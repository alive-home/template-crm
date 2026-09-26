import { Link, useParams } from "@tanstack/react-router"
import { Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { DataGrid, type SortState } from "#/components/crm/DataGrid.tsx"
import { EmptyState, Page, Panel } from "#/components/crm/Panel.tsx"
import { ViewSettings } from "#/components/crm/ViewSettings.tsx"
import { Input } from "#/components/ui/input.tsx"
import { useCrmRecords, useCrmSchema } from "#/hooks/use-crm.ts"
import { availableColumns, columnKind } from "#/lib/crm-columns.ts"
import { CRM_OBJECTS, type CrmObject, LIST_COLUMNS, OBJECT_LABELS } from "#/lib/crm-types.ts"

/** Long enough that typing a name is one request, short enough that the table still feels live. */
const DEBOUNCE_MS = 250

function useDebounced(value: string, delay = DEBOUNCE_MS): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/**
 * Chosen columns, remembered per object.
 *
 * A view you rebuilt on every visit is not a view. This is browser-local on purpose: it is a
 * per-person preference about a screen, not CRM data, and it has no business in Turso.
 */
function useVisibleColumns(object: CrmObject) {
  const storageKey = `crm.columns.${object}`
  const [columns, setColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      const parsed = saved ? JSON.parse(saved) : null
      if (Array.isArray(parsed) && parsed.length && parsed.every(name => typeof name === "string")) return parsed
    } catch {
      // A corrupt or unreadable preference is not worth an error — fall back to the defaults.
    }
    return LIST_COLUMNS[object]
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columns))
    } catch {
      // Private-mode storage failures must not take the table down with them.
    }
  }, [storageKey, columns])

  return [columns, setColumns] as const
}

/**
 * One object's records.
 *
 * Split out from the page so the hooks sit behind the param check rather than in front of it: an
 * unrecognised `:object` must never reach a query, because it would go straight into the API path.
 */
function RecordGrid({ object }: { object: CrmObject }) {
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [visible, setVisible] = useVisibleColumns(object)

  const query = useDebounced(search)
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useCrmRecords(object, query, sort)
  const { data: schema } = useCrmSchema(object)

  // The pages are the list. They arrive in order and each one is the next slice of the same query,
  // so flattening is all the assembly there is — no client-side sort, because the order is the
  // server's answer and re-sorting a partial list here would silently contradict it.
  const rows = useMemo(() => data?.pages.flatMap(page => page.rows) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0

  const attributes = useMemo(() => schema?.attributes ?? [], [schema])
  const offered = useMemo(
    () =>
      availableColumns(
        object,
        rows,
        attributes.map(attribute => attribute.slug),
      ),
    [object, rows, attributes],
  )

  // The catalog is the source of a column's type, so the icons are facts rather than name-guessing.
  const kinds = useMemo(
    () => Object.fromEntries(offered.map(column => [column, columnKind(column, attributes)])),
    [offered, attributes],
  )

  /**
   * Load the next page when the bottom of the list comes into view.
   *
   * The observer's root is the viewport rather than the grid, which works because the grid is on
   * screen whenever it is scrollable: a sentinel inside an internally scrolling element intersects
   * the viewport exactly when it is scrolled into the visible part of that element.
   */
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage) return

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) fetchNextPage()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage])

  // A column can only be shown if the API still returns it — a stale preference must not add a
  // ghost column that renders a dash on every row.
  const columns = useMemo(() => {
    const live = visible.filter(column => column === "label" || offered.includes(column))
    return live.includes("label") ? live : ["label", ...live]
  }, [visible, offered])

  function toggleColumn(column: string) {
    setVisible(current =>
      current.includes(column)
        ? current.filter(name => name !== column)
        : // Added columns land in the offered order, so the grid never reshuffles itself.
          offered.filter(name => current.includes(name) || name === column),
    )
  }

  function picker(variant?: "plus") {
    return (
      <ViewSettings
        columns={offered}
        visible={columns}
        kinds={kinds}
        onToggle={toggleColumn}
        onReset={() => setVisible(LIST_COLUMNS[object])}
        variant={variant}
      />
    )
  }

  return (
    // The table is the view. No page title, no card, no gutter: a strip of controls, the grid
    // filling everything that is left, and a status line. The heading this page would have carried
    // is already lit up in the sidebar, and spending the top fifth of the screen restating it is
    // what made this feel like a report about the records instead of the records.
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-border border-b px-3">
        <div className="relative w-72">
          <Search size={14} className="-translate-y-1/2 absolute top-1/2 left-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={`Search ${OBJECT_LABELS[object].toLowerCase()}`}
            className="h-7 pl-8 text-[13px]"
          />
        </div>

        {selected.size > 0 ? (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-medium tabular-nums">
              {selected.size} {selected.size === 1 ? "record" : "records"} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={12} />
              Clear
            </button>
          </div>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2">{picker()}</div>
      </div>

      {error ? <p className="border-border border-b px-3 py-2 text-[12px] text-destructive">{error.message}</p> : null}

      <DataGrid
        object={object}
        rows={rows}
        columns={columns}
        kinds={kinds}
        sort={sort}
        onSort={setSort}
        onHide={toggleColumn}
        selected={selected}
        onSelect={setSelected}
        // Square and borderless: the grid meets the sidebar and the window edge, so the chrome
        // around it is the app, not a card.
        className="min-h-0 flex-1 rounded-none border-0"
        addColumn={picker("plus")}
        footer={
          // Always mounted while there is more, so the observer has something to watch. The text is
          // what a reader needs at the bottom of a list that is still growing under them.
          hasNextPage ? (
            <div ref={sentinel} className="px-3 py-3 text-[11px] text-muted-foreground">
              {isFetchingNextPage ? "Loading more…" : `${rows.length.toLocaleString()} of ${total.toLocaleString()}`}
            </div>
          ) : null
        }
      >
        {isLoading && !data ? <EmptyState>Loading…</EmptyState> : null}
        {data && rows.length === 0 ? (
          <EmptyState>{query ? `No matches for “${query}”` : "No records"}</EmptyState>
        ) : null}
      </DataGrid>

      {/* The count belongs under the table it counts, out of the way, the way a spreadsheet does it. */}
      <div className="flex h-8 shrink-0 items-center gap-3 border-border border-t px-3 text-[11px] text-muted-foreground">
        {data ? (
          <>
            {/* What is loaded, and what there is. A grid holding the first hundred of twelve
					      thousand must not present itself as a hundred records. */}
            <span className="tabular-nums">
              {rows.length < total
                ? `${rows.length.toLocaleString()} of ${total.toLocaleString()} records`
                : `${total.toLocaleString()} ${total === 1 ? "record" : "records"}`}
            </span>
            <span className="tabular-nums">
              {columns.length} of {offered.length} columns
            </span>
          </>
        ) : (
          <span>Loading records…</span>
        )}
      </div>
    </div>
  )
}

function UnknownObject() {
  return (
    <Page>
      <Panel className="p-6">
        <h1 className="font-semibold text-[19px] text-foreground tracking-tight">Unknown record type</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">The CRM has no object by that name.</p>
        <Link to="/crm" className="mt-3 inline-block text-[13px] text-muted-foreground underline hover:text-foreground">
          Back to the overview
        </Link>
      </Panel>
    </Page>
  )
}

/**
 * `/crm/$object` — one grid per object.
 *
 * `LIST_COLUMNS` is only the opening view now: every column the API returns is available behind the
 * picker, and the choice is remembered per object.
 */
export function ObjectList() {
  // `strict: false` reads the param without binding this page to a route id. Whatever comes back is
  // an arbitrary string from the URL bar, so it is matched against CRM_OBJECTS before it is used.
  const params: { object?: string } = useParams({ strict: false })
  const object = CRM_OBJECTS.find(candidate => candidate === params.object)

  if (!object) return <UnknownObject />

  return <RecordGrid key={object} object={object} />
}

export default ObjectList
