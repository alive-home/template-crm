const UNITS = [
  { limit: 1_000_000_000, suffix: "B" },
  { limit: 1_000_000, suffix: "M" },
  { limit: 1_000, suffix: "K" },
]

/** 1_240_000 -> "1.24M" */
export function compactNumber(value: number): string {
  for (const { limit, suffix } of UNITS) {
    if (Math.abs(value) >= limit) {
      const scaled = value / limit
      return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${suffix}`
    }
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 })
}

/** 71_000 -> "$71.0K" */
export function compactCurrency(value: number): string {
  if (value === 0) return "—"
  return `$${compactNumber(value)}`
}

/** Small amounts keep cents: 0.28 -> "$0.28" */
export function money(value: number): string {
  if (value === 0) return "—"
  if (value < 1000) return `$${value.toFixed(2)}`
  return compactCurrency(value)
}

export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(bareDomain(domain))}&sz=${size}`
}

/**
 * A stored domain, as a bare host.
 *
 * `companies__domains` holds both shapes: some of its rows carry `https://` and the rest do
 * not. Nothing downstream can tell which it is holding, so anything that built `https://${domain}`
 * from one of them linked one company in four to `https://https://studio.example` — an address that
 * looks right on screen and only fails on the click.
 *
 * The scheme is stripped rather than the value being trusted, because the next import can write
 * either shape and a link is not the place to find that out.
 */
export function bareDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
}

/** The address a stored domain points at. One `https://`, whatever the row held. */
export function domainHref(value: string): string {
  return `https://${bareDomain(value)}`
}
