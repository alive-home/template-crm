import { createFileRoute } from "@tanstack/react-router"
import { CrmMap } from "#/pages/crm/Map.tsx"

/**
 * MapLibre is roughly 800kB of WebGL renderer, more than the rest of the app put together. The
 * router plugin's `autoCodeSplitting` puts this route's component in its own chunk, fetched the first
 * time somebody opens the map, so no other page pays for it.
 */
export const Route = createFileRoute("/crm/map")({
  component: CrmMap,
})
