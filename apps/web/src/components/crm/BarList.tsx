import { cn } from "#/lib/utils.ts"

/**
 * A ranked list of counts, one series, one colour.
 *
 * Every bar is `bg-accent`. Colouring by category would invent a categorical scale for what is a
 * single magnitude comparison, and colouring by rank would repaint the bars whenever the data
 * reorders. Each bar is direct-labelled, so there is nothing for a legend to add.
 */

export type BarRow = { name: string; count: number; meta?: string | null }

/** A non-zero count must never render as an invisible bar, so the fill has a floor of 2% of track. */
const MIN_BAR_PERCENT = 2

export function BarList({ rows, unit = "record", className }: { rows: BarRow[]; unit?: string; className?: string }) {
  const max = Math.max(...rows.map(row => row.count), 1)

  return (
    <div className={cn("space-y-1", className)}>
      {rows.map(row => (
        <div
          key={row.name}
          title={`${row.count.toLocaleString()} ${row.count === 1 ? unit : `${unit}s`} — ${row.name}`}
          className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
        >
          <span className="w-44 shrink-0 truncate text-[13px] text-foreground">{row.name}</span>
          {/* Shared scale: the widest count is a full track, so bar length is comparable down the column. */}
          <div className="min-w-0 flex-1">
            <div
              className="h-1.5 rounded-full bg-accent"
              style={{ width: `${Math.max((row.count / max) * 100, MIN_BAR_PERCENT)}%` }}
            />
          </div>
          {row.meta ? <span className="shrink-0 text-[11px] text-muted-foreground">{row.meta}</span> : null}
          <span className="w-8 shrink-0 text-right text-[13px] text-muted-foreground tabular-nums">
            {row.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

export default BarList
