/** Database-backed host rules used by the otherwise generic picture URL validator. */
import { query } from "./turso"

export type PictureHostRule = { host: string; why: string }

let loaded: Promise<PictureHostRule[]> | null = null

/**
 * The expiring-host register, once per process.
 *
 * An unseeded database must not block record writes: the generic https check still runs and there
 * are simply no host-specific refusals. Other database failures still surface, because a broken
 * read and an absent table must not look alike.
 */
export function loadPictureRules(): Promise<PictureHostRule[]> {
  loaded ??= query<PictureHostRule>("SELECT host, why FROM picture_host_rule ORDER BY host").catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    if (/no such table/i.test(message)) return []
    throw error
  })
  return loaded
}
