import { existsSync, readFileSync } from "node:fs"
import { defineConfig, devices } from "@playwright/test"

// bun's automatic .env loading does not survive the `bun --filter` hop, so
// load the workspace root .env here — real env vars keep precedence.
const envFile = new URL("../.env", import.meta.url)
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line)
    if (m?.[1] && m[2] !== undefined && !(m[1] in process.env)) {
      process.env[m[1]] = m[2]
    }
  }
}

const WEB = process.env.WEB_BASE_URL ?? "http://localhost:3000"
const API = process.env.API_BASE_URL ?? "http://localhost:3001"
// The api starts with the CRM's password gate on, so the suite walks through the door as well as
// the room. `||`, not `??`: .env.example carries an empty CRM_PASSWORD, which means "no gate".
// Written back to process.env so the specs read the same value.
const CRM_PASSWORD = process.env.CRM_PASSWORD || "e2e-crm-password"
process.env.CRM_PASSWORD = CRM_PASSWORD

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: WEB,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun --filter @template/api dev",
      url: `${API}/health`,
      reuseExistingServer: !process.env.CI,
      cwd: "..",
      // PORT follows the URL, so the suite can run beside the supervised dev servers on 3000/3001
      // (which it would otherwise reuse, with their own password or none) on any free pair.
      env: { CRM_PASSWORD, API_BASE_URL: API, WEB_BASE_URL: WEB, PORT: new URL(API).port },
    },
    {
      command: "bun --filter @template/web dev",
      url: WEB,
      reuseExistingServer: !process.env.CI,
      cwd: "..",
      env: { VITE_API_BASE_URL: API, VITE_WEB_BASE_URL: WEB, PORT: new URL(WEB).port, API_PROXY_TARGET: API },
    },
  ],
})
