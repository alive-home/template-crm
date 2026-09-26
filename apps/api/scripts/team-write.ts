/**
 * Putting a scanned team into the CRM. The only half of `team-scan.ts` that writes anything.
 *
 * Separated for the same reason `outbound-queue.ts` and `outbound-log.ts` are two files: reading the
 * web and writing the database fail in different ways and are worth re-running independently. A run
 * that researched twelve companies and then tripped over one bad row should not have to go back out to
 * the internet to try again.
 *
 * **It only ever fills a hole.** Every column is written through `coalesce`, so a job title somebody
 * typed by hand outranks one read off a web page, and the whole script is safe to run twice — which it
 * has to be, because the photo matcher improves and the second pass is how the earlier records get the
 * picture the first pass missed.
 */
import { pictureUrlProblem } from "../src/crm/picture"
import { loadPictureRules } from "../src/crm/picture-rules"
import { textColumn } from "../src/crm/row"
import type { turso } from "../src/crm/turso"

export type TeamPerson = { name: string; role: string; photo: string | null; linkedin: string | null }
export type TeamCompany = { id: string; name: string; site: string }
export type TeamResult = {
  company: TeamCompany
  page?: string
  people: TeamPerson[]
  refusal?: string
  /** Set when the people were salvaged from markup because the extractor refused the page. */
  note?: string
}

export type Saved = { inserted: number; updated: number; photosStored: number }

/**
 * Save every person found, against the company they were found on.
 *
 * A person is matched to an existing record by name within the same company, which is the only key
 * these two sides share: the site publishes a name and a face, never an id. Matching on name alone
 * across the whole CRM would merge two different people who happen to be called Max.
 */
export async function saveTeams(
  client: ReturnType<typeof turso>,
  results: TeamResult[],
  city: string,
  today: string,
): Promise<Saved> {
  const saved: Saved = { inserted: 0, updated: 0, photosStored: 0 }
  const pictureRules = await loadPictureRules()

  for (const result of results) {
    const existing = (
      await client.execute({
        sql: "select record_id, name_full_name, job_title, avatar_url, linkedin from people where company_record_id = ?",
        args: [result.company.id],
      })
    ).rows

    for (const person of result.people) {
      // A photo is only ever stored through the same rule the write endpoint enforces, so a script
      // cannot put a URL in a column that the API would have refused.
      const photo = pictureUrlProblem(person.photo, pictureRules) === null ? person.photo : null

      const match = existing.find(
        row => (textColumn([row], "name_full_name")[0] ?? "").toLowerCase() === person.name.toLowerCase(),
      )

      if (match) {
        const id = textColumn([match], "record_id")[0]
        if (!id) continue
        await client.execute({
          sql: `update people set job_title = coalesce(job_title, ?), avatar_url = coalesce(avatar_url, ?),
                  linkedin = coalesce(linkedin, ?) where record_id = ?`,
          args: [person.role || null, photo, person.linkedin, id],
        })
        if (!textColumn([match], "avatar_url")[0] && photo) saved.photosStored++
        saved.updated++
        continue
      }

      const parts = person.name.split(/\s+/).filter(Boolean)
      await client.execute({
        sql: `insert into people (record_id, name_first_name, name_last_name, name_full_name, job_title, avatar_url,
                linkedin, company_record_id, company_target_object, primary_location_locality, created_at,
                created_by_actor_type, source_notes)
              values (?, ?, ?, ?, ?, ?, ?, ?, 'companies', ?, ?, 'api-token', ?)`,
        args: [
          crypto.randomUUID(),
          parts[0] ?? person.name,
          parts.length > 1 ? (parts[parts.length - 1] ?? "") : "",
          person.name,
          person.role || null,
          photo,
          person.linkedin,
          result.company.id,
          city,
          new Date().toISOString(),
          `Read from ${result.page} on ${today}.`,
        ],
      })
      if (photo) saved.photosStored++
      saved.inserted++
    }
  }

  return saved
}
