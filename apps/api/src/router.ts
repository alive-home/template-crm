import { publicProcedure } from "./orpc.ts"

export const appRouter = {
  health: publicProcedure.handler(() => ({ ok: true, ts: Date.now() })),
}

export type AppRouter = typeof appRouter
