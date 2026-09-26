# Alive CRM

**The app is the CRM, and the CRM is the database.** `/` redirects to `/crm`. There is no index table
and no research file: the index page it grew out of, its components, `use-niche-products` and the
whole of `src/data/` are gone.

**The dev servers are already running.** `alive.toml` declares `web` (Vite, port 3000) and `api`
(Hono on Bun, port 3001) as `[dev.services]`, and in an Alive workspace the supervisor starts them,
restarts them and routes the preview to them. Never start either yourself — no `bun run dev`, no
`vite`, no `bun src/index.ts` on those ports — a second copy collides with the supervised one. Both
reload on save (`vite` HMR, `bun --hot`).

The app carries **no runtime record fallback**. It used to hold a scraped copy of published customer
cases, named Dutch companies with their detected web stacks, and a full CRM dump — companies, people,
email addresses, phone numbers, deals and notes — as files that git would keep forever. All application
records were already in Turso, which is the system of record, so those copies were deleted rather than
maintained in two places. `private/` is a gitignored local working directory holding transfer
sources, all of it already in Turso; none is read by the app on boot.

Three consequences worth stating plainly, because they are easy to undo by accident:

- **No real company or person is named anywhere in this repository, comments included.** The records
  are in Turso and the tree is meant to be publishable without them. A worked example that names the
  prospect whose about page answered `502` is still that prospect sitting in git forever, and a comment
  is where it comes back, because it feels like documentation rather than data. Write the shape of the
  case — one agency's about page, a testimonial reading `Firstname Lastname | CEO, Their Client` — and
  the lesson survives the anonymity intact.
- **Nothing is seeded from a file on boot.** `apps/api/src/index.ts` is a router. The old `products`
  table, its SQLite cache, `/api/products` and `/api/notes/:domain` are gone with the data that fed them.
- **A fact about a company belongs on the company.** The bottleneck cluster is read back out of the
  `Knelpunt:` line the import wrote on the record, not out of a slug-keyed table in the repo. If you
  find yourself adding a `Record<slug, something>` of real organisations, that is the pattern this
  cleanup removed.

## The commercial playbook

**The commercial playbook is not in this repo; it is in Turso.** The source documents under
`private/` are gitignored transfer material, not the copy an agent works from, and neither the
documents nor a description of them belongs in a tracked file. Ask the database what it holds:
`bun apps/api/scripts/playbook.ts` lists every guide with its slug, and
`bun apps/api/scripts/playbook.ts <slug>` prints one raw markdown body. A clone with an unseeded
database gets an empty list and a named refusal, which is the correct answer rather than a gap.

An agent about to write anything in the sender's name, or about to make a decision owned by the outbound
loop, **MUST read the relevant document first rather than work from memory**. If the playbook is
unreachable, stop and say so; do not draft or decide from memory.

## Bringing a clone online

Everything below is what stands between `git clone` and a running instance. The repository already
carries the parts that are not a fork's to decide: an MIT `LICENSE`, a `README.md` written for a
human rather than for an agent, and the base template's dev, build and deploy plumbing. Those are
done. These are not. Run every script from the repository root.

**Required, in this order:**

- [ ] Create a Turso database and set its URL and token as `TURSO_DATABASE_URL_CRM` and
      `TURSO_API_KEY_CRM` — in Alive's env settings (they land in `.env.development`), or in `.env`
      for a clone with no platform. Neither has a default in code, so a missing one throws a
      sentence naming the variable rather than booting cleanly against an empty database that looks
      like a lost one.
- [ ] `bun apps/api/scripts/migrate.ts` once. It creates every table and describes it in the
      catalog, writes no records, and is safe to re-run. `--dry-run` prints the statements.
- [ ] In an Alive workspace, nothing else: the supervisor already runs both servers. Elsewhere,
      `bun run dev` starts Vite on 3000 and the api on 3001. Vite proxies `/rpc`, `/api`, `/login`
      and `/logout` to `API_PROXY_TARGET` (`http://localhost:3001` by default); an api on another
      port with no matching target gives a dev server whose every API call fails while the page
      itself renders perfectly.

**Required the moment it is not on localhost:**

- [ ] Set `CRM_PASSWORD`. There is no user table and no default. Unset locally means no gate, which
      is right because dev binds to localhost; unset in production means the app serves nothing and
      names the missing variable, which is also right. A gate that disables itself when its secret
      goes missing is not a gate. `alive.toml` lists it in `env_required`, so an Alive deploy
      without it does not start.

**Only if the scripts under `apps/api/scripts/` are going to be run:**

- [ ] Change `USER_AGENT` in `apps/api/scripts/geocode-places.ts` before running the geocoder.
      Nominatim asks for an identifying sender and the one in the file identifies nobody.
- [ ] Set `ALIVE_SERVICES_URL` and `ALIVE_SECRET_KEY` for `company-recon`, `team-scan` and the
      outbound loop. That host is a paid scraping and enrichment API, it is not part of this
      repository, and without it those scripts cannot run at all.
- [ ] Fill `private/turso-seed/` and run `bun apps/api/scripts/seed-turso.ts`. Until then `doc`,
      `app_setting`, `market_cluster`, `market_route`, `voice_rule`, `pipeline_stage` and
      `picture_host_rule` are empty, the playbook reads as empty, and every outbound script stops
      with a named refusal instead of a default. The refusal is the design rather than a gap: the
      alternative is an automation writing email in somebody's name out of values it invented. The
      CRM itself — grid, record pages, tasks, notes, overview, map, pipeline board — does not care,
      and works against an empty database.

## Stack

- **Layout**: the Turborepo of [`alive-home/alive-template-base`](https://github.com/alive-home/alive-template-base):
  `apps/web`, `apps/api`, `packages/shared`, `packages/ui`, `e2e`. See **The rules from the base template**
- **Frontend**: React 19, Vite 8, TypeScript 7 (`apps/web`)
- **Routing**: TanStack Router, file routes under `apps/web/src/routes/`
- **State**: TanStack Query (server state); the client and its defaults are in `apps/web/src/lib/orpc.ts`
- **Styling**: Tailwind CSS 4 (CSS-first config in `apps/web/src/styles.css`), shadcn/ui (Radix primitives)
- **Linting**: Biome (`biome.json`), plus a Grit plugin that bans `as` and a shell gate on file length
- **Types**: full `strict` plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax`
- **Validation**: Zod 4, at the boundaries only (see **The rules from the base template**)
- **API server**: Hono (`apps/api/src/index.ts`), with the base's oRPC handler at `/rpc`
- **CRM**: Turso (hosted libsql), named by `TURSO_DATABASE_URL_CRM`. The only datastore
- **Runtime**: Bun

## File Structure

```
apps/web/
  index.html, public/favicon.svg   -- The shell, served by Vite in dev and nginx in the image
  nginx.conf                       -- Image only: the SPA, plus /rpc /api /login /logout to the api
  vite.config.ts                   -- Dev proxy for the same four paths
  src/main.tsx                     -- Router and QueryClientProvider (the base's, unchanged)
  src/routes/                      -- File routes: __root (providers), index (redirect), crm/*
  src/routeTree.gen.ts             -- Generated by the router plugin on every dev start and build
  src/styles.css                   -- Tailwind 4 theme and design tokens
  src/components/crm/              -- CRM shell, grid, record, draft, pipeline and persona components
  src/components/market/           -- Research index, detail pane and contact-channel chip
  src/components/ui/               -- The shadcn/Radix primitives the app actually uses
  src/features/map/                -- Generic MapLibre instance, basemaps, camera, layers and worker wiring
  src/features/accounts-map/       -- CRM clusters, account card, legend, styles and in-view count
  src/hooks/use-crm.ts             -- Every TanStack Query read and mutation
  src/lib/                         -- API, oRPC client, formatting, CRM columns/types and feature contracts
  src/pages/                       -- NotFound plus the CRM page components the routes render
apps/api/
  src/index.ts                     -- Hono app: gzip, the gate, CRM routes, cache middleware, oRPC
  src/env.ts                       -- The api's t3 env; extends src/crm/env.ts
  src/router.ts, src/orpc.ts       -- oRPC: one `health` procedure behind the gate
  src/crm/env.ts                   -- The CRM's variables, importable by the scripts on their own
  src/crm/auth.ts, login-page.ts   -- Shared-password gate and its server-rendered page
  src/crm/turso.ts, row.ts         -- libsql boundary, retry policy and row guards
  src/crm/schema*.ts               -- Object, support, playbook and index schema declarations
  src/crm/crm.ts, crm-routes.ts    -- Object registry and generic CRM API
  src/crm/crm-list.ts, crm-records.ts   -- Paged lists and record assembly
  src/crm/crm-lookups.ts, crm-tasks.ts  -- Reference labels and id-addressed tasks/notes
  src/crm/crm-summary.ts           -- Overview aggregates counted in SQL
  src/crm/crm-outbound.ts          -- Outbound notes reassembled for the Emails tab
  src/crm/crm-market.ts            -- Case companies joined to delivered projects
  src/crm/market-taxonomy.ts       -- Clusters, routes and ordered route rules read from Turso
  src/crm/crm-map.ts               -- Accounts as GeoJSON with coordinate provenance
  src/crm/crm-pipeline.ts          -- Deal cards and the stage order read from Turso
  src/crm/crm-personas.ts          -- Read-only persona rings and quotes
  src/crm/crm-docs.ts, app-settings.ts  -- Guide metadata/bodies and operational settings
  src/crm/picture.ts, picture-rules.ts  -- Stored-picture validation and host rules read from Turso
  src/crm/http-cache.ts            -- Bun gzip and revalidate-every-time cache policy
  scripts/migrate.ts, migrate-catalog.ts -- Additive schema and catalog migration
  scripts/seed-turso*.ts           -- Validated, generic private-payload importer
  scripts/playbook.ts, settings.ts -- Read guides and typed operational settings
  scripts/outbound-*.ts            -- State, queue, recipient vetoes and touch logging
  scripts/services.ts, company-recon.ts -- Alive services boundary and one-company reconnaissance
  scripts/prospect-batch.ts        -- Verified candidate import
  scripts/team-*.ts                -- Team-page discovery, fallback extraction and writes
  scripts/mail-sync.ts             -- Mail-envelope mirror
  scripts/geocode-places.ts        -- City lookup into `geo_place`
packages/shared/                   -- Cross-app code; empty since the base's demo schemas went
packages/ui/                       -- The base's shared UI package; the CRM uses its own components/ui
e2e/                               -- Playwright smoke: health, the gate, sign-in, oRPC with a session
scripts/check-file-length.sh       -- The 300-line gate
config/biome/no-as.grit            -- The repo-wide ban on type assertions
alive.toml                         -- Alive's deploy contract and the dev services
private/                           -- Gitignored working directory: guide sources, the prospect list and
                                      the turso-seed transfer payload. All of it lives in Turso; a clone
                                      has none of it and needs none of it
```

There is no local database. `bun:sqlite`, the `products` and `notes` tables and the `DB_PATH` volume
were removed with the files that seeded them, so a deploy has no disk state to preserve and no mount.

**Nothing in `apps/api` imports out of `apps/web`.** The api image is built from `apps/api` and
`packages/shared` only, so such an import passes `bun run build` locally and breaks the image build
in CI. Code both sides need lives in `apps/api` (or `packages/shared`); the web app imports only the
`AppRouter` type from `@template/api/router`.

Every source file stays under 300 lines, and that is checked rather than asked for:
`scripts/check-file-length.sh` runs as part of `bun run lint` and fails the build over it. A file past
the cap almost always holds two responsibilities, so the fix is to split it along a seam, never to
compress lines or delete comments to duck under.

## Routing

Routes are file routes under `apps/web/src/routes/`. Each is a thin file that renders a component
from `pages/` or `components/`; `routeTree.gen.ts` is generated from them by the router plugin.
`__root.tsx` holds the providers every screen shares (`TooltipProvider`, the `Toaster`) and the 404.
- `/` (`index.tsx`) - redirects to `/crm`. **The CRM is the front door.** The index table UI was
  removed; `/` redirects rather than mounting the CRM at the root so every `/crm/...` link and bookmark
  keeps working, and an unknown path still reaches NotFound instead of being swallowed by a root-level
  `$object` route
- `/crm` (`crm/route.tsx`) - `CrmLayout` (sidebar + outlet), with these children:
  - `/crm` (`crm/index.tsx`) - `pages/crm/Overview.tsx`
  - `/crm/emails` - `pages/crm/Emails.tsx` — the outbound drafts, read like mail
  - `/crm/map` - `pages/crm/Map.tsx` — the accounts map. MapLibre is ~800kB of WebGL renderer
  - `/crm/personas` - `pages/crm/Personas.tsx` — who pays and who we think will
  - `/crm/pipeline` - `pages/crm/Pipeline.tsx` — the deals as a board, dragged between stages
  - `/crm/research` - `pages/crm/Research.tsx` — the market research: where the buyers jam
  - `/crm/tasks` - `pages/crm/Tasks.tsx`
  - `/crm/$object` (`crm/$object/index.tsx`) - `pages/crm/ObjectList.tsx`
  - `/crm/$object/$id` (`crm/$object/$id.tsx`) - `pages/crm/RecordDetail.tsx`. A sibling of the list
    under `/crm`, not its child, so the record page replaces the list rather than needing an outlet
- `*` (404) - `pages/NotFound.tsx`

`autoCodeSplitting` is on, so every route's component is its own chunk; the map's is the one that
matters, because no other page pays for MapLibre. Page components are named exports, and the map's is
`CrmMap` so it cannot shadow the global `Map`.

For navigation, use `<Link to="...">` from `@tanstack/react-router`. Never use `<a href>` for internal links.

## The CRM frontend

One layout route owns the sidebar so the nav mounts once and survives navigation between lists.
`$object` is always validated against `CRM_OBJECTS` before it reaches a hook or a URL — an unknown
slug renders an empty state rather than being passed through to the API.

- `apps/web/src/lib/crm-types.ts` is the frontend contract: the object list, row/detail/schema types,
  and three lookup tables. `LIST_COLUMNS` is the **opening view** for each list, not the ceiling —
  every column the API returns is available behind the column picker. `HIDDEN_FIELDS` drops identity
  and provenance columns from the detail page.
- `apps/web/src/hooks/use-crm.ts` holds every query and mutation. Unlike `use-niche-products`, it has
  **no bundled fallback on purpose**: the index is derived from files in this repo so a snapshot is
  honest, while a CRM rendering stale rows it invented is a liability. No data, no rows.
- The QueryClient defaults live in `apps/web/src/lib/orpc.ts`, where the base defines the client: a
  one-minute `staleTime`, a 30-minute `gcTime`, no refetch on focus, and no retry of a 4xx `ApiError`
  — a refusal is an answer, and a 401 is already navigating to `/login`.
- `FieldValue.tsx` is the single value renderer, narrowing on the **shape** of the value rather than a
  declared type, because the API returns loosely-typed columns. Null renders as a muted em-dash — and
  most values on most records are null, so that is the common path, not the edge case. It takes an
  optional `kind` (the catalog's attribute type) that changes only how a value is *dressed* — a select
  or status becomes a chip — never how it is read, because the hint often does not arrive.
- `RecordDetail.tsx` is a header, one field panel and the notes beside it. Fields are **one list sorted
  by whether they are filled in**, not split by the catalog's system flag — that flag describes who owns an
  attribute, and using it as the split put the description and job title behind a collapsed toggle.
  Empty fields fold behind a "show N empty" count. Plumbing columns (`*_record_id`, `*_target_object`,
  `*_actor_id`, `*_currency_code`) are dropped by `isPlumbing`: a UUID is not a fact about a person.
  Editability follows the **attribute type**, not the group: select/status with options, numbers and
  plain text are editable; references, timestamps and multi-value fields are read-only because this
  endpoint cannot write them. A long value edits in a textarea, not a one-line box showing a sliding
  window of itself.
- The pages are built from three containers in `Panel.tsx` — `PageHeader`, `Panel`, `EmptyState` — so
  headings, panel chrome and empty states are one decision rather than a class string copied between
  four pages. Type is dense on purpose: 13px body, 11px meta.
- A list cell is **one line, always**. `FieldValue` takes a `limit` and folds the rest of a collection
  into a "+N" chip; without it a company with nine categories makes its row three times the height of
  its neighbours and the scan down the column is gone. `limit` also declares list context, where a
  paragraph is one truncated line — the three-line clamp and its "Show more" toggle belong on the
  record page, not in a cell you were only scanning. The record page passes no limit.
- Single-value references arrive as a bare id (`company_record_id`), so
  `apps/api/src/crm/crm-lookups.ts` resolves them per page into `{ id, object, label }` and the list
  shows a linked company instead of a UUID. A target that no longer exists keeps its id with a null
  label rather than vanishing.
- `fetchApi` (`apps/web/src/lib/api.ts`) parses `{ error }` out of a failed response and throws that
  sentence verbatim. The server rejects an unknown or read-only field with a 400 rather than dropping
  it silently; swallowing that message into a generic "something went wrong" would undo the point of
  the 400.

Only `badge`, `button`, `checkbox`, `dropdown-menu`, `input`, `popover`, `sonner`, `table` and
`tooltip` exist in `apps/web/src/components/ui/`. There is no card, select, textarea or dialog
primitive — the CRM uses plain semantic HTML with token classes instead. `dropdown-menu` is trimmed to
the parts the grid calls; the full shadcn primitive's submenus and radio groups would be dead surface.

`apps/web/package.json` matches that. The CRM once carried 35 packages nothing imported — 21 unused
Radix primitives plus TanStack Table, recharts, zustand, react-hook-form and the rest of the template
it was generated from — and the base template's TanStack Form and Table went the same way in the
port. **The grid is hand-written**, which is why TanStack Table is not a dependency: `DataGrid.tsx`
draws its own cells. Do not add a package back to satisfy a type error without checking that
something actually imports it.

**Zod came back with call sites.** It was deleted for the right reason: nothing imported it. It is
here because `as` is banned and the boundaries where data arrives from outside this repo — a services
response, `private/turso-seed/prospects.json`, the drafts an agent writes to stdin, an exported
mailbox — have to be *checked* rather than asserted. It is not used anywhere inside the app: a CRM
column is loosely typed on purpose and a schema over it would be a second copy of a catalog that
already lives in Turso.

### The record grid

`/crm/$object` is a spreadsheet, not a report. `DataGrid.tsx` draws ruled cells, a checkbox gutter and
a menu on every column header, because a column is something you act on — sort it, hide it — rather
than a fixed label the page chose for you.

- **A column's type comes from the catalog, never from its name.** `catalog_attribute` lives in Turso
  with a real type per attribute, so `crm-columns.ts` reads it to pick the header
  icon and the column width. A new column in Turso gets the right icon with no code change. Response
  keys that are assembled rather than stored (`domains`, `company`, `emailAddresses`) resolve through
  a small alias map, then by walking the column name back to its attribute — `primary_location_locality`
  belongs to `primary_location`.
- **The picker offers the catalog, plus whatever the rows add.** Every real attribute comes from
  `catalog_attribute`, and the loaded rows are sampled on top of it for the keys the catalog has no
  row for — the collections assembled from child tables, the references resolved to a label. It used
  to be sampling alone, which stopped working when a list became a page: a column nobody fills in
  until row 400 was simply not offered, and the picker changed as you scrolled. A column the API
  stopped returning is still dropped from a saved preference rather than rendering a ghost column.
- **Chosen columns live in `localStorage`, per object.** A view you rebuild on every visit is not a
  view — and this is a per-person preference about a screen, so it has no business in Turso.
- **A list is a page, and sorting belongs to the server.** `GET /api/crm/:object` answers 100 rows
  and a total; the grid loads the next page when you reach the bottom and says "100 of 12,480" until
  it has them all. Sorting had to move with it — sorting a page is not sorting a list, and a
  client-side sort asked for the oldest company would answer with the oldest of the hundred rows it
  happened to hold, which looks exactly like the right answer. **Blanks pin to the bottom in both
  directions** — most columns are null on most records. Collections sort by how many, references by
  the label you can see, both expressed in SQL from the registry.
- The gutter and the name column are **pinned left**, and the name is the one column that cannot be
  hidden. These tables scroll sideways now, and a row whose name has scrolled away is an anonymous
  row of values.
- Row height is fixed. Anything that can grow a cell — a paragraph, a wrapping collection — is capped
  instead, because uneven rows destroy the scan down a column.

## The accounts map

`/crm/map` answers a question no list can: **who else is near the one I am already talking to.** The
motion is Dutch and regional, so a trip to Eindhoven that visits one prospect and misses the four
around it is exactly the thing a table will never tell you.

- **Two registers, never merged.** Some companies carry a latitude and longitude on the record. More
  carry only a city name, which `apps/api/scripts/geocode-places.ts` looks up once into `geo_place`.
  Both end up as a dot, so `source` (`record` or `city`) rides along on every feature and the map
  draws the second kind as a ring rather than a solid fill. A city centre and a checked street address
  look equally certain once they are both dots, and most of them are the former.
- **The guess never goes in the record's own column.** `primary_location_latitude` is an address
  somebody filled in; a city centre written there would be indistinguishable from it the next day and
  forever. That is why `geo_place` is a table beside `companies` and is keyed on the *place*, not the
  record — Utrecht is looked up once and the fourteenth company there gets a point for free.
- **A company we cannot place is counted, never dropped.** Many have no location at all, and the
  legend says so. A map that quietly draws only the placeable ones presents itself as the whole CRM.
- **Clustering is not decoration.** CRM records pile up in cities the way geographic data does not.
  Clusters carry `minBand`, so a cluster is coloured by the best lead inside it and the map still
  answers "where are the P0s" at country zoom.
- **Filtering rebuilds the collection, it does not filter the layer.** A layer filter hides features
  *after* clustering, so the circles would keep the unfiltered counts: filter to P0 and Utrecht still
  reads its unfiltered count while showing one dot.
- **The map does not fetch its own data.** MapLibre would happily take the URL as a source, on its own
  worker thread and without the session cookie — a 401 and an empty map with no error worth reading.
  It goes through `fetchApi` like everything else.
- **`apps/web/src/features/map` knows nothing about the CRM.** It is an instance, basemaps, a camera
  and a layer-lifecycle hook. Everything that means something lives in
  `apps/web/src/features/accounts-map`, mounted as children of `<MapView>`. A layer component renders
  `null`: it exists to run one effect.
- **`styleEpoch` is the detail that is easy to miss.** `setStyle` discards every source and layer
  added by hand, so switching basemap silently empties the map unless the layers are told to rebuild.
- **The route is its own chunk.** MapLibre is ~800kB, which is more than the rest of the app put
  together, and eight of the nine screens never touch it. `autoCodeSplitting` does the splitting.
- **MapLibre cannot find its own worker inside a bundle.** It resolves
  `new URL("./maplibre-gl-worker.mjs", import.meta.url)` at runtime, which is right when the library
  is served out of `node_modules` and wrong the moment `import.meta.url` is a hashed chunk. The file
  was never emitted, the SPA fallback answered the request with `index.html`, and the console said
  `non-JavaScript MIME type "text/html"` while the page rendered its legend, its count and its
  basemap switcher over a blank canvas. `apps/web/src/features/map/lib/worker.ts` imports the worker
  with `?worker&url` and calls `setWorkerUrl`, so it is a real hashed asset. Plain `?url` is not
  enough: it copies the one file and its own `./maplibre-gl-shared.mjs` import then 404s in turn.

`maplibre-gl` and `@maplibre/maplibre-gl-style-spec` are both direct dependencies on purpose. The
second is only for its types: paint properties are expression arrays, and typing them properly is what
lets this feature exist without a single `as`, where the upstream version used `as never` at every
call site.

## The pipeline board

`/crm/pipeline` renders deals as cards in stage columns and writes moves back through the generic deal
endpoint.

- **The board owns no state.** A card dropped in another column is a `PATCH /api/crm/deals/:id` on
  `stage`, the same writable column the record page edits. There is no board-side ordering, no
  per-column bookkeeping and nothing to reconcile — which is why moving a card can be optimistic and
  simply roll back to the previous feed if the write is rejected.
- **The stage order comes from `pipeline_stage`.** The endpoint reads its stored position, then appends
  any stage used by a deal but absent from the register. If the table has not been seeded, the endpoint
  returns the stages it can observe with a warning instead of hiding every card.
- **A stage the list does not know about still gets a column**, appended after the nine, and a deal
  with no stage at all gets a `No stage` column that nothing can be dropped into. A card with nowhere
  to go is a record the board hides while presenting itself as the whole pipeline.
- **The card is one control, and the arrow keys are the drag.** Dragging is a mouse gesture; without
  left/right on a focused card the board would be a feature only a mouse can use. The columns are drop
  targets, not controls, which is what the two `biome-ignore` lines are for.
- The endpoint is its own read for the same reason the summary is: a deal has 60 columns and a card
  shows six. Sending every full record to draw the cards is most of a megabyte the board never renders.

Two deliberate literals remain in code. `STAGE_TONE` in
`apps/web/src/components/crm/PipelineBoard.tsx` maps a stage title to a Tailwind token because storing
a design token in the database would couple the schema to the stylesheet; an unknown stage already
falls back to a neutral dot. The `stage` options in `apps/api/src/crm/schema.ts` remain because
`apps/api/scripts/migrate.ts` runs before `apps/api/scripts/seed-turso.ts` and therefore cannot read
`pipeline_stage`.

## The personas

The personas live in Turso, in three tables of their own: `personas`, `persona_ring` and
`persona_quote`. `/crm/personas` reads them and writes nothing.

- **They are ours, not the CRM's.** They are not in `CRM_SCHEMA` and they are not in the Records list
  in the sidebar, because that registry is the seven objects the grid renders. A table of our own
  reading of the market sitting between them would blur the line that matters.
- **They are still in the database.** A persona in a markdown file in this repo is a file nobody opens
  a month later, and the assumptions in it go stale without anybody noticing.
- **The screen is Dutch and so are the column names**, because the personas were written in Dutch.
  Translating the keys on the way out would put a second vocabulary between the database and the page.

## The playbook

**The commercial playbook belongs in Turso, not in a working tree that happens to have the right
ignored files.** A guide or veto in `private/` existed only on the machine carrying it, while a
literal inside a script could change only through a deployment. Both failures made the application
look complete while one of the rules governing its work was missing or stale. Turso is already the
durable SQLite database for this CRM, so it is the one place where the playbook can be present,
queryable and changed without turning the repository into a copy of the business.

Nine tables keep the registers separate. `doc` holds guide metadata and verbatim markdown bodies;
`app_setting` holds operational tunables; `prospect_candidate` holds the private candidate list;
`market_cluster`, `market_route` and `market_route_rule` hold the taxonomy and its ordered route
decision; `pipeline_stage` holds the board order; `picture_host_rule` holds expiring hosts; and
`voice_rule` holds the recipient's vetoes. They are support tables, not CRM objects, so none appears
in the record registry or the grid.

**The whole of `private/` is gitignored, and the crossing is finished.** Those documents were tracked
here while git was the only durable place they had; they are rows in Turso now, verified byte for byte
against the files, so a tracked copy would be the **second copy of the same documents** that this move
exists to end — and the one that travels, because a clone carries it. It is also the copy that cannot
be open sourced, and describing its contents in a tracked file republishes them in summary, which is
why this paragraph does not. The repository carries the generic schemas and the importer;
`private/turso-seed/` is scaffolding for the crossing and stays on the machine doing it.
`bun apps/api/scripts/seed-turso.ts --dry-run` parses every file with Zod and prints every upsert
without opening a connection. A real run is idempotent and only inserts or updates rows; one refused
file does not keep the independent files from being imported.

The setup order is `bun apps/api/scripts/migrate.ts`, then `bun apps/api/scripts/seed-turso.ts`.
After that, `bun apps/api/scripts/playbook.ts` lists the guides, `bun apps/api/scripts/playbook.ts
<slug>` prints one raw markdown body, and `bun apps/api/scripts/playbook.ts --settings` prints the
settings. An empty or unreachable seed is a named refusal rather than silence, because silence must
never be mistaken for a guide saying nothing.

## Pictures

A record's picture is **a URL we store, never a file we hold**. Some companies carry a `logo_url` and
some people an `avatar_url`; both are plain text columns and both point at somebody else's server.

- **A dead image looks exactly like a working one** until somebody opens the page, so the failure is
  absorbed in two places rather than trusted in either. At render time `RecordAvatar` walks a chain:
  the stored picture, then the company's real favicon, then initials — each `onError` moves to the
  next, keyed so React builds a fresh element instead of keeping the broken node. Before storage,
  `apps/api/src/crm/picture.ts` refuses the two things a string check can actually establish: not an
  https URL, or a host known to expire what it serves. `media.licdn.com` is the one that taught us:
  signed, valid on the day it is written, a 404 within the week, and a field that reads as filled the
  whole time.
- **The write endpoint enforces it**, not only the scripts. A rule checked in one of the two places
  is a rule the other one walks around, so `PATCH /api/crm/:object/:id` answers 400 with the reason.
- **A mark is not a portrait.** In the grid every record is a 24px box, cropped to fill, the same size
  on every row — the row height is fixed on purpose and a People list with 36px marks is a column you
  can no longer scan. On a person's own record page the picture is the reason you are there, so
  `RecordPortrait` renders the file uncropped at its natural aspect ratio. A circle would crop the
  photograph to whatever its camera framed, and there is no version of "the whole photo" inside one.
- Shape carries the object: a person is a circle, a company a rounded square. A face fills its frame
  (`object-cover`); a favicon sits inside one at 72% (`object-contain`), because it is a drawing that
  comes with its own margins and must not be cropped.

## Design System

Colors and theme tokens are HSL CSS custom properties in `apps/web/src/styles.css`. The
`@theme inline` block maps them to Tailwind utilities (`bg-background`, `text-foreground`,
`text-success`…). Use those tokens — never hard-coded colors.

`--age-1` … `--age-5` are a sequential single-hue ramp for the Founded column: lightness rises and chroma
falls monotonically from newest to oldest, so the newest product is the most saturated mark on screen.
Every step clears 3:1 against the card surface. They are separate from `--success` on purpose — status
colours stay reserved for status, so a green age bar is never confused with a "good" badge.

## API

`apps/api/src/index.ts` runs a Hono server on `PORT` (3001). It serves no files: the web app comes
from Vite in dev, from nginx in the web image, and from Alive's static hosting when published. Vite
and nginx both forward `/rpc`, `/api`, `/login` and `/logout` here. It seeds nothing and stores
nothing: every route below `/api/crm` reads Turso, and that is the whole of the API surface besides
the health probe and one oRPC procedure.

- `GET /health` — supervisor health probe, and the only path in front of the password gate
- `GET /login`, `POST /login`, `POST /logout` — the gate itself, server-rendered. See **The password gate**
- `/api/crm/*` — see **CRM endpoints** below
- `/rpc/*` — the base template's oRPC handler, behind the gate. The router (`apps/api/src/router.ts`)
  holds one `health` procedure; a new typed procedure goes there, and the web app calls it through
  `client` / `orpc` in `apps/web/src/lib/orpc.ts`

Missing build files are nginx's to answer: `location /assets/` has no SPA fallback, so a stale chunk
request is a 404 rather than `index.html`, which the browser would report as a MIME type error instead
of the missing file it is.

A thrown error answers as `{ error: "<message>" }` with a 500, via `app.onError`. That exists so a
missing `TURSO_DATABASE_URL_CRM` reaches the browser as the sentence naming the variable rather than as
a bare "Internal Server Error" — the same contract the routes keep when they reject an unknown field
with a 400, and the one `fetchApi` is written to read.

## Reading at scale

This CRM is being built for hundreds of thousands of rows, and almost everything that made the first
version pleasant was a bet on it being small. The bets that have been unwound, and the ones that have
not:

- **Nothing is compressed by the platform, so the app does it.** `/api/crm/companies` answered 787,341
  bytes to a browser asking for gzip. It is 91,808 now. **`hono/compress` cannot be used here**: it
  builds a `CompressionStream`, which Bun 1.2.12 does not define, and nothing says so until the first
  response over a kilobyte dies with `CompressionStream is not defined` — the server boots clean and
  the failure reads like a broken API. `apps/api/src/crm/http-cache.ts` uses `Bun.gzipSync`.
- **ETag, and `private, no-cache`.** Not `max-age`: a CRM that serves a list out of the browser's cache
  without asking will render a record somebody changed thirty seconds ago and say nothing. `no-cache`
  means store it and ask every time, so a revisit costs a 304 and is never wrong.
- **A list is a page.** `SELECT *` with no `LIMIT`, ordered by name, and five child-table reads that
  fetched every domain in the database to decorate one page of rows. All three are scoped to the page now, and
  `childValues` **takes the ids as a required argument** — it used to default to "all of them", which
  is the kind of default that gets reintroduced by someone reading it as harmless.
- **The `ORDER BY` and the indexes are generated from one function.** An index only serves a sort it
  matches term for term, so `sortTerms` in `crm-list.ts` writes both. Two consequences that are easy to
  undo: the sort ends in `record_id`, because `LIMIT`/`OFFSET` over a non-total order lets a row appear
  on two pages and another on none — and there is an index per direction, because blanks-last is a
  mixed-direction sort and SQLite only reads an index backwards when *every* term reverses. Check
  `explain query plan` after touching either; a sort that fell back to a temp B-tree is not an error,
  it is just slow, and only at scale.
- **What is still unsolved: free-text search.** `?q=` is `LIKE '%q%'` across three or four columns, and
  no index can serve a leading wildcard at any size. That is FTS5 and a set of triggers to keep it
  current, and it is the next piece of work rather than something to bolt onto the query.
- **Turso reads retry, writes do not.** A dropped socket is worth asking again; a retried `INSERT` can
  write the row twice, because there is no way to tell "never arrived" from "applied, acknowledgement
  lost". See `retryRead` in `apps/api/src/crm/turso.ts`.
- **Hono on Bun is not the bottleneck and swapping it for Go would not have fixed any of the above.**
  Every problem here was the shape of the query and the size of the payload. The router was serialising
  what it was given.

## The password gate

Everything except `/health` sits behind one shared password, held as the `CRM_PASSWORD` secret on the
platform. There is no user table and no reason to build one: this is one person's CRM on a public
hostname, and what it holds is companies and people with their email addresses and phone
numbers. The code is `apps/api/src/crm/auth.ts`.

- **It fails closed.** `CRM_PASSWORD` has no default, exactly like the two Turso variables. A
  production deploy without it serves nothing at all and says which variable is missing, rather than
  serving the records to whoever loads the page. A gate that disables itself when its secret goes
  missing is not a gate. Locally there is no secret and no gate, because dev binds to localhost.
- **The gate is registered before the things it guards** — above `/api/crm` and `/rpc`, in that order
  in `apps/api/src/index.ts`. That ordering is the whole of it: no record leaves the process before
  signing in.
- **The client bundle is not behind it.** The api serves no files, so the SPA shell and its chunks
  come from Vite, nginx or Alive's static hosting without asking. They hold code, not records: the
  shell's first API call answers 401 and `fetchApi` sends the tab to `/login`, so a signed-out
  visitor sees the app shell for a moment and then the door.
- **An API caller gets the sentence, a browser gets the door.** `/api/*` and `/rpc/*` answer 401
  `{ error: "Session expired. Sign in again." }`, which `fetchApi` surfaces verbatim and acts on by
  sending the tab to `/login`. Every other path that reaches the api is a 302.
- **The session is signed with the password itself**, so there is no second secret to set and
  rotating the password signs everyone out — which is what a rotation is for. The cookie is
  `HttpOnly`, `SameSite=Lax` and `Secure` in production, and carries an expiry that is part of what
  is signed.
- **The login page is server-rendered** (`apps/api/src/crm/login-page.ts`), not a route in the React
  app. It lives beside the gate that checks it and renders even when the client build is broken.
- Five wrong guesses per client buy a ten-minute pause, held in memory. One password on a public URL
  is worth guessing at. The client is `X-Real-IP`, which the web image's nginx sets from the
  connection so a guesser cannot rotate it; behind a hosting edge that connection is the edge, and
  without nginx every caller is one key, so the pause applies to everyone at once.

## The CRM

The CRM is a **hosted Turso database**, not a file in this repo. It is the system of record and now the
only datastore the app has. Nothing reseeds it, nothing drops it, and there is no local fallback.

The connection and the gate both come from the environment, and **none of the three has a default**:

| Variable | What it is |
| --- | --- |
| `TURSO_DATABASE_URL_CRM` | Which database. Ordinary config, set per environment |
| `TURSO_API_KEY_CRM` | A rotating secret. Never in the repo; set it in Alive's env settings or your platform's secrets |
| `CRM_PASSWORD` | The one password in front of the app. No default: production without it serves nothing |

They are declared once, in `apps/api/src/crm/env.ts` (t3 env, all optional, empty means unset), which
`apps/api/src/env.ts` extends. The split is so the scripts can import the CRM modules without also
needing the api's `API_BASE_URL` and `WEB_BASE_URL`. `.env.example` leaves all three empty on
purpose: a placeholder URL would be a set-but-wrong value, which is the failure the missing default
exists to prevent.

The URL was once a literal in the Turso module for a stated reason: an env-var URL lets a
misconfigured environment boot cleanly against an empty database, and "we lost the CRM" must not look
like "we pointed at the wrong CRM". That reason was right and the literal was the wrong way to honour
it, because it also put the tenant in every clone of the repo. **The absent default is what does the
work now.** Incomplete config throws a sentence naming the missing variable, on the first query and in
the boot log. Do not add a fallback value to either variable; that is the one change that would
quietly bring the failure back.

### Starting from an empty database

`bun apps/api/scripts/migrate.ts` creates every table the code needs and describes it in the catalog.
Run it once against a new Turso database and the app comes up; it writes no records, so the CRM is
empty rather than seeded with somebody's demo data.

**It is safe to run against a database that already has data**, which is the property that matters,
because otherwise nobody runs it. Every step is additive and conditional: tables are `if not exists`,
columns are added only when `pragma_table_info` says they are missing, and catalog rows are matched on
`(object_slug, api_slug)` rather than on id — a database carrying the original catalog under its own
UUIDs keeps those rows and their titles instead of getting a second copy of every attribute. Nothing
is dropped, renamed or retyped. `--dry-run` prints the statements without running them.

`apps/api/src/crm/schema.ts` is what it applies: the minimum the code requires, which is every table
`apps/api/src/crm/crm.ts` maps an object to and every column named in SQL under `apps/api/src/crm/`
or `apps/api/scripts/`. It is **not** a copy of the full 164-attribute catalog — those columns are
data, they are discovered at runtime, and re-declaring them here would be a second definition to keep
in sync. The migration cross-checks the two files before it writes anything, so a table in the
registry that nobody declared is an error with a name in it rather than a 500 in production.

### Shape

It is **relational**: one table per object with a real column per attribute (164 across 7 objects),
one child table per multi-value attribute (`companies__domains`, `people__email_addresses`,
`deals__associated_people`…), plus the attribute catalog itself — `catalog_object`,
`catalog_attribute`, `catalog_select_option`, `catalog_status`.

The catalog tables were loaded once from a hosted CRM and carried that vendor's prefix (`attio_*`).
They describe this CRM's attributes now, so the prefix documented where the rows came from once
rather than what they are. `apps/api/scripts/migrate.ts` renames them, first, before it can create
anything beside them. If you meet a database still on the old names, run it; do not add a fallback
that queries both.

That is a deliberate reversal of the earlier staging copy, which put every attribute in one JSON blob.
A blob was right while the data was still being loaded and is wrong now that this is the source of
truth: it makes every field untyped and every filter a table scan. **Do not reintroduce a values_json
column.**

| Table group | What is in it |
| --- | --- |
| companies / people / deals | One table per object, one real column per attribute |
| projects / customer_feedback / users / workspaces | The same, for the four smaller objects |
| note / task | Free text and follow-ups, addressed by record id |
| geo_place | One row per city, filled by `apps/api/scripts/geocode-places.ts` |
| catalog_attribute / catalog_select_option | The attribute catalog the grid and record page read |

Row counts are a property of an installation, not of this schema, and they do not belong in a
tracked file: count them with SQL against the database you are actually pointed at.

`apps/api/src/crm/crm.ts` is the **only** place that maps an object slug to a table. Routes never
interpolate a caller-supplied name into SQL — they check it against the registry first, and values
always bind as parameters. Writable columns are read from `pragma_table_info` at runtime and cached,
minus `record_id` and the `created_*` provenance columns: an HTTP body must never be able to rewrite
who made a row.

Task links carry a `target_record_id` but no `target_object`, so `crm-tasks.ts` uses the `record_index`
CTE from `crm-records.ts` — every record id and label across all seven objects — to resolve them.

### CRM endpoints

- `GET /api/crm/summary` — the overview aggregate: per-object counts, note and task totals (including
  overdue), deal coverage, committed/paid/outstanding, deals by stage, priority and readiness
  breakdowns, and the latest notes. Every figure is a COUNT or SUM in SQL — the page never fetches a
  table to add up a column, and a breakdown's long tail is folded into an "Other (N)" row rather than
  being dropped. Lives in `apps/api/src/crm/crm-summary.ts`, mounted before `/:object` so the literal
  path wins
- `GET /api/crm/outbound` — the drafts feed for the Emails tab: every `Outbound — <date>` company note
  parsed back into `{ company, signal, source, subject, body, task }`, plus a run log derived from the
  dates those notes carry. It reads the automation's output and invents nothing — a note whose body does
  not parse still comes back with its raw text, because a hidden draft looks the same as a broken run
- `GET /api/crm/map` — every company we can place, as a GeoJSON FeatureCollection, plus a `meta` block
  counting what is *not* on it. See **The accounts map**
- `GET /api/crm/pipeline` — every deal as a card, plus the stage columns to lay them out in. See
  **The pipeline board**
- `GET /api/crm/personas` — the personas, their rings and their quotes. Read only, and a
  missing table answers as an empty list with a reason rather than a 500. See **The personas**
- `GET /api/crm/docs` and `GET /api/crm/docs/:slug` — guide metadata without large bodies, then one
  full markdown guide by slug. An unmigrated database answers with an empty list and names the migration
- `GET /api/crm/settings` — the tunable values used by operational scripts, with the sentence that
  explains why each value exists
- `GET /api/crm/market` — the case companies with the work already delivered there, joined in SQL from
  `companies` and `projects`. The research page reads this and nothing else
- `GET /api/crm/schema/:object` — the mirrored attribute catalog: slug, title, type, select/status options
- `GET /api/crm/:object` — one page of records as `{ rows, total, limit, offset }`, with `?q=` free-text
  over that object's search columns, `?field=&value=`, `?sort=&dir=` and `?limit=&offset=` (100 by
  default, 500 maximum). The shape is not a bare array on purpose: a page of a hundred handed over as
  an array cannot be told apart from a complete list of a hundred
- `GET /api/crm/:object/:id` — one record with its multi-value fields, notes and linked tasks
- `PATCH /api/crm/:object/:id` — write columns (body `{ values }`). An unknown or read-only field is a
  400, never a silent drop: dropping a field the caller believes it saved is the worse failure
- `POST /api/crm/:object/:id/notes` — append a note
- `DELETE /api/crm/notes/:noteId` — remove a note
- `PATCH /api/crm/tasks/:id` — toggle completion, stamping `completed_at` to match
- `GET /api/crm/tasks` — every task, with its linked record resolved; `?open=1` limits the read to open tasks

## Alive services

`$ALIVE_SERVICES_URL/discover` is a **self-describing directory** of paid APIs the platform
already pays for. Ask it what exists; do not carry a list of endpoints in your head:

1. `GET /discover` — the services. Currently **Mini Tools** (API wrappers) and **Stealth Scraper**
   (browser fetching and reconnaissance).
2. `GET /<service>/discover` — that service's endpoints, method, path and description.
3. `GET /<service>/discover?endpoint=/path&detail=true` — the full parameter spec, defaults and
   response shape.

The host comes from `ALIVE_SERVICES_URL` (no default, like the CRM URL). Auth is
`Authorization: Bearer $ALIVE_SECRET_KEY`, and **the key comes from the root `.env.development`**,
which the platform generates. `apps/api/scripts/services.ts` reads it and is the only place that key
is touched: never paste it into a file, a note, a log line or a commit.

This key is the **one deliberate exception** to "everything lives in the database". Everything else the
project reads at runtime comes out of Turso; this is what buys access to the services in the first
place, so it cannot come from them. When reading it out of `.env.development` directly, strip the
quotes the platform writes — the earlier regex kept them and every request built a malformed bearer
header, invisible under Bun because Bun populates `process.env` first.

`bun apps/api/scripts/company-recon.ts <domain> [--nl]` is the outbound loop's use of this: promise,
quote, latest dated item, contact, people and KvK in one command, which is the evidence the gate needs.

## Market research

**The page owns no list, and neither does the repo any more.** An import put the named case
companies into CRM `companies` and every published case into `projects`, linked by
`company_record_id`, and the scraped JSON it read has since been deleted. So a case is a company you can
sell to plus *work already delivered there by somebody else*, and the CRM is the only place it lives —
it renders on the company's own record page as a Projects panel, not only here. `/api/crm/market` is the
join; the page is a view over it, full-bleed, because the comparison it exists for is one sentence
against another and both need the width. A case that names no client is refused: there is no
company to file it under.

The two registers still stay apart, but the line between them is now the line between the database and
the code:

| Register | Where | What it is |
| --- | --- | --- |
| The case | CRM `companies` + `projects` | Their words: bottleneck, what was built, the claimed result, their quote |
| Our read | `market_cluster`, `market_route`, `market_route_rule` | The taxonomy and its ordered route decision, read through `apps/api/src/crm/market-taxonomy.ts` and tagged `onze lezing, geen bron` on screen |

- **The cluster is a fact about a company, so it is on the company.** The import wrote it as a
  `Knelpunt:` line in the description and `apps/api/src/crm/crm-market.ts` parses it back out,
  together with `Sector:` and the provenance sentence that carries who published the cases and when.
  The page used to group by a `CLUSTER_OF` table of slugs in the repo; that table was a second register
  of real organisations and is gone. An unrecognised label renders as ungrouped rather than being
  bucketed into the largest cluster, because a silent default there would invent a finding.
- **The channel chip survived the deletion, and is better for it.** It used to be read off the invented
  mails; `channelOf` in `apps/web/src/lib/contact-channels.ts` now derives it from the sector and the
  function the work was for, both of which are on the record. That was always how the route was
  defined — the hand-written table had drifted into being the source.
- **The page is read like mail, not like a table.** A narrow index of companies on the left, one case
  in the pane on the right. The table version made you compare sentences you were only scanning; the
  question here is one company at a time.
- **The clamp lives on an inner element.** A grid item is blockified, so `display: -webkit-box` on the
  cell itself computes to `flow-root`, the clamp silently does nothing and `overflow: hidden` cuts the
  text with no ellipsis. A truncated cell then looks exactly like a complete one.

Re-reading the cases means re-importing them into the CRM, not writing a file back into the repo.

## Outbound automation

`outbound-state.ts`, `outbound-queue.ts`, `outbound-voice.ts` and `outbound-log.ts` in
`apps/api/scripts/` are separate code boundaries for deciding the work, selecting records, applying
recipient vetoes and writing one touch. They read tunables, the market taxonomy and voice rules from
Turso rather than application literals. The note prefix and cooldown are `outbound.note_prefix` and
`outbound.cooldown_days` settings, not constants in an outbound module.

### The people behind the companies

`bun apps/api/scripts/team-scan.ts --city=Amsterdam` reads a company's own team page for the people on
it, four at most, founders first, and `--write` saves them. A CRM full of companies and empty of
people is a list you cannot write to.

- **Two facts, two readers.** Names and roles are prose, so `/scraper/extract` reads them. A photograph
  is an `<img src>`, which an LLM sent the page as *text* never sees, so it is matched out of the raw
  markup against the names the extractor found — on alt text or file name only. A stranger's face on a
  record is worse than no face: it reads as checked for as long as nobody who knows them opens it.
- **The path picks the page, not the picture count.** A marketing homepage carries 190 images against a
  team page's twelve, so scoring on images sent every read at the front page and reported eleven
  companies as naming nobody while the CRM already held people from the page that lost.
- **An empty answer earns a second look.** The extractor read one about page without complaining and
  returned nobody while the markup names eight, and it answers `502` on another every time. Both
  fall back to reading the markup, and the run says so on the line — that reading is the weaker one.
- **The fallback's hard case is the testimonial**, which has exactly the shape it looks for: a name,
  then a job title. The tell is a capital letter after the comma — `CEO, Their Client` is a client,
  `Managing Director, co-founder` is staff. Without that check five of one studio's customers would
  have been imported as its employees.
- **A photo is checked twice and reported the way it is written**: `pictureUrlProblem` for what a string
  can establish, then one request for whether it answers at all. HTML attributes are entity-encoded, so
  a `&amp;` left in a URL is a portrait that 400s while looking perfectly filled in.
- **Nobody is invented.** A company whose site names no one is reported as such — that was the right
  answer for a good share of one city's batch, and it is not a gap to fill from memory or a search.

### Where drafts are read

`/crm/emails` is the review surface. The note on the company record is still the system of record —
this page just reads those notes as mail, because nobody opens twelve company pages to review twelve
emails. The message renders first and plain (the question is "would I send this"), with the signal,
angle and source in a separate dashed block underneath, tagged as the automation's claim rather than
the CRM's. Marking a draft reviewed closes the automation's own review task, so the Emails tab and the
Tasks tab cannot drift apart. The run strip in the header is derived from the drafts themselves: a day
with no chip is a day the automation found nothing worth writing, which is a legitimate outcome.

## Git: push to main, every time

**Finish every piece of work by committing and pushing to `main`. Not at the end of the session — at
the end of each change.** Local commits are not durable. This project has already lost a day's work
once: a sandbox was rebuilt from a checkpoint on a different lineage and 70 verified companies looked
deleted, because the only copy of the work that survived was the one that had been pushed.

The loop, after every change that builds and passes checks:

```
bun run check && bun run build     # never push a broken tree
git add -A && git commit -m "..."
git push origin HEAD:main
```

- Do not wait to be asked. "Merge it to main" should never need saying.
- Do not batch several unrelated changes into one end-of-session push.
- Verify it landed: `git log -1 --format='%h' origin/main` must equal local `HEAD`.
- Pushing to `main` here is a fast-forward. If it would not be, **stop and say so** — never force,
  never rebase, never reset. Divergence is not corruption and is not yours to repair.

## CI, images and deploy

A push to `main` runs `.github/workflows/ci.yml` — Biome and syncpack, typecheck, build (asserting
the `VITE_*` values were inlined), the Playwright smoke, both Docker images built from a clean context,
and actionlint — and `.github/workflows/cd.yml`, which builds both images with `docker buildx bake`,
pushes them to GHCR, boots them together and checks through nginx that `/login` serves the sign-in
page and `/api/crm/summary` answers 401. Neither needs a database.

- **Two images.** `apps/api/Dockerfile` bundles `apps/api/src/index.ts` with `bun build` into one file
  and runs it; `apps/web/Dockerfile` builds the SPA and serves it with nginx, which proxies `/rpc`,
  `/api`, `/login` and `/logout` to the `api` container. Only `web` is public.
- **The bundle is not everything the api needs.** libsql requires its native binding
  (`@libsql/<platform>`) by name at startup, and no bundler can inline that. The runtime stage finds
  it through `NODE_PATH`, pointed at bun's hoisted store. Without it the image built green and died on
  its first boot with `Cannot find module '@libsql/linux-arm64-musl'`; a Mac hides this, because bun
  auto-installs a missing package when no `node_modules` is in reach. CD's sanity boot is the check.
- **On Alive, `alive.toml` is the contract.** `web` is the `public_target`, `api` listens on 3001
  inside the cluster, and `env_required` lists `TURSO_DATABASE_URL_CRM`, `TURSO_API_KEY_CRM` and
  `CRM_PASSWORD`, so a deploy missing any of them is blocked before it starts. Renaming a service
  there is a routing change: the name is also the bake target and the container's DNS label.
- **Three secrets, no defaults anywhere.** A deploy that somehow runs without them serves nothing and
  names the one it is missing.
- `compose.yaml` runs the same two images locally and refuses to start without `CRM_PASSWORD`.

## The rules from the base template

This repository is a fork of
[`alive-home/alive-template-base`](https://github.com/alive-home/alive-template-base) and keeps its
layout, so base improvements arrive by `gh repo sync` or a merge of the base's `main`. **Edit a base
file only where the CRM needs it, and minimally**, because every line changed there is a line a later
sync can conflict on. What is deliberately not taken from the base is its demo: the JWT login, the
hello and todo procedures and their shared schemas are gone, and the CRM's password gate stands in
their place. The `[setup]` command in `alive.toml` and `scripts/runtime/local.sh` still carry the
base's `AUTH_SECRET` generator; with no such line in `.env.example` it copies the file unchanged.

- **Full `strict`, and the checker is a gate.** `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`.
  `bun run check` is lint **and** typecheck; both must be clean before a push. The errors this
  turned up were not cosmetic — `Overview.tsx` linked to `/crm/deals`, a route that does not exist.
- **`as` is banned.** `config/biome/no-as.grit` fails the lint on any type assertion but `as const`.
  An assertion is not a check: `row.title as string | null` is the compiler being told to stop
  looking, and a column that came back a number then travelled on as a `string` and failed somewhere
  else entirely. Use a type guard, a `satisfies`, or a Zod parse.
  - The guards live in `apps/api/src/crm/row.ts` for a database row and in
    `apps/web/src/lib/crm-types.ts` (`isCrmObject`, `isCrmRef`) for an API value.
  - **There is exactly one unchecked boundary**, `trustShape` in `apps/api/src/crm/turso.ts`, and it
    is a named function with a comment explaining itself. A driver hands back rows the type system
    cannot know the shape of, so somewhere a shape is taken on the caller's word. Once. Do not add a
    second.
  - The plugin also trips on an `import { X as Y }` alias, which is a false positive of the pattern.
    Import the namespace (`import * as sonner`) rather than working around the rule.
- **Zod at the boundaries, nowhere else.** Data crossing into this repo from outside is parsed:
  service responses (`apps/api/scripts/services.ts`), the prospect list, the drafts an agent writes to
  stdin, an exported mailbox. Inside the app nothing is parsed, because a CRM column is loosely typed
  on purpose. Where a per-item rejection already reads better than a schema error, the schema stays
  structural and the loop keeps the good message — `apps/api/scripts/outbound-log.ts` is that case.
- **Env through t3.** The api reads its variables through `apps/api/src/env.ts` and
  `apps/api/src/crm/env.ts`, never `process.env`. The scripts' own variables (`ALIVE_SERVICES_URL`,
  `ALIVE_SECRET_KEY`, `OUR_ADDRESSES`) are read where they are used, since the app never needs them.
- **300 lines a source file, enforced.** `scripts/check-file-length.sh`, wired into `bun run lint`.
- **Subpath imports, not aliases.** `#/lib/utils.ts`, declared once in `apps/web/package.json` under
  `"imports"`. No `tsconfig` `paths`, no `resolve.alias` in `vite.config.ts` — TypeScript and Vite
  both read `imports` on their own, so there is one place to change instead of three. **The extension
  is required**: `#/lib/utils.ts`, never `#/lib/utils`. The api uses plain relative imports.
- **TypeScript 7**, as the template pins it. Not cosmetic: TS 5.9 rejects a `#/…` specifier outright
  (Node's own resolution algorithm refuses a subpath starting `#/`), so the import convention above
  does not compile without it.
- **Exact pins, one version per package.** Every dependency is pinned exactly in the workspace that
  imports it, and `bunx syncpack lint` fails when two workspaces disagree.
- **Biome formatting is the template's**: two spaces, no semicolons, double quotes, trailing commas,
  120 columns, imports organised.

## Commands

Run from the repository root.

- `bun run check` -- The gate: `lint` then `typecheck`. Both must be clean before a push
- `bun run lint` -- Biome check + the 300-line cap
- `bun run lint:fix` -- Auto-fix what Biome can
- `bun run format` -- Biome format --write
- `bun run typecheck` -- `tsc --noEmit` in every workspace, through Turborepo
- `bunx syncpack lint` -- Dependency versions agree across workspaces
- `bun run build` -- Both apps, then the publishable root `dist/`
- `bun run test:e2e` -- Playwright; boots its own api (gate on) and web. Needs no database. In an
  Alive workspace 3000/3001 are the supervised servers, which it would reuse with their own password
  or none, so point it at a free pair:
  `API_BASE_URL=http://localhost:3201 WEB_BASE_URL=http://localhost:3200 bun run test:e2e`
- `bun run docker:build` -- Both images through `docker-bake.hcl`
- `bun run dev` -- Web on 3000 and api on 3001, **only for a clone with no supervisor**. In an Alive
  workspace they are already running; see the top of this file
- `bun apps/api/scripts/migrate.ts` -- Create/extend the Turso schema. Additive, idempotent, `--dry-run` to preview
- `bun apps/api/scripts/seed-turso.ts` -- Upsert a private playbook payload; `--dry-run` prints the plan offline
- `bun apps/api/scripts/playbook.ts [<slug>]` -- List guides or print one raw body; `--settings` reads tunables
- `bun apps/api/scripts/geocode-places.ts` -- Fill `geo_place` so city-only companies get a pin. `--dry`, `--force`

`tsc --noEmit` **is** the gate, alongside `biome check` and the build. It used to be neither, and the
note here used to name three files with pre-existing errors as a thing to live with. They are fixed;
the tree typechecks clean. Do not reintroduce a "known failing" list — a checker nobody expects to pass
is a checker nobody reads.
