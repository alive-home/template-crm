import { type DragEvent, useState } from "react"
import { DealCard } from "#/components/crm/DealCard.tsx"
import type { PipelineDeal } from "#/lib/pipeline-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * The pipeline board: one column per stage, cards dragged between them.
 *
 * Dragging a card to another column is the only thing that writes, and it writes one field. There
 * is no ordering inside a column to persist: `deals` has no sort column, so the vertical axis is the
 * ranking the CRM already holds, priority band first and then the time-saved score, and the header
 * says so rather than letting you discover it by dragging a card that springs back.
 */

/**
 * Stage colours, mapped onto tokens that already exist rather than a new hue per column.
 *
 * Two pairs share a tone on purpose. Nine distinct colours across nine columns is nine things to
 * hold apart, and the column a card is in is already given by its position; the dot is a hint about
 * temperature, not the label. Won and Lost are the two that must never be misread, so they take the
 * status colours, which is what status colours are for.
 */
const STAGE_TONE: Record<string, string> = {
  Lead: "bg-muted-foreground/40",
  Prospect: "bg-muted-foreground/60",
  Contacted: "bg-accent/60",
  Qualified: "bg-accent",
  Proposal: "bg-warning/70",
  Negotiation: "bg-warning",
  "In Progress": "bg-accent",
  "Won 🎉": "bg-success",
  Lost: "bg-destructive",
}

type ColumnProps = {
  stage: string
  deals: PipelineDeal[]
  draggingId: string | null
  droppable: boolean
  onDrop: (id: string, stage: string) => void
  onDragStateChange: (id: string | null) => void
  onNudge: (id: string, direction: -1 | 1) => void
}

function Column({ stage, deals, draggingId, droppable, onDrop, onDragStateChange, onNudge }: ColumnProps) {
  const [over, setOver] = useState(false)

  // A card dragged over its own column is not a move. Highlighting it anyway promises a change
  // that will not happen, and the drop is then silently ignored.
  const dragged = draggingId ? deals.some(d => d.id === draggingId) : false
  const receptive = droppable && draggingId !== null && !dragged

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    if (!droppable) return
    const id = e.dataTransfer.getData("text/plain")
    if (id && !deals.some(d => d.id === id)) onDrop(id, stage)
  }

  return (
    // A drop target is not a control. The move it implements is reachable without a mouse from the
    // card itself, which is focusable and takes the arrow keys, so the board is not mouse-only.
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target; keyboard path is on the card
    <section
      onDragOver={e => {
        if (!receptive) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={cn(
        "flex max-h-full w-[264px] shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
        over ? "border-accent bg-accent/5" : "border-border",
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span className={cn("size-1.5 shrink-0 rounded-full", STAGE_TONE[stage] ?? "bg-muted-foreground/50")} />
        <h2 className="min-w-0 flex-1 truncate font-medium text-[12px] text-foreground" title={stage}>
          {stage}
        </h2>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{deals.length}</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
        {deals.map(deal => (
          // This wrapper only observes the drag lifecycle so the board can dim the card being
          // moved. The card inside it is the interactive element and carries the label.
          // biome-ignore lint/a11y/noStaticElementInteractions: drag observer, not a control
          <div key={deal.id} onDragStart={() => onDragStateChange(deal.id)} onDragEnd={() => onDragStateChange(null)}>
            <DealCard deal={deal} dragging={draggingId === deal.id} onNudge={dir => onNudge(deal.id, dir)} />
          </div>
        ))}

        {deals.length === 0 ? (
          <p
            className={cn(
              "rounded-lg border border-dashed py-6 text-center text-[11px] transition-colors",
              over ? "border-accent text-accent" : "border-border text-muted-foreground/70",
            )}
          >
            {receptive ? "Drop here" : "Empty"}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/**
 * Where a deal with no stage at all goes.
 *
 * Every deal has one today, so this column is normally absent. It exists because grouping strictly
 * by the known stages would drop such a record on the floor: no column would claim it and the board
 * would quietly show every deal but that one. Nothing can be dropped *into* it, because "no stage" is not a
 * stage a deal can be moved to.
 */
const NO_STAGE = "No stage"

export function PipelineBoard({
  stages,
  deals,
  onMove,
}: {
  stages: string[]
  deals: PipelineDeal[]
  onMove: (id: string, stage: string) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const columns = deals.some(d => !d.stage) ? [...stages, NO_STAGE] : stages
  const grouped = new Map<string, PipelineDeal[]>(columns.map(s => [s, []]))
  for (const deal of deals) grouped.get(deal.stage ?? NO_STAGE)?.push(deal)

  /** The keyboard equivalent of a drag: one stage left or right, stopping at the ends. */
  function nudge(id: string, direction: -1 | 1) {
    const deal = deals.find(d => d.id === id)
    const from = stages.indexOf(deal?.stage ?? "")
    // The target is read out before it is used rather than indexed at the call site: with
    // `noUncheckedIndexedAccess` an array index is possibly undefined, and a move to `undefined`
    // would be a PATCH that clears the stage instead of a nudge that does nothing.
    const target = stages[from + direction]
    if (from === -1 || target === undefined) return
    onMove(id, target)
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-6 pb-6">
      {columns.map(stage => (
        <Column
          key={stage}
          stage={stage}
          deals={grouped.get(stage) ?? []}
          draggingId={draggingId}
          droppable={stage !== NO_STAGE}
          onDrop={onMove}
          onDragStateChange={setDraggingId}
          onNudge={nudge}
        />
      ))}
    </div>
  )
}

export default PipelineBoard
