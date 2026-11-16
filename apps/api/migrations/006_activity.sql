-- Actividad para el panel: última vez que la persona abrió la app y cuándo miró su plan.
alter table users add column last_seen_at timestamptz;
alter table memberships add column plan_viewed_at timestamptz;
