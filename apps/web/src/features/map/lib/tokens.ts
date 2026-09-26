/**
 * Design tokens, read out of CSS and into JavaScript.
 *
 * MapLibre paint properties take colour strings. They cannot take a Tailwind class, so the map is the
 * one place in this app that has to reach for the raw token values — and hardcoding hexes here would
 * mean the map is the one surface that ignores the theme, including dark mode.
 *
 * The tokens are stored as bare HSL triplets (`217 91% 60%`) precisely so they work both ways:
 * `hsl(var(--accent))` in CSS, and this reader in JS.
 */

export type Hsl = { h: number; s: number; l: number }

export type HslOptions = {
  /** Percentage points added to lightness. Negative darkens. */
  lighten?: number
  /** Percentage points added to saturation. */
  saturate?: number
  /** 0-1. Produces `hsla` instead of `hsl`. */
  alpha?: number
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

/**
 * Read one custom property off the document root.
 *
 * Falls back rather than throwing: this runs during the first paint of a WebGL layer, and a missing
 * token should cost a shade, not the whole map.
 */
export function readToken(name: string, fallback: Hsl): Hsl {
  if (typeof window === "undefined") return fallback

  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return fallback

  // `217 91% 60%` — three parts, the last two carrying a percent sign.
  const parts = raw.split(/\s+/)
  const [rawH, rawS, rawL] = parts
  if (rawH === undefined || rawS === undefined || rawL === undefined) return fallback

  const h = Number.parseFloat(rawH)
  const s = Number.parseFloat(rawS)
  const l = Number.parseFloat(rawL)
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return fallback

  return { h, s, l }
}

/** Build a CSS colour string from a token, optionally deriving a variant off it. */
export function hsl(token: Hsl, options: HslOptions = {}): string {
  const h = token.h
  const s = clamp(token.s + (options.saturate ?? 0))
  const l = clamp(token.l + (options.lighten ?? 0))
  if (options.alpha !== undefined) return `hsla(${h}, ${s}%, ${l}%, ${clamp(options.alpha, 0, 1)})`
  return `hsl(${h}, ${s}%, ${l}%)`
}

/**
 * The tokens the map actually paints with, read once per call.
 *
 * Called again on every style epoch and on a theme change, so switching to dark mode repaints the
 * data layers with the dark palette instead of leaving light-mode dots on a dark basemap.
 */
export function mapTokens() {
  return {
    background: readToken("--background", { h: 0, s: 0, l: 100 }),
    foreground: readToken("--foreground", { h: 0, s: 0, l: 9 }),
    card: readToken("--card", { h: 0, s: 0, l: 100 }),
    muted: readToken("--muted-foreground", { h: 0, s: 0, l: 45 }),
    border: readToken("--border", { h: 0, s: 0, l: 90 }),
    accent: readToken("--accent", { h: 217, s: 91, l: 60 }),
    success: readToken("--success", { h: 152, s: 62, l: 36 }),
    warning: readToken("--warning", { h: 38, s: 92, l: 45 }),
    destructive: readToken("--destructive", { h: 0, s: 72, l: 51 }),
  }
}

export type MapTokens = ReturnType<typeof mapTokens>
