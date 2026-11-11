import { useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'
import { DESKTOP_APPEARANCE_EVENT, saveDesktopAppearance } from '../desktopBridge.ts'
import { pageFollowsAccount, SettingsDialog, THEME_URL } from './SettingsDialog.tsx'
import {
  OPEN_SETTINGS_EVENT,
  settingsSectionId,
  type RootSearch,
  type SettingsSectionId,
  type SettingsWindow,
} from './settingsSections.ts'

type SettingsState = { settingsModal?: boolean }

function withoutSettings(search: Record<string, unknown>): Record<string, unknown> {
  const { settings: _settings, settingsError: _error, ...rest } = search
  return rest
}

/**
 * Settings open over whatever page is showing. The section is the `settings` search value, so opening
 * pushes a history entry, Back closes the modal, and a link to `?settings=usage` opens that section.
 */
export function SettingsLayer() {
  const search = useSearch({ strict: false }) as RootSearch
  const navigate = useNavigate()
  const router = useRouter()
  const section = settingsSectionId(search.settings)

  useEffect(() => {
    const open = (event: Event) => {
      const wanted = settingsSectionId((event as CustomEvent<{ section?: string }>).detail?.section) ?? 'general'
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...withoutSettings(prev), settings: wanted }),
        state: (prev: Record<string, unknown>) => ({ ...prev, settingsModal: true }),
        resetScroll: false,
      } as never)
    }
    const win = window as SettingsWindow
    win.__LIVE_PLAN_SETTINGS_LAYER__ = true
    window.addEventListener(OPEN_SETTINGS_EVENT, open)
    return () => {
      delete win.__LIVE_PLAN_SETTINGS_LAYER__
      window.removeEventListener(OPEN_SETTINGS_EVENT, open)
    }
  }, [navigate])

  // Inside the desktop app: save the look chosen in its setup to this account, once.
  useEffect(() => {
    const save = () => void saveDesktopAppearance(THEME_URL, pageFollowsAccount)
    save()
    window.addEventListener(DESKTOP_APPEARANCE_EVENT, save)
    return () => window.removeEventListener(DESKTOP_APPEARANCE_EVENT, save)
  }, [])

  function select(next: SettingsSectionId) {
    if (next === section) return
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => ({ ...withoutSettings(prev), settings: next }),
      state: (prev: Record<string, unknown>) => prev,
      replace: true,
      resetScroll: false,
    } as never)
  }

  function close() {
    // Opened from this page: step back so the history has no leftover settings entry.
    if ((router.state.location.state as SettingsState).settingsModal) {
      router.history.back()
      return
    }
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => withoutSettings(prev),
      replace: true,
      resetScroll: false,
    } as never)
  }

  return <SettingsDialog section={section} errorCode={search.settingsError} onSelect={select} onClose={close} />
}
