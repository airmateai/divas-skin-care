-- DIVAS SKIN CARE - 25/09/2026 (d)
-- Pegar en Supabase > FIBIOAIRMATE > Divas Skin Care > SQL Editor > Run. Se puede ejecutar varias veces.

-- 1) Objetivo de facturacion mensual (pedido por Louie)
create table if not exists objetivos_mensuales (
  mes text primary key,            -- 'YYYY-MM'
  objetivo numeric not null,
  actualizado_por text,
  updated_at timestamptz default now()
);
alter table objetivos_mensuales enable row level security;
revoke all on objetivos_mensuales from anon;
grant select, insert, update, delete on objetivos_mensuales to authenticated;
drop policy if exists objetivos_equipo on objetivos_mensuales;
create policy objetivos_equipo on objetivos_mensuales for all to authenticated using (true) with check (true);

-- 2) Verifactu: numero de ticket correlativo y estado del registro en cada venta del TPV
alter table ventas add column if not exists num_ticket text unique;
alter table ventas add column if not exists verifactu_id bigint unique;
alter table ventas add column if not exists verifactu_estado text;      -- pending | sent | sent_warning | error
alter table ventas add column if not exists verifactu_queue_id text;
alter table ventas add column if not exists verifactu_qr text;          -- imagen PNG en base64
alter table ventas add column if not exists verifactu_url text;         -- enlace de verificacion de la AEAT
alter table ventas add column if not exists verifactu_msg text;
alter table ventas add column if not exists verifactu_at timestamptz;

create sequence if not exists verifactu_id_seq start 1000;
create table if not exists series_tickets (anio int primary key, ultimo int not null default 0);

-- Asigna (una sola vez) numero de ticket T2026-000001... sin huecos ni repeticiones
create or replace function asignar_numero_verifactu(p_venta uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; n int; a int;
begin
  select * into v from ventas where id = p_venta for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v.num_ticket is not null and v.verifactu_id is not null then
    return jsonb_build_object('num_ticket', v.num_ticket, 'verifactu_id', v.verifactu_id);
  end if;
  a := extract(year from (v.created_at at time zone 'Atlantic/Canary'))::int;
  insert into series_tickets(anio, ultimo) values (a, 1)
    on conflict (anio) do update set ultimo = series_tickets.ultimo + 1
    returning ultimo into n;
  update ventas set num_ticket = 'T' || a || '-' || lpad(n::text, 6, '0'),
                    verifactu_id = coalesce(verifactu_id, nextval('verifactu_id_seq'))
   where id = p_venta returning * into v;
  return jsonb_build_object('num_ticket', v.num_ticket, 'verifactu_id', v.verifactu_id);
end $$;
revoke all on function asignar_numero_verifactu(uuid) from public, anon;
grant execute on function asignar_numero_verifactu(uuid) to authenticated, service_role;
alter table series_tickets enable row level security;
revoke all on series_tickets from anon, authenticated;

-- FIN
