-- Datos de demostración (sintéticos): se excluyen de las estadísticas reales.
alter table users add column is_demo boolean not null default false;
alter table communities add column is_demo boolean not null default false;
