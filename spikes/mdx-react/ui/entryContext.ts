import { createContext } from 'react'

export type ChoiceContextValue = {
  choiceId: string
  selectedId?: string
  disabled: boolean
  onSelect: (optionId: string, label: string) => void
}

export const ChoiceContext = createContext<ChoiceContextValue | null>(null)

export type FormContextValue = {
  disabled: boolean
  values?: Record<string, string | number>
}

export const FormContext = createContext<FormContextValue | null>(null)

export type ItemContextValue = {
  mode: 'checklist' | 'questions'
  disabled: boolean
  answers?: Record<string, string>
}

export const ItemContext = createContext<ItemContextValue | null>(null)
