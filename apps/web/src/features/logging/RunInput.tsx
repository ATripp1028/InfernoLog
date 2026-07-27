import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface ParsedRun {
  from: number
  to: number
}

export type RunParseResult =
  | { kind: 'empty' }
  | { kind: 'error'; message: string; fix?: { label: string; value: string } }
  | { kind: 'ok'; from: number; to: number }

// Grammar: "N"/"N%" is a run from 0% to N; "A-B"/"A%-B%" (hyphen, en-dash, or
// em-dash, spaces tolerated) is a run that started partway through. Matches
// community shorthand for logging progress rather than inventing new syntax.
const RANGE_RE = /^\s*(\d{1,3})\s*%?\s*[-–—]\s*(\d{1,3})\s*%?\s*$/
const SINGLE_RE = /^\s*(\d{1,3})\s*%?\s*$/

export function parseRunInput(raw: string): RunParseResult {
  if (raw.trim() === '') return { kind: 'empty' }

  const rangeMatch = raw.match(RANGE_RE)
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1]!, 10)
    const b = parseInt(rangeMatch[2]!, 10)
    if (a > 100 || b > 100) {
      return { kind: 'error', message: 'Percentages must be 0–100.' }
    }
    if (a === b) {
      return {
        kind: 'error',
        message:
          'Start and end are the same — enter just one number for a run from 0%.',
      }
    }
    if (a > b) {
      return {
        kind: 'error',
        message: "That's high-to-low.",
        fix: { label: `Swap to ${b}–${a}`, value: `${b}-${a}` },
      }
    }
    return { kind: 'ok', from: a, to: b }
  }

  const singleMatch = raw.match(SINGLE_RE)
  if (singleMatch) {
    const n = parseInt(singleMatch[1]!, 10)
    if (n > 100) {
      return { kind: 'error', message: 'Percentages must be 0–100.' }
    }
    if (n === 0) {
      return {
        kind: 'error',
        message: "0% isn't a run — enter how far it reached.",
      }
    }
    return { kind: 'ok', from: 0, to: n }
  }

  return {
    kind: 'error',
    message:
      "Couldn't read that — try a number like 63, or a range like 52-92.",
  }
}

// Seeds the box from an existing entry's stored fields.
export function formatRunInputValue(
  percentage: number | null,
  runFrom: number | null,
  runTo: number | null
): string {
  if (runFrom != null && runTo != null) return `${runFrom}-${runTo}`
  if (percentage != null) return String(Math.round(percentage))
  return ''
}

export interface RunInputProps {
  id?: string
  initialValue: string
  onParsedChange: (result: ParsedRun | null) => void
}

// Free-text run percentage input — parses as you type instead of a mode
// toggle + separate from/to fields. See parseRunInput for the grammar.
export function RunInput({ id, initialValue, onParsedChange }: RunInputProps) {
  const [text, setText] = useState(initialValue)
  const result = parseRunInput(text)

  useEffect(() => {
    onParsedChange(
      result.kind === 'ok' ? { from: result.from, to: result.to } : null
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return (
    <div>
      <Input
        id={id}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="e.g. 63 or 52-92"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={cn(
          result.kind === 'error' && 'border-danger focus-visible:ring-danger'
        )}
      />
      <p className="mt-1.5 text-xs text-text-tertiary">
        A single number (<code className="text-text-secondary">63</code> or{' '}
        <code className="text-text-secondary">63%</code>) is a run from 0%. A
        range (<code className="text-text-secondary">52-92</code> or{' '}
        <code className="text-text-secondary">52%-92%</code>) started partway
        through.
      </p>
      {result.kind === 'error' && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-danger">
          <span>{result.message}</span>
          {result.fix && (
            <button
              type="button"
              onClick={() => setText(result.fix!.value)}
              className="ml-auto shrink-0 rounded-full border border-danger bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger transition-colors hover:bg-danger/20"
            >
              {result.fix.label}
            </button>
          )}
        </div>
      )}
      {result.kind === 'ok' && (
        <p className="mt-1.5 text-xs text-text-secondary">
          Parsed as{' '}
          <strong className="font-medium text-text-primary">
            {result.from}% → {result.to}%
          </strong>
          {result.from === 0 ? ' · from 0%' : ' · partial run'}
        </p>
      )}
    </div>
  )
}
