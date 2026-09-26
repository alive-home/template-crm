import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { band } from "#/components/crm/DealCard.tsx"
import { Skeleton } from "#/components/crm/Panel.tsx"
import { PipelineBoard } from "#/components/crm/PipelineBoard.tsx"
import { Input } from "#/components/ui/input.tsx"
import { useMoveDeal, usePipeline } from "#/hooks/use-crm.ts"
import type { PipelineDeal } from "#/lib/pipeline-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * The deal pipeline as a board.
 *
 * The list view answers "what do we hold about this deal"; this answers "where is everything", which
 * is a different question and a worse table. Moving a card writes `stage` on the deal and nothing
 * else, so the board is a view of the CRM rather than a second place state lives.
 *
 * It opens filtered to nothing, and it needs the filters: nearly every deal sits in Prospect, so the
 * unfiltered board is one very long column and eight short ones. That is the real shape of this
 * pipeline and the page does not pretend otherwise — it gives you a way to cut it down instead.
 */

const BANDS = ["All", "P0", "P1", "P2", "P3", "Unscored"] as const
type Band = (typeof BANDS)[number]

function matches(deal: PipelineDeal, filter: Band, q: string): boolean {
  if (filter !== "All") {
    const own = band(deal.priority)
    if (filter === "Unscored" ? own !== null : own !== filter) return false
  }
  if (!q) return true
  const haystack = [deal.name, deal.company?.label, deal.location, deal.readiness]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(q.toLowerCase())
}

export function Pipeline() {
  const { data, isLoading, error } = usePipeline()
  const move = useMoveDeal()
  const [filter, setFilter] = useState<Band>("All")
  const [q, setQ] = useState("")

  const all = useMemo(() => data?.deals ?? [], [data])
  const deals = useMemo(() => all.filter(d => matches(d, filter, q)), [all, filter, q])

  function handleMove(id: string, stage: string) {
    const deal = all.find(d => d.id === id)
    move.mutate(
      { id, stage },
      {
        onSuccess: () => toast.success(`${deal?.company?.label ?? "Deal"} moved to ${stage}`),
        // The optimistic card has already snapped back by now, so the message is the only
        // account of what happened. It carries the server's own sentence, never a generic one.
        onError: e => toast.error(e instanceof Error ? e.message : "Could not move the deal"),
      },
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 pt-5 pb-3">
        <div className="min-w-0">
          <h1 className="font-semibold text-[19px] text-foreground tracking-tight">Pipeline</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Drag a deal to change its stage. Cards are ranked by priority band, then fit score.
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search size={14} className="-translate-y-1/2 absolute top-1/2 left-2.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search company, city…"
              className="h-8 pl-8 text-[13px]"
            />
          </div>

          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {BANDS.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={cn(
                  "rounded px-2 py-1 text-[11.5px] transition-colors",
                  filter === option
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <p className="mx-6 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          Could not reach the CRM: {error instanceof Error ? error.message : String(error)}
        </p>
      ) : null}

      {data?.warning ? <p className="shrink-0 px-6 pb-3 text-[11.5px] text-muted-foreground">{data.warning}</p> : null}

      <p className="shrink-0 px-6 pb-3 text-[11.5px] text-muted-foreground">
        {isLoading ? "Loading…" : `${deals.length} of ${all.length} deals${filter === "All" && !q ? "" : " shown"}`}
      </p>

      {isLoading ? (
        <div className="flex gap-3 px-6 pb-6">
          {[0, 1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-72 w-[264px] shrink-0" />
          ))}
        </div>
      ) : (
        <PipelineBoard stages={data?.stages ?? []} deals={deals} onMove={handleMove} />
      )}
    </div>
  )
}

export default Pipeline
