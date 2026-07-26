import { useLayoutEffect, useRef, useState } from 'react'
import type { RunsGraphEntry } from './types'

// Bar colors per entry state
function barColor(entry: RunsGraphEntry): string {
  if (entry.droppedAfter) return 'rgba(226,74,74,0.9)'
  if (entry.kind === 'completion') return '#22c55e'
  if (entry.kind === 'worst_fail') return 'rgba(251,146,60,0.9)'
  return 'rgba(115,115,115,0.9)'
}

function labelColor(entry: RunsGraphEntry): string {
  if (entry.droppedAfter) return '#ff8a8a'
  if (entry.kind === 'completion') return '#5ddc8a'
  if (entry.kind === 'worst_fail') return '#fb923c'
  return '#c8c8c8'
}

function entryLabel(entry: RunsGraphEntry): string {
  if (entry.kind === 'completion') return 'Completion'
  if (entry.kind === 'worst_fail') return 'Worst fail'
  if (entry.from === 0) return `${entry.to}% from 0`
  return `run ${entry.from} → ${entry.to}%`
}

const TICK_POSITIONS = [0, 25, 50, 75, 100]

interface RunsGraphProps {
  entries: RunsGraphEntry[]
}

// A stable identity for a bar, independent of its current position in the
// array — `progressUpdateId` is null for the worst-fail bar and for
// synthetic drop-derived bars, both of which can change position when an
// edit shifts the chronological sort order. Falling back to the array index
// there would let a row's DOM/refs/overlap-state get reused by an unrelated
// bar after a reorder (observed as a duplicated percent label).
function entryKey(entry: RunsGraphEntry, i: number): string {
  if (entry.progressUpdateId) return entry.progressUpdateId
  if (entry.kind === 'worst_fail') return 'worst-fail'
  return `drop-${entry.to}-${i}`
}

export function RunsGraph({ entries }: RunsGraphProps) {
  // Track which "worst fail" rows have their end-percent label overlapping
  // the "Worst fail" text label, so it can be moved inline instead.
  const labelRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const percentRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const [overlapKeys, setOverlapKeys] = useState<Set<string>>(new Set())

  useLayoutEffect(() => {
    const recompute = () => {
      const next = new Set<string>()
      entries.forEach((entry, i) => {
        if (entry.kind !== 'worst_fail') return
        const key = entryKey(entry, i)
        const labelEl = labelRefs.current.get(key)
        const percentEl = percentRefs.current.get(key)
        if (!labelEl || !percentEl) return
        const labelRect = labelEl.getBoundingClientRect()
        const percentRect = percentEl.getBoundingClientRect()
        if (percentRect.left < labelRect.right + 4) {
          next.add(key)
        }
      })
      setOverlapKeys(next)
    }

    recompute()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(recompute)
    labelRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [entries])

  if (entries.length === 0) return null

  // Each bar row: 6px track (grey), 8px colored bar on top, label above
  // All values are 0–100 on the percentage axis
  const ROW_HEIGHT = 46 // label (14px) + spacing + bar track (6px) + gap

  return (
    <div>
      <div className="relative overflow-hidden rounded-card border border-border-subtle bg-bg-surface">
        {/* Tick grid lines (vertical) */}
        <div
          className="relative"
          style={{ height: entries.length * ROW_HEIGHT + 32 }}
        >
          {/* Axis labels row at bottom */}
          <div className="absolute inset-x-0 bottom-0 flex justify-between px-3.5 pb-1.5 -translate-x-1">
            {TICK_POSITIONS.map((tick) => (
              <span
                key={tick}
                className="text-[9px] text-text-tertiary"
                style={{ width: 0, textAlign: 'left' }}
              >
                {tick === 100 ? '100' : tick === 0 ? '0' : tick}
              </span>
            ))}
          </div>

          {/* Tick lines */}
          {TICK_POSITIONS.map((tick, i) => (
            <div
              key={tick}
              className="absolute bottom-5 top-3"
              style={{
                left: `calc(${tick}% * (100% - 28px) / 100 + 14px)`,
                width: 1,
                background:
                  i === 0 ? 'rgba(42,42,42,0.8)' : 'rgba(42,42,42,0.4)',
              }}
              aria-hidden
            />
          ))}

          {/* Bars */}
          <div className="absolute inset-x-3.5 bottom-5 top-3 flex flex-col gap-0">
            {entries.map((entry, i) => {
              const fromPct = entry.from
              const toPct = entry.to
              const color = barColor(entry)
              const label = entryLabel(entry)
              const lColor = labelColor(entry)
              const rowTop = i * ROW_HEIGHT
              const isWorstFail = entry.kind === 'worst_fail'
              const key = entryKey(entry, i)
              // A bar starting at the left edge is understood to start from
              // 0, and one reaching the right edge is understood to reach
              // 100 — labeling those values above the bar is redundant.
              const showPercentLabel = toPct !== 0 && toPct !== 100
              const overlapsWorstFailLabel =
                isWorstFail && overlapKeys.has(key)

              return (
                <div
                  key={key}
                  className="absolute left-0 right-0"
                  style={{ top: rowTop, height: ROW_HEIGHT }}
                >
                  {/* Label row */}
                  <div className="flex items-end gap-2" style={{ height: 20 }}>
                    <span
                      ref={
                        isWorstFail
                          ? (el) => {
                              if (el) labelRefs.current.set(key, el)
                              else labelRefs.current.delete(key)
                            }
                          : undefined
                      }
                      className="text-[11px] leading-none"
                      style={{
                        color: lColor,
                        marginLeft: `${fromPct}%`,
                      }}
                    >
                      {label}
                    </span>

                    {isWorstFail &&
                      showPercentLabel &&
                      overlapsWorstFailLabel && (
                        <span
                          className="text-[10px] font-medium leading-none"
                          style={{ color: lColor }}
                        >
                          {toPct}%
                        </span>
                      )}

                    {entry.droppedAfter && (
                      <span className="inline-flex h-[17px] items-center rounded bg-[rgba(226,74,74,0.14)] px-1.5 text-[9px] font-medium text-[#ff8a8a]">
                        ⚑ dropped
                      </span>
                    )}
                  </div>

                  {/* Track + bar */}
                  <div className="relative mt-1.5" style={{ height: 8 }}>
                    {/* Track (grey background) */}
                    <div className="absolute inset-0 rounded-full bg-[rgba(42,42,42,0.5)]" />
                    {/* Colored bar */}
                    <div
                      className="absolute top-0 h-full rounded-full"
                      style={{
                        left: `${fromPct}%`,
                        width: `${toPct - fromPct}%`,
                        background: color,
                      }}
                    />
                    {/* End percentage label — sits above the bar end, centred on it */}
                    {showPercentLabel && (
                      <span
                        ref={
                          isWorstFail
                            ? (el) => {
                                if (el) percentRefs.current.set(key, el)
                                else percentRefs.current.delete(key)
                              }
                            : undefined
                        }
                        className="absolute -top-4 text-[10px] font-medium leading-none"
                        style={{
                          left: `${toPct}%`,
                          transform: 'translateX(-50%)',
                          color: lColor,
                          visibility: overlapsWorstFailLabel
                            ? 'hidden'
                            : 'visible',
                        }}
                      >
                        {toPct}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-text-tertiary">
        Orange = worst fail · Red = dropped after · Green = completion
      </p>
    </div>
  )
}
