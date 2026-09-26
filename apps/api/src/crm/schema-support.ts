/**
 * The tables that are not CRM objects.
 *
 * Notes, tasks, the task-to-record link, the mail mirror, and the attribute catalog the UI reads to
 * learn what a column is. None of them is ever rendered as a record with fields, so none is generated
 * from a column list: they are plain DDL, written out.
 */

/**
 * Tables that are not CRM objects: notes, tasks, the task-to-record link, and the mail mirror.
 *
 * These have no catalog entry because they are never rendered as a record with fields. They are
 * plain DDL, written out rather than generated.
 */
export const SUPPORT_TABLES: { name: string; ddl: string; indexes?: string[] }[] = [
  {
    name: "note",
    ddl: `create table if not exists note (
			note_id text primary key,
			parent_object text,
			parent_record_id text,
			title text,
			content_plaintext text,
			created_at text
		)`,
    // Both hot paths: the record page reads one parent's notes, the overview and the outbound feed
    // scan by title prefix and sort by date.
    indexes: [
      "create index if not exists note_parent on note (parent_object, parent_record_id)",
      "create index if not exists note_created on note (created_at)",
    ],
  },
  {
    name: "task",
    ddl: `create table if not exists task (
			task_id text primary key,
			content_plaintext text,
			is_completed integer default 0,
			deadline_at text,
			completed_at text,
			created_at text
		)`,
    indexes: ["create index if not exists task_open on task (is_completed, deadline_at)"],
  },
  {
    name: "task_linked_record",
    // A task can point at several records, so the key is the pair rather than the task.
    ddl: `create table if not exists task_linked_record (
			task_id text,
			target_object text,
			target_record_id text,
			primary key (task_id, target_record_id)
		)`,
    indexes: ["create index if not exists task_link_target on task_linked_record (target_record_id)"],
  },
  {
    name: "email_message",
    // The envelope only, never the body — see `apps/api/scripts/mail-sync.ts` for why. This used to be created
    // by that script on every run, which put schema creation in a data-loading path where a fresh
    // clone's first sync silently defined the table.
    ddl: `create table if not exists email_message (
			message_id text primary key,
			thread_id text,
			company_record_id text,
			direction text,
			from_address text,
			to_address text,
			subject text,
			snippet text,
			sent_at text,
			synced_at text
		)`,
    indexes: ["create index if not exists email_message_company on email_message (company_record_id)"],
  },
  {
    /*
     * Where a city is, looked up once and reused.
     *
     * Keyed on the place, never on the record: a city is looked up once and the next company in it
     * gets a point without anything having to run again. The map reads it as the weaker of its two
     * registers, so it is deliberately a table beside `companies` rather than columns on it —
     * writing a city centre into `primary_location_latitude` would make a guess indistinguishable
     * from an address somebody checked, the next day and forever.
     *
     * Filled by `apps/api/scripts/geocode-places.ts`. Created here so a fresh database has it before the map
     * asks, and so the migration owns every table the code reads.
     */
    name: "geo_place",
    ddl: `create table if not exists geo_place (
      place_key text primary key,
      locality text not null,
      country_code text,
      latitude real not null,
      longitude real not null,
      display_name text,
      place_rank integer,
      source text not null,
      geocoded_at text not null
    )`,
  },
  /*
   * The three persona tables. Ours, not the CRM's: they hold who we think buys, why, and how sure we
   * are of each claim. They sit in the same database rather than in a file in this repo, because a
   * persona in a markdown file is a file nobody opens a month later — and they are declared here
   * rather than created by the endpoint that reads them, so schema creation stays in one place.
   *
   * Certainty is a column on the ring and on the quote, not only on the persona, and that is the
   * point of the split: one flag on the row would make a published quote look as weak as a guess.
   */
  {
    name: "personas",
    ddl: `create table if not exists personas (
      persona_id text primary key,
      naam text not null,
      roepnaam text not null,
      persona_type text not null,
      scope text not null,
      mandaat text,
      doel text,
      huidige_werkwijze text,
      denkwijze text,
      bewijsbasis text,
      n_gesprekken integer not null default 0,
      zekerheid text not null,
      laatst_getoetst text not null,
      volgorde integer not null default 0
    )`,
  },
  {
    name: "persona_ring",
    ddl: `create table if not exists persona_ring (
      ring_id text primary key,
      persona_id text not null,
      ring text not null,
      waarde text not null,
      zekerheid text not null,
      bron text,
      volgorde integer not null default 0
    )`,
    indexes: ["create index if not exists persona_ring_persona on persona_ring (persona_id)"],
  },
  {
    name: "persona_quote",
    ddl: `create table if not exists persona_quote (
      quote_id text primary key,
      persona_id text not null,
      citaat text not null,
      functie text,
      bron text,
      datum text,
      zekerheid text not null
    )`,
    indexes: ["create index if not exists persona_quote_persona on persona_quote (persona_id)"],
  },
]

/**
 * The catalog: what the UI reads to learn an attribute's type, title and allowed values.
 *
 * **This is a transcription, not a design.** These four tables were loaded once from a hosted CRM and
 * they hold 164 attributes and 203 options; every database this code will ever meet already has them
 * in that shape. What was written here before was a plausible-looking simplification of it — a
 * `catalog_object` keyed by `object_slug` instead of `object_id`, an `is_archived` flag no export
 * ever wrote, and none of the seven `not null` columns the real tables declare — and the cost of the
 * mismatch was not theoretical: the migration's own inserts failed against the real database, one
 * missing column at a time, while `--dry-run` reported a clean plan.
 *
 * So when it disagrees with the database, the database is right. Match it exactly, including the
 * columns nothing reads yet.
 */
export const CATALOG_TABLES: { name: string; ddl: string; indexes?: string[] }[] = [
  {
    name: "catalog_object",
    ddl: `create table if not exists catalog_object (
			object_id text primary key,
			api_slug text not null unique,
			singular_noun text,
			plural_noun text,
			created_at text
		)`,
  },
  {
    name: "catalog_attribute",
    // The pair, not the id, is the identity: `(object_slug, api_slug)` is unique here and is what the
    // migration matches on so an attribute already described under somebody else's UUID is left alone.
    ddl: `create table if not exists catalog_attribute (
			attribute_id text primary key,
			object_id text not null references catalog_object(object_id),
			object_slug text not null,
			api_slug text not null,
			title text,
			description text,
			type text not null,
			is_system_attribute integer not null,
			is_writable integer not null,
			is_required integer not null,
			is_unique integer not null,
			is_multiselect integer not null,
			is_archived integer not null,
			created_at text,
			storage text not null,
			unique (object_slug, api_slug)
		)`,
  },
  {
    name: "catalog_select_option",
    ddl: `create table if not exists catalog_select_option (
			option_id text primary key,
			attribute_id text not null references catalog_attribute(attribute_id),
			title text not null,
			is_archived integer not null
		)`,
  },
  {
    name: "catalog_status",
    ddl: `create table if not exists catalog_status (
			status_id text primary key,
			attribute_id text not null references catalog_attribute(attribute_id),
			title text not null,
			is_archived integer not null,
			target_time_in_status text,
			celebration_enabled integer not null
		)`,
  },
]
