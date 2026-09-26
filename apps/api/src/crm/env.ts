import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * The CRM's configuration, declared apart from the api's public origins.
 *
 * The scripts under `apps/api/scripts` import the CRM modules and run from a shell with no reason to
 * know the web's URL, so these cannot share a `createEnv` with `API_BASE_URL` and `WEB_BASE_URL`,
 * which refuses to parse without both. `apps/api/src/env.ts` extends this one, so the server still
 * declares everything it reads in one place.
 *
 * All three are optional on purpose, and none has a default. The process boots without them, and
 * each use names the missing variable: `turso()` on the first query, the gate on the first request.
 */
export const crmEnv = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    TURSO_DATABASE_URL_CRM: z.string().optional(),
    TURSO_API_KEY_CRM: z.string().optional(),
    CRM_PASSWORD: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
