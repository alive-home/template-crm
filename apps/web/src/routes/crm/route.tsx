import { createFileRoute } from "@tanstack/react-router"
import { CrmLayout } from "#/components/crm/CrmLayout.tsx"

/**
 * `/crm` is a layout route: it owns the sidebar and renders its children into `CrmLayout`'s outlet,
 * so the nav mounts once and survives navigation between record lists instead of remounting per page.
 *
 * TanStack Router ranks a static segment above a dynamic one, so `/crm/tasks` can never be read as
 * an object named "tasks".
 */
export const Route = createFileRoute("/crm")({
  component: CrmLayout,
})
