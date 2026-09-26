import { format, parseISO } from "date-fns"
import { Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Panel } from "#/components/crm/Panel.tsx"
import { Button } from "#/components/ui/button.tsx"
import { Input } from "#/components/ui/input.tsx"
import { useAddNote, useDeleteNote } from "#/hooks/use-crm.ts"
import type { CrmNote, CrmObject } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

/** Past this many characters a note is clamped, because one long note should not bury the rest. */
const CLAMP_ABOVE = 400

/** A delete stays armed this long, then disarms itself. */
const ARM_MS = 4000

/** Timestamps arrive from Turso with nanosecond precision; an unparseable one renders raw, never "Invalid Date". */
function noteDate(iso: string): string {
  const parsed = parseISO(iso)
  return Number.isNaN(parsed.getTime()) ? iso : format(parsed, "d MMM yyyy")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * One note. Owns its own expand/collapse, since that is a per-note decision and lifting it would
 * make every note re-render when one is opened.
 *
 * The delete confirm is *not* local: `armed` is passed down so arming one note disarms the other.
 */
function NoteRow({
  note,
  armed,
  onArm,
  onDelete,
  deleting,
}: {
  note: CrmNote
  armed: boolean
  onArm: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const content = note.content ?? ""
  const clampable = content.length > CLAMP_ABOVE

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {note.title ? <div className="font-medium text-[13px] text-foreground">{note.title}</div> : null}
          {/* whitespace-pre-wrap: these are pasted call notes — the line breaks are the structure. */}
          <p
            className={cn(
              "whitespace-pre-wrap text-[13px] text-foreground leading-relaxed",
              clampable && !expanded && "line-clamp-5",
            )}
          >
            {content}
          </p>
          {clampable ? (
            <button
              type="button"
              onClick={() => setExpanded(open => !open)}
              className="mt-1 text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}
          <div className="mt-1.5 text-[11px] text-muted-foreground">{noteDate(note.createdAt)}</div>
        </div>

        {/* Two steps, no dialog: the first click arms and relabels, the second deletes. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-note-delete
          disabled={deleting}
          onClick={armed ? onDelete : onArm}
          className={armed ? "shrink-0 text-destructive" : "shrink-0 text-muted-foreground"}
        >
          <Trash2 size={14} />
          {armed ? "Confirm" : null}
        </Button>
      </div>
    </li>
  )
}

/**
 * Notes on one record: a composer, then the notes newest first (the API already orders them).
 *
 * Notes are the part of the CRM a human actually wrote, so nothing here is derived or summarised —
 * the content is rendered exactly as stored.
 */
export function RecordNotes({ object, id, notes }: { object: CrmObject; id: string; notes: CrmNote[] }) {
  const addNote = useAddNote(object, id)
  const deleteNote = useDeleteNote(object, id)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [armedId, setArmedId] = useState<string | null>(null)

  useEffect(() => {
    if (!armedId) return

    const disarm = () => setArmedId(null)
    // A click on any trash button is the buttons' own business — arming one must not be undone by
    // this listener before React has run the handler that arms it.
    const onDocumentClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-note-delete]")) return
      disarm()
    }

    const expiry = window.setTimeout(disarm, ARM_MS)
    document.addEventListener("click", onDocumentClick)
    return () => {
      window.clearTimeout(expiry)
      document.removeEventListener("click", onDocumentClick)
    }
  }, [armedId])

  const submit = () => {
    const body = content.trim()
    if (!body) return
    const heading = title.trim()

    addNote.mutate(heading ? { title: heading, content: body } : { content: body }, {
      onSuccess: () => {
        setTitle("")
        setContent("")
        toast.success("Note added")
      },
      onError: error => toast.error(errorMessage(error)),
    })
  }

  const remove = (noteId: string) => {
    setArmedId(null)
    deleteNote.mutate(noteId, {
      onSuccess: () => toast.success("Note deleted"),
      onError: error => toast.error(errorMessage(error)),
    })
  }

  return (
    <Panel title={`Notes (${notes.length})`}>
      <div className="space-y-2 border-border border-b p-4">
        <Input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Title (optional)"
          className="h-8 text-[13px]"
        />
        <textarea
          value={content}
          onChange={event => setContent(event.target.value)}
          placeholder="Write a note…"
          className="flex min-h-16 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={submit} disabled={!content.trim() || addNote.isPending}>
            {addNote.isPending ? "Adding…" : "Add note"}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {notes.map(note => (
            <NoteRow
              key={note.id}
              note={note}
              armed={armedId === note.id}
              onArm={() => setArmedId(note.id)}
              onDelete={() => remove(note.id)}
              deleting={deleteNote.isPending}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default RecordNotes
