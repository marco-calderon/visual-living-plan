import { Box, JumpNav, Keybind, ScrollView, Spinner, Text, useApp, useInput, useMediaQuery } from '@semos-labs/glyph'
import { useEffect, useState } from 'react'
import type { DashboardPayload, DashboardPeriod } from '../dashboard'
import type { ProcessRecord } from '../processRecord'
import { archiveUrl, livePlanUrl } from './dashboardView'
import {
  FILTER_LABEL,
  PERIODS,
  PERIOD_LABEL,
  STATUS_FILTERS,
  dashboardStatusLine,
  planRowKey,
  presentPlans,
  shiftFilter,
  shiftPeriod,
  summaryStats,
  uniqueRowKeys,
  type DashboardStatusFilter,
} from './dashboardView'
import { openExternal } from './openExternal'
import { PaletteProvider, usePalette } from './PaletteProvider'
import { PlanCard } from './PlanCard'
import { PlanTable } from './PlanTable'
import { ProcessList } from './ProcessList'
import { readDashboard } from './readDashboard'
import { readProcesses } from './readProcesses'
import { processOpenUrl, processRowKey, registryStatusLine } from './registryView'
import type { ColorMode } from './systemTheme'
import { SegmentButton } from './SegmentButton'
import { StatCard } from './StatCard'

type TuiSurface = 'running' | 'dashboard'

type DashboardAppProps = {
  registryUrl: string
  initialPeriod?: DashboardPeriod
  read?: (registryUrl: string, period: DashboardPeriod) => Promise<DashboardPayload>
  readRunning?: (registryUrl: string) => Promise<ProcessRecord[]>
  openUrl?: (url: string) => void
  refreshMs?: number
  /** Accent from the theme config. Omit for the default theme accent. */
  accent?: string
  /** Omit to follow the system light or dark theme. */
  colorMode?: ColorMode
  /** Leave the terminal UI. The plan service keeps running. */
  onQuit?: () => void
}

export function DashboardApp({ accent, colorMode, ...props }: DashboardAppProps) {
  return (
    <PaletteProvider accent={accent} colorMode={colorMode}>
      <DashboardScreen {...props} />
    </PaletteProvider>
  )
}

function DashboardScreen({
  registryUrl,
  initialPeriod = 'day',
  read = readDashboard,
  readRunning = readProcesses,
  openUrl = openExternal,
  refreshMs = 4_000,
  onQuit,
}: Omit<DashboardAppProps, 'accent' | 'colorMode'>) {
  const palette = usePalette()
  const { columns, rows, exit } = useApp()
  const wide = useMediaQuery({ minColumns: 110 })
  const [surface, setSurface] = useState<TuiSurface>('dashboard')
  const [period, setPeriod] = useState<DashboardPeriod>(initialPeriod)
  const [filter, setFilter] = useState<DashboardStatusFilter>('all')
  const [payload, setPayload] = useState<DashboardPayload | null>(null)
  const [processes, setProcesses] = useState<ProcessRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedProcessKey, setSelectedProcessKey] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const refresh = () => setRefreshTick((tick) => tick + 1)
  const showRunning = () => {
    setError(null)
    setSurface('running')
  }
  const showDashboard = () => {
    setError(null)
    setSurface('dashboard')
  }
  const quit = () => {
    if (onQuit) onQuit()
    else exit()
  }

  useEffect(() => {
    if (surface !== 'dashboard') return
    let stopped = false
    const load = () => {
      read(registryUrl, period).then(
        (next) => {
          if (stopped) return
          setPayload(next)
          setError(null)
        },
        (cause: unknown) => {
          if (stopped) return
          setError(cause instanceof Error ? cause.message : 'Could not read the dashboard.')
        },
      )
    }
    load()
    const timer = setInterval(load, refreshMs)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [surface, registryUrl, period, read, refreshMs, refreshTick])

  useEffect(() => {
    if (surface !== 'running') return
    let stopped = false
    const load = () => {
      readRunning(registryUrl).then(
        (next) => {
          if (stopped) return
          setProcesses(next)
          setError(null)
        },
        (cause: unknown) => {
          if (stopped) return
          setError(cause instanceof Error ? cause.message : 'Could not read the registry.')
        },
      )
    }
    load()
    const timer = setInterval(load, refreshMs)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [surface, registryUrl, readRunning, refreshMs, refreshTick])

  const shown = payload ? presentPlans(payload.plans, filter) : []
  const planKeys = uniqueRowKeys(shown, planRowKey)
  const shownKey = planKeys.join('\n')
  const running = processes ?? []
  const runningKeys = uniqueRowKeys(running, processRowKey)
  const runningKey = runningKeys.join('\n')

  useEffect(() => {
    if (surface !== 'dashboard') return
    const keys = shownKey.length > 0 ? shownKey.split('\n') : []
    if (keys.length === 0) return
    if (!selectedKey || !keys.includes(selectedKey)) setSelectedKey(keys[0] ?? null)
  }, [surface, shownKey, selectedKey])

  useEffect(() => {
    if (surface !== 'running') return
    const keys = runningKey.length > 0 ? runningKey.split('\n') : []
    if (keys.length === 0) return
    if (!selectedProcessKey || !keys.includes(selectedProcessKey)) setSelectedProcessKey(keys[0] ?? null)
  }, [surface, runningKey, selectedProcessKey])

  const move = (delta: number) => {
    if (surface === 'running') {
      if (running.length === 0) return
      const index = runningKeys.indexOf(selectedProcessKey ?? '')
      const start = index === -1 ? 0 : index
      const next = Math.max(0, Math.min(running.length - 1, start + delta))
      const key = runningKeys[next]
      if (key) setSelectedProcessKey(key)
      return
    }
    if (shown.length === 0) return
    const index = planKeys.indexOf(selectedKey ?? '')
    const start = index === -1 ? 0 : index
    const next = Math.max(0, Math.min(shown.length - 1, start + delta))
    const key = planKeys[next]
    if (key) setSelectedKey(key)
  }

  const openSelected = () => {
    if (surface === 'running') {
      const index = runningKeys.indexOf(selectedProcessKey ?? '')
      const record = index >= 0 ? running[index] : undefined
      const url = record ? processOpenUrl(record) : null
      if (url) openUrl(url)
      return
    }
    const index = planKeys.indexOf(selectedKey ?? '')
    const plan = index >= 0 ? shown[index] : undefined
    if (!plan) return
    const url = livePlanUrl(plan) ?? archiveUrl(registryUrl, plan)
    if (url) openUrl(url)
  }

  useInput((key) => {
    if (key.ctrl || key.meta || key.alt) return
    if (key.name === 'up' || key.name === 'k') move(-1)
    if (key.name === 'down' || key.name === 'j') move(1)
    if (key.name === 'home' || (key.name === 'g' && !key.shift)) {
      if (surface === 'running') {
        const first = runningKeys[0]
        if (first) setSelectedProcessKey(first)
      } else {
        const first = planKeys[0]
        if (first) setSelectedKey(first)
      }
    }
    if (key.name === 'end' || (key.name === 'g' && key.shift)) {
      if (surface === 'running') {
        const last = runningKeys[runningKeys.length - 1]
        if (last) setSelectedProcessKey(last)
      } else {
        const last = planKeys[planKeys.length - 1]
        if (last) setSelectedKey(last)
      }
    }
  }, [surface, shownKey, selectedKey, shown, planKeys, runningKey, selectedProcessKey, running, runningKeys])

  const summary = payload?.summary
  const status = error
    ? error
    : surface === 'running'
      ? processes
        ? registryStatusLine(processes.length)
        : 'Loading…'
      : summary
        ? dashboardStatusLine(summary, filter, shown.length)
        : 'Loading…'

  return (
    <JumpNav>
      <Box
        style={{
          width: columns,
          height: rows,
          flexDirection: 'column',
          bg: palette.paper,
          paddingX: 1,
          paddingY: 0,
          gap: 1,
        }}
      >
        <Box style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 2 }}>
          <Box style={{ flexDirection: 'column', flexShrink: 1, flexGrow: 1 }}>
            <Text style={{ color: palette.accent, bold: true }}>LIVING PLAN</Text>
            <Text style={{ bold: true, color: palette.ink }}>
              {surface === 'running' ? 'Running plans' : 'Control dashboard'}
            </Text>
            <Text style={{ color: palette.muted }}>
              {surface === 'running'
                ? 'Plans started from the CLI. Each one is linked to a directory and that directory\'s git status.'
                : 'Running plans and plans that have already executed. Summaries follow the local day, week, and month.'}
            </Text>
          </Box>
          <Box style={{ flexDirection: 'row', gap: 1 }}>
            <SegmentButton label="Running plans" pressed={surface === 'running'} onPress={showRunning} />
            <SegmentButton label="Dashboard" pressed={surface === 'dashboard'} onPress={showDashboard} />
          </Box>
        </Box>

        {surface === 'dashboard' ? (
          <Box style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 1 }}>
            <Box style={{ flexDirection: 'row', gap: 1 }}>
              {PERIODS.map((value) => (
                <SegmentButton
                  key={value}
                  label={PERIOD_LABEL[value]}
                  pressed={period === value}
                  onPress={() => setPeriod(value)}
                />
              ))}
            </Box>
            <SegmentButton label="Refresh" pressed={false} onPress={refresh} />
          </Box>
        ) : (
          <Box style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <SegmentButton label="Refresh" pressed={false} onPress={refresh} />
          </Box>
        )}

        {surface === 'dashboard' && summary ? (
          <Box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
            {summaryStats(summary).map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </Box>
        ) : null}
        {surface === 'dashboard' && !summary && !error ? (
          <Spinner label="Loading…" style={{ color: palette.accent }} />
        ) : null}
        {surface === 'running' && !processes && !error ? (
          <Spinner label="Loading…" style={{ color: palette.accent }} />
        ) : null}

        <Text style={{ color: error ? palette.warn : palette.muted }}>{status}</Text>

        {surface === 'dashboard' ? (
          <Box style={{ flexDirection: 'row', gap: 1 }}>
            {STATUS_FILTERS.map((value) => (
              <SegmentButton
                key={value}
                label={FILTER_LABEL[value]}
                pressed={filter === value}
                onPress={() => setFilter(value)}
              />
            ))}
          </Box>
        ) : null}

        <ScrollView
          focusable={false}
          style={{
            flexGrow: 1,
            border: 'round',
            borderColor: palette.line,
            bg: palette.panel,
            paddingX: 1,
            paddingY: 0,
          }}
        >
          {surface === 'running' ? (
            running.length === 0 ? (
              <Text style={{ color: palette.muted }}>No plans are running.</Text>
            ) : (
              <ProcessList
                records={running}
                selectedKey={selectedProcessKey}
                onSelect={setSelectedProcessKey}
                onOpen={openUrl}
              />
            )
          ) : shown.length === 0 ? (
            <Text style={{ color: palette.muted }}>No plans in this view.</Text>
          ) : wide ? (
            <PlanTable
              plans={shown}
              selectedKey={selectedKey}
              hoveredKey={hoveredKey}
              openUrlFor={livePlanUrl}
              archiveFor={(plan) => archiveUrl(registryUrl, plan)}
              onSelect={setSelectedKey}
              onHover={setHoveredKey}
              onOpen={openUrl}
            />
          ) : (
            <Box style={{ flexDirection: 'column', gap: 1 }}>
              {shown.map((plan, index) => {
                const key = planKeys[index] ?? planRowKey(plan)
                return (
                  <PlanCard
                    key={key}
                    plan={plan}
                    selected={key === selectedKey}
                    hovered={key === hoveredKey}
                    openUrl={livePlanUrl(plan)}
                    archive={archiveUrl(registryUrl, plan)}
                    onSelect={() => setSelectedKey(key)}
                    onHover={() => setHoveredKey(key)}
                    onOpen={openUrl}
                  />
                )
              })}
            </Box>
          )}
        </ScrollView>

        <Text style={{ color: palette.muted }}>
          p running plans    d dashboard    ↑↓ or jk    o open    r refresh    1 2 3 period    f filter    q quit
        </Text>
        <Text style={{ color: palette.muted }}>{registryUrl}</Text>

        <Keybind keypress="q" onPress={quit} />
        <Keybind keypress="escape" onPress={quit} />
        <Keybind keypress="ctrl+c" onPress={quit} priority />
        <Keybind keypress="p" onPress={showRunning} />
        <Keybind keypress="d" onPress={showDashboard} />
        <Keybind keypress="r" onPress={refresh} />
        <Keybind keypress="o" onPress={openSelected} />
        <Keybind
          keypress="f"
          onPress={() => {
            if (surface === 'dashboard') setFilter((current) => shiftFilter(current))
          }}
        />
        <Keybind
          keypress="1"
          onPress={() => {
            if (surface === 'dashboard') setPeriod('day')
          }}
        />
        <Keybind
          keypress="2"
          onPress={() => {
            if (surface === 'dashboard') setPeriod('week')
          }}
        />
        <Keybind
          keypress="3"
          onPress={() => {
            if (surface === 'dashboard') setPeriod('month')
          }}
        />
        <Keybind
          keypress="left"
          onPress={() => {
            if (surface === 'dashboard') setPeriod((current) => shiftPeriod(current, -1))
          }}
        />
        <Keybind
          keypress="right"
          onPress={() => {
            if (surface === 'dashboard') setPeriod((current) => shiftPeriod(current, 1))
          }}
        />
      </Box>
    </JumpNav>
  )
}
