import { Ban, Plus } from 'lucide-react'
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { cardIconColor, cardIconColors, cardIconGlyph, cardIconNames } from '../entries/CardLabel.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover.tsx'

export type IconChoice = { icon: string; color: string }

// Both grids use the same columns, so the color row lines up under the icons.
const COLUMNS = 7
const NO_ICON = ''
const DEFAULT_COLOR = ''

/** Arrow keys, Home, and End move focus between the buttons of one grid. */
function moveInGrid(event: KeyboardEvent<HTMLElement>) {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  const step: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: COLUMNS,
    ArrowUp: -COLUMNS,
    Home: -at,
    End: buttons.length - 1 - at,
  }
  const delta = step[event.key]
  if (delta === undefined) return
  event.preventDefault()
  buttons[Math.min(buttons.length - 1, Math.max(0, at + delta))]?.focus()
}

/** One tab stop per grid: the picked button, or the first one. */
function tabStop(index: number, picked: number): 0 | -1 {
  return index === Math.max(0, picked) ? 0 : -1
}

/**
 * The icon square of a card label, as a button. It opens a popover with every card icon and
 * the icon colors. A pick shows on the card at once; the popover stays open until Escape or a
 * click outside, so icon and color can be set together.
 */
export function IconPicker({
  icon,
  color,
  label,
  defaultTint,
  onChange,
}: {
  icon: string
  color: string
  /** The card label beside the icon. */
  label: string
  /** The card's own tint without a color, such as a risk callout's red. */
  defaultTint?: string
  onChange: (next: IconChoice) => void
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const picked = useRef<HTMLButtonElement>(null)
  const id = useId()
  const glyph = icon ? cardIconGlyph(icon) : null
  const tint = glyph ? cardIconColor(color) : undefined
  const icons = [NO_ICON, ...cardIconNames]
  const colors = [DEFAULT_COLOR, ...cardIconColors]
  const iconAt = icons.indexOf(glyph ? icon.trim().toLowerCase() : NO_ICON)
  const colorAt = colors.indexOf(tint ?? DEFAULT_COLOR)
  const caption = hovered ?? (glyph ? [icon, tint].filter(Boolean).join(' · ') : 'No icon')
  const defaultStyle = defaultTint ? ({ '--card-icon-color': defaultTint } as CSSProperties) : undefined

  return (
    <div className="plan-card-label plan-editor-kicker" data-has-icon="true">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          setHovered(null)
        }}
      >
        <PopoverTrigger
          className="plan-card-icon plan-editor-icon"
          data-color={tint}
          data-empty={glyph ? undefined : 'true'}
          data-icon-picker=""
          aria-label={glyph ? `Icon ${caption}. Change icon` : 'Add an icon'}
          title={glyph ? 'Change icon' : 'Add an icon'}
        >
          {glyph ?? <Plus size={14} strokeWidth={2} aria-hidden="true" />}
        </PopoverTrigger>
        <PopoverContent
          className="plan-icon-popover"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          initialFocus={picked}
          data-icon-picker-popup=""
        >
          <div className="plan-icon-popover-head">
            <span className="plan-icon-popover-title" id={`${id}-icons`}>
              Icon
            </span>
            <span className="plan-icon-popover-caption" aria-live="polite">
              {caption}
            </span>
          </div>
          <div className="plan-icon-grid" role="group" aria-labelledby={`${id}-icons`} onKeyDown={moveInGrid}>
            {icons.map((name, index) => (
              <button
                key={name || 'none'}
                ref={index === Math.max(0, iconAt) ? picked : undefined}
                type="button"
                className="plan-card-icon plan-icon-option"
                data-icon-option={name || 'none'}
                data-color={name ? tint : undefined}
                aria-pressed={index === iconAt}
                aria-label={name || 'No icon'}
                title={name || 'No icon'}
                tabIndex={tabStop(index, iconAt)}
                style={name && !tint ? defaultStyle : undefined}
                data-tinted={name && !tint && defaultTint ? 'true' : undefined}
                onPointerEnter={() => setHovered(name || 'No icon')}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(name || 'No icon')}
                onBlur={() => setHovered(null)}
                // No icon also drops the color: it has nothing left to tint.
                onClick={() => onChange(name ? { icon: name, color } : { icon: NO_ICON, color: DEFAULT_COLOR })}
              >
                {name ? cardIconGlyph(name) : <Ban size={16} strokeWidth={2} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="plan-icon-popover-head">
            <span className="plan-icon-popover-title" id={`${id}-colors`}>
              Color
            </span>
          </div>
          <div className="plan-icon-grid" role="group" aria-labelledby={`${id}-colors`} onKeyDown={moveInGrid}>
            {colors.map((name, index) => (
              <button
                key={name || 'default'}
                type="button"
                className="plan-card-icon plan-icon-option plan-icon-swatch"
                data-color-option={name || 'default'}
                data-color={name || undefined}
                data-tinted={!name && defaultTint ? 'true' : undefined}
                style={!name ? defaultStyle : undefined}
                disabled={!glyph}
                aria-pressed={index === colorAt}
                aria-label={name || 'Default color'}
                title={glyph ? name || 'Default color' : 'Pick an icon first'}
                tabIndex={tabStop(index, colorAt)}
                onPointerEnter={() => setHovered(name || 'Default color')}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(name || 'Default color')}
                onBlur={() => setHovered(null)}
                onClick={() => onChange({ icon, color: name })}
              >
                {glyph ?? <span className="plan-icon-swatch-dot" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <span className="plan-card-label-text">{label}</span>
    </div>
  )
}
