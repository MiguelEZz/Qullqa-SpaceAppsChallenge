-- Corridas del cerebro: cola + snapshot inmutable + resultado.
-- snapshot e input contienen datos PRIVADOS (monedas): nunca se devuelven por HTTP tal cual.
create table runs (
  id             uuid primary key default gen_random_uuid(),
  community_id   uuid not null references communities(id) on delete cascade,
  requested_by   uuid references users(id) on delete set null,
  status         text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  valley_id      text not null,
  seed           int not null,
  input          jsonb not null,
  snapshot_meta  jsonb,
  result         jsonb,
  error          text,
  duration_ms    int,
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz
);
create index runs_community_idx on runs(community_id, created_at desc);
create index runs_queue_idx on runs(created_at) where status = 'queued';
