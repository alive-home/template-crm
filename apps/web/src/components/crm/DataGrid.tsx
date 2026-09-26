import { FieldValue } from "#/components/crm/FieldValue.tsx"
import { CELL, CHIPS_PER_CELL, GUTTER, HEAD, HeaderCell, NameCell, SEAM } from "#/components/crm/GridCells.tsx"
import { Checkbox } from "#/components/ui/checkbox.tsx"
import { columnWidth } from "#/lib/crm-columns.ts"
import type { CrmObject, CrmRecord } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * The record grid.
 *
 * Built as a spreadsheet rather than a report: ruled columns, a checkbox gutter, a type icon per
 * header and a menu on every column. The point is that a column is a thing you act on — sort it,
 * hide it — not a fixed label the page decided for you.
 *
 * The gutter and the name column are pinned left. These tables are wide enough to scroll sideways
 * now, and a row whose name has scrolled away is an anonymous row of values.
 */

export type SortState = { column: string; direction: "asc" | "desc" }

export function DataGrid({
  object,
  rows,
  columns,
  kinds,
  sort,
  onSort,
  onHide,
  selected,
  onSelect,
  addColumn,
  className,
  children,
  footer,
}: {
  object: CrmObject
  rows: CrmRecord[]
  columns: string[]
  /** Attribute type per column, resolved from the mirrored catalog. */
  kinds: Record<string, string>
  sort: SortState | null
  onSort: (next: SortState | null) => void
  onHide: (column: string) => void
  selected: Set<string>
  onSelect: (next: Set<string>) => void
  /** The "+" control at the end of the header row — the column picker lives behind it. */
  addColumn?: React.ReactNode
  className?: string
  /** Rendered in place of rows when there are none. */
  children?: React.ReactNode
  /**
   * Rendered as a last row, below the records.
   *
   * This is where the infinite scroll's sentinel goes. It has to live inside the scrolling element
   * rather than under it: the grid owns its own overflow, so an element placed after the table is
   * pinned in the layout and is "visible" from the first paint, which would fetch every page at once
   * without anybody scrolling.
   */
  footer?: React.ReactNode
}) {
  const allSelected = rows.length > 0 && rows.every(row => selected.has(row.record_id))
  const someSelected = rows.some(row => selected.has(row.record_id))

  function toggleAll() {
    onSelect(allSelected ? new Set() : new Set(rows.map(row => row.record_id)))
  }

  function toggleRow(id: string) {
    const next = new Set(selected)
    if (!next.delete(id)) next.add(id)
    onSelect(next)
  }

  return (
    <div className={cn("relative overflow-auto rounded-xl border border-border bg-card", className)}>
      {/* `border-separate` rather than `border-collapse`: a collapsed border is shared between two
			    cells, and where a pinned cell meets a scrolling one that shared 1px line let the row
			    underneath show through it as a sliver of ghost text. */}
      <table className="w-full border-separate border-spacing-0">
        <thead className="sticky top-0 z-20">
          <tr>
            <th scope="col" className={cn(HEAD, GUTTER, SEAM, "sticky top-0 left-0 z-40 px-0 text-center")}>
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="Select all rows"
                className="mx-auto"
              />
            </th>

            {columns.map((column, index) => (
              <HeaderCell
                key={column}
                column={column}
                kind={kinds[column] ?? "text"}
                sort={sort}
                onSort={onSort}
                onHide={onHide}
                // The name column is the row's identity; hiding it leaves a table of orphan values.
                canHide={column !== "label"}
                sticky={index === 0}
              />
            ))}

            <th scope="col" className={cn(HEAD, "sticky top-0 z-20 w-full min-w-10 border-r-0 px-1")}>
              {addColumn}
            </th>
          </tr>
        </thead>

        <tbody>
          {children ? (
            <tr>
              <td colSpan={columns.length + 2} className="p-0">
                {children}
              </td>
            </tr>
          ) : null}

          {rows.map((row, index) => {
            const isSelected = selected.has(row.record_id)

            return (
              <tr key={row.record_id} className={cn("group", isSelected ? "bg-accent/40" : "hover:bg-muted/40")}>
                <td
                  className={cn(
                    CELL,
                    GUTTER,
                    SEAM,
                    "sticky left-0 z-10 px-0 text-center transition-colors",
                    isSelected ? "bg-accent/40" : "bg-card group-hover:bg-muted/40",
                  )}
                >
                  {/* The gutter carries the row number at rest and the checkbox where you are
									    pointing. A column that is simply blank until hovered reads as broken. */}
                  <div className="relative flex h-full items-center justify-center">
                    <span
                      className={cn(
                        "text-[11px] text-muted-foreground tabular-nums transition-opacity",
                        isSelected ? "opacity-0" : "opacity-100 group-hover:opacity-0",
                      )}
                    >
                      {index + 1}
                    </span>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleRow(row.record_id)}
                      aria-label={`Select ${row.label ?? "row"}`}
                      className={cn(
                        "absolute transition-opacity",
                        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                      )}
                    />
                  </div>
                </td>

                {columns.map((column, index) => (
                  <td
                    key={column}
                    className={cn(
                      CELL,
                      columnWidth(kinds[column] ?? "text"),
                      "max-w-[22rem]",
                      index === 0 &&
                        cn(
                          "sticky left-10 z-10 transition-colors",
                          isSelected ? "bg-accent/40" : "bg-card group-hover:bg-muted/40",
                        ),
                    )}
                  >
                    {column === "label" ? (
                      <NameCell object={object} row={row} />
                    ) : (
                      // One line per row, always: a nine-category cell that wraps makes its row
                      // three times the height of its neighbours and kills the scan down a column.
                      <div className="truncate whitespace-nowrap text-muted-foreground">
                        <FieldValue value={row[column]} slug={column} kind={kinds[column]} limit={CHIPS_PER_CELL} />
                      </div>
                    )}
                  </td>
                ))}

                <td className={cn(CELL, "border-r-0")} />
              </tr>
            )
          })}

          {footer ? (
            <tr>
              <td colSpan={columns.length + 2} className="p-0">
                {footer}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

export default DataGrid
