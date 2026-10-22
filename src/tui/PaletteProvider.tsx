import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_ACCENT } from '../theme'
import { createPalette, type Palette } from './palette'
import { systemColorMode, type ColorMode } from './systemTheme'

const PaletteContext = createContext<Palette | null>(null)

type PaletteProviderProps = {
  children: ReactNode
  accent?: string
  /** Set to paint a fixed mode. Omit to follow the system theme. */
  colorMode?: ColorMode
}

function useSystemColorMode(override: ColorMode | undefined): ColorMode {
  const [mode, setMode] = useState<ColorMode>(() => override ?? systemColorMode())

  useEffect(() => {
    if (override) {
      setMode(override)
      return
    }
    const read = () => {
      const next = systemColorMode()
      setMode((current) => (current === next ? current : next))
    }
    read()
    const timer = setInterval(read, 2_000)
    return () => clearInterval(timer)
  }, [override])

  return override ?? mode
}

export function PaletteProvider({ children, accent = DEFAULT_ACCENT, colorMode }: PaletteProviderProps) {
  const mode = useSystemColorMode(colorMode)
  const palette = useMemo(() => createPalette(mode, accent), [mode, accent])
  return <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>
}

let fallbackMode: ColorMode | null = null

export function usePalette(): Palette {
  const palette = useContext(PaletteContext)
  if (palette) return palette
  fallbackMode ??= systemColorMode()
  return createPalette(fallbackMode)
}
