import type { CompletionState, PlanMode, PlanStatus, ReviewOutcome } from '../processRecord'

/** Values stored in `plans.mode`, `plans.status`, and `plans.meta`. */
export const planModeValues = ['watch', 'comment', 'review'] as const
export const planStatusValues = ['running', 'executed', 'interrupted'] as const
export const completionStateValues = ['idle', 'in_progress', 'partial', 'complete'] as const
export const reviewOutcomeValues = ['approve', 'deny', 'iterate'] as const

type ExactEnum<TValues extends readonly string[], TUnion extends string> = [TUnion] extends [TValues[number]]
  ? [TValues[number]] extends [TUnion]
    ? true
    : never
  : never
type AssertExact<T extends true> = T

type _planModes = AssertExact<ExactEnum<typeof planModeValues, PlanMode>>
type _planStatuses = AssertExact<ExactEnum<typeof planStatusValues, PlanStatus>>
type _completionStates = AssertExact<ExactEnum<typeof completionStateValues, CompletionState>>
type _reviewOutcomes = AssertExact<ExactEnum<typeof reviewOutcomeValues, ReviewOutcome>>
