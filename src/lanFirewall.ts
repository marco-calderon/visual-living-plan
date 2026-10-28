import { execFile } from 'node:child_process'
import type { FirewallRecord, FirewallRule } from './lanConfig'

export type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>

export type FirewallAttempt = {
  ok: boolean
  record: FirewallRecord
}

let commandRuns = 0

export function firewallCommandCount(): number {
  return commandRuns
}

export function runCommand(command: string, args: string[]): Promise<CommandResult> {
  commandRuns += 1
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 8_000, windowsHide: true }, (error, stdout, stderr) => {
      const errno = error && typeof error === 'object' && 'code' in error ? error.code : undefined
      const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
      let code = 0
      if (errno === 'ENOENT') code = 127
      else if (typeof status === 'number') code = status
      else if (error) code = 1
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

const PRIVATE_SOURCES = [
  { family: 'ipv4' as const, source: '10.0.0.0/8' },
  { family: 'ipv4' as const, source: '172.16.0.0/12' },
  { family: 'ipv4' as const, source: '192.168.0.0/16' },
  { family: 'ipv6' as const, source: 'fc00::/7' },
]

function skipped(port: number, summary: string, manual: string | null = null): FirewallAttempt {
  return {
    ok: manual === null,
    record: { added: false, tool: 'none', port, rules: [], summary, manual },
  }
}

function failed(tool: FirewallRecord['tool'], port: number, rules: FirewallRule[], summary: string, manual: string): FirewallAttempt {
  return {
    ok: false,
    record: { added: rules.length > 0, tool, port, rules, summary, manual },
  }
}

function alreadyThere(result: CommandResult): boolean {
  return /skipping|already exists|already been added/i.test(`${result.stdout}\n${result.stderr}`)
}

export function manualAllowCommand(port: number, platform: NodeJS.Platform, execPath: string): string {
  if (platform === 'darwin') {
    const bin = '/usr/libexec/ApplicationFirewall/socketfilterfw'
    return [`sudo ${bin} --add ${execPath}`, `sudo ${bin} --unblockapp ${execPath}`].join('\n')
  }
  if (platform === 'win32') {
    return `netsh advfirewall firewall add rule name="Living Plan LAN ${port}" dir=in action=allow protocol=TCP localport=${port} remoteip=LocalSubnet`
  }
  const ufw = PRIVATE_SOURCES.map(
    ({ source }) => `sudo ufw allow from ${source} to any port ${port} proto tcp comment living-plan-lan`,
  ).join('\n')
  const firewalld = PRIVATE_SOURCES.map(
    ({ family, source }) =>
      `sudo firewall-cmd --permanent --add-rich-rule='rule family="${family}" source address="${source}" port port="${port}" protocol="tcp" accept'`,
  ).join('\n')
  return `${ufw}\n${firewalld}\nsudo firewall-cmd --reload`
}

export function manualRemoveCommand(record: FirewallRecord): string {
  return record.rules.map((rule) => `${rule.command} ${rule.args.join(' ')}`).join('\n')
}

function sameRule(left: FirewallRule, right: FirewallRule): boolean {
  return left.command === right.command && left.args.join('\0') === right.args.join('\0')
}

async function applyRules(
  runner: CommandRunner,
  tool: FirewallRecord['tool'],
  port: number,
  adds: Array<{ command: string; add: string[]; remove: FirewallRule | null }>,
  manual: string,
  reload?: { command: string; args: string[] },
): Promise<FirewallAttempt> {
  const added: FirewallRule[] = []
  for (const rule of adds) {
    const result = await runner(rule.command, rule.add)
    if (result.code === 127) {
      return failed(tool, port, added, `${rule.command} is not installed`, manual)
    }
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || `exit ${result.code}`).trim()
      return failed(tool, port, added, `Could not open the firewall (${detail})`, manual)
    }
    if (rule.remove && !alreadyThere(result) && !added.some((item) => sameRule(item, rule.remove as FirewallRule))) {
      added.push(rule.remove)
    }
  }
  if (reload && added.length > 0) {
    const result = await runner(reload.command, reload.args)
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || `exit ${result.code}`).trim()
      return failed(tool, port, added, `Could not reload the firewall (${detail})`, manual)
    }
  }
  if (added.length === 0) {
    return {
      ok: true,
      record: { added: false, tool, port, rules: [], summary: 'already allowed', manual: null },
    }
  }
  return {
    ok: true,
    record: { added: true, tool, port, rules: added, summary: `opened (${tool})`, manual: null },
  }
}

async function openUfw(port: number, runner: CommandRunner, manual: string): Promise<FirewallAttempt> {
  const adds = PRIVATE_SOURCES.map(({ source }) => {
    const spec = ['from', source, 'to', 'any', 'port', String(port), 'proto', 'tcp']
    return {
      command: 'ufw',
      add: ['allow', ...spec, 'comment', 'living-plan-lan'],
      remove: { command: 'ufw', args: ['delete', 'allow', ...spec] },
    }
  })
  return applyRules(runner, 'ufw', port, adds, manual)
}

async function openFirewalld(port: number, runner: CommandRunner, manual: string): Promise<FirewallAttempt> {
  const adds = PRIVATE_SOURCES.map(({ family, source }) => {
    const rule = `rule family="${family}" source address="${source}" port port="${port}" protocol="tcp" accept`
    return {
      command: 'firewall-cmd',
      add: ['--permanent', `--add-rich-rule=${rule}`],
      remove: { command: 'firewall-cmd', args: ['--permanent', `--remove-rich-rule=${rule}`] },
    }
  })
  return applyRules(runner, 'firewalld', port, adds, manual, { command: 'firewall-cmd', args: ['--reload'] })
}

async function openDarwin(port: number, runner: CommandRunner, execPath: string, manual: string): Promise<FirewallAttempt> {
  const bin = '/usr/libexec/ApplicationFirewall/socketfilterfw'
  const listed = await runner(bin, ['--listapps'])
  if (listed.code === 127) return failed('socketfilterfw', port, [], 'Application Firewall tool is not installed', manual)
  if (listed.code === 0 && listed.stdout.includes(execPath)) {
    return {
      ok: true,
      record: {
        added: false,
        tool: 'socketfilterfw',
        port,
        rules: [],
        summary: 'already allowed',
        manual: null,
      },
    }
  }
  return applyRules(
    runner,
    'socketfilterfw',
    port,
    [
      { command: bin, add: ['--add', execPath], remove: { command: bin, args: ['--remove', execPath] } },
      { command: bin, add: ['--unblockapp', execPath], remove: null },
    ],
    manual,
  )
}

async function openWindows(port: number, runner: CommandRunner, manual: string): Promise<FirewallAttempt> {
  const name = `Living Plan LAN ${port}`
  return applyRules(
    runner,
    'netsh',
    port,
    [
      {
        command: 'netsh',
        add: [
          'advfirewall',
          'firewall',
          'add',
          'rule',
          `name=${name}`,
          'dir=in',
          'action=allow',
          'protocol=TCP',
          `localport=${port}`,
          'remoteip=LocalSubnet',
        ],
        remove: { command: 'netsh', args: ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`] },
      },
    ],
    manual,
  )
}

export async function openLanFirewall(
  port: number,
  runner: CommandRunner,
  platform: NodeJS.Platform = process.platform,
  execPath = process.execPath,
): Promise<FirewallAttempt> {
  const manual = manualAllowCommand(port, platform, execPath)
  if (platform === 'darwin') return openDarwin(port, runner, execPath, manual)
  if (platform === 'win32') return openWindows(port, runner, manual)
  const ufw = await runner('ufw', ['status'])
  if (ufw.code !== 127) return openUfw(port, runner, manual)
  const firewalld = await runner('firewall-cmd', ['--state'])
  if (firewalld.code === 127) {
    return skipped(port, 'No ufw or firewalld is installed', manual)
  }
  return openFirewalld(port, runner, manual)
}

export async function closeLanFirewall(record: FirewallRecord, runner: CommandRunner): Promise<FirewallAttempt> {
  if (!record.added || record.rules.length === 0) {
    return {
      ok: true,
      record: { ...record, added: false, rules: [], summary: record.summary || 'not applied', manual: null },
    }
  }
  const removed: FirewallRule[] = []
  for (const rule of record.rules) {
    const result = await runner(rule.command, rule.args)
    if (result.code !== 0 && result.code !== 127) {
      const detail = (result.stderr || result.stdout || `exit ${result.code}`).trim()
      const manual = manualRemoveCommand({ ...record, rules: record.rules.filter((item) => !removed.includes(item)) })
      return {
        ok: false,
        record: {
          ...record,
          added: true,
          rules: record.rules.filter((item) => !removed.includes(item)),
          summary: `Could not remove the firewall rule (${detail})`,
          manual,
        },
      }
    }
    removed.push(rule)
  }
  if (record.tool === 'firewalld') {
    const reload = await runner('firewall-cmd', ['--reload'])
    if (reload.code !== 0) {
      return {
        ok: false,
        record: {
          ...record,
          added: false,
          rules: [],
          summary: 'Removed the firewalld rules, but reload failed',
          manual: 'sudo firewall-cmd --reload',
        },
      }
    }
  }
  return {
    ok: true,
    record: { ...record, added: false, rules: [], summary: 'removed', manual: null },
  }
}
