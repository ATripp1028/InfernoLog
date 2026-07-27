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
// there would let React reuse an unrelated bar's identity after a reorder, so
// synthetic drop bars key on their own `date` instead — a level can be
// dropped more than once at the same worst-fail percentage, but each drop
// still has its own (possibly null) date.
function entryKey(entry: RunsGraphEntry): string {
  if (entry.progressUpdateId) return entry.progressUpdateId
  if (entry.kind === 'worst_fail') return 'worst-fail'
  return `drop-${entry.to}-${entry.date ?? 'no-date'}`
}

export function RunsGraph({ entries }: RunsGraphProps) {
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
              const key = entryKey(entry)

              return (
                <div
                  key={key}
                  className="absolute left-0 right-0"
                  style={{ top: rowTop, height: ROW_HEIGHT }}
                >
                  {/* Label row */}
                  <div className="flex items-end gap-2" style={{ height: 20 }}>
                    <span
                      className="text-[11px] leading-none"
                      style={{
                        color: lColor,
                        marginLeft: `${fromPct}%`,
                      }}
                    >
                      {label}
                    </span>

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
