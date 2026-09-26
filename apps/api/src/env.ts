import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"
import { crmEnv } from "./crm/env.ts"

export const env = createEnv({
  extends: [crmEnv],
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    API_BASE_URL: z.url(),
    WEB_BASE_URL: z.url(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
