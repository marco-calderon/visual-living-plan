import {
  Bug,
  CircleCheck,
  CircleHelp,
  Clock,
  Database,
  FileText,
  Flag,
  GitBranch,
  Globe,
  Info,
  KeyRound,
  Lightbulb,
  ListChecks,
  Lock,
  MessageCircle,
  Package,
  Rocket,
  Scale,
  Server,
  Shield,
  Sparkles,
  TriangleAlert,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { isValidElement, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './styles'

/** Icon names a plan file can pass as `icon="..."` on a card. */
const CARD_ICONS: Record<string, LucideIcon> = {
  alert: TriangleAlert,
  bug: Bug,
  check: CircleCheck,
  clock: Clock,
  database: Database,
  decision: Scale,
  file: FileText,
  flag: Flag,
  branch: GitBranch,
  globe: Globe,
  help: CircleHelp,
  idea: Lightbulb,
  info: Info,
  key: KeyRound,
  list: ListChecks,
  lock: Lock,
  message: MessageCircle,
  package: Package,
  rocket: Rocket,
  server: Server,
  shield: Shield,
  sparkles: Sparkles,
  users: Users,
  wrench: Wrench,
  zap: Zap,
}

export const cardIconNames = Object.keys(CARD_ICONS) as readonly string[]

/** Colors a plan file can pass as `color="..."` to tint a card's icon square. */
export const cardIconColors = ['blue', 'green', 'orange', 'red', 'pink', 'purple'] as const

export type CardIconColor = (typeof cardIconColors)[number]

/** A known color name, or undefined so the icon keeps the card's own tint. */
export function cardIconColor(value: string | undefined): CardIconColor | undefined {
  const name = value?.trim().toLowerCase()
  return (cardIconColors as readonly string[]).includes(name ?? '') ? (name as CardIconColor) : undefined
}

/** A card icon: a known name from a plan file, or any element from code. */
export type CardIcon = string | ReactNode

/** The glyph for a card icon, or null when the name is unknown. */
export function cardIconGlyph(icon: CardIcon): ReactNode {
  if (typeof icon === 'string') {
    const Icon = CARD_ICONS[icon.trim().toLowerCase()]
    return Icon ? <Icon size={16} strokeWidth={2} /> : null
  }
  return isValidElement(icon) ? icon : null
}

export type CardLabelProps = {
  icon?: CardIcon
  /** Tints the icon square. Unknown names keep the card's own tint. */
  color?: string
  children: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>

/**
 * The label at the top left of a card.
 * Without an icon it is the plain kicker. With one, the icon sits in an outlined
 * square like a phase number and the label follows it in capitals.
 */
export function CardLabel({ icon, color, children, className, ...rest }: CardLabelProps) {
  const glyph = icon === undefined ? null : cardIconGlyph(icon)
  if (!glyph) {
    return (
      <div {...rest} className={cx('plan-kicker', className)}>
        {children}
      </div>
    )
  }
  return (
    <div {...rest} className={cx('plan-card-label', className)} data-has-icon="true">
      <span className="plan-card-icon" data-color={cardIconColor(color)} aria-hidden="true">
        {glyph}
      </span>
      <span className="plan-card-label-text">{children}</span>
    </div>
  )
}
