import { Link, useParams } from "@tanstack/react-router"
import { Check, ChevronLeft, Circle } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"
import { Page, Panel, Skeleton } from "#/components/crm/Panel.tsx"
import { firstDomain, RecordMark } from "#/components/crm/RecordAvatar.tsx"
import { type Field, FieldGroup, type SaveFn } from "#/components/crm/RecordFields.tsx"
import { RecordNotes } from "#/components/crm/RecordNotes.tsx"
import { useCrmRecord, useCrmSchema, useUpdateRecord } from "#/hooks/use-crm.ts"
import type { CrmAttribute, CrmObject, CrmProject, CrmRecordDetail, CrmTask } from "#/lib/crm-types.ts"
import { CRM_OBJECTS, fieldLabel, isCrmRef, isPlumbing, OBJECT_LABELS } from "#/lib/crm-types.ts"
import { domainHref } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"

const LINK = "inline-flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
const MUTED = "text-muted-foreground"

/**
 * A rejected write comes back as `{ error: "unknown or read-only fields: …" }` and is surfaced word for
 * word — a generic message would hide the one thing that response exists to say, and the user would
 * believe a dropped field was saved.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function first(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value
  if (Array.isArray(value) && typeof value[0] === "string") return value[0]
  return null
}

/**
 * The one line under the name: what this record *is*, in the words you would use out loud.
 *
 * Only a handful of columns qualify, and they are the ones you would read off a business card. The
 * rest of the record is below; this line exists so you know who you are looking at without reading it.
 */
function Identity({ record }: { record: CrmRecordDetail }) {
  const parts: React.ReactNode[] = []
  const title = first(record.job_title) ?? first(record.employee_range)
  const email = first(record.emailAddresses)
  const domain = firstDomain(record.domains)
  const place = first(record.primary_location_locality)
  const company = record.company

  if (title) parts.push(<span key="title">{title}</span>)
  // A deal is usually named after its company, and "Hangsofa · Hangsofa" says nothing twice.
  if (isCrmRef(company) && company.label !== record.label) {
    parts.push(
      <Link
        key="company"
        to="/crm/$object/$id"
        params={{ object: company.object, id: company.id }}
        className="text-foreground hover:underline"
      >
        {company.label ?? "Linked company"}
      </Link>,
    )
  }
  if (domain) {
    parts.push(
      <a
        key="domain"
        href={domainHref(domain)}
        target="_blank"
        rel="noreferrer noopener"
        className="hover:text-foreground hover:underline"
      >
        {domain}
      </a>,
    )
  }
  if (email)
    parts.push(
      <a key="email" href={`mailto:${email}`} className="hover:text-foreground hover:underline">
        {email}
      </a>,
    )
  if (place) parts.push(<span key="place">{place}</span>)

  if (parts.length === 0) return null

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
      {parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: separators, positional by definition
        <span key={`sep-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span className="text-border">·</span> : null}
          {part}
        </span>
      ))}
    </p>
  )
}

/** Linked tasks, read-only here: this page shows them, `/crm/tasks` is where they are worked. */
function TaskList({ tasks }: { tasks: CrmTask[] }) {
  return (
    <Panel title={`Tasks (${tasks.length})`}>
      <ul className="divide-y divide-border/60">
        {tasks.map(task => {
          const Marker = task.isCompleted ? Check : Circle
          const title = (task.content ?? "").split("\n").find(line => line.trim()) ?? "Untitled task"
          return (
            <li key={task.id} className="flex items-start gap-2.5 px-4 py-2.5">
              <Marker size={13} className={cn("mt-0.5 shrink-0", task.isCompleted ? "text-success" : MUTED)} />
              <p className={cn("min-w-0 flex-1 text-[13px]", task.isCompleted && `${MUTED} line-through`)}>{title}</p>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/**
 * Projects delivered at this company.
 *
 * A project points at its company rather than the other way round, so this is a backlink. For the
 * case companies it is the whole point of the record: what was already automated here, and by whom.
 */
function ProjectList({ projects }: { projects: CrmProject[] }) {
  return (
    <Panel title={`Projects (${projects.length})`}>
      <ul className="divide-y divide-border/60">
        {projects.map(project => (
          <li key={project.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-[13px] text-foreground">{project.name ?? "Untitled"}</span>
              {project.status ? <span className={`text-[11px] ${MUTED}`}>{project.status}</span> : null}
              {project.stack ? <span className={`text-[11px] ${MUTED}`}>{project.stack}</span> : null}
            </div>
            {project.notes ? (
              <p className={`mt-1 whitespace-pre-line text-[12px] ${MUTED} leading-relaxed`}>{project.notes}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/**
 * Every field on the record, in one list: what a person typed first, then what the system generated.
 *
 * An earlier version split these into "Details" and "System" panels using the catalog's system flag,
 * and it put the description, the job title and the created date behind a collapsed toggle while
 * leaving two fields on show. The flag describes who owns the attribute, not whether it is worth
 * reading. What actually matters is whether the field is filled in, and `FieldGroup` already sorts
 * on that.
 *
 * Plumbing columns — ids, target-object markers, currency codes — are dropped entirely. They are how
 * the mirror is wired, not facts about the record, and rendering them made the page a table dump.
 */
function collectFields(record: CrmRecordDetail | undefined, attributes: CrmAttribute[] | undefined): Field[] {
  if (!record) return []

  const bySlug = new Map((attributes ?? []).map(attribute => [attribute.slug, attribute]))
  const own: Field[] = []
  const generated: Field[] = []

  for (const slug of Object.keys(record)) {
    if (isPlumbing(slug)) continue
    const attribute = bySlug.get(slug)
    ;(attribute && !attribute.isSystem ? own : generated).push({ slug, attribute, value: record[slug] })
  }

  return [...own, ...generated]
}

function RecordView({ object, id }: { object: CrmObject; id: string }) {
  const { data: record, isLoading, error } = useCrmRecord(object, id)
  const { data: schema } = useCrmSchema(object)
  const update = useUpdateRecord(object, id)
  const fields = useMemo(() => collectFields(record, schema?.attributes), [record, schema])

  const save: SaveFn = async (slug, value) => {
    try {
      await update.mutateAsync({ [slug]: value })
      toast.success(`${fieldLabel(slug)} saved`)
      return true
    } catch (caught) {
      toast.error(errorMessage(caught))
      return false
    }
  }

  if (isLoading) {
    return (
      <Page>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </Page>
    )
  }

  if (error || !record) {
    return (
      <Page>
        <Panel className="p-6">
          <p className="text-[13px] text-destructive">
            {error ? errorMessage(error) : "That record is not in the CRM."}
          </p>
          <Link to="/crm/$object" params={{ object }} className={cn(LINK, "mt-3")}>
            <ChevronLeft size={13} /> Back to {OBJECT_LABELS[object]}
          </Link>
        </Panel>
      </Page>
    )
  }

  return (
    <Page>
      <div className="space-y-5">
        <header className="space-y-2.5">
          <Link to="/crm/$object" params={{ object }} className={LINK}>
            <ChevronLeft size={13} /> {OBJECT_LABELS[object]}
          </Link>
          <div className="flex items-center gap-3">
            <RecordMark object={object} record={record} />
            <div className="min-w-0 space-y-0.5">
              <h1
                className={cn(
                  "truncate font-semibold text-[22px] tracking-tight",
                  record.label ? "text-foreground" : MUTED,
                )}
              >
                {record.label ?? "Untitled"}
              </h1>
              <Identity record={record} />
            </div>
          </div>
        </header>

        {/* Fields left, the written record right: notes are read alongside the attributes, not below them. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="space-y-4">
            <FieldGroup title="Details" fields={fields} onSave={save} />
          </div>

          <div className="space-y-4">
            <RecordNotes object={object} id={id} notes={record.notes} />
            {record.projects?.length ? <ProjectList projects={record.projects} /> : null}
            {record.tasks.length > 0 ? <TaskList tasks={record.tasks} /> : null}
          </div>
        </div>
      </div>
    </Page>
  )
}

export function RecordDetail() {
  // Read loosely and validated here rather than leaned on the inferred param union: this page checks
  // the slug itself, whatever the route tree declares. An unrecognised one must never reach a hook or
  // become a URL.
  const params: Record<string, string | undefined> = useParams({ strict: false })
  const object = CRM_OBJECTS.find(candidate => candidate === params.object)

  if (!object || !params.id) {
    return (
      <Page>
        <Panel className="p-6">
          <h1 className="font-semibold text-[19px] text-foreground tracking-tight">Unknown record type</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">There is no such object in this CRM.</p>
          <Link to="/crm" className={cn(LINK, "mt-3")}>
            <ChevronLeft size={13} /> Back to the CRM
          </Link>
        </Panel>
      </Page>
    )
  }

  return <RecordView object={object} id={params.id} />
}

export default RecordDetail
