import type { ComponentProps, KeyboardEvent } from 'react'

type KbdProps = ComponentProps<'kbd'>

export function Kbd({ className, ...props }: KbdProps) {
  return <kbd data-slot="kbd" className={className ? `plan-kbd ${className}` : 'plan-kbd'} {...props} />
}

type KbdGroupProps = ComponentProps<'kbd'>

export function KbdGroup({ className, ...props }: KbdGroupProps) {
  return (
    <kbd
      data-slot="kbd-group"
      className={className ? `plan-kbd-group ${className}` : 'plan-kbd-group'}
      {...props}
    />
  )
}

function usesCommandKey(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

export function SendShortcut() {
  return (
    <KbdGroup aria-hidden="true">
      <Kbd>{usesCommandKey() ? '⌘' : 'Ctrl'}</Kbd>
      <Kbd>Enter</Kbd>
    </KbdGroup>
  )
}

export function isSendShortcut(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && !event.repeat
}
