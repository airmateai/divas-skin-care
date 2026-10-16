-- Divas Skin Care · 2026-10-16 · Encargos desde la web (fajas bajo pedido) → llegan a Pedidos del panel
-- Ejecutar en Supabase (proyecto Divas) → SQL Editor → Run. Se puede ejecutar varias veces.
-- La web NO puede escribir en la tabla pedidos directamente: solo puede llamar a esta función,
-- que valida los datos y limita los envíos (evita spam y que alguien meta basura).
create or replace function public.encargar_producto(p_nombre text, p_telefono text, p_producto text, p_talla text default null, p_color text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_prod public.stock%rowtype; v_tel text; v_nombre text; v_notas text;
begin
  v_nombre := btrim(coalesce(p_nombre,''));
  v_tel := regexp_replace(coalesce(p_telefono,''), '[^0-9+]', '', 'g');
  if length(v_nombre) < 2 or length(v_nombre) > 80 then raise exception 'Escribe tu nombre'; end if;
  if length(regexp_replace(v_tel,'[^0-9]','','g')) not between 9 and 15 then raise exception 'Escribe un teléfono válido'; end if;
  select * into v_prod from public.stock where id::text = p_producto and visible_web = true and bajo_pedido = true;
  if not found then raise exception 'Producto no disponible'; end if;
  if (select count(*) from public.pedidos where cliente_telefono = v_tel and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Ya hemos recibido tus encargos de hoy. Te escribimos enseguida.'; end if;
  v_notas := concat_ws(' · ', 'Encargo web', nullif('Talla '||left(btrim(coalesce(p_talla,'')),12),'Talla '), nullif('Color '||left(btrim(coalesce(p_color,'')),20),'Color '));
  insert into public.pedidos (cliente_nombre, cliente_telefono, producto_id, estado, origen, notas)
  values (v_nombre, v_tel, v_prod.id, 'encargo', 'web', v_notas);
  insert into public.notificaciones (tipo, mensaje)
  values ('pedido', 'Nuevo encargo: ' || v_prod.nombre || ' — ' || v_nombre || ' (' || v_tel || ')' || coalesce(' · '||nullif(v_notas,'Encargo web'),''));
  return 'ok';
end $$;
revoke all on function public.encargar_producto(text,text,text,text,text) from public;
grant execute on function public.encargar_producto(text,text,text,text,text) to anon, authenticated;
