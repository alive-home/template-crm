import { Link } from "@tanstack/react-router"
import { format, formatDistanceToNowStrict, isPast, isValid, parseISO } from "date-fns"
import { AlertTriangle, Check, Copy, ExternalLink, Send } from "lucide-react"
import { toast } from "sonner"
import { EmptyState } from "#/components/crm/Panel.tsx"
import { RecordAvatar } from "#/components/crm/RecordAvatar.tsx"
import type { OutboundDraft } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

/** A date that may be absent or malformed. Every timestamp here comes out of a text column. */
function when(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : null
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-[13px]">
      <span className="w-16 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </div>
  )
}

/**
 * One row in the drafts list.
 *
 * Company first, then subject, then the signal in one muted line — that is the order you triage in:
 * who is it, what does it say, why now. The row is a fixed two lines so the list scans.
 */
export function DraftRow({ draft, active, onSelect }: { draft: OutboundDraft; active: boolean; onSelect: () => void }) {
  const created = when(draft.createdAt)
  const reviewed = draft.task?.isCompleted ?? false

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-0.5 border-border border-b px-4 py-3 text-left transition-colors",
        active ? "bg-sidebar-accent" : "hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2">
        {/* An unreviewed draft is the only thing on this screen that needs doing, so it carries the dot. */}
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            draft.needsReview ? "bg-warning" : reviewed ? "bg-transparent" : "bg-primary",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-[13px] text-foreground">
          {draft.company.name ?? "Unknown company"}
        </span>
        {created ? (
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{format(created, "d MMM")}</span>
        ) : null}
      </div>
      <p className="truncate pl-3.5 text-[13px] text-foreground/90">{draft.subject ?? "No subject line"}</p>
      <p className="truncate pl-3.5 text-[11px] text-muted-foreground">{draft.signal ?? "No signal recorded"}</p>
    </button>
  )
}

/**
 * The reading pane: the email as it would be sent, then the reasoning underneath it.
 *
 * The message comes first and unadorned, because the question you are actually answering is "would I
 * send this". The reasoning sits below in its own block, tagged as the automation's, so a claim it
 * made is never mistaken for something the CRM knows.
 */
export function DraftReader({
  draft,
  onToggleReviewed,
  pending,
}: {
  draft: OutboundDraft
  onToggleReviewed: () => void
  pending: boolean
}) {
  const created = when(draft.createdAt)
  const deadline = when(draft.task?.deadlineAt)
  const reviewed = draft.task?.isCompleted ?? false
  const overdue = deadline ? isPast(deadline) && !reviewed : false

  const copy = async () => {
    const text = `Subject: ${draft.subject ?? ""}\n\n${draft.body}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Draft copied")
    } catch {
      toast.error("Could not copy — your browser blocked clipboard access")
    }
  }

  const mailto = draft.email
    ? `mailto:${draft.email}?subject=${encodeURIComponent(draft.subject ?? "")}&body=${encodeURIComponent(draft.body)}`
    : null

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-6">
      <header className="flex items-start gap-3">
        <RecordAvatar
          object="companies"
          name={draft.company.name}
          domain={draft.company.domain}
          picture={draft.company.logo}
          className="size-8 text-[11px]"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-[17px] text-foreground leading-tight tracking-tight">
            {draft.subject ?? "No subject line"}
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            <Link
              to="/crm/$object/$id"
              params={{ object: "companies", id: draft.company.id }}
              className="text-foreground underline-offset-2 hover:underline"
            >
              {draft.company.name ?? "Unknown company"}
            </Link>
            {draft.company.domain ? ` · ${draft.company.domain}` : ""}
            {created ? ` · drafted ${formatDistanceToNowStrict(created)} ago` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleReviewed}
          disabled={pending || !draft.task}
          title={draft.task ? undefined : "This draft has no review task"}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors disabled:opacity-50",
            reviewed
              ? "border-border text-muted-foreground hover:text-foreground"
              : "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <Check size={13} />
          {reviewed ? "Reviewed" : "Mark reviewed"}
        </button>
      </header>

      <div className="rounded-xl border border-border bg-card">
        {/*
         * A draft can be blocked on something only the sender knows. The draft contract says the answer
         * then is Needs Review rather than a guessed sentence, so the block sits on top of the message
         * instead of being hidden in the reasoning: you should know before you read it, not after.
         */}
        {draft.needsReview ? (
          <div className="flex items-start gap-2 border-border border-b bg-warning/10 px-4 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[12px] text-foreground">
              <span className="font-medium">Needs review — do not send as is. </span>
              {draft.needsReview}
            </p>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5 border-border border-b px-4 py-3">
          <Meta label="To">{draft.to ?? <span className="text-muted-foreground">No contact yet — add one</span>}</Meta>
          <Meta label="Subject">{draft.subject ?? "—"}</Meta>
          <Meta label="Channel">{draft.channel ?? "email"}</Meta>
        </div>
        {/* The draft is preformatted: line breaks the writer chose are part of the message. */}
        <p className="whitespace-pre-wrap px-4 py-4 text-[13px] text-foreground leading-relaxed">{draft.body}</p>
        <div className="flex items-center gap-2 border-border border-t px-4 py-2.5">
          <button
            type="button"
            onClick={copy}
            className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Copy size={13} />
            Copy
          </button>
          {mailto ? (
            <a
              href={mailto}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Send size={13} />
              Open in mail
            </a>
          ) : null}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {deadline ? (
              <span className={cn(overdue && "text-destructive")}>
                Review by {format(deadline, "d MMM")}
                {overdue ? " · overdue" : ""}
              </span>
            ) : (
              "Drafted, not sent"
            )}
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-border border-dashed bg-muted/20 px-4 py-3.5">
        <h2 className="font-medium text-[12px] text-muted-foreground">Why this was drafted</h2>
        <div className="mt-2.5 flex flex-col gap-1.5">
          <Meta label="Signal">{draft.signal ?? "None recorded — this draft should not be sent"}</Meta>
          {draft.angle ? <Meta label="Angle">{draft.angle}</Meta> : null}
          {/* Whether we had spoken before is the first thing you check when a first line reads oddly. */}
          <Meta label="History">{draft.priorContact ?? "Not checked"}</Meta>
          <Meta label="Source">
            {draft.source?.startsWith("http") ? (
              <a
                href={draft.source}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all text-foreground underline-offset-2 hover:underline"
              >
                {draft.source}
                <ExternalLink size={11} className="shrink-0" />
              </a>
            ) : (
              (draft.source ?? "—")
            )}
          </Meta>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Written by the outbound automation from a public signal. The claim above is the automation's, not the CRM's —
          check the source before you send.
        </p>
      </section>
    </div>
  )
}

export function NoDraftSelected() {
  return <EmptyState>Pick a draft to read it.</EmptyState>
}

export function DraftListEmpty() {
  return (
    <EmptyState>
      No drafts yet. The outbound automation runs on weekday mornings and writes what it finds here.
    </EmptyState>
  )
}

export default DraftReader
