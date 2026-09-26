import { Columns3, Plus, Search } from "lucide-react"
import { useState } from "react"
import { Input } from "#/components/ui/input.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover.tsx"
import { columnIcon } from "#/lib/crm-columns.ts"
import { fieldLabel } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * Which columns the grid shows.
 *
 * Every column the API returns is offered, not a curated shortlist — the defaults are a starting
 * view, not a ceiling. Objects here carry up to sixty columns, so the list is searchable: scrolling
 * sixty checkboxes to find "Employee range" is slower than typing four letters of it.
 */
export function ViewSettings({
  columns,
  visible,
  kinds,
  onToggle,
  onReset,
  /** The compact "+" at the end of the header row, instead of a labelled toolbar button. */
  variant = "button",
}: {
  columns: string[]
  visible: string[]
  kinds: Record<string, string>
  onToggle: (column: string) => void
  onReset: () => void
  variant?: "button" | "plus"
}) {
  const [filter, setFilter] = useState("")
  const shown = new Set(visible)
  const needle = filter.trim().toLowerCase()
  const matches = needle ? columns.filter(column => fieldLabel(column).toLowerCase().includes(needle)) : columns

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex items-center gap-1.5 rounded-md text-[13px] outline-none transition-colors",
          variant === "plus"
            ? "size-6 justify-center text-muted-foreground hover:bg-border/60 hover:text-foreground"
            : "h-8 border border-border bg-card px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        title="Choose columns"
      >
        {variant === "plus" ? (
          <Plus size={14} />
        ) : (
          <>
            <Columns3 size={14} />
            Columns
            <span className="tabular-nums">{visible.length}</span>
          </>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-72 p-0">
        <div className="relative border-border border-b">
          <Search size={13} className="-translate-y-1/2 absolute top-1/2 left-2.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder="Find a column"
            className="h-9 border-0 pl-8 text-[13px] shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {matches.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">No column by that name</p>
          ) : null}

          {matches.map(column => {
            const Icon = columnIcon(kinds[column])
            const checked = shown.has(column)

            return (
              <label
                key={column}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-accent",
                  // The name column is the row's identity, so it is always on and cannot be turned off.
                  column === "label" && "cursor-default opacity-60 hover:bg-transparent",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={column === "label"}
                  onChange={() => onToggle(column)}
                  className="size-[13px] accent-primary"
                />
                <Icon size={12} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{fieldLabel(column)}</span>
              </label>
            )
          })}
        </div>

        <div className="border-border border-t p-1">
          <button
            type="button"
            onClick={onReset}
            className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Reset to default columns
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default ViewSettings
