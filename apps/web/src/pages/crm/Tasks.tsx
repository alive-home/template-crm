import { Link } from "@tanstack/react-router"
import { format, isPast, isValid, parseISO } from "date-fns"
import { useState } from "react"
import { toast } from "sonner"
import { EmptyState, Page, PageHeader, Panel } from "#/components/crm/Panel.tsx"
import { useCrmTasks, useToggleTask } from "#/hooks/use-crm.ts"
import type { CrmTask } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

const FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
] as const

type Filter = (typeof FILTERS)[number]["value"]

/**
 * Task content is one block of several lines: a title, then context, then a source marker. The row
 * shows the first line as the task and the rest as one muted line, because twenty tasks rendered in
 * full is a wall of text you cannot scan. The whole body is on the linked record.
 */
function split(task: CrmTask): { title: string; detail: string | null } {
  const lines = (task.content ?? "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)

  const [first, ...rest] = lines
  if (!first) return { title: "Untitled task", detail: null }
  return { title: first, detail: rest.join(" · ") || null }
}

function TaskRow({ task, onToggle, pending }: { task: CrmTask; onToggle: (task: CrmTask) => void; pending: boolean }) {
  const { title, detail } = split(task)
  const deadline = task.deadlineAt ? parseISO(task.deadlineAt) : null
  const dated = deadline && isValid(deadline) ? deadline : null
  // A missed deadline on a closed task is history, not a warning, so only open tasks go red.
  const overdue = dated ? isPast(dated) && !task.isCompleted : false

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
      <input
        type="checkbox"
        checked={task.isCompleted}
        onChange={() => onToggle(task)}
        disabled={pending}
        aria-label={task.isCompleted ? "Reopen task" : "Complete task"}
        className="size-3.5 shrink-0 accent-accent disabled:opacity-50"
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[13px]",
            task.isCompleted ? "text-muted-foreground line-through" : "text-foreground",
          )}
          title={title}
        >
          {title}
        </p>
        {detail ? (
          <p className="truncate text-[11px] text-muted-foreground" title={detail}>
            {detail}
          </p>
        ) : null}
      </div>

      {dated ? (
        <span
          className={cn("shrink-0 text-[11px] tabular-nums", overdue ? "text-destructive" : "text-muted-foreground")}
        >
          {format(dated, "d MMM yyyy")}
        </span>
      ) : null}

      {task.record ? (
        <Link
          to="/crm/$object/$id"
          params={{ object: task.record.object, id: task.record.id }}
          className="w-40 shrink-0 truncate text-right text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {task.record.label ?? "Linked record"}
        </Link>
      ) : (
        <span className="w-40 shrink-0" />
      )}
    </li>
  )
}

/**
 * `/crm/tasks` — every task in the CRM, open and closed.
 *
 * The whole list is fetched once and the All/Open switch filters it in the browser. There are 22
 * tasks: a second round trip to hide a handful of rows would cost more than the filter does, and
 * refetching per tab would make the toggle feel slower than the checkbox next to it.
 */
export function Tasks() {
  const [filter, setFilter] = useState<Filter>("all")
  const { data, isLoading, error } = useCrmTasks()
  const toggleTask = useToggleTask()

  const tasks = data ?? []
  const visible = filter === "open" ? tasks.filter(task => !task.isCompleted) : tasks

  const onToggle = (task: CrmTask) => {
    toggleTask.mutate(
      { id: task.id, isCompleted: !task.isCompleted },
      { onError: cause => toast.error(cause instanceof Error ? cause.message : "Could not update the task") },
    )
  }

  return (
    <Page>
      <div className="space-y-5">
        <PageHeader
          title="Tasks"
          description={
            data ? `${visible.length.toLocaleString()} ${visible.length === 1 ? "task" : "tasks"}` : "Loading tasks…"
          }
          actions={
            <div className="flex rounded-md border border-border p-0.5">
              {FILTERS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-[13px] transition-colors",
                    filter === option.value
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        />

        {error ? <p className="text-[13px] text-destructive">{error.message}</p> : null}

        <Panel>
          {isLoading && !data ? <EmptyState>Loading…</EmptyState> : null}

          {data && visible.length === 0 ? (
            <EmptyState>
              {filter === "open" ? "Nothing open. Every task is closed." : "No tasks in the CRM."}
            </EmptyState>
          ) : null}

          {visible.length > 0 ? (
            <ul className="divide-y divide-border">
              {visible.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  // Only the row being written is disabled; the rest of the list stays usable.
                  pending={toggleTask.isPending && toggleTask.variables?.id === task.id}
                />
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>
    </Page>
  )
}

export default Tasks
