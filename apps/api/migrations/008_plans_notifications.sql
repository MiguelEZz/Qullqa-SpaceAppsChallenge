-- Cuándo se calcula el plan:
--  community   = plan comunitario completo (cuando hay ≥ 2 familias con datos y aún no había plan; o el admin)
--  incremental = alguien se suma a una comunidad que ya tiene plan: su plan se calcula con el de los vecinos fijo
--  personal    = pasaron 3 días y nadie más de su comunidad envió datos: plan solo para esa familia
alter table runs add column kind text not null default 'community' check (kind in ('community', 'incremental', 'personal'));
alter table runs add column target_user uuid references users(id) on delete set null;
alter table runs add column fixed_plans jsonb;
-- Última vez que esta familia recibió un plan (para saber si espera uno)
alter table memberships add column last_plan_at timestamptz;

-- Avisos dentro de la app (y por notificación del celular si dio permiso)
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  community_id  uuid references communities(id) on delete cascade,
  kind          text not null,
  title         text not null,
  body          text not null,
  link          text,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index notifications_user_idx on notifications(user_id, created_at desc);

-- Suscripciones Web Push (notificaciones del celular)
create table push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);
