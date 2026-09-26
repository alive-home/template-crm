import { Link } from "@tanstack/react-router"
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, StickyNote } from "lucide-react"
import { firstDomain, pictureOf, RecordAvatar } from "#/components/crm/RecordAvatar.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx"
import { columnIcon, columnTypeLabel, columnWidth } from "#/lib/crm-columns.ts"
import { type CrmObject, type CrmRecord, fieldLabel } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * The two cells that are more than a value: the column header and the record's own name.
 *
 * Both carry behaviour rather than content — a header is a menu you sort and hide from, a name cell
 * is a link with a mark and a note count — and both are the same in every column set. The grid that
 * lays them out is next door and stays a layout.
 */

/** Chips a cell shows before the rest fold into a "+N". Keeps every row exactly one line tall. */
export const CHIPS_PER_CELL = 2

import type { SortState } from "#/components/crm/DataGrid.tsx"

/** Width of the checkbox gutter, and therefore the offset the name column pins at. */
export const GUTTER = "w-10 min-w-10"

/**
 * A 1px rule painted *outside* the gutter's right edge.
 *
 * The browser resolves the gutter to a fractional width, so the name column — pinned at a whole
 * 40px — leaves a half-pixel gap that the scrolling row shows through as a sliver of ghost text.
 * This covers that seam with the same line the column rule would have drawn anyway.
 */
export const SEAM = "shadow-[1px_0_0_0_var(--color-border)]"

/**
 * Every rule is opaque, and so is every pinned surface.
 *
 * A translucent border or header is fine until something scrolls underneath it: the header row and
 * the pinned name column sit on top of moving content, and at 40% alpha the rows read straight
 * through them. Solid is the only correct answer for a surface that overlaps.
 */
export const CELL = "h-[42px] border-border border-r border-b px-3 text-[13px] align-middle"
export const HEAD = "h-9 border-border border-r border-b bg-muted px-3 text-left font-medium text-[11px]"

export function HeaderCell({
  column,
  kind,
  sort,
  onSort,
  onHide,
  canHide,
  sticky,
}: {
  column: string
  kind: string
  sort: SortState | null
  onSort: (next: SortState | null) => void
  onHide: (column: string) => void
  canHide: boolean
  sticky?: boolean
}) {
  const Icon = columnIcon(kind)
  const active = sort?.column === column

  return (
    <th
      scope="col"
      // Sticky on the cell itself, not just on `thead`: a sticky row whose cells are static is one
      // engine quirk away from scrolling off, and it is what let rows read through this row.
      className={cn(HEAD, columnWidth(kind), "sticky top-0", sticky ? "left-10 z-30" : "z-20")}
    >
      <DropdownMenu>
        <DropdownMenuTrigger className="group -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 rounded px-1 py-1 outline-none transition-colors hover:bg-border/60 data-[state=open]:bg-border/60">
          <Icon size={12} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground">{fieldLabel(column)}</span>
          {/* The type, the way a table editor states it. First thing to go when width runs out. */}
          <span className="hidden truncate font-normal text-[10px] text-muted-foreground/80 sm:inline">
            {columnTypeLabel(kind)}
          </span>
          {active ? (
            sort?.direction === "asc" ? (
              <ArrowUp size={11} className="shrink-0 text-foreground" />
            ) : (
              <ArrowDown size={11} className="shrink-0 text-foreground" />
            )
          ) : null}
          {/* Only on hover: a chevron on every header at rest is twelve arrows of noise. */}
          <ChevronDown
            size={11}
            className="ml-auto shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=open]:opacity-100"
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onSort({ column, direction: "asc" })}>
            <ArrowUp size={13} className="text-muted-foreground" />
            Sort ascending
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSort({ column, direction: "desc" })}>
            <ArrowDown size={13} className="text-muted-foreground" />
            Sort descending
          </DropdownMenuItem>
          {active ? (
            <DropdownMenuItem onSelect={() => onSort(null)}>
              <span className="w-[13px]" />
              Clear sort
            </DropdownMenuItem>
          ) : null}

          {canHide ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onHide(column)}>
                <EyeOff size={13} className="text-muted-foreground" />
                Hide column
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </th>
  )
}

/** The record's own cell: mark, name, a link to it, and how many notes hang off it. */
export function NameCell({ object, row }: { object: CrmObject; row: CrmRecord }) {
  const noteCount = row.noteCount ?? 0

  return (
    <div className="flex items-center gap-2">
      <RecordAvatar
        object={object}
        name={row.label}
        domain={firstDomain(row.domains)}
        picture={pictureOf(row.logo_url ?? row.avatar_url)}
      />
      <Link
        to="/crm/$object/$id"
        params={{ object, id: row.record_id }}
        // Underlined at rest, not on hover: in a grid of plain values the underline is what says
        // "this cell is the way into the record", and a link you have to find by hovering is not.
        className={cn(
          "truncate underline decoration-border underline-offset-[3px] transition-colors hover:decoration-foreground",
          row.label ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {row.label ?? "Untitled"}
      </Link>

      {noteCount > 0 ? (
        <span
          title={`${noteCount} ${noteCount === 1 ? "note" : "notes"}`}
          className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground tabular-nums"
        >
          <StickyNote size={11} />
          {noteCount}
        </span>
      ) : null}
    </div>
  )
}
