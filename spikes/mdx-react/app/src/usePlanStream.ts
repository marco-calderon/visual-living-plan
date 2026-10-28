import { useCallback, useEffect, useState } from 'react'
import { samplePlanId, serverEventNames } from '../../server/protocol'
import { currentPlanState, postPlanEvent, subscribePlanConnection, subscribePlanEvents } from './planStream'

export function usePlanStream() {
  const [state, setState] = useState(currentPlanState)
  const [connected, setConnected] = useState(false)
  const [openPlanId, setOpenPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => setState(currentPlanState())
    const unsubs = serverEventNames.map((event) => subscribePlanEvents(event, refresh))
    const unsubConnection = subscribePlanConnection(setConnected)
    refresh()
    return () => {
      for (const unsub of unsubs) unsub()
      unsubConnection()
    }
  }, [])

  useEffect(() => {
    setOpenPlanId((current) => {
      if (current && state.plans.some((plan) => plan.id === current)) return current
      return state.plans.find((plan) => plan.id === samplePlanId)?.id ?? state.plans[0]?.id ?? null
    })
  }, [state.plans])

  const openPlan = state.plans.find((plan) => plan.id === openPlanId) ?? null
  const openSnapshots = state.snapshots.filter((snapshot) => snapshot.documentId === openPlan?.id)

  const fail = useCallback((caught: unknown, fallback: string) => {
    const message = caught instanceof Error ? caught.message : fallback
    setError(message)
  }, [])

  const edit = useCallback(
    async (body: string, title?: string) => {
      if (!openPlanId) {
        const missing = new Error('No open plan')
        fail(missing, missing.message)
        throw missing
      }
      try {
        setError(null)
        await postPlanEvent('edit', title === undefined ? { planId: openPlanId, body } : { planId: openPlanId, body, title })
      } catch (caught) {
        fail(caught, 'Edit failed')
        throw caught
      }
    },
    [fail, openPlanId],
  )

  const restore = useCallback(
    async (snapshotId: string) => {
      if (!openPlanId) {
        const missing = new Error('No open plan')
        fail(missing, missing.message)
        throw missing
      }
      try {
        setError(null)
        await postPlanEvent('restore', { planId: openPlanId, snapshotId })
      } catch (caught) {
        fail(caught, 'Restore failed')
        throw caught
      }
    },
    [fail, openPlanId],
  )

  const create = useCallback(
    async (title: string, body: string) => {
      try {
        setError(null)
        const result = await postPlanEvent('create', { title, body })
        const createdId = result.plan.id
        if (typeof createdId === 'string') setOpenPlanId(createdId)
      } catch (caught) {
        fail(caught, 'Create failed')
        throw caught
      }
    },
    [fail],
  )

  const open = useCallback((planId: string) => {
    setOpenPlanId(planId)
  }, [])

  useEffect(() => {
    window.__MDX_PLAN_HOST__ = {
      connected,
      plan: openPlan,
      snapshots: openSnapshots,
      edit,
      restore,
      create,
      open,
    }
  })

  return {
    connected,
    plans: state.plans,
    snapshots: state.snapshots,
    openPlan,
    openSnapshots,
    error,
    open,
    edit,
    restore,
    create,
  }
}
