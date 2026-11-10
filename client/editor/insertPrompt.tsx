import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Popover, PopoverContent } from '../ui/Popover.tsx'
import { normalizeInsertUrl, previewableImageUrl } from './insertUrl.ts'

export type InsertKind = 'link' | 'image'
export type InsertValues = { url: string; text: string }

const COPY: Record<InsertKind, { title: string; url: string; text: string; textHint: string; submit: string }> = {
  link: {
    title: 'Link',
    url: 'Address',
    text: 'Text',
    textHint: 'Shown instead of the address (optional)',
    submit: 'Add link',
  },
  image: {
    title: 'Image',
    url: 'Image address',
    text: 'Description',
    textHint: 'Read aloud and shown if the image does not load',
    submit: 'Add image',
  },
}

/**
 * The small form the card menu opens for Link and Image: an address and a text, next to the line
 * the "/" was typed on. Enter adds; Escape or a click outside closes it and adds nothing.
 */
export function InsertPrompt({
  kind,
  anchor,
  onSubmit,
  onCancel,
}: {
  kind: InsertKind
  /** Where the "/" was, in the viewport. */
  anchor: DOMRect
  onSubmit: (values: InsertValues) => void
  onCancel: () => void
}) {
  const copy = COPY[kind]
  const id = useId()
  const urlRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const [broken, setBroken] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const result = normalizeInsertUrl(url, kind)
  const candidate = kind === 'image' && result.ok ? result.url : null

  // Load the preview once typing pauses on a finished address, not for every key.
  useEffect(() => {
    setPreview(null)
    setBroken(false)
    if (!candidate || !previewableImageUrl(candidate)) return
    const timer = setTimeout(() => setPreview(candidate), 450)
    return () => clearTimeout(timer)
  }, [candidate])
  const virtual = useMemo(() => ({ getBoundingClientRect: () => anchor }), [anchor])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (result.ok) onSubmit({ url: result.url, text: text.trim() })
    else urlRef.current?.focus()
  }

  return (
    <Popover open onOpenChange={(next) => (next ? undefined : onCancel())}>
      <PopoverContent
        className="plan-insert-prompt"
        anchor={virtual}
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        initialFocus={urlRef}
        data-insert-prompt={kind}
      >
        <form onSubmit={submit} noValidate>
          <div className="plan-insert-prompt-title">{copy.title}</div>
          <label className="plan-insert-prompt-field" htmlFor={`${id}-url`}>
            <span>{copy.url}</span>
            <input
              id={`${id}-url`}
              ref={urlRef}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://"
              value={url}
              aria-invalid={tried && !result.ok}
              aria-describedby={tried && !result.ok ? `${id}-error` : undefined}
              data-insert-url=""
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          {tried && !result.ok ? (
            <p className="plan-insert-prompt-error" id={`${id}-error`} role="alert">
              {result.reason}
            </p>
          ) : null}
          <label className="plan-insert-prompt-field" htmlFor={`${id}-text`}>
            <span>{copy.text}</span>
            <input
              id={`${id}-text`}
              type="text"
              autoComplete="off"
              placeholder={copy.textHint}
              value={text}
              data-insert-text=""
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          {preview ? (
            <div className="plan-insert-prompt-preview" data-broken={broken ? 'true' : undefined}>
              {broken ? (
                <span>This address does not load as an image here. You can still add it.</span>
              ) : (
                <img src={preview} alt="" onError={() => setBroken(true)} />
              )}
            </div>
          ) : null}
          <div className="plan-insert-prompt-actions">
            <button type="button" className="plan-btn plan-btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="plan-btn plan-btn-primary" data-insert-submit="">
              {copy.submit}
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
