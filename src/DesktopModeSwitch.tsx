import { DESKTOP_MODE_SIDES, type DesktopModeSide, type PlanHost } from './hostToolbar'

/** The laptop or cloud icon for one side of the switch. */
export function DesktopModeIcon({ side }: { side: DesktopModeSide }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {side.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/**
 * The Local and Cloud switch in a toolbar with no account menu. Same markup as
 * `desktopModeSwitchHtml`: styles hide it in a browser, and inside the desktop app the other side is
 * a `living-plan://switch/<mode>` link. With an account menu, the menu carries the switch instead.
 */
export function DesktopModeSwitch({ host }: { host: PlanHost }) {
  return (
    <nav className="desktop-mode" aria-label="Environment">
      {DESKTOP_MODE_SIDES.map((side) =>
        side.mode === host ? (
          <span key={side.mode} aria-current="true" aria-label={side.label} title={side.label}>
            <DesktopModeIcon side={side} />
          </span>
        ) : (
          <a key={side.mode} href={`living-plan://switch/${side.mode}`} aria-label={side.label} title={side.label}>
            <DesktopModeIcon side={side} />
          </a>
        ),
      )}
    </nav>
  )
}
