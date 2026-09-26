import { Outlet } from "@tanstack/react-router"
import { CrmSidebar } from "#/components/crm/CrmSidebar.tsx"

/**
 * Two-column shell for everything under `/crm`.
 *
 * The shell is exactly one viewport tall and never scrolls itself; each page owns its scroll. That
 * is what lets the record grid *be* the screen — a full-height table with its own header row pinned
 * — instead of a card sitting inside a page that scrolls behind it. Reading pages opt back into a
 * gutter with `Page`, so the padding is a page's decision rather than something the grid must undo.
 */
export function CrmLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <CrmSidebar />
      {/* min-w-0 stops a wide table inside the outlet from pushing the sidebar off-screen. */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

export default CrmLayout
