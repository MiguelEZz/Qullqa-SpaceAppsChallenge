-- Comunidades de catálogo (src/communityCatalog.ts): no se crean ni usan códigos;
-- las forman quienes se unen. Las comunidades creadas antes quedan sin listar (solo sus miembros las ven).
alter table communities alter column join_code drop not null;
alter table communities alter column created_by drop not null;
alter table communities
  add column slug        text unique,
  add column district    text,
  add column province    text,
  add column region      text,
  add column altitude_m  int,
  add column valley_id   text,
  add column listed      boolean not null default false;
update memberships set role = 'member';
alter table memberships alter column role set default 'member';
