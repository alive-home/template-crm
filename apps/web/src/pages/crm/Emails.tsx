import { format, isValid, parseISO } from "date-fns"
import { useState } from "react"
import { toast } from "sonner"
import { DraftListEmpty, DraftReader, DraftRow, NoDraftSelected } from "#/components/crm/DraftReader.tsx"
import { EmptyState } from "#/components/crm/Panel.tsx"
import { useOutboundDrafts, useToggleTask } from "#/hooks/use-crm.ts"
import { cn } from "#/lib/utils.ts"

const FILTERS = [
  { value: "review", label: "Needs review" },
  { value: "all", label: "All" },
] as const

type Filter = (typeof FILTERS)[number]["value"]

/**
 * The automation's own activity, read out of what it produced.
 *
 * One chip per day it ran, newest first, with how many drafts it wrote and how many have been dealt
 * with. There is no separate run log to disagree with this — if a day produced nothing, it has no
 * chip, which is exactly what "found no signal worth writing about" looks like.
 */
function Runs({ runs }: { runs: { date: string; drafts: number; sent: number }[] }) {
  if (runs.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {runs.map(run => {
        const date = parseISO(run.date)
        return (
          <span
            key={run.date}
            title={`${run.drafts} drafted, ${run.sent} reviewed`}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground"
          >
            <span className="tabular-nums">{isValid(date) ? format(date, "d MMM") : run.date}</span>
            <span className="font-medium text-foreground tabular-nums">{run.drafts}</span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * `/crm/emails` — the outbound drafts, read like mail.
 *
 * The automation already writes each touch onto its company as a note, which is right for the record
 * and wrong for the review: nobody opens twelve company pages to read twelve emails. This is the same
 * data in the shape the work actually has — a list you triage down and one message at a time on the
 * right, with the reasoning that produced it attached to the message rather than filed elsewhere.
 *
 * It opens on **Needs review**, because a draft nobody has looked at is the only thing here that is
 * still work. Marking one reviewed closes the automation's own review task, so the two screens cannot
 * drift apart.
 */
export function Emails() {
  const [filter, setFilter] = useState<Filter>("review")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data, isLoading, error } = useOutboundDrafts()
  const toggleTask = useToggleTask()

  const drafts = data?.drafts ?? []
  const visible = filter === "review" ? drafts.filter(draft => !draft.task?.isCompleted) : drafts
  // The selection follows the visible list rather than being remembered across filters: a draft you
  // just marked reviewed disappearing from under the cursor is worse than falling back to the top.
  const selected = visible.find(draft => draft.id === selectedId) ?? visible[0] ?? null

  const onToggleReviewed = () => {
    if (!selected?.task) return
    toggleTask.mutate(
      { id: selected.task.id, isCompleted: !selected.task.isCompleted },
      { onError: cause => toast.error(cause instanceof Error ? cause.message : "Could not update the review task") },
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-border border-b px-6">
        <div className="min-w-0">
          <h1 className="font-semibold text-[15px] text-foreground tracking-tight">Emails</h1>
          <p className="truncate text-[11px] text-muted-foreground">
            {data
              ? `${data.awaitingReview.toLocaleString()} awaiting review · ${drafts.length.toLocaleString()} drafted in total`
              : "Loading drafts…"}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {data ? <Runs runs={data.runs} /> : null}
          <div className="flex rounded-md border border-border p-0.5">
            {FILTERS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={cn(
                  "rounded px-2.5 py-1 text-[12px] transition-colors",
                  filter === option.value
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? <p className="border-border border-b px-6 py-2 text-[12px] text-destructive">{error.message}</p> : null}

      <div className="flex min-h-0 flex-1">
        <div className="w-[340px] shrink-0 overflow-y-auto border-border border-r">
          {isLoading && !data ? <EmptyState>Loading…</EmptyState> : null}
          {data && drafts.length === 0 ? <DraftListEmpty /> : null}
          {data && drafts.length > 0 && visible.length === 0 ? (
            <EmptyState>Nothing waiting. Every draft has been reviewed.</EmptyState>
          ) : null}
          {visible.map(draft => (
            <DraftRow
              key={draft.id}
              draft={draft}
              active={selected?.id === draft.id}
              onSelect={() => setSelectedId(draft.id)}
            />
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {selected ? (
            <DraftReader
              draft={selected}
              onToggleReviewed={onToggleReviewed}
              pending={toggleTask.isPending && toggleTask.variables?.id === selected.task?.id}
            />
          ) : (
            <NoDraftSelected />
          )}
        </div>
      </div>
    </div>
  )
}

export default Emails
