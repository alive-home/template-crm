import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { QueryClient } from "@tanstack/react-query"
import type { AppRouter } from "@template/api/router"
import { env } from "#/env.ts"
import { ApiError } from "#/lib/api.ts"

/**
 * How long a CRM read stays good, and when asking again is worth anything.
 *
 * Every list was `staleTime: 0`, which means a refetch on every mount: opening a company from the
 * list and pressing back re-fetched the whole company list, and it will re-fetch all 300,000 later. A
 * minute is the compromise — long enough that moving around the app costs nothing, short enough that
 * a change somebody made while you were on another screen shows up without a reload. The reads that
 * describe structure rather than records (the attribute catalog, the market cases, the personas) set
 * their own longer times in `use-crm.ts` and still override this.
 *
 * The safety net under it is the ETag: when a query does go stale and refetch, an unchanged list
 * answers 304 with no body. So the cost of being wrong about this number is a round trip, never a
 * stale screen.
 */
const ONE_MINUTE = 60 * 1000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: ONE_MINUTE,

      // Keep a list in memory for the length of a working session rather than the default five
      // minutes, so going back to one is instant instead of a spinner over data we just had.
      gcTime: 30 * ONE_MINUTE,

      /*
       * Retry a server that fell over, never a request the server refused.
       *
       * A 4xx is an answer: an unknown field, a read-only column, an expired session that `fetchApi`
       * has already redirected on. Repeating it three times just delays the message and, for the 401,
       * fires three more requests at a tab that is already navigating away.
       */
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false
        return failureCount < 2
      },
    },
  },
})

// Resolve the oRPC endpoint URL.
//
//   VITE_API_BASE_URL set     → use it directly (e.g.
//                               "http://localhost:3001/rpc" when api runs
//                               on its own port without a proxy).
//   VITE_API_BASE_URL unset   → same-origin "/rpc" (default; web's nginx
//                               in production and vite's dev proxy forward
//                               /rpc to the api — see apps/web/nginx.conf
//                               and apps/web/vite.config.ts).
const rpcUrl = env.VITE_API_BASE_URL ? `${env.VITE_API_BASE_URL}/rpc` : `${window.location.origin}/rpc`

const link = new RPCLink({ url: rpcUrl })

export const client: RouterClient<AppRouter> = createORPCClient(link)

export const orpc = createTanstackQueryUtils(client)
