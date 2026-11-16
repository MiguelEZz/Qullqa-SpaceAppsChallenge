-- Recuperación del PIN con un código de un solo uso (se muestra una vez al registrarse) y aceptación de términos.
alter table users
  add column recovery_hash      text,
  add column terms_accepted_at  timestamptz,
  add column terms_version      text;
-- Borrar una cuenta no debe fallar por comunidades antiguas que esa persona creó.
alter table communities drop constraint if exists communities_created_by_fkey;
alter table communities add constraint communities_created_by_fkey foreign key (created_by) references users(id) on delete set null;
