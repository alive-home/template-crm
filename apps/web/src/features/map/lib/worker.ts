import { setWorkerUrl } from "maplibre-gl"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"

/**
 * Tell MapLibre where its worker is, because it cannot work that out inside a bundle.
 *
 * MapLibre spawns a web worker for tile parsing and it finds it at runtime, by resolving
 * `new URL("./maplibre-gl-worker.mjs", import.meta.url)` against its own module URL. Served straight
 * out of `node_modules` or from a CDN that file sits right there, so this normally needs no thought.
 *
 * Bundled, it is a lie. `import.meta.url` becomes the hashed chunk in `/assets/`, the worker is not
 * in there because nothing statically imports it, and the browser asks for
 * `/assets/maplibre-gl-worker.mjs`. The SPA fallback answers that with `index.html`, so the console
 * says `Failed to load module script: non-JavaScript MIME type "text/html"` and the map paints a
 * blank canvas under a working legend, a working count and a working basemap switcher. Every layer
 * this feature adds needs the worker to parse a tile, so nothing draws and nothing throws.
 *
 * `?worker&url` makes Vite bundle the worker with its own dependency on `maplibre-gl-shared.mjs` and
 * hand back the emitted URL, so the file really exists and carries a content hash. A plain `?url`
 * would copy the one file verbatim and its bare `./maplibre-gl-shared.mjs` import would 404 in turn.
 *
 * The call is a module side effect and this module is imported by `useMapInstance`, so it runs
 * before any map is constructed and exactly once.
 */
setWorkerUrl(workerUrl)
