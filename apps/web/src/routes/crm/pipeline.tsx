import { createFileRoute } from "@tanstack/react-router"
import { Pipeline } from "#/pages/crm/Pipeline.tsx"

export const Route = createFileRoute("/crm/pipeline")({
  component: Pipeline,
})
