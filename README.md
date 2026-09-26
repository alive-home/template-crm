# CRM

A single-tenant CRM that is one React app over one Hono router over one hosted SQLite database.
`/` redirects to `/crm`, and everything else is a view on the same seven objects: companies, people,
deals, projects, feedback, users, workspaces.

**It ships with no records.** The database is [Turso](https://turso.tech) and it is the only
datastore: no local SQLite file, no seed fixtures, no bundled fallback. A fresh clone against a fresh
database gives you an empty CRM with a working schema, not somebody else's contacts.

This repository is a fork of [`alive-home/alive-template-base`](https://github.com/alive-home/alive-template-base)
and keeps its layout, so improvements to the base arrive with `gh repo sync` or a merge of the base's
`main`.

## What is in it

- A spreadsheet-style record grid with server-side paging, sorting and a per-object column picker
- A record page that reads its fields out of the attribute catalog, so a new column in the database
  renders correctly with no code change
- A drag-and-drop pipeline board that writes moves straight back through the record endpoint
- An accounts map (MapLibre) that keeps a checked address and a geocoded city centre visually apart
- Tasks, notes, an overview counted entirely in SQL, and a shared-password gate in front of all of it

## Stack

React 19, Vite 8, TypeScript 7, TanStack Router (file routes) and Query, Tailwind 4, Radix
primitives, Hono with oRPC, Zod 4, `@t3-oss/env-core`, Biome, Turborepo, Playwright. Runtime is
[Bun](https://bun.sh).

```
apps/
  web/            The CRM screens: Vite SPA              → static nginx image
  api/            Hono: CRM routes, password gate, oRPC  → bun runtime image
    src/crm/      The CRM's server modules over Turso
    scripts/      migrate, seed, playbook, geocoder and the outbound scripts
packages/
  shared/         Cross-app code (empty)
  ui/             The base template's shared UI package (unused by the CRM)
e2e/              Playwright smoke that needs no database
alive.toml        Deploy and dev contract for Alive
docker-bake.hcl   One image per app
compose.yaml      Local convenience over the same Dockerfiles
```

## Running it

You need Bun 1.2+ and a Turso database.

```bash
bun install
cp .env.example .env                 # fill in TURSO_DATABASE_URL_CRM and TURSO_API_KEY_CRM
bun apps/api/scripts/migrate.ts      # creates every table and describes it in the catalog
bun run dev                          # web on 3000, api on 3001
```

`dev` runs both apps through Turborepo. Vite proxies `/rpc`, `/api`, `/login` and `/logout` to the
api (`API_PROXY_TARGET`, `http://localhost:3001` by default); in the image nginx does the same.

In an Alive workspace nothing needs starting: `alive.toml` declares the `web` (3000) and `api` (3001)
dev servers and the workspace supervisor runs them. Set the three variables below in Alive's env
settings; they land in `.env.development`, which the api reads after `.env`, so they win.

`migrate.ts` is additive and idempotent: every table is `if not exists`, every column is added only
when it is missing, and nothing is dropped, renamed or retyped. It is safe against a database that
already holds data, which is the property that makes anyone actually run it. `--dry-run` prints the
statements without executing them. Run the scripts from the repository root.

### Configuration

The CRM's three variables have no default in code. A missing one throws a sentence naming the
variable rather than booting cleanly against nothing.

| Variable | What it is |
| --- | --- |
| `TURSO_DATABASE_URL_CRM` | Which database. Ordinary config, set per environment |
| `TURSO_API_KEY_CRM` | The database token. A rotating secret, set it on the platform |
| `CRM_PASSWORD` | The one password in front of the app. Unset locally means no gate; unset in production means the api serves nothing |

The base template's variables stay as they were: `API_BASE_URL` and `WEB_BASE_URL` are the public
origins (the api uses `WEB_BASE_URL` for CORS), `PORT` is the api port (3001), and `VITE_API_BASE_URL`
/ `VITE_WEB_BASE_URL` are inlined into the web bundle at build time. Only the oRPC client reads
`VITE_API_BASE_URL`; the CRM's own requests are always same-origin `/api`.

### What a clone gets, and what it does not

The CRM itself works against an empty database: the grid, the record pages, tasks, notes, the
overview, the map and the pipeline board all read the schema `migrate.ts` created.

The scripts under `apps/api/scripts/` are a second thing, and half of them will not run for you. The
outbound automation reads its tunables, its taxonomy and its recipient vetoes out of tables that
`apps/api/scripts/seed-turso.ts` fills from a private payload, so those scripts stop with a named
refusal rather than a default. That is deliberate: the alternative is an automation that writes email
in somebody's name from values it invented. `apps/api/scripts/services.ts` likewise wants a host and
a key for a scraping and enrichment API that is not part of this repo.

One identifier names the original deployment and wants changing if you run your own: the
`USER_AGENT` in `apps/api/scripts/geocode-places.ts`, which Nominatim's usage policy requires to
identify whoever is actually making the requests.

## Checks

```bash
bun run check        # Biome, the 300-line-per-file cap, then tsc --noEmit in every workspace
bunx syncpack lint   # dependency versions agree across workspaces, pinned exactly
bun run build        # both apps, plus the publishable root dist/
bun run test:e2e     # Playwright boots the api (password gate on) and the web app itself
```

Next to running dev servers, give the suite its own ports:
`API_BASE_URL=http://localhost:3201 WEB_BASE_URL=http://localhost:3200 bun run test:e2e`.

`bun run check` is a gate, not a suggestion: `as` is banned by a Grit plugin, every source file stays
under 300 lines, and the typechecker runs in full `strict` with `noUncheckedIndexedAccess`.

## Deploy

Two workflows in `.github/workflows`. `ci.yml` runs on every PR and push to `main`: Biome and
syncpack, typecheck, build, the e2e smoke, both Docker images from a clean context, and actionlint.
`cd.yml` builds and pushes both images to GHCR with `docker buildx bake`, then boots them and checks
the login page and the gate's 401 through nginx.

Any host that runs Dockerfiles can take `apps/api/Dockerfile` and `apps/web/Dockerfile` with the repo
root as build context; `docker buildx bake` builds both. The web image is nginx serving the built SPA
and proxying `/rpc`, `/api`, `/login` and `/logout` to the api container, which is never public.

On [Alive](https://alive.site) the contract is [`alive.toml`](alive.toml): `web` is the public
target, `api` listens on 3001 inside the cluster, and `env_required` lists the three CRM variables, so
a deploy is blocked until each has a value.

## Reading further

`CLAUDE.md` is the long form: why the grid is hand-written, why sorting had to move to the server,
why the map keeps two registers of coordinates apart, and what each of the endpoints is for. It is
written for an agent working in this repo, and it is the honest architecture document.

## License

MIT. See `LICENSE`.
