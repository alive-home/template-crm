import { createFileRoute } from "@tanstack/react-router"
import { Tasks } from "#/pages/crm/Tasks.tsx"

export const Route = createFileRoute("/crm/tasks")({
  component: Tasks,
})
