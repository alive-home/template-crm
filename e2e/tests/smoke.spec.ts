import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { expect, test } from "@playwright/test"
import type { AppRouter } from "@template/api/router"

// No Turso database is needed: every assertion here is about the process, the proxy and the gate,
// never about a record.
const API = process.env.API_BASE_URL ?? "http://localhost:3001"
const PASSWORD = process.env.CRM_PASSWORD ?? ""

test("api health responds in front of the gate", async ({ request }) => {
  const res = await request.get(`${API}/health`)
  expect(res.ok()).toBe(true)
  await expect(res.json()).resolves.toEqual({ ok: true })
})

test("a signed-out API caller gets the sentence, through the web proxy", async ({ request }) => {
  const res = await request.get("/api/crm/summary")
  expect(res.status()).toBe(401)
  await expect(res.json()).resolves.toEqual({ error: "Session expired. Sign in again." })
})

test("a signed-out browser is sent to the login page, and signing in opens the CRM", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/crm$/)
  await expect(page.getByRole("link", { name: "Overview", exact: true })).toBeVisible()
})

test("oRPC answers behind the gate once signed in", async ({ request }) => {
  const login = await request.post(`${API}/login`, { form: { password: PASSWORD, next: "/" }, maxRedirects: 0 })
  expect(login.status()).toBe(302)
  const cookie = login.headers()["set-cookie"]?.split(";")[0] ?? ""
  expect(cookie).toMatch(/^crm_session=/)

  const client: RouterClient<AppRouter> = createORPCClient(new RPCLink({ url: `${API}/rpc`, headers: { cookie } }))
  await expect(client.health()).resolves.toMatchObject({ ok: true })
})
