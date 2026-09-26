import { createFileRoute } from "@tanstack/react-router"
import { Emails } from "#/pages/crm/Emails.tsx"

export const Route = createFileRoute("/crm/emails")({
  component: Emails,
})
