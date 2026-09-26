import { Link } from "@tanstack/react-router"
import { format, isValid, parseISO } from "date-fns"
import { BarList } from "#/components/crm/BarList.tsx"
import { EmptyState, Page, PageHeader, Panel, Skeleton } from "#/components/crm/Panel.tsx"
import { useCrmSummary, useCrmTasks } from "#/hooks/use-crm.ts"
import type { CrmSummary, CrmTask } from "#/lib/crm-types.ts"

const MAX_TASKS = 6

const EUR = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

function countOf(summary: CrmSummary, object: string): number {
  return summary.objects.find(entry => entry.object === object)?.count ?? 0
}

/**
 * Six totals that answer different questions, which is exactly why they are tiles and not a chart:
 * they share no scale, so a bar chart of them would invite a comparison that means nothing.
 */
function tiles(summary: CrmSummary): { label: string; value: string; hint?: string }[] {
  const worked = summary.coverage.deals ? Math.round((summary.coverage.withNextStep / summary.coverage.deals) * 100) : 0

  return [
    { label: "Companies", value: countOf(summary, "companies").toLocaleString() },
    { label: "People", value: countOf(summary, "people").toLocaleString() },
    {
      label: "Deals",
      value: countOf(summary, "deals").toLocaleString(),
      hint: `${worked}% have a next step`,
    },
    { label: "Notes", value: summary.notes.toLocaleString() },
    {
      label: "Open tasks",
      value: summary.openTasks.toLocaleString(),
      hint: summary.overdueTasks > 0 ? `${summary.overdueTasks} overdue` : undefined,
    },
    {
      label: "Committed",
      value: EUR.format(summary.revenue.committed),
      hint: `${EUR.format(summary.revenue.outstanding)} outstanding`,
    },
  ]
}

/** Task content is a multi-line block; its first line is the actual title. */
function taskTitle(task: { content: string | null }): string {
  const first = (task.content ?? "")
    .split("\n")
    .map(line => line.trim())
    .find(Boolean)

  return first ?? "Untitled task"
}

function when(value: string | null): string | null {
  if (!value) return null
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, "d MMM") : null
}

function OpenTasks({ tasks }: { tasks: CrmTask[] }) {
  return (
    <ul className="divide-y divide-border">
      {tasks.slice(0, MAX_TASKS).map(task => (
        <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="truncate text-[13px] text-foreground" title={taskTitle(task)}>
            {taskTitle(task)}
          </span>
          {task.record ? (
            <Link
              to="/crm/$object/$id"
              params={{ object: task.record.object, id: task.record.id }}
              className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {task.record.label ?? "Linked record"}
            </Link>
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">{when(task.deadlineAt) ?? "No date"}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function RecentNotes({ notes }: { notes: CrmSummary["recentNotes"] }) {
  return (
    <ul className="divide-y divide-border">
      {notes.slice(0, MAX_TASKS).map(note => (
        <li key={note.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="truncate text-[13px] text-foreground" title={note.title ?? undefined}>
            {note.title ?? "Untitled note"}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
            {/* A note whose parent no longer resolves still lists — the note is the record of the work. */}
            {note.record ? (
              <Link
                to="/crm/$object/$id"
                params={{ object: note.record.object, id: note.record.id }}
                className="transition-colors hover:text-foreground"
              >
                {note.record.label ?? "Linked record"}
              </Link>
            ) : null}
            {when(note.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <Skeleton key={index} className="h-6" />
      ))}
    </div>
  )
}

export function Overview() {
  const { data: summary, isLoading } = useCrmSummary()
  const { data: tasks, isLoading: tasksLoading } = useCrmTasks(true)

  const openTasks = tasks ?? []
  const stages =
    summary?.stages.map(row => ({
      name: row.stage,
      count: row.count,
      meta: row.committed > 0 ? EUR.format(row.committed) : null,
    })) ?? []

  return (
    <Page>
      <div className="space-y-5">
        <PageHeader
          title="Overview"
          description="The CRM at a glance, counted live in Turso."
          actions={
            <Link
              to="/crm/$object"
              params={{ object: "deals" }}
              className="rounded-md border border-border px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Open pipeline
            </Link>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {isLoading || !summary
            ? Array.from({ length: 6 }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
                <Skeleton key={index} className="h-[76px] rounded-xl" />
              ))
            : tiles(summary).map(tile => (
                <div key={tile.label} className="rounded-xl border border-border bg-card px-3.5 py-3">
                  <div className="truncate font-semibold text-[20px] text-card-foreground tabular-nums">
                    {tile.value}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{tile.label}</div>
                  {tile.hint ? (
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{tile.hint}</div>
                  ) : null}
                </div>
              ))}
        </div>

        {/* items-start: a short panel keeps its own height instead of stretching to match its neighbour. */}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Panel title="Deals by stage">
            {!summary ? (
              <Loading />
            ) : stages.length === 0 ? (
              <EmptyState>No deals in the CRM yet.</EmptyState>
            ) : (
              <BarList rows={stages} unit="deal" className="p-2" />
            )}
          </Panel>

          <Panel title="Prospect priority">
            {!summary ? (
              <Loading />
            ) : summary.priorities.length === 0 ? (
              <EmptyState>Nothing scored yet.</EmptyState>
            ) : (
              <BarList rows={summary.priorities} unit="deal" className="p-2" />
            )}
          </Panel>

          <Panel title="Outreach readiness">
            {!summary ? (
              <Loading />
            ) : summary.readiness.length === 0 ? (
              <EmptyState>Nothing assessed yet.</EmptyState>
            ) : (
              <BarList rows={summary.readiness} unit="deal" className="p-2" />
            )}
          </Panel>

          <Panel
            title="Open tasks"
            action={
              <Link
                to="/crm/tasks"
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
              </Link>
            }
          >
            {tasksLoading && !tasks ? (
              <Loading />
            ) : openTasks.length === 0 ? (
              <EmptyState>Nothing open. Every task is closed.</EmptyState>
            ) : (
              <OpenTasks tasks={openTasks} />
            )}
          </Panel>

          <Panel title="Recent notes" className="lg:col-span-2">
            {!summary ? (
              <Loading />
            ) : summary.recentNotes.length === 0 ? (
              <EmptyState>No notes yet.</EmptyState>
            ) : (
              <RecentNotes notes={summary.recentNotes} />
            )}
          </Panel>
        </div>
      </div>
    </Page>
  )
}

export default Overview
