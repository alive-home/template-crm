import { Link, useRouterState } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  Boxes,
  Building2,
  CircleUser,
  Columns3,
  FolderKanban,
  Handshake,
  Home,
  ListChecks,
  LogOut,
  Mail,
  MapIcon,
  MessageSquareQuote,
  PanelLeftClose,
  PanelLeftOpen,
  Telescope,
  UserSearch,
  Users,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useCrmSummary, useOutboundDrafts } from "#/hooks/use-crm.ts"
import { CRM_OBJECTS, type CrmObject, OBJECT_LABELS } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

const OBJECT_ICONS: Record<CrmObject, LucideIcon> = {
  companies: Building2,
  people: Users,
  deals: Handshake,
  projects: FolderKanban,
  customer_feedback: MessageSquareQuote,
  users: CircleUser,
  workspaces: Boxes,
}

/**
 * `/crm` matches exactly; everything else also matches its descendants.
 *
 * A prefix match on Overview would light it up on every page in the section, since they all sit
 * under `/crm`. Object links do want the prefix, so a record detail keeps its list highlighted.
 */
function isActive(pathname: string, to: string, exact = false): boolean {
  if (exact) return pathname === to
  return pathname === to || pathname.startsWith(`${to}/`)
}

const STORAGE_KEY = "crm.sidebar.collapsed"

/**
 * Collapsed or open, remembered.
 *
 * Which one you want depends on what you are doing — a wide grid wants the rail, the overview wants
 * the labels — so the choice has to survive navigation and reloads or it is not a choice.
 */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0")
    } catch {
      // Private-mode storage failures must not take the nav down with them.
    }
  }, [collapsed])

  return [collapsed, setCollapsed] as const
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return null
  return <div className="px-2 pb-1 font-medium text-[11px] text-muted-foreground/80 tracking-wide">{children}</div>
}

type ItemProps = {
  to: string
  params?: { object: CrmObject }
  icon: LucideIcon
  label: string
  active: boolean
  collapsed: boolean
  trailing?: React.ReactNode
}

/**
 * One nav row.
 *
 * The active row is marked by surface *and* a left bar rather than colour alone: at this type size a
 * tinted row alone reads as a hover state on a dense list.
 */
function Item({ to, params, icon: Icon, label, active, collapsed, trailing }: ItemProps) {
  return (
    <Link
      to={to}
      params={params}
      title={label}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
        collapsed ? "justify-center" : "justify-start",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      {active && !collapsed ? (
        <span className="-translate-y-1/2 absolute top-1/2 left-0 h-4 w-0.5 rounded-r-full bg-primary" />
      ) : null}
      <Icon size={15} className={cn("shrink-0", active ? "text-sidebar-accent-foreground" : "text-muted-foreground")} />
      {collapsed ? null : (
        <>
          <span className="truncate">{label}</span>
          {trailing ? <span className="ml-auto">{trailing}</span> : null}
        </>
      )}
    </Link>
  )
}

function Count({ value, tone = "muted" }: { value: number; tone?: "muted" | "loud" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] tabular-nums",
        tone === "loud" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
      )}
    >
      {value.toLocaleString()}
    </span>
  )
}

/**
 * Nav for the CRM section.
 *
 * It collapses to an icon rail on demand — labels, counts and section headings drop out and the
 * icons carry the nav — because the record grid is a wide table and 56 rems of nav is the first
 * thing you want back. The state is the reader's, not the breakpoint's.
 */
export function CrmSidebar() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const { data: summary } = useCrmSummary()
  const { data: outbound } = useOutboundDrafts()
  const [collapsed, setCollapsed] = useCollapsed()

  // Counts render only once the summary lands. An undefined count is omitted rather than shown as
  // a zero, because "0 companies" and "not loaded yet" are different claims.
  const counts = new Map(summary?.objects.map(entry => [entry.object, entry.count]))
  const openTasks = summary?.openTasks ?? 0
  const awaitingReview = outbound?.awaitingReview ?? 0
  const total = summary?.objects.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-sidebar-border border-r bg-sidebar-background transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className={cn("flex h-14 items-center gap-2.5 px-3", collapsed && "justify-center px-2")}>
        {collapsed ? null : (
          <>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-[13px] text-primary-foreground">
              C
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium text-[13px] text-sidebar-accent-foreground">CRM</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {total === undefined ? "Loading…" : `${total.toLocaleString()} records · Turso`}
              </div>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed || "ml-auto",
          )}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-0.5">
          <Item
            to="/crm"
            icon={Home}
            label="Overview"
            active={isActive(pathname, "/crm", true)}
            collapsed={collapsed}
          />
          <Item
            to="/crm/emails"
            icon={Mail}
            label="Emails"
            active={isActive(pathname, "/crm/emails", true)}
            collapsed={collapsed}
            // Drafts nobody has read yet are the whole point of the tab, so the count is the loud one.
            trailing={awaitingReview > 0 ? <Count value={awaitingReview} tone="loud" /> : null}
          />
          <Item
            to="/crm/pipeline"
            icon={Columns3}
            label="Pipeline"
            active={isActive(pathname, "/crm/pipeline", true)}
            collapsed={collapsed}
          />
          <Item
            to="/crm/map"
            icon={MapIcon}
            label="Map"
            active={isActive(pathname, "/crm/map", true)}
            collapsed={collapsed}
          />
          <Item
            to="/crm/personas"
            icon={UserSearch}
            label="Persona's"
            active={isActive(pathname, "/crm/personas", true)}
            collapsed={collapsed}
          />
          <Item
            to="/crm/research"
            icon={Telescope}
            label="Market research"
            active={isActive(pathname, "/crm/research", true)}
            collapsed={collapsed}
          />
          <Item
            to="/crm/tasks"
            icon={ListChecks}
            label="Tasks"
            active={isActive(pathname, "/crm/tasks", true)}
            collapsed={collapsed}
            trailing={openTasks > 0 ? <Count value={openTasks} tone="loud" /> : null}
          />
        </div>

        <div className="flex flex-col gap-0.5">
          <SectionLabel collapsed={collapsed}>Records</SectionLabel>
          {CRM_OBJECTS.map(object => {
            const count = counts.get(object)

            return (
              <Item
                key={object}
                to="/crm/$object"
                params={{ object }}
                icon={OBJECT_ICONS[object]}
                label={OBJECT_LABELS[object]}
                active={isActive(pathname, `/crm/${object}`)}
                collapsed={collapsed}
                trailing={count === undefined ? null : <Count value={count} />}
              />
            )
          })}
        </div>
      </nav>

      {/* A plain form post, not fetch: signing out clears an HttpOnly cookie the app cannot see, and
          the page it lands on is server-rendered. */}
      <form method="post" action="/logout" className="border-sidebar-border border-t p-2">
        <button
          type="submit"
          title="Sign out"
          className={cn(
            "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center" : "justify-start",
          )}
        >
          <LogOut size={15} className="shrink-0" />
          {collapsed ? null : <span className="truncate">Sign out</span>}
        </button>
      </form>
    </aside>
  )
}

export default CrmSidebar
