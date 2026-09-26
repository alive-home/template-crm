import { type ChangeEvent, type KeyboardEvent, useState } from "react"
import { toast } from "sonner"
import { FieldValue } from "#/components/crm/FieldValue.tsx"
import { Panel } from "#/components/crm/Panel.tsx"
import type { CrmAttribute } from "#/lib/crm-types.ts"
import { fieldLabel } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

export type Field = { slug: string; attribute: CrmAttribute | undefined; value: unknown }
export type Editor = { kind: "select"; options: string[] } | { kind: "text"; long: boolean } | { kind: "number" } | null
export type SaveFn = (slug: string, value: unknown) => Promise<boolean>

const CONTROL =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const ACTION = "text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
const TEXT_TYPES = new Set(["text", "personal-name", "email-address", "phone-number", "domain"])
const NUMBER_TYPES = new Set(["number", "currency", "rating"])
/** Past this, a value gets a textarea: a one-line box for a paragraph shows a sliding window of it. */
const LONG_TEXT = 60

/**
 * What a field can be edited with. References, timestamps and multi-value collections stay read-only:
 * PATCH writes plain columns on one table, so a box that cannot save is worse than no box. Editability
 * follows the attribute *type*, not the group — a deal's own name is system and must still be editable.
 */
export function editorFor(field: Field): Editor {
  const attribute = field.attribute
  if (!attribute || attribute.isMultiselect || Array.isArray(field.value)) return null
  const { type, options } = attribute
  if ((type === "select" || type === "status") && options.length > 0) return { kind: "select", options }
  if (NUMBER_TYPES.has(type)) return { kind: "number" }
  if (TEXT_TYPES.has(type)) return { kind: "text", long: String(field.value ?? "").length > LONG_TEXT }
  return null
}

export function isEmpty(value: unknown): boolean {
  if (typeof value === "string") return value.trim() === ""
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0)
}

/** A checkbox column stores 0/1. "1" is a database answer to "is this person a decision maker". */
function display(field: Field): unknown {
  if (field.attribute?.type === "checkbox" && (field.value === 0 || field.value === 1)) {
    return field.value === 1 ? "Yes" : "No"
  }
  return field.value
}

function Row({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-4 px-4 py-2">
      <dt className="truncate pt-px text-[12px] text-muted-foreground" title={fieldLabel(slug)}>
        {fieldLabel(slug)}
      </dt>
      <dd className="min-w-0 text-[13px] text-foreground">{children}</dd>
    </div>
  )
}

/**
 * One field. Reading always goes through `FieldValue`, so every value on the page is formatted by one
 * set of rules and this component only ever owns the draft.
 *
 * Editing is quiet: the value itself is the trigger, the control takes the full width of the value
 * column, and Enter saves while Escape cancels. A permanent pair of buttons on every row would draw
 * more attention to editing than to the record.
 */
export function FieldRow({ field, editor, onSave }: { field: Field; editor: Editor; onSave: SaveFn }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const cancel = () => setEditing(false)
  const read = <FieldValue value={display(field)} slug={field.slug} />
  const onChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setDraft(event.target.value)

  const start = () => {
    setDraft(field.value === null || field.value === undefined ? "" : String(field.value))
    setEditing(true)
  }

  const commit = async () => {
    const trimmed = draft.trim()
    if (editor?.kind === "number" && trimmed !== "" && !Number.isFinite(Number(trimmed))) {
      toast.error(`${fieldLabel(field.slug)} must be a number`)
      return
    }
    // Clearing writes null rather than "", so a cleared field reads back as unset.
    const next = trimmed === "" ? null : editor?.kind === "number" ? Number(trimmed) : draft
    setSaving(true)
    const saved = await onSave(field.slug, next)
    setSaving(false)
    if (saved) cancel()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Enter commits, except in a textarea where it is a line break and ⌘/Ctrl+Enter commits instead.
    const isTextarea = event.currentTarget instanceof HTMLTextAreaElement
    if (event.key === "Enter" && (!isTextarea || event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void commit()
    } else if (event.key === "Escape") {
      event.preventDefault()
      cancel()
    }
  }

  if (!editor) return <Row slug={field.slug}>{read}</Row>

  if (!editing) {
    return (
      <Row slug={field.slug}>
        <button
          type="button"
          onClick={start}
          title={`Edit ${fieldLabel(field.slug)}`}
          className="-mx-1.5 -my-0.5 block w-full rounded px-1.5 py-0.5 text-left transition-colors hover:bg-muted"
        >
          {read}
        </button>
      </Row>
    )
  }

  // A stored value outside the catalog stays selectable rather than snapping to the first option.
  const extra = editor.kind === "select" && draft && !editor.options.includes(draft) ? [draft] : []
  const common = { value: draft, onChange, onKeyDown }

  return (
    <Row slug={field.slug}>
      <div className="space-y-1.5">
        {editor.kind === "select" ? (
          // biome-ignore lint/a11y/noAutofocus: focus follows an explicit click to edit
          <select autoFocus {...common} className={cn(CONTROL, "h-8 py-0")}>
            <option value="">—</option>
            {[...extra, ...editor.options].map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : editor.kind === "text" && editor.long ? (
          // biome-ignore lint/a11y/noAutofocus: focus follows an explicit click to edit
          <textarea autoFocus {...common} rows={4} className={cn(CONTROL, "resize-y leading-relaxed")} />
        ) : (
          // biome-ignore lint/a11y/noAutofocus: focus follows an explicit click to edit
          <input autoFocus {...common} type={editor.kind === "number" ? "number" : "text"} className={CONTROL} />
        )}

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void commit()} disabled={saving} className={cn(ACTION, "font-medium")}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={cancel} disabled={saving} className={ACTION}>
            Cancel
          </button>
          <span className="text-[11px] text-muted-foreground/70">
            {/* Spelled out rather than drawn: the ⌘ glyph is missing from the UI font and renders as tofu. */}
            {editor.kind === "text" && editor.long
              ? "Cmd + Enter to save, Esc to cancel"
              : "Enter to save, Esc to cancel"}
          </span>
        </div>
      </div>
    </Row>
  )
}

/**
 * A group of fields, populated ones first. Most of the sixty-odd columns are null on any given record,
 * so empty ones collapse behind a count — still listed, since an unset field is a fact, just not at
 * the cost of burying the handful that are filled in.
 */
export function FieldGroup({
  title,
  fields,
  onSave,
  collapsible,
}: {
  title: string
  fields: Field[]
  onSave: SaveFn
  /** A group of system columns opens closed: it is reference material, not what you came to read. */
  collapsible?: boolean
}) {
  const [showEmpty, setShowEmpty] = useState(false)
  const [open, setOpen] = useState(!collapsible)
  if (fields.length === 0) return null

  const filled = fields.filter(field => !isEmpty(field.value))
  const empty = fields.filter(field => isEmpty(field.value))
  const visible = showEmpty ? [...filled, ...empty] : filled

  return (
    <Panel
      title={title}
      action={
        collapsible ? (
          <button type="button" onClick={() => setOpen(was => !was)} className={ACTION}>
            {open ? "Hide" : `Show ${fields.length}`}
          </button>
        ) : null
      }
    >
      {open ? (
        <div className="py-1.5">
          {visible.length === 0 ? (
            <p className="px-4 py-2 text-[13px] text-muted-foreground">Nothing filled in.</p>
          ) : (
            <dl className="divide-y divide-border/60">
              {visible.map(field => (
                <FieldRow key={field.slug} field={field} editor={editorFor(field)} onSave={onSave} />
              ))}
            </dl>
          )}
          {empty.length > 0 ? (
            <button type="button" onClick={() => setShowEmpty(was => !was)} className={cn(ACTION, "mt-1 px-4")}>
              {showEmpty ? "Hide" : "Show"} {empty.length} empty {empty.length === 1 ? "field" : "fields"}
            </button>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}
