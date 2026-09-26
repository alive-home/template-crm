import { createFileRoute } from "@tanstack/react-router"
import { Personas } from "#/pages/crm/Personas.tsx"

export const Route = createFileRoute("/crm/personas")({
  component: Personas,
})
