/**
 * The playbook tables: private commercial knowledge stored beside the CRM records that use it.
 *
 * These are not CRM objects. They do not belong in the record registry or the grid, but leaving
 * them in application arrays and ignored markdown files made the working tree a second, incomplete
 * datastore. A clone could run while silently missing the rules that govern its work.
 *
 * The database owns the rows; this file owns only their generic relational shape. The private seed
 * that transfers the current material is deliberately absent from a clone, and the importer reads
 * every value from disk rather than baking one tenant's playbook back into the skeleton.
 */

export const PLAYBOOK_TABLES: { name: string; ddl: string; indexes?: string[] }[] = [
  /* The guides themselves. A list reads metadata; one explicit slug reads the large markdown body. */
  {
    name: "doc",
    ddl: `create table if not exists doc (
      doc_id text primary key,
      title text not null,
      kind text not null,
      body text not null,
      summary text,
      position integer not null default 0,
      updated_at text not null
    )`,
    indexes: ["create index if not exists doc_kind_position on doc (kind, position)"],
  },
  /* Tunables belong in data so an operational value can change without changing the application. */
  {
    name: "app_setting",
    ddl: `create table if not exists app_setting (
      key text primary key,
      value text not null,
      note text
    )`,
  },
  /* Candidate companies are private records, not fixtures a clone should inherit. */
  {
    name: "prospect_candidate",
    ddl: `create table if not exists prospect_candidate (
      domain text primary key,
      name text not null,
      sector text,
      why text,
      added_at text not null
    )`,
  },
  /* The market taxonomy. The human label is the key already written on CRM company records. */
  {
    name: "market_cluster",
    ddl: `create table if not exists market_cluster (
      cluster_id text primary key,
      label text not null,
      what text not null,
      position integer not null default 0
    )`,
    indexes: ["create unique index if not exists market_cluster_label on market_cluster (label)"],
  },
  /* Entry routes carry their display channel because the two describe the same commercial fact. */
  {
    name: "market_route",
    ddl: `create table if not exists market_route (
      route_id text primary key,
      label text not null,
      why text not null,
      move text not null,
      channel_id text not null,
      channel_label text not null,
      channel_icon text not null,
      channel_what text not null,
      inbound integer not null,
      is_fallback integer not null default 0,
      position integer not null default 0
    )`,
  },
  /* Ordered JavaScript regex sources choose one route; first match wins. */
  {
    name: "market_route_rule",
    ddl: `create table if not exists market_route_rule (
      rule_id text primary key,
      route_id text not null,
      field text not null,
      pattern text not null,
      flags text not null default 'i',
      position integer not null
    )`,
    indexes: ["create index if not exists market_route_rule_position on market_route_rule (position)"],
  },
  /* The board order is a hand-set decision because the catalog has no status position. */
  {
    name: "pipeline_stage",
    ddl: `create table if not exists pipeline_stage (
      title text primary key,
      position integer not null,
      note text
    )`,
  },
  /* Hosts whose apparently valid picture URLs are known to expire. */
  {
    name: "picture_host_rule",
    ddl: `create table if not exists picture_host_rule (
      host text primary key,
      why text not null
    )`,
  },
  /* Recipient-side vetoes, ordered within their kind and stored as JavaScript regex sources. */
  {
    name: "voice_rule",
    ddl: `create table if not exists voice_rule (
      rule_id text primary key,
      kind text not null,
      pattern text not null,
      flags text not null default 'i',
      why text not null,
      position integer not null default 0
    )`,
    indexes: ["create index if not exists voice_rule_kind_position on voice_rule (kind, position)"],
  },
]
