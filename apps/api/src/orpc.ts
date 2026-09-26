import { os } from "@orpc/server"

// Initial context supplied by the fetch handler in index.ts.
export type Context = { headers: Headers }

// No session here: the CRM's password gate in index.ts runs before /rpc, so a procedure is
// exactly as protected as every /api/crm route.
export const publicProcedure = os.$context<Context>()
