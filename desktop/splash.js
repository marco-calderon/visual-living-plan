// Ask the app to find or start the plan service, then load its dashboard in this window.
const splash = document.querySelector('.splash')
const status = document.getElementById('status')
const detail = document.getElementById('detail')
const retry = document.getElementById('retry')

function show(state, message, more = '') {
  splash.dataset.state = state
  status.textContent = message
  detail.textContent = more
}

async function connect() {
  const invoke = window.__TAURI__?.core?.invoke
  if (!invoke) {
    show('error', 'Open this page from the Living Plan app.')
    return
  }
  show('starting', 'Starting the plan service…')
  retry.disabled = true
  try {
    const dashboard = await invoke('connect')
    location.replace(dashboard)
  } catch (error) {
    show('error', 'Living Plan could not reach the plan service.', String(error))
    retry.disabled = false
    retry.focus()
  }
}

retry.addEventListener('click', connect)
connect()
