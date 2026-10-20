import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type ColorMode = 'light' | 'dark'

export type SystemThemeSources = {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  home: string
  command(name: string, args: string[]): { ok: boolean; stdout: string } | null
  readText(path: string): string | null
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

/** Theme names such as `Adwaita-dark` or `WhiteSur-Light`. A bare `Adwaita` has no mode. */
export function colorModeFromThemeName(name: string): ColorMode | null {
  const value = unquote(name)
  if (!value) return null
  if (/dark/i.test(value)) return 'dark'
  if (/light/i.test(value)) return 'light'
  return null
}

/** GNOME `org.gnome.desktop.interface color-scheme`. `default` defers to the theme. */
export function colorModeFromGnomeColorScheme(value: string | undefined | null): ColorMode | null {
  if (!value) return null
  const scheme = unquote(value)
  if (scheme === 'prefer-dark') return 'dark'
  if (scheme === 'prefer-light') return 'light'
  return null
}

/** GTK settings.ini: prefer-dark wins, otherwise the named theme. */
export function colorModeFromGtkSettings(text: string): ColorMode | null {
  const prefer = text.match(/gtk-application-prefer-dark-theme\s*=\s*([01])/)
  if (prefer) return prefer[1] === '1' ? 'dark' : 'light'
  const theme = text.match(/gtk-theme-name\s*=\s*(\S+)/)
  if (!theme) return null
  return colorModeFromThemeName(theme[1])
}

/** KDE `~/.config/kdeglobals` ColorScheme entry. */
export function colorModeFromKdeGlobals(text: string): ColorMode | null {
  const match = text.match(/^\s*ColorScheme\s*=\s*(.+)$/m)
  if (!match) return null
  return colorModeFromThemeName(match[1])
}

/**
 * `COLORFGBG` is `foreground;background` (ANSI 0–15).
 * 7 and the bright colors 9–15 are light backgrounds. 0–6 and 8 are dark.
 */
export function colorModeFromColorfgbg(value: string | undefined | null): ColorMode | null {
  if (!value) return null
  const bg = Number(value.trim().split(';').at(-1))
  if (!Number.isInteger(bg)) return null
  return bg === 7 || bg >= 9 ? 'light' : 'dark'
}

function readOsColorMode(sources: SystemThemeSources): ColorMode | null {
  if (sources.platform === 'darwin') {
    const result = sources.command('defaults', ['read', '-g', 'AppleInterfaceStyle'])
    if (!result) return null
    if (result.ok && /dark/i.test(result.stdout)) return 'dark'
    return 'light'
  }

  if (sources.platform === 'win32') {
    const result = sources.command('reg', [
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
      '/v',
      'AppsUseLightTheme',
    ])
    if (!result?.stdout) return null
    if (/0x0\b/i.test(result.stdout)) return 'dark'
    if (/0x1\b/i.test(result.stdout)) return 'light'
    return null
  }

  if (sources.platform === 'linux') {
    const scheme = sources.command('gsettings', ['get', 'org.gnome.desktop.interface', 'color-scheme'])
    const fromScheme = scheme?.ok ? colorModeFromGnomeColorScheme(scheme.stdout) : null
    if (fromScheme) return fromScheme

    const gtkTheme = sources.command('gsettings', ['get', 'org.gnome.desktop.interface', 'gtk-theme'])
    const fromGtkTheme = gtkTheme?.ok ? colorModeFromThemeName(gtkTheme.stdout) : null
    if (fromGtkTheme) return fromGtkTheme

    for (const relative of ['.config/gtk-4.0/settings.ini', '.config/gtk-3.0/settings.ini']) {
      const text = sources.readText(join(sources.home, relative))
      const fromFile = text ? colorModeFromGtkSettings(text) : null
      if (fromFile) return fromFile
    }

    const kde = sources.readText(join(sources.home, '.config/kdeglobals'))
    const fromKde = kde ? colorModeFromKdeGlobals(kde) : null
    if (fromKde) return fromKde
  }

  return null
}

/** Operating-system appearance, then the terminal background hint, then light. */
export function resolveSystemColorMode(sources: SystemThemeSources): ColorMode {
  return readOsColorMode(sources) ?? colorModeFromColorfgbg(sources.env.COLORFGBG) ?? 'light'
}

/** Color mode of this machine. A missing desktop setting stays on the light palette. */
export function systemColorMode(): ColorMode {
  return resolveSystemColorMode({
    platform: process.platform,
    env: process.env,
    home: homedir(),
    command(name, args) {
      try {
        const stdout = execFileSync(name, args, {
          encoding: 'utf8',
          timeout: 500,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        return { ok: true, stdout }
      } catch (error) {
        const failed = error as { code?: string; stdout?: unknown }
        if (failed.code === 'ENOENT' || failed.code === 'ENOTDIR') return null
        const stdout = typeof failed.stdout === 'string' ? failed.stdout : ''
        return { ok: false, stdout }
      }
    },
    readText(path) {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return null
      }
    },
  })
}
