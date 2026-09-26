import { createFileRoute } from "@tanstack/react-router"
import { ObjectList } from "#/pages/crm/ObjectList.tsx"

export const Route = createFileRoute("/crm/$object/")({
  component: ObjectList,
})
