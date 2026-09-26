import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The front door is the CRM.
 *
 * `/` redirects rather than mounting the CRM at the root, so every `/crm/...` link, bookmark and
 * `$object` param keeps working unchanged — and a genuinely unknown path still reaches NotFound
 * instead of being swallowed by a root-level `$object` route.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/crm" })
  },
})
