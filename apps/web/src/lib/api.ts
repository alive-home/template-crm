/**
 * A failed request, with the status still attached.
 *
 * The sentence is what a person reads and the status is what the retry policy reads, and throwing a
 * bare `Error` threw the second one away. That mattered: React Query retries three times by default,
 * so every rejected write — an unknown field, a read-only column, a 401 that has already sent the tab
 * to the login page — was asked for four times before the message arrived. A 400 is the server saying
 * the request is wrong, and asking again cannot make it right.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Thin fetch wrapper for the Hono API (proxied at /api in dev). */
export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })

  // A session that ran out while the tab was open turns every query into an error toast about being
  // signed out. Go to the door instead: the app can do nothing useful in that state anyway.
  if (response.status === 401) {
    const next = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.assign(`/login?next=${next}`)
  }

  // The API answers a rejected write with `{ error }` explaining what it refused and why — an unknown
  // or read-only CRM field, for instance. Throwing the bare status would drop that sentence and leave
  // the caller to invent a generic message, which is the failure the server is deliberately avoiding.
  if (!response.ok) {
    const detail = await response
      .clone()
      .json()
      .then(errorSentence)
      .catch(() => null)

    throw new ApiError(detail ?? `API error: ${response.status}`, response.status)
  }

  return response.json()
}

/** The `{ error }` sentence, if the body carries one. Checked rather than assumed: a failed request
 * can also answer with HTML, an empty body or somebody else's JSON. */
function errorSentence(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null
  return typeof body.error === "string" ? body.error : null
}
