import { useEffect, useRef, useState } from 'react'
import { Switch } from '../ui/Switch.tsx'

type ThemeDetail = {
  wrapCode?: boolean
}

type CodeWrapSwitchProps = {
  initialChecked: boolean
}

function apiPath(path: string): string {
  const base = (window as Window & { __LIVE_PLAN_BASE__?: string }).__LIVE_PLAN_BASE__ ?? ''
  return `${base}${path}`
}

function readWrapCode(): boolean {
  return document.documentElement.dataset.wrapCode === 'true'
}

function publishWrapCode(on: boolean): void {
  document.documentElement.dataset.wrapCode = on ? 'true' : 'false'
  window.dispatchEvent(new CustomEvent('living-plan-theme', { detail: { wrapCode: on } }))
}

export function CodeWrapSwitch({ initialChecked }: CodeWrapSwitchProps) {
  const [checked, setChecked] = useState(initialChecked)
  const request = useRef(0)

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<ThemeDetail>).detail
      const next = typeof detail?.wrapCode === 'boolean' ? detail.wrapCode : readWrapCode()
      setChecked((previous) => (previous === next ? previous : next))
    }
    window.addEventListener('living-plan-theme', sync)
    return () => window.removeEventListener('living-plan-theme', sync)
  }, [])

  async function onCheckedChange(next: boolean): Promise<void> {
    const id = request.current + 1
    request.current = id
    const previous = checked
    setChecked(next)
    publishWrapCode(next)
    try {
      const response = await fetch(apiPath('/api/theme'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wrapCode: next }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to save settings')
      }
      if (request.current !== id) return
      window.showPlanToast?.(next ? 'Code wraps' : 'Code scrolls')
    } catch (error) {
      if (request.current !== id) return
      setChecked(previous)
      publishWrapCode(previous)
      const message = error instanceof Error ? error.message : 'Could not save code wrap'
      window.showPlanToast?.(message)
    }
  }

  return (
    <Switch
      id="code-wrap-switch"
      checked={checked}
      onCheckedChange={(next) => {
        void onCheckedChange(next)
      }}
      aria-labelledby="code-wrap-label"
    />
  )
}
