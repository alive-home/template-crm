import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "#/lib/api.ts"
import type {
  CrmObject,
  CrmPage,
  CrmRecord,
  CrmRecordDetail,
  CrmSchema,
  CrmSummary,
  CrmTask,
  OutboundFeed,
} from "#/lib/crm-types.ts"
import type { MapFeed } from "#/lib/map-types.ts"
import type { MarketCases } from "#/lib/market-types.ts"
import type { PersonaFeed } from "#/lib/persona-types.ts"
import type { PipelineFeed } from "#/lib/pipeline-types.ts"

/**
 * CRM server state. Every query hits Turso through the Hono API, and there is no bundled fallback:
 * an app that falls back to a snapshot is fine when the snapshot is derived from files in the repo,
 * but a CRM showing stale rows it invented is a liability. No data, no rows.
 */

const key = {
  summary: ["crm", "summary"] as const,
  schema: (object: CrmObject) => ["crm", "schema", object] as const,
  list: (object: CrmObject, q: string) => ["crm", object, q] as const,
  record: (object: CrmObject, id: string) => ["crm", object, id] as const,
  tasks: ["crm", "tasks"] as const,
  outbound: ["crm", "outbound"] as const,
  market: ["crm", "market"] as const,
  map: ["crm", "map"] as const,
  pipeline: ["crm", "pipeline"] as const,
  personas: ["crm", "personas"] as const,
}

/**
 * The companies we can place, as a GeoJSON feature collection.
 *
 * **The map does not fetch this itself, and that is because of the password.** MapLibre will happily
 * take a URL as a source and fetch it on its own worker thread, which is the right shape for a large
 * static file — but that fetch carries no cookie the gate accepts, so against this API it would get a
 * 401 and render an empty map with no error worth reading. Going through `fetchApi` keeps every
 * authenticated call in one place, and 148 points is far too small to be worth a second auth path.
 */
export function useCrmMap() {
  return useQuery({ queryKey: key.map, queryFn: () => fetchApi<MapFeed>("/crm/map") })
}

export function useCrmSummary() {
  return useQuery({ queryKey: key.summary, queryFn: () => fetchApi<CrmSummary>("/crm/summary") })
}

export function useCrmSchema(object: CrmObject) {
  return useQuery({
    queryKey: key.schema(object),
    queryFn: () => fetchApi<CrmSchema>(`/crm/schema/${object}`),
    staleTime: 10 * 60 * 1000,
  })
}

/** How many rows a scroll fetches. The server clamps at 500, so this is a choice, not a limit. */
const PAGE_SIZE = 100

export type RecordSort = { column: string; direction: "asc" | "desc" } | null

/**
 * One object's records, a page at a time.
 *
 * This used to fetch the whole table and sort it in the browser, which was a reasonable trade at a few
 * hundred rows and is the wrong one at the size this CRM is heading for: most of a megabyte of JSON
 * to draw thirty visible rows, and every one of them re-fetched on every visit.
 *
 * **Sorting moved to the server with the paging, and it had to.** Sorting a page is not sorting a
 * list — asked for the oldest company, a client-side sort over the hundred rows it happens to hold
 * answers with the oldest of those hundred and looks exactly like the right answer. So the sort is
 * part of the query key: changing a column starts a new list from the server rather than rearranging
 * what is on screen.
 */
export function useCrmRecords(object: CrmObject, q = "", sort: RecordSort = null) {
  return useInfiniteQuery({
    queryKey: [...key.list(object, q), sort?.column ?? "", sort?.direction ?? ""],

    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) })
      if (q) params.set("q", q)
      if (sort) {
        params.set("sort", sort.column)
        params.set("dir", sort.direction)
      }
      return fetchApi<CrmPage>(`/crm/${object}?${params.toString()}`)
    },

    initialPageParam: 0,

    // The next offset is what we already hold, and undefined once that is all of them — which is
    // what tells the grid there is nothing further down and stops the scroll sentinel asking.
    getNextPageParam: last => {
      const loaded = last.offset + last.rows.length
      return loaded < last.total ? loaded : undefined
    },

    placeholderData: previous => previous,
  })
}

export function useCrmRecord(object: CrmObject, id: string) {
  return useQuery({
    queryKey: key.record(object, id),
    queryFn: () => fetchApi<CrmRecordDetail>(`/crm/${object}/${id}`),
    enabled: Boolean(id),
  })
}

export function useCrmTasks(openOnly = false) {
  return useQuery({
    queryKey: [...key.tasks, openOnly],
    queryFn: () => fetchApi<CrmTask[]>(`/crm/tasks${openOnly ? "?open=1" : ""}`),
  })
}

/** The outbound drafts feed: one row per drafted email, plus the automation's own run log. */
export function useOutboundDrafts() {
  return useQuery({ queryKey: key.outbound, queryFn: () => fetchApi<OutboundFeed>("/crm/outbound") })
}

/** The case companies and the AI work already delivered there, joined in SQL. */
export function useMarketCases() {
  return useQuery({
    queryKey: key.market,
    queryFn: () => fetchApi<MarketCases>("/crm/market"),
    staleTime: 10 * 60 * 1000,
  })
}

/** The personas, with their rings and quotes. Ours, not the CRM's — see `apps/api/src/crm/crm-personas.ts`. */
export function usePersonas() {
  return useQuery({
    queryKey: key.personas,
    queryFn: () => fetchApi<PersonaFeed>("/crm/personas"),
    staleTime: 10 * 60 * 1000,
  })
}

/** Every deal as a card, with the stage columns to lay them out in. */
export function usePipeline() {
  return useQuery({ queryKey: key.pipeline, queryFn: () => fetchApi<PipelineFeed>("/crm/pipeline") })
}

/**
 * Move one deal to another stage.
 *
 * Optimistic, because a card that waits for a round trip before it lands under the cursor feels
 * broken even when it works. The previous board is kept and put back if the write fails, so a
 * rejected move never leaves the screen claiming something the CRM does not hold. The write itself
 * is the ordinary record PATCH — `stage` is a real writable column and the board invents nothing.
 */
export function useMoveDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      fetchApi<CrmRecord>(`/crm/deals/${id}`, { method: "PATCH", body: JSON.stringify({ values: { stage } }) }),

    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: key.pipeline })
      const previous = queryClient.getQueryData<PipelineFeed>(key.pipeline)
      queryClient.setQueryData<PipelineFeed>(key.pipeline, feed =>
        feed ? { ...feed, deals: feed.deals.map(d => (d.id === id ? { ...d, stage } : d)) } : feed,
      )
      return { previous }
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key.pipeline, context.previous)
    },

    // The summary counts deals by stage, so it is stale the moment a card moves.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key.pipeline })
      queryClient.invalidateQueries({ queryKey: key.summary })
    },
  })
}

/** Write one or more columns on a record. The server rejects unknown fields rather than dropping them. */
export function useUpdateRecord(object: CrmObject, id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      fetchApi<CrmRecord>(`/crm/${object}/${id}`, { method: "PATCH", body: JSON.stringify({ values }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key.record(object, id) })
      queryClient.invalidateQueries({ queryKey: ["crm", object] })
    },
  })
}

export function useAddNote(object: CrmObject, id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (note: { title?: string; content: string }) =>
      fetchApi(`/crm/${object}/${id}/notes`, { method: "POST", body: JSON.stringify(note) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key.record(object, id) })
      queryClient.invalidateQueries({ queryKey: key.summary })
    },
  })
}

export function useDeleteNote(object: CrmObject, id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (noteId: string) => fetchApi(`/crm/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key.record(object, id) })
      queryClient.invalidateQueries({ queryKey: key.summary })
    },
  })
}

export function useToggleTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isCompleted }: { id: string; isCompleted: boolean }) =>
      fetchApi(`/crm/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ isCompleted }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key.tasks })
      queryClient.invalidateQueries({ queryKey: key.outbound })
      queryClient.invalidateQueries({ queryKey: key.summary })
    },
  })
}
