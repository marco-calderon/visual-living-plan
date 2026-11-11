import type { PlanHost } from './hostToolbar'

const SIDES: ReadonlyArray<{ mode: PlanHost; label: string }> = [
  { mode: 'local', label: 'Local' },
  { mode: 'cloud', label: 'Cloud' },
]

/**
 * The Local and Cloud switch in a toolbar. Same markup as `desktopModeSwitchHtml`: styles hide it in
 * a browser, and inside the desktop app the other side is a `living-plan://switch/<mode>` link.
 */
export function DesktopModeSwitch({ host }: { host: PlanHost }) {
  return (
    <nav className="desktop-mode" aria-label="Where plans run">
      {SIDES.map((side) =>
        side.mode === host ? (
          <span key={side.mode} aria-current="true">
            {side.label}
          </span>
        ) : (
          <a key={side.mode} href={`living-plan://switch/${side.mode}`}>
            {side.label}
          </a>
        ),
      )}
    </nav>
  )
}
