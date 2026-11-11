// The desktop app's own page. It shows the setup screen on the first launch, and again when a
// page asks for it. Otherwise it asks the app for the page to load and goes there.
//
// The fragment says what to do:
//   (none)          setup if it never ran, else open the saved mode
//   #setup          the setup screen
//   #setup=skills   the setup screen at one section: mode, look, cli, or skills
//   #mode=cloud     switch to that mode (local or cloud), remember it, and open it
const invoke = window.__TAURI__?.core?.invoke
const $ = (id) => document.getElementById(id)

const status = $('status')
const detail = $('detail')
const retry = $('retry')
const useLocal = $('use-local')
const openSetup = $('open-setup')
const setup = $('setup')

/** What `live-plan desktop state` last printed. */
let state = null
/** The mode chosen on the setup screen, saved when it is finished. */
let chosenMode = 'local'
/** What "Try again" runs. */
let again = () => route()

function show(view, message = '', more = '') {
  document.body.dataset.state = view
  setup.hidden = view !== 'setup'
  status.textContent = message
  detail.textContent = more
}

function message(error) {
  return String(error?.message ?? error).trim()
}

function fail(title, error, { mode } = {}) {
  show('error', title, message(error))
  // The service log explains a local failure. A cloud one is about the network.
  $('log-hint').hidden = mode === 'cloud'
  useLocal.hidden = mode !== 'cloud'
  retry.disabled = false
  retry.focus()
}

async function connect(mode) {
  show('starting', mode === 'cloud' ? 'Opening your cloud plans…' : 'Starting the plan service…')
  retry.disabled = true
  again = () => connect(mode)
  try {
    location.replace(await invoke('connect', { mode }))
  } catch (error) {
    fail(
      mode === 'cloud' ? 'Living Plan could not reach the cloud host.' : 'Living Plan could not reach the plan service.',
      error,
      { mode },
    )
  }
}

// ---- Setup ----------------------------------------------------------------------------------

function setChecked(container, attribute, value) {
  for (const button of container.querySelectorAll(`[${attribute}]`)) {
    button.setAttribute('aria-checked', String(button.getAttribute(attribute) === value))
  }
}

function look() {
  const saved = state.config.appearance
  return { accent: saved?.accent ?? state.theme.accent, diffsTheme: saved?.diffsTheme ?? state.theme.diffsTheme }
}

async function save(patch, errorId) {
  const error = $(errorId)
  error.textContent = ''
  try {
    state = await invoke('configure', { patch })
    return true
  } catch (problem) {
    error.textContent = message(problem)
    return false
  }
}

function paintMode() {
  setChecked($('section-mode'), 'data-mode', chosenMode)
  $('cloud-field').hidden = chosenMode !== 'cloud'
}

function paintLook() {
  const current = look()
  setChecked($('color-modes'), 'data-color-mode', state.config.colorMode)
  setChecked($('accents'), 'data-accent', current.accent)
  setChecked($('syntax-themes'), 'data-syntax-theme', current.diffsTheme)
}

function sample(colors, text) {
  const box = document.createElement('span')
  box.className = 'theme-sample'
  for (const [name, value] of Object.entries({ bg: colors.bg, fg: colors.fg, keyword: colors.keyword, string: colors.string, comment: colors.comment })) {
    box.style.setProperty(`--sample-${name}`, value)
  }
  for (const [kind, word] of text) {
    const part = document.createElement('span')
    if (kind) part.className = kind
    part.textContent = word
    box.append(part)
  }
  return box
}

function buildLook() {
  const accents = $('accents')
  accents.replaceChildren(
    ...state.accents.map((choice) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'swatch'
      button.setAttribute('role', 'radio')
      button.dataset.accent = choice.accent
      button.title = choice.label
      button.setAttribute('aria-label', `${choice.label} accent`)
      button.style.setProperty('--swatch', choice.accent)
      button.addEventListener('click', async () => {
        if (await save({ accent: choice.accent, diffsTheme: look().diffsTheme }, 'look-error')) paintLook()
      })
      return button
    }),
  )
  const code = [
    ['keyword', 'const '],
    ['', 'plan = '],
    ['string', "'live'"],
  ]
  $('syntax-themes').replaceChildren(
    ...state.syntaxThemes.map((theme) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'theme'
      button.setAttribute('role', 'radio')
      button.dataset.syntaxTheme = theme.id
      const samples = document.createElement('span')
      samples.className = 'theme-samples'
      samples.append(sample(theme.light, code), sample(theme.dark, code))
      const label = document.createElement('span')
      label.className = 'theme-label'
      label.textContent = theme.label
      button.title = theme.description
      button.append(samples, label)
      button.addEventListener('click', async () => {
        if (await save({ accent: look().accent, diffsTheme: theme.id }, 'look-error')) paintLook()
      })
      return button
    }),
  )
}

function paintCli() {
  const cli = state.cli
  const install = $('cli-install')
  const hint = $('cli-hint')
  $('cli-detail').textContent = cli.other ?? cli.path
  hint.hidden = true
  install.hidden = false
  install.textContent = 'Install'
  if (cli.other) {
    $('cli-status').textContent = 'live-plan is already installed by something else'
    install.hidden = true
  } else if (cli.installed) {
    $('cli-status').textContent = 'Installed'
    install.textContent = 'Reinstall'
  } else if (cli.stale) {
    $('cli-status').textContent = 'Installed, but it runs another copy of the app'
    install.textContent = 'Update'
  } else if (cli.present) {
    $('cli-status').textContent = 'Installed, but that folder is not on your PATH'
    install.textContent = 'Reinstall'
  } else {
    $('cli-status').textContent = 'Not installed'
  }
  if (cli.hint && (cli.present || cli.stale)) {
    hint.hidden = false
    hint.textContent = `Add this line to your shell profile, such as ~/.zshrc:\n${cli.hint}`
  }
}

function harnessRow(harness) {
  const item = document.createElement('li')
  const row = document.createElement('div')
  row.className = 'row'
  const copy = document.createElement('div')
  copy.className = 'row-copy'
  const title = document.createElement('p')
  title.className = 'row-title'
  title.textContent = harness.label
  const path = document.createElement('p')
  path.className = 'row-detail'
  path.textContent = harness.path
  copy.append(title, path)
  const stateLabel = document.createElement('span')
  stateLabel.className = 'row-state'
  if (harness.current) {
    stateLabel.dataset.state = 'done'
    stateLabel.textContent = 'Installed'
  } else if (harness.installed) stateLabel.textContent = 'Older copy'
  else if (!harness.detected) stateLabel.textContent = 'Not found on this computer'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button-secondary'
  button.textContent = harness.current ? 'Reinstall' : harness.installed ? 'Update' : 'Install'
  button.addEventListener('click', () => installSkills([harness.id], button))
  row.append(copy, stateLabel, button)
  item.append(row)
  return item
}

function paintSkills() {
  $('harnesses').replaceChildren(...state.harnesses.map(harnessRow))
  $('skills-all').disabled = !state.harnesses.some((harness) => harness.detected)
}

async function installSkills(harnesses, button) {
  const error = $('skills-error')
  error.textContent = ''
  button.disabled = true
  try {
    const installed = await invoke('install_skills', { harnesses })
    const byId = new Map(installed.map((harness) => [harness.id, harness]))
    state.harnesses = state.harnesses.map((harness) => byId.get(harness.id) ?? harness)
    paintSkills()
  } catch (problem) {
    error.textContent = message(problem)
    button.disabled = false
  }
}

async function installCli() {
  const error = $('cli-error')
  const button = $('cli-install')
  error.textContent = ''
  button.disabled = true
  try {
    state.cli = await invoke('install_cli')
    paintCli()
  } catch (problem) {
    error.textContent = message(problem)
  }
  button.disabled = false
}

// ---- Steps ----------------------------------------------------------------------------------

const STEPS = ['mode', 'look', 'cli', 'skills']
let step = 0

function paintStep() {
  STEPS.forEach((name, index) => {
    $(`section-${name}`).hidden = index !== step
    const dot = document.querySelector(`.dot[data-step="${name}"]`)
    if (index === step) dot.setAttribute('aria-current', 'step')
    else dot.removeAttribute('aria-current')
    dot.dataset.done = String(index < step)
  })
  $('back').hidden = step === 0
  const last = step === STEPS.length - 1
  $('next').textContent = !last ? 'Continue' : state.config.setupDone ? 'Done' : 'Open Living Plan'
}

/** Save where plans run. The address is checked here, so a mistake shows on its own step. */
async function saveMode() {
  const patch = { mode: chosenMode }
  if (chosenMode === 'cloud') patch.cloudUrl = $('cloud-url').value
  return save(patch, 'mode-error')
}

/** Move to a step. Leaving the first step saves it, and stays there when it cannot be saved. */
async function goTo(index) {
  const target = Math.max(0, Math.min(STEPS.length - 1, index))
  if (target === step) return
  if (step === 0 && !(await saveMode())) return
  step = target
  paintStep()
  setup.scrollTop = 0
  $(`section-${STEPS[step]}`).focus({ preventScroll: true })
}

async function next() {
  const button = $('next')
  button.disabled = true
  try {
    if (step < STEPS.length - 1) {
      await goTo(step + 1)
      return
    }
    if (!(await save({ setupDone: true }, 'skills-error'))) return
    history.replaceState(null, '', location.pathname)
    await connect(state.config.mode)
  } finally {
    button.disabled = false
  }
}

function showSetup({ section, mode, problem } = {}) {
  chosenMode = mode ?? state.config.mode
  $('mode-title').textContent = state.config.setupDone ? 'Where your plans run' : 'Welcome to Living Plan'
  $('cloud-url').value = state.cloudUrl ?? ''
  for (const id of ['mode-error', 'look-error', 'cli-error', 'skills-error']) $(id).textContent = ''
  if (problem) $('mode-error').textContent = problem
  buildLook()
  paintMode()
  paintLook()
  paintCli()
  paintSkills()
  step = Math.max(0, STEPS.indexOf(section))
  paintStep()
  show('setup')
  setup.scrollTop = 0
}

// ---- Routing --------------------------------------------------------------------------------

function wanted() {
  const fragment = location.hash.replace(/^#/, '')
  const [name, value = ''] = fragment.split('=')
  if (name === 'setup') return { setup: true, section: value }
  if (name === 'mode' && (value === 'local' || value === 'cloud')) return { mode: value }
  return {}
}

async function route() {
  if (!invoke) {
    show('error', 'Open this page from the Living Plan app.')
    retry.hidden = true
    openSetup.hidden = true
    return
  }
  show('starting', 'Starting…')
  again = () => route()
  try {
    state = await invoke('desktop_state')
  } catch (error) {
    fail('Living Plan could not read its settings.', error)
    return
  }
  const want = wanted()
  if (want.setup || !state.config.setupDone) {
    showSetup({ section: want.section })
    return
  }
  if (want.mode && want.mode !== state.config.mode) {
    try {
      state = await invoke('configure', { patch: { mode: want.mode } })
    } catch (error) {
      // Cloud was asked for and no host is set yet.
      showSetup({ section: 'mode', mode: want.mode, problem: message(error) })
      return
    }
  }
  await connect(want.mode ?? state.config.mode)
}

for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    chosenMode = button.dataset.mode
    $('mode-error').textContent = ''
    paintMode()
    if (chosenMode === 'cloud') $('cloud-url').focus()
  })
}
for (const button of document.querySelectorAll('[data-color-mode]')) {
  button.addEventListener('click', async () => {
    if (await save({ colorMode: button.dataset.colorMode }, 'look-error')) paintLook()
  })
}
$('cli-install').addEventListener('click', installCli)
$('skills-all').addEventListener('click', (event) => installSkills([], event.currentTarget))
$('next').addEventListener('click', next)
$('back').addEventListener('click', () => goTo(step - 1))
for (const dot of document.querySelectorAll('.dot')) {
  dot.addEventListener('click', () => goTo(STEPS.indexOf(dot.dataset.step)))
}
$('cloud-url').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') next()
})
retry.addEventListener('click', () => again())
useLocal.addEventListener('click', () => connect('local'))
openSetup.addEventListener('click', () => {
  if (state) showSetup()
  else route()
})
window.addEventListener('hashchange', route)
route()
