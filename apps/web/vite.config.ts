import { aliveTagger } from "@alive-game/alive-tagger"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const api = env.API_PROXY_TARGET ?? "http://localhost:3001"
  return {
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      // Dev only: tags each element with its source location so Alive's
      // preview can map a clicked element back to the line that renders it.
      mode === "development" && aliveTagger(),
    ],
    server: {
      port: Number(env.PORT ?? 3000),
      host: true,
      // Dev-only mirror of nginx.conf's `location /rpc/` so the same-origin
      // "/rpc" client default reaches the api (bun, :3001) in dev too.
      proxy: {
        "/rpc": api,
        // The CRM: its routes, and the password gate's own pages. `fetchApi` answers a 401 by
        // sending the tab to /login, which exists only on the api; unproxied, the SPA fallback
        // serves index.html and the router renders NotFound, so signing in looks like a broken route.
        "/api": api,
        "/login": api,
        "/logout": api,
      },
    },
    preview: {
      port: Number(env.PORT ?? 3000),
      host: true,
    },
  }
})
