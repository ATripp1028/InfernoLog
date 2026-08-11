import { useEffect, useState } from 'react'
import { Input } from '@/components/generic/input'
import { cn } from '@/lib/utils'
import { parseRunInput, type ParsedRun } from './runParsing'

/**
 * Props for the run input. See {@link parseRunInput} for the accepted syntax.
 */
export interface RunInputProps {
  id?: string
  initialValue: string
  onParsedChange: (result: ParsedRun | null) => void
}

/**
 * Free-text run percentage input — parses as you type instead of a mode
 * toggle + separate from/to fields. See parseRunInput for the grammar.
 */
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
