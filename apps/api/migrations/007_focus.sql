-- «¿Qué te importa más?»: tarjetas elegidas y de dónde salen las monedas (tarjetas o ajuste manual).
alter table preferences add column focus text[] not null default '{}';
alter table preferences add column coins_source text not null default 'manual' check (coins_source in ('cards', 'manual'));
