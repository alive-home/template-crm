import { cn } from "#/lib/utils.ts"

/**
 * The two containers every CRM page is built from.
 *
 * They exist so panels, headings and empty states are one decision rather than a class string
 * copied between four pages and slowly drifting apart.
 */

/**
 * The padded, centred container for the reading pages — overview, tasks, one record.
 *
 * It owns the scroll and the page gutter so the shell can stay full-bleed: the record grid is a
 * viewport-filling table with no gutter at all, and a padding rule in the layout would have forced
 * it to undo one.
 */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
      <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="font-semibold text-[19px] text-foreground tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      {title ? (
        <div className="flex h-11 items-center justify-between gap-3 border-border border-b px-4">
          <h2 className="font-medium text-[13px] text-card-foreground">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />
}

/** An empty panel body. Says what is absent, in a sentence, rather than drawing a blank box. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">{children}</p>
}
