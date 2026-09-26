import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { Toaster } from "#/components/ui/sonner.tsx"
import { TooltipProvider } from "#/components/ui/tooltip.tsx"
import NotFound from "#/pages/NotFound.tsx"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  return (
    <TooltipProvider delayDuration={200}>
      <Toaster />
      <Outlet />
    </TooltipProvider>
  )
}
