import { Box, JumpNav, Keybind, ScrollView, Spinner, Text, useApp, useInput, useMediaQuery } from '@semos-labs/glyph'
import { useEffect, useState } from 'react'
import type { DashboardPayload, DashboardPeriod } from '../dashboard.js'
import { archiveUrl, livePlanUrl } from './dashboardView.js'
import {
  FILTER_LABEL,
  PERIODS,
  PERIOD_LABEL,
  STATUS_FILTERS,
  dashboardStatusLine,
  presentPlans,
  shiftFilter,
  shiftPeriod,
  summaryStats,
  type DashboardStatusFilter,
} from './dashboardView.js'
import { openExternal } from './openExternal.js'
import { palette } from './palette.js'
import { PlanCard } from './PlanCard.js'
import { PlanTable } from './PlanTable.js'
import { readDashboard } from './readDashboard.js'
import { SegmentButton } from './SegmentButton.js'
import { StatCard } from './StatCard.js'

type DashboardAppProps = {
  registryUrl: string
  initialPeriod?: DashboardPeriod
  read?: (registryUrl: string, period: DashboardPeriod) => Promise<DashboardPayload>
  openUrl?: (url: string) => void
  refreshMs?: number
}

export function DashboardApp({
  registryUrl,
  initialPeriod = 'day',
  read = readDashboard,
  openUrl = openExternal,
  refreshMs = 4_000,
}: DashboardAppProps) {
  const { columns, rows, exit } = useApp()
  const wide = useMediaQuery({ minColumns: 110 })
  const [period, setPeriod] = useState<DashboardPeriod>(initialPeriod)
  const [filter, setFilter] = useState<DashboardStatusFilter>('all')
  const [payload, setPayload] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const refresh = () => setRefreshTick((tick) => tick + 1)

  useEffect(() => {
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
  }, [registryUrl, period, read, refreshMs, refreshTick])

  const shown = payload ? presentPlans(payload.plans, filter) : []
  const shownKey = shown.map((plan) => plan.id).join('\n')

  useEffect(() => {
    const ids = shownKey.length > 0 ? shownKey.split('\n') : []
    if (ids.length === 0) return
    if (!selectedId || !ids.includes(selectedId)) setSelectedId(ids[0] ?? null)
  }, [shownKey, selectedId])

  const move = (delta: number) => {
    if (shown.length === 0) return
    const index = shown.findIndex((plan) => plan.id === selectedId)
    const start = index === -1 ? 0 : index
    const next = shown[Math.max(0, Math.min(shown.length - 1, start + delta))]
    if (next) setSelectedId(next.id)
  }

  const openSelected = () => {
    const plan = shown.find((entry) => entry.id === selectedId)
    if (!plan) return
    const url = livePlanUrl(plan) ?? archiveUrl(registryUrl, plan)
    if (url) openUrl(url)
  }

  useInput((key) => {
    if (key.ctrl || key.meta || key.alt) return
    if (key.name === 'up' || key.name === 'k') move(-1)
    if (key.name === 'down' || key.name === 'j') move(1)
    if (key.name === 'home' || (key.name === 'g' && !key.shift)) {
      const first = shown[0]
      if (first) setSelectedId(first.id)
    }
    if (key.name === 'end' || (key.name === 'g' && key.shift)) {
      const last = shown[shown.length - 1]
      if (last) setSelectedId(last.id)
    }
  }, [shownKey, selectedId, shown])

  const summary = payload?.summary
  const status = error
    ? error
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
            <Text style={{ bold: true, color: palette.ink }}>Control dashboard</Text>
            <Text style={{ color: palette.muted }}>
              Running plans and plans that have already executed. Summaries follow the local day, week, and month.
            </Text>
          </Box>
        </Box>

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

        {summary ? (
          <Box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
            {summaryStats(summary).map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </Box>
        ) : (
          <Spinner label="Loading…" style={{ color: palette.accent }} />
        )}

        <Text style={{ color: error ? palette.warn : palette.muted }}>{status}</Text>

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
          {shown.length === 0 ? (
            <Text style={{ color: palette.muted }}>No plans in this view.</Text>
          ) : wide ? (
            <PlanTable
              plans={shown}
              selectedId={selectedId}
              hoveredId={hoveredId}
              openUrlFor={livePlanUrl}
              archiveFor={(plan) => archiveUrl(registryUrl, plan)}
              onSelect={setSelectedId}
              onHover={setHoveredId}
              onOpen={openUrl}
            />
          ) : (
            <Box style={{ flexDirection: 'column', gap: 1 }}>
              {shown.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  selected={plan.id === selectedId}
                  hovered={plan.id === hoveredId}
                  openUrl={livePlanUrl(plan)}
                  archive={archiveUrl(registryUrl, plan)}
                  onSelect={() => setSelectedId(plan.id)}
                  onHover={() => setHoveredId(plan.id)}
                  onOpen={openUrl}
                />
              ))}
            </Box>
          )}
        </ScrollView>

        <Text style={{ color: palette.muted }}>
          Click a control · Tab focus · ↑↓ or jk plans · Enter on Open · o open · 1 2 3 period · f filter · r refresh · q
          quit
        </Text>
        <Text style={{ color: palette.muted }}>{registryUrl}</Text>

        <Keybind keypress="q" onPress={() => exit()} />
        <Keybind keypress="escape" onPress={() => exit()} />
        <Keybind keypress="ctrl+c" onPress={() => exit()} priority />
        <Keybind keypress="r" onPress={refresh} />
        <Keybind keypress="f" onPress={() => setFilter((current) => shiftFilter(current))} />
        <Keybind keypress="o" onPress={openSelected} />
        <Keybind keypress="1" onPress={() => setPeriod('day')} />
        <Keybind keypress="2" onPress={() => setPeriod('week')} />
        <Keybind keypress="3" onPress={() => setPeriod('month')} />
        <Keybind keypress="left" onPress={() => setPeriod((current) => shiftPeriod(current, -1))} />
        <Keybind keypress="right" onPress={() => setPeriod((current) => shiftPeriod(current, 1))} />
      </Box>
    </JumpNav>
  )
}
