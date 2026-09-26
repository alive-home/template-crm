import { createFileRoute } from "@tanstack/react-router"
import { Research } from "#/pages/crm/Research.tsx"

export const Route = createFileRoute("/crm/research")({
  component: Research,
})
