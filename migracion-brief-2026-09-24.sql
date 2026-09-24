-- MIGRACION DIVAS SKIN CARE - brief reunion 23/09/2026
-- Todo aditivo: nuevas columnas / nuevas tablas. No borra nada existente.
-- Es seguro ejecutar esto completo aunque ya hayas ejecutado parte antes.

-- FASE 1: duracion real de los servicios + disponibilidad por rango

alter table servicios add column if not exists duracion_min integer;

update servicios set duracion_min =
  coalesce( (regexp_match(duracion, '(\d+)\s*h'))[1]::int, 0) * 60
  + coalesce( (regexp_match(duracion, '(\d+)\s*min'))[1]::int, 0)
where duracion_min is null;

update servicios set duracion_min = 60 where duracion_min = 0;

alter table servicios add column if not exists color text;
alter table servicios add column if not exists video_url text;
alter table servicios add column if not exists img_url text;

update servicios set color = case categoria
  when 'Limpieza facial Profunda'      then '#A9B6A2'
  when 'Tratamiento Personalizado'     then '#BC916A'
  when 'Plasma Pen'                    then '#8FA07E'
  when 'Reductor corporal'             then '#C7A17A'
  when 'Laser IPL'                     then '#7C8F94'
  when 'Cejas'                         then '#D9A6A6'
  when 'Diagnostico'                   then '#B0B0A0'
  when 'Skin Club'                     then '#9CAF88'
  else '#A9B6A2'
end
where color is null;

drop function if exists get_busy_slots(date, date);

create function get_busy_slots(desde date, hasta date)
returns table(fecha timestamptz, duracion_min int)
language sql
security definer
set search_path = public
as $$
  select c.fecha, coalesce(s.duracion_min, 60) as duracion_min
  from citas c
  left join servicios s on s.id = c.servicio_id
  where c.fecha::date between desde and hasta
    and c.estado not in ('cancelada', 'rechazada')
$$;

grant execute on function get_busy_slots(date, date) to anon;

-- FASE 5: ficha de clienta
alter table clientas add column if not exists fecha_nacimiento date;

-- FASE 4: profesional en las citas
alter table citas add column if not exists profesional text;

-- FASE 7: lista de espera
create table if not exists lista_espera (
  id uuid primary key default gen_random_uuid(),
  cliente_nombre text not null,
  cliente_telefono text,
  servicio_id uuid references servicios(id),
  fecha_deseada date,
  hora_preferida time,
  rango_horario text,
  notas text,
  estado text default 'pendiente',
  created_at timestamptz default now()
);
alter table lista_espera enable row level security;
drop policy if exists lista_espera_anon_insert on lista_espera;
create policy lista_espera_anon_insert on lista_espera for insert to anon with check (true);
grant select, insert, update, delete on lista_espera to anon;

-- FASE 8: stock - quitar obligatoriedad de minimo + IVA/IGIC
alter table stock alter column minimo drop not null;
alter table stock add column if not exists tipo_impuesto text default 'IGIC';
alter table stock add column if not exists porcentaje_impuesto numeric default 0;

-- FASE 9: TPV con usuario
alter table ventas add column if not exists usuario text;

-- FASE 10: cierre de caja
create table if not exists cierres_caja (
  id uuid primary key default gen_random_uuid(),
  usuario text,
  fecha date not null default current_date,
  ventas_total numeric,
  efectivo_esperado numeric,
  efectivo_contado numeric,
  diferencia numeric,
  otros_metodos jsonb,
  observaciones text,
  created_at timestamptz default now()
);
alter table cierres_caja enable row level security;
grant select, insert, update, delete on cierres_caja to anon;
drop policy if exists cierres_caja_anon_all on cierres_caja;
create policy cierres_caja_anon_all on cierres_caja for all to anon using (true) with check (true);

-- FASE 11: notificaciones
create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text,
  mensaje text,
  leida boolean default false,
  created_at timestamptz default now()
);
alter table notificaciones enable row level security;
grant select, insert, update, delete on notificaciones to anon;
drop policy if exists notificaciones_anon_all on notificaciones;
create policy notificaciones_anon_all on notificaciones for all to anon using (true) with check (true);

-- FASE 12: consentimiento de privacidad en la reserva
alter table citas add column if not exists consentimiento_privacidad boolean default false;
alter table citas add column if not exists consentimiento_fecha timestamptz;

-- FIN
