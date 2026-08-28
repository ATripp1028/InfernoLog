import type { RunsGraphEntry } from '@/lib/api/levelPage'
import { barColor, entryKey, entryLabel, labelColor } from './runsGraphBars'

const TICK_POSITIONS = [0, 25, 50, 75, 100]

interface RunsGraphProps {
  entries: RunsGraphEntry[]
}

/**
 * Every logged run as a horizontal span, showing where attempts clustered and how far they reached.
 */
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
                      <span className="inline-flex h-[17px] items-center rounded bg-danger-dim px-1.5 text-[9px] font-medium text-danger-soft">
                        ⚑ dropped
                      </span>
                    )}
                  </div>

                  {/* Track + bar */}
                  <div className="relative mt-1.5" style={{ height: 8 }}>
                    {/* Track (grey background) */}
                    <div className="absolute inset-0 rounded-full bg-bg-subtle/50" />
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
