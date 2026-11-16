-- Acceso de invitado (jurado de NASA Space Apps): cuentas creadas al momento, sin celular ni PIN.
-- No entran en las estadísticas reales del panel.
alter table users add column is_guest boolean not null default false;
