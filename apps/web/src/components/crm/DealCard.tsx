import { useNavigate } from "@tanstack/react-router"
import { compactCurrency } from "#/lib/format.ts"
import type { PipelineDeal } from "#/lib/pipeline-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * One deal as a card.
 *
 * It shows six fields and only the ones that are filled in. Most deals here are researched
 * prospects: they have a priority band, a fit score and a city, and no money at all, because
 * nothing has been quoted. A card that renders an empty money row on nearly every deal teaches
 * you to read a blank as a zero.
 */

/** `P1 — high fit` -> `P1`. The band is the pill; the rest is the tooltip. */
export function band(priority: string | null): string | null {
  const match = priority?.match(/^P\d/)
  return match ? match[0] : null
}

/**
 * Deal names are written `Company — what we would build`, and the company is already the first line
 * of the card. Repeating it costs the half of the card that says what the deal is actually about.
 */
export function dealLine(name: string, company: string | null): string {
  if (!company) return name
  const trimmed = name.trim()
  if (!trimmed.toLowerCase().startsWith(company.trim().toLowerCase())) return name
  return trimmed.slice(company.trim().length).replace(/^\s*[—–-]\s*/, "") || name
}

const BAND_TONE: Record<string, string> = {
  P0: "border-transparent bg-accent/15 text-accent",
  P1: "border-transparent bg-accent/10 text-accent/90",
  P2: "border-border text-muted-foreground",
  P3: "border-border text-muted-foreground",
}

function Chip({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center truncate rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  )
}

export function DealCard({
  deal,
  dragging,
  onNudge,
}: {
  deal: PipelineDeal
  dragging: boolean
  onNudge?: (direction: -1 | 1) => void
}) {
  const navigate = useNavigate()
  const company = deal.company?.label ?? null
  const pill = band(deal.priority)
  const line = dealLine(deal.name, company)
  const open = () => navigate({ to: "/crm/$object/$id", params: { object: "deals", id: deal.id } })

  return (
    // The whole card is the control: click or Enter opens the record, the arrow keys move it a
    // stage. That is one target instead of a card with a small link in the corner, and it is what
    // makes the keyboard path real — dragging is a mouse gesture, so without the arrow keys this
    // board would be a feature only a mouse can use.
    <button
      type="button"
      draggable
      data-card
      aria-label={`${company ?? deal.name}, stage ${deal.stage ?? "none"}. Enter opens the record; left and right arrows change stage.`}
      onClick={open}
      onKeyDown={e => {
        if (onNudge && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault()
          onNudge(e.key === "ArrowLeft" ? -1 : 1)
        }
      }}
      onDragStart={e => {
        e.dataTransfer.setData("text/plain", deal.id)
        e.dataTransfer.effectAllowed = "move"
      }}
      className={cn(
        "group block w-full cursor-grab rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-all",
        "hover:border-accent/40 hover:shadow-md active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging && "opacity-40",
      )}
    >
      {/* Spans throughout: a button may only contain phrasing content, so a div or p in here is
          invalid HTML even though it renders. Block layout comes from the classes instead. */}
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-[12.5px] text-card-foreground" title={company ?? ""}>
          {company ?? <span className="text-muted-foreground italic">No company linked</span>}
        </span>
        {pill ? (
          <span
            title={deal.priority ?? ""}
            className={cn(
              "shrink-0 rounded border px-1 py-px font-medium text-[10px] tabular-nums",
              BAND_TONE[pill] ?? "border-border text-muted-foreground",
            )}
          >
            {pill}
          </span>
        ) : null}
      </span>

      <span className="mt-1 line-clamp-2 block text-[11.5px] text-muted-foreground leading-snug" title={line}>
        {line}
      </span>

      <span className="mt-2 flex flex-wrap gap-1">
        {deal.score != null ? (
          <Chip title={`Time-saved score ${deal.score}/100`} className="tabular-nums">
            {deal.score}
          </Chip>
        ) : null}
        {deal.location ? <Chip title={deal.location}>{deal.location}</Chip> : null}
        {/* Money exists on five deals. It is shown where it is real and omitted everywhere else. */}
        {deal.committedEur ? (
          <Chip className="border-success/40 text-success" title="Committed">
            {compactCurrency(deal.committedEur)}
          </Chip>
        ) : null}
        {deal.outstandingEur ? (
          <Chip className="border-warning/40 text-warning" title="Outstanding, recorded on the deal">
            {compactCurrency(deal.outstandingEur)} open
          </Chip>
        ) : null}
      </span>

      <span className="mt-2 block text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        Open record →
      </span>
    </button>
  )
}

export default DealCard
