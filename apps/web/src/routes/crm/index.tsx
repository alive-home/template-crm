import { createFileRoute } from "@tanstack/react-router"
import { Overview } from "#/pages/crm/Overview.tsx"

export const Route = createFileRoute("/crm/")({
  component: Overview,
})
