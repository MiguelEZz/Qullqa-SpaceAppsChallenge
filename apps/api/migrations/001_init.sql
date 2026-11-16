create extension if not exists postgis;

create table users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null unique,
  pin_hash    text not null,
  created_at  timestamptz not null default now()
);

create table communities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,
  center      geography(Point, 4326) not null,
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now()
);

create table memberships (
  user_id       uuid not null references users(id) on delete cascade,
  community_id  uuid not null references communities(id) on delete cascade,
  role          text not null check (role in ('member', 'coordinator')),
  joined_at     timestamptz not null default now(),
  -- «datos listos»: el agricultor envió sus datos al cerebro. Se limpia si edita parcelas o prioridades.
  submitted_at  timestamptz,
  primary key (user_id, community_id)
);

create table parcels (
  id                uuid primary key default gen_random_uuid(),
  community_id      uuid not null references communities(id) on delete cascade,
  owner_id          uuid not null references users(id) on delete cascade,
  name              text not null,
  polygon           geography(Polygon, 4326) not null,
  capture_method    text not null check (capture_method in ('walk', 'draw')),
  gps_altitude_m    real,
  gps_accuracy_m    real,
  irrigation        jsonb not null,
  current_rotation  text[] not null check (array_length(current_rotation, 1) = 3),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index parcels_community_idx on parcels(community_id);
create index parcels_polygon_idx on parcels using gist(polygon);

create table observations (
  id           uuid primary key default gen_random_uuid(),
  parcel_id    uuid not null references parcels(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  type         text not null,
  value        jsonb not null,
  photo        bytea,
  lat          double precision,
  lon          double precision,
  accuracy_m   real,
  observed_at  timestamptz not null,
  created_at   timestamptz not null default now()
);
create index observations_parcel_idx on observations(parcel_id);

-- PRIVADO: solo lo lee su dueño y el cerebro.
create table preferences (
  user_id       uuid not null references users(id) on delete cascade,
  community_id  uuid not null references communities(id) on delete cascade,
  coins         jsonb not null,
  constraints   jsonb not null,
  vetoes        text[] not null default '{}',
  updated_at    timestamptz not null default now(),
  primary key (user_id, community_id)
);
