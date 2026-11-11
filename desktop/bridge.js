// Runs in every page of a Living Plan window before the page's own scripts (ADR 0038). The app
// fills in the two __VALUES__. It tells the page it is inside the desktop app, and, where the
// window has no title bar of its own, makes room for the window buttons and lets the page's
// toolbar move the window.
//
// Pages get no Tauri API from this. They reach the app only by following living-plan:// links.
;(function () {
  if (window.top !== window) return
  var info = { platform: '__PLATFORM__', chrome: '__CHROME__' }
  var existing = window.__LIVING_PLAN_DESKTOP__
  window.__LIVING_PLAN_DESKTOP__ = Object.assign(existing && typeof existing === 'object' ? existing : {}, info)

  // Some web views run this before the document has its root element.
  if (document.documentElement) mark(document.documentElement)
  else {
    var waiting = new MutationObserver(function () {
      if (!document.documentElement) return
      waiting.disconnect()
      mark(document.documentElement)
    })
    waiting.observe(document, { childList: true })
  }

  function mark(root) {
    // Page styles show the Local and Cloud switch and the app's settings under this attribute.
    root.dataset.desktop = info.platform
    if (info.chrome !== 'overlay') return
    root.dataset.desktopChrome = 'overlay'

    // The window buttons sit over the page's top left corner. Every Living Plan page has a
    // `.titlebar`; it steps aside for them. Full screen hides the buttons, so the room is given back.
    var css =
      'html[data-desktop-chrome="overlay"] .titlebar{-webkit-user-select:none;user-select:none;cursor:default}' +
      'html[data-desktop-chrome="overlay"]:not([data-desktop-fullscreen="true"]) .titlebar{padding-left:88px !important}' +
      // A page with no toolbar, such as a sign-in provider's, gets a bare strip to hold the buttons.
      '.desktop-drag-strip{position:fixed;top:0;left:0;right:0;height:52px;z-index:2147483000;background:Canvas;border-bottom:1px solid color-mix(in srgb,CanvasText 12%,transparent)}' +
      'html[data-desktop-bare="true"] body{padding-top:52px !important}' +
      'html[data-desktop-fullscreen="true"] .desktop-drag-strip{display:none}' +
      'html[data-desktop-fullscreen="true"][data-desktop-bare="true"] body{padding-top:0 !important}'
    try {
      var sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      document.adoptedStyleSheets = Array.prototype.concat.call(document.adoptedStyleSheets, sheet)
    } catch (error) {
      var style = document.createElement('style')
      style.textContent = css
      root.appendChild(style)
    }

    // Tauri moves the window from an element marked as a drag region, and leaves buttons and
    // links inside it alone. Mark the toolbar the moment it is pressed, so one the page drew
    // later counts too.
    window.addEventListener(
      'mousedown',
      function (event) {
        var target = event.target
        var bar = target instanceof Element ? target.closest('.titlebar, .desktop-drag-strip') : null
        if (bar && !bar.hasAttribute('data-tauri-drag-region')) bar.setAttribute('data-tauri-drag-region', 'deep')
      },
      true,
    )

    function settle() {
      if (!document.body) return
      var strip = document.querySelector('.desktop-drag-strip')
      if (document.querySelector('.titlebar')) {
        delete root.dataset.desktopBare
        if (strip) strip.remove()
        return
      }
      root.dataset.desktopBare = 'true'
      if (!strip) {
        strip = document.createElement('div')
        strip.className = 'desktop-drag-strip'
        strip.setAttribute('data-tauri-drag-region', 'deep')
        document.body.appendChild(strip)
      }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', settle)
    else settle()
    // A page that draws its toolbar after loading.
    window.addEventListener('load', function () {
      settle()
      setTimeout(settle, 1500)
    })
  }
})()
