import { createFileRoute } from "@tanstack/react-router"
import { RecordDetail } from "#/pages/crm/RecordDetail.tsx"

export const Route = createFileRoute("/crm/$object/$id")({
  component: RecordDetail,
})
