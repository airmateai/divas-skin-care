-- MIGRACION DIVAS SKIN CARE - 25/09/2026
-- Completa el brief de la reunion del 23/09 y arregla lo que quedo roto en la
-- migracion del 24/09. Todo aditivo: no borra datos. Se puede ejecutar entero
-- varias veces sin problema.
-- Pegar completo en Supabase > SQL Editor > Run.

-- =====================================================================
-- 1. PERMISOS: lista_espera / cierres_caja / notificaciones
-- El panel entra con sesion de usuario (rol "authenticated"), pero estas
-- tablas solo tenian politicas para "anon" -> el panel no podia leer ni
-- escribir nada en ellas (error 42501). Ademas "anon" (cualquiera con la
-- clave publica de la web) podia leer y modificar los cierres de caja.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['lista_espera','cierres_caja','notificaciones'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop policy if exists %I on %I', t||'_anon_all', t);
    execute format('drop policy if exists %I on %I', t||'_anon_insert', t);
    execute format('drop policy if exists %I on %I', t||'_equipo', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t||'_equipo', t);
  end loop;
end $$;

-- =====================================================================
-- 2. SERVICIOS: precios reales de la web + estado activo coherente
-- Los precios se corrigieron en la web el 07/09 (Treatwell) pero no en la
-- base de datos. Ahora la web lee precio/duracion de aqui, asi que tienen
-- que coincidir.
-- =====================================================================
update servicios set precio = 55 where id = 'ff975148-78d5-4f99-8cd8-1806aee0c676'; -- Limpieza + Extraccion de Puntos Negros (39 -> 55)
update servicios set precio = 65 where id = '12755c7f-395c-4cd7-b254-b849d3a96957'; -- Limpieza + Extraccion + Radiofrecuencia (39 -> 65)
update servicios set precio = 65 where id = 'c43dc1c2-f750-4ab4-b45f-16733297651d'; -- Limpieza + Extraccion + Vitaminas (45 -> 65)
update servicios set precio = 83 where id = '580ddd98-a824-4a9f-8fcc-ed90f8080eed'; -- Limpieza + Extraccion + Mesoterapia (142,20 -> 83)
update servicios set precio = 79 where id = '8df32799-90e4-459e-847f-d7d014eb82ee'; -- Limpieza + Extraccion + Dermapen (49,80 -> 79)
update servicios set precio = 55 where id = '8ff78653-55bb-44d5-8e21-c418fbd58142'; -- Radiofrecuencia + Presoterapia (45 -> 55)
update servicios set precio = 45 where id = 'e37f89ec-0e65-4363-94c7-83e4e74aae7e'; -- Vacum Therapy + Presoterapia (40 -> 45)
update servicios set precio = 40 where id = '2eeb280a-64bf-4f09-961a-2313a87eb2d8'; -- Lipolaser + Presoterapia (45 -> 40)

-- Servicios que ya no tienen tarjeta en la web (quitados a proposito) -> inactivos,
-- para que no reaparezcan solos ahora que la web muestra los servicios activos nuevos.
update servicios set reservable = false where id in (
  'dd2be73b-9040-4d57-ace7-78bff1e9cbc1', -- Limpieza profunda (peeling quimico, hydrafacial...) 33
  'c32763b3-f36d-498c-8870-01b38729211d', -- Divas Laser Anti-aging 89
  'c24c32ff-00f9-4e89-bfa4-eade8de4b4da'  -- Limpieza + Extraccion + Presoterapia 33 (duplicada)
);
-- Las 3 tarjetas de Divas Skin Club SI estan en la web con boton de reserva, pero en
-- la base estaban como no reservables -> el codigo del 24/09 las ocultaba en la web.
update servicios set reservable = true
where categoria = 'Skin Club' and reservable = false and nombre ilike 'Divas Skin Club%';

alter table servicios add column if not exists descripcion text;
update servicios set duracion_min = 60 where duracion_min is null or duracion_min <= 0;

-- =====================================================================
-- 3. EQUIPO / USUARIOS DEL PANEL (quien hace cada accion)
-- =====================================================================
create table if not exists panel_usuarios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text not null,
  rol text not null default 'equipo',
  activo boolean not null default true,
  created_at timestamptz default now()
);
alter table panel_usuarios enable row level security;
revoke all on panel_usuarios from anon;
grant select, insert, update on panel_usuarios to authenticated;
drop policy if exists panel_usuarios_equipo on panel_usuarios;
create policy panel_usuarios_equipo on panel_usuarios for all to authenticated using (true) with check (true);

insert into panel_usuarios (user_id, email, nombre, rol)
select u.id, u.email,
  case
    when u.email ilike 'louie%'    then 'Louie'
    when u.email ilike 'natalia%'  then 'Natalia'
    when u.email ilike 'divassc%'  then 'Divas (cuenta del centro)'
    when u.email ilike 'airmateai%' then 'Airmate (soporte)'
    else split_part(u.email, '@', 1)
  end,
  case
    when u.email ilike 'louie%'    then 'propietaria'
    when u.email ilike 'airmateai%' then 'soporte'
    else 'equipo'
  end
from auth.users u
on conflict (user_id) do nothing;

-- =====================================================================
-- 4. CLIENTAS
-- =====================================================================
alter table clientas add column if not exists notas text;
alter table clientas add column if not exists consentimiento_privacidad_fecha timestamptz;
create index if not exists clientas_email_lower_idx on clientas (lower(email));

-- =====================================================================
-- 5. CITAS: duracion guardada, clienta vinculada, quien la crea
-- =====================================================================
alter table citas add column if not exists duracion_min integer;
alter table citas add column if not exists clienta_id uuid references clientas(id) on delete set null;
alter table citas add column if not exists creado_por text;
alter table citas add column if not exists actualizado_en timestamptz;
alter table citas add column if not exists consentimiento_version text;

update citas c set duracion_min = coalesce(s.duracion_min, 60)
from servicios s where s.id = c.servicio_id and c.duracion_min is null;
update citas set duracion_min = 60 where duracion_min is null;

-- Vincula citas antiguas con su ficha por email o por telefono (solo digitos, ultimos 9)
update citas c set clienta_id = k.id
from clientas k
where c.clienta_id is null and (
  (c.cliente_email is not null and k.email is not null and lower(c.cliente_email) = lower(k.email))
  or (length(regexp_replace(coalesce(c.cliente_telefono,''), '\D', '', 'g')) >= 9
      and right(regexp_replace(coalesce(c.cliente_telefono,''), '\D', '', 'g'), 9)
        = right(regexp_replace(coalesce(k.telefono,''), '\D', '', 'g'), 9))
);

-- Regla de negocio en la propia base de datos: una cita activa no puede
-- solaparse con otra (inicio + duracion). Asi se cumple venga de la web, del
-- panel o de donde sea, aunque dos personas reserven a la vez.
create or replace function citas_antes_de_guardar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_choca record;
  v_comprobar boolean;
begin
  if new.duracion_min is null then
    select coalesce(duracion_min, 60) into new.duracion_min from servicios where id = new.servicio_id;
    new.duracion_min := coalesce(new.duracion_min, 60);
  end if;
  if tg_op = 'UPDATE' then new.actualizado_en := now(); end if;

  if new.fecha is null or new.estado in ('cancelada','rechazada','no_show') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_comprobar := true;
  else
    v_comprobar := new.fecha is distinct from old.fecha
      or new.duracion_min is distinct from old.duracion_min
      or old.estado in ('cancelada','rechazada','no_show');
  end if;
  if not v_comprobar then return new; end if;

  select c.fecha, c.cliente_nombre into v_choca
  from citas c
  where c.id <> new.id
    and c.fecha is not null
    and c.estado not in ('cancelada','rechazada','no_show')
    and c.fecha < new.fecha + make_interval(mins => new.duracion_min)
    and c.fecha + make_interval(mins => coalesce(c.duracion_min, 60)) > new.fecha
  limit 1;

  if found then
    raise exception 'SOLAPE: esa franja ya esta ocupada por otra cita (%)',
      to_char(v_choca.fecha at time zone 'Atlantic/Canary', 'HH24:MI')
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists citas_antes_de_guardar on citas;
create trigger citas_antes_de_guardar before insert or update on citas
for each row execute function citas_antes_de_guardar();

-- Huecos ocupados para la web (usa la duracion guardada en cada cita)
drop function if exists get_busy_slots(date, date);
create function get_busy_slots(desde date, hasta date)
returns table(fecha timestamptz, duracion_min int)
language sql security definer set search_path = public as $$
  select c.fecha, coalesce(c.duracion_min, s.duracion_min, 60)
  from citas c
  left join servicios s on s.id = c.servicio_id
  where (c.fecha at time zone 'Atlantic/Canary')::date between desde and hasta
    and c.estado not in ('cancelada', 'rechazada', 'no_show')
$$;
grant execute on function get_busy_slots(date, date) to anon, authenticated;

-- =====================================================================
-- 6. RESERVA DESDE LA WEB (una sola llamada: ficha + cita + consentimiento)
-- Antes la web intentaba guardar la ficha de clienta sin esperar a la
-- respuesta y la peticion nunca llegaba a enviarse.
-- =====================================================================
create or replace function reservar_cita_web(
  p_nombre text,
  p_telefono text,
  p_email text,
  p_fecha_nacimiento date,
  p_fecha timestamptz,
  p_servicio_id uuid,
  p_notas text,
  p_con_deposito boolean,
  p_consentimiento boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_serv servicios%rowtype;
  v_clienta uuid;
  v_cita uuid := gen_random_uuid();
  v_tel9 text := right(regexp_replace(coalesce(p_telefono,''), '\D', '', 'g'), 9);
  v_email text := nullif(lower(trim(coalesce(p_email,''))), '');
begin
  if not coalesce(p_consentimiento, false) then
    raise exception 'CONSENTIMIENTO: hay que aceptar la politica de privacidad';
  end if;
  if coalesce(trim(p_nombre),'') = '' or length(v_tel9) < 9 then
    raise exception 'DATOS: faltan nombre o telefono';
  end if;
  if p_fecha is null or p_fecha < now() then
    raise exception 'FECHA: la hora elegida no es valida';
  end if;
  select * into v_serv from servicios where id = p_servicio_id;
  if not found or v_serv.reservable is not true then
    raise exception 'SERVICIO: este servicio no esta disponible para reservar online';
  end if;

  -- Busca la ficha por email y, si no, por telefono (campos comparados por separado)
  select id into v_clienta from clientas where v_email is not null and lower(email) = v_email limit 1;
  if v_clienta is null then
    select id into v_clienta from clientas
    where length(v_tel9) = 9 and right(regexp_replace(coalesce(telefono,''), '\D', '', 'g'), 9) = v_tel9
    limit 1;
  end if;

  if v_clienta is null then
    insert into clientas (nombre, telefono, email, fecha_nacimiento, consentimiento_privacidad_fecha)
    values (trim(p_nombre), trim(p_telefono), v_email, p_fecha_nacimiento, now())
    returning id into v_clienta;
  else
    update clientas set
      telefono = coalesce(nullif(telefono,''), trim(p_telefono)),
      email = coalesce(email, v_email),
      fecha_nacimiento = coalesce(fecha_nacimiento, p_fecha_nacimiento),
      consentimiento_privacidad_fecha = now()
    where id = v_clienta;
  end if;

  insert into citas (id, cliente_nombre, cliente_telefono, cliente_email, fecha, servicio_id,
                     duracion_min, estado, notas, origen, clienta_id, creado_por,
                     consentimiento_privacidad, consentimiento_fecha, consentimiento_version)
  values (v_cita, trim(p_nombre), trim(p_telefono), v_email, p_fecha, p_servicio_id,
          coalesce(v_serv.duracion_min, 60),
          case when p_con_deposito then 'pendiente_deposito' else 'pendiente_confirmar' end,
          p_notas, 'web', v_clienta, 'web',
          true, now(), 'privacidad.html v2026-09-24');
  return v_cita;
end $$;
revoke all on function reservar_cita_web(text,text,text,date,timestamptz,uuid,text,boolean,boolean) from public;
grant execute on function reservar_cita_web(text,text,text,date,timestamptz,uuid,text,boolean,boolean) to anon, authenticated;

-- =====================================================================
-- 7. NOTIFICACIONES AUTOMATICAS (desde la base de datos, vengan de donde vengan)
-- =====================================================================
alter table notificaciones add column if not exists cita_id uuid;
alter table notificaciones add column if not exists lista_espera_id uuid;

create or replace function notificar_cambios_cita()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_serv text;
  v_cuando text;
begin
  select nombre into v_serv from servicios where id = new.servicio_id;
  v_cuando := coalesce(to_char(new.fecha at time zone 'Atlantic/Canary', 'DD/MM HH24:MI'), 'sin fecha');
  if tg_op = 'INSERT' then
    insert into notificaciones (tipo, mensaje, cita_id) values (
      'nueva_cita',
      format('Nueva reserva (%s): %s · %s · %s', coalesce(new.origen,'panel'), new.cliente_nombre, coalesce(v_serv,'servicio'), v_cuando),
      new.id);
  elsif new.estado in ('cancelada','rechazada') and old.estado is distinct from new.estado then
    insert into notificaciones (tipo, mensaje, cita_id) values (
      'cita_cancelada',
      format('Cita cancelada: %s · %s · %s (revisa la lista de espera)', new.cliente_nombre, coalesce(v_serv,'servicio'), v_cuando),
      new.id);
  elsif old.estado = 'pendiente_deposito' and new.estado = 'confirmada' then
    insert into notificaciones (tipo, mensaje, cita_id) values (
      'deposito_pagado',
      format('Deposito pagado, cita confirmada: %s · %s', new.cliente_nombre, v_cuando),
      new.id);
  elsif new.fecha is distinct from old.fecha
     or new.servicio_id is distinct from old.servicio_id
     or new.profesional is distinct from old.profesional then
    insert into notificaciones (tipo, mensaje, cita_id) values (
      'cita_modificada',
      format('Cita modificada: %s · %s · %s%s', new.cliente_nombre, coalesce(v_serv,'servicio'), v_cuando,
             coalesce(' · ' || new.profesional, '')),
      new.id);
  end if;
  return new;
end $$;
drop trigger if exists notificar_cambios_cita on citas;
create trigger notificar_cambios_cita after insert or update on citas
for each row execute function notificar_cambios_cita();

-- =====================================================================
-- 8. LISTA DE ESPERA
-- =====================================================================
alter table lista_espera add column if not exists clienta_id uuid references clientas(id) on delete set null;
alter table lista_espera add column if not exists hora_desde time;
alter table lista_espera add column if not exists hora_hasta time;
alter table lista_espera add column if not exists creado_por text;

create or replace function notificar_lista_espera()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_serv text;
begin
  select nombre into v_serv from servicios where id = new.servicio_id;
  insert into notificaciones (tipo, mensaje, lista_espera_id) values (
    'lista_espera',
    format('Nueva en lista de espera: %s · %s · %s', new.cliente_nombre, coalesce(v_serv,'servicio'),
           coalesce(to_char(new.fecha_deseada, 'DD/MM'), 'cualquier dia')),
    new.id);
  return new;
end $$;
drop trigger if exists notificar_lista_espera on lista_espera;
create trigger notificar_lista_espera after insert on lista_espera
for each row execute function notificar_lista_espera();

-- =====================================================================
-- 9. STOCK / PRODUCTOS (impuesto por producto + preparado para la web)
-- =====================================================================
alter table stock alter column minimo drop not null;
alter table stock alter column minimo drop default;
alter table stock add column if not exists tipo_impuesto text default 'IGIC';
alter table stock add column if not exists porcentaje_impuesto numeric default 0;
alter table stock add column if not exists descripcion text;
alter table stock add column if not exists imagen_url text;
alter table stock add column if not exists visible_web boolean not null default false;

-- Lo que la web podra leer cuando se active la tienda (solo lo publicado, sin costes ni stock)
create or replace view productos_web as
  select id, nombre, marca, descripcion, imagen_url, precio, (cantidad > 0) as disponible
  from stock where visible_web = true;
grant select on productos_web to anon, authenticated;

-- =====================================================================
-- 10. TPV: venta + descuento de stock en una sola operacion
-- =====================================================================
alter table ventas add column if not exists usuario text;
alter table ventas add column if not exists base_imponible numeric;
alter table ventas add column if not exists impuestos numeric;
alter table ventas add column if not exists cierre_id uuid;

-- p_items: [{type:'producto'|'servicio', stock_id, servicio_id, name, qty, price, tipo_impuesto, porcentaje_impuesto}]
-- price = precio final (impuesto incluido). Si falta stock, no se guarda nada.
create or replace function registrar_venta(p_items jsonb, p_metodo text, p_usuario text, p_cliente_email text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  it jsonb;
  v_id uuid;
  v_total numeric := 0;
  v_base numeric := 0;
  v_linea numeric;
  v_pct numeric;
  v_ok int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'VENTA: el carrito esta vacio';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_linea := round((it->>'qty')::numeric * (it->>'price')::numeric, 2);
    v_pct := coalesce((it->>'porcentaje_impuesto')::numeric, 0);
    v_total := v_total + v_linea;
    v_base := v_base + round(v_linea / (1 + v_pct/100), 2);
    if it->>'type' = 'producto' and it->>'stock_id' is not null then
      update stock set cantidad = cantidad - (it->>'qty')::int
      where id = (it->>'stock_id')::uuid and cantidad >= (it->>'qty')::int;
      get diagnostics v_ok = row_count;
      if v_ok = 0 then
        raise exception 'STOCK: no hay stock suficiente de %', it->>'name';
      end if;
    end if;
  end loop;
  insert into ventas (items, subtotal, total, metodo_pago, usuario, cliente_email, base_imponible, impuestos)
  values (p_items, v_base, v_total, lower(p_metodo), p_usuario, p_cliente_email, v_base, v_total - v_base)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function registrar_venta(jsonb, text, text, text) to authenticated;

-- =====================================================================
-- 11. CIERRE DE CAJA (apertura con fondo inicial + cierre)
-- =====================================================================
alter table cierres_caja add column if not exists estado text not null default 'cerrada';
alter table cierres_caja add column if not exists usuario_apertura text;
alter table cierres_caja add column if not exists hora_apertura timestamptz;
alter table cierres_caja add column if not exists hora_cierre timestamptz;
alter table cierres_caja add column if not exists fondo_inicial numeric default 0;
alter table cierres_caja add column if not exists num_ventas integer;

-- =====================================================================
-- 12. TIEMPO REAL (el panel se actualiza solo cuando entra una reserva)
-- =====================================================================
do $$
begin
  begin alter publication supabase_realtime add table notificaciones; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table citas; exception when duplicate_object then null; end;
end $$;

-- FIN
