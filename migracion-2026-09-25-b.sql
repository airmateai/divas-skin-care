-- MIGRACION DIVAS SKIN CARE - 25/09/2026 (b)
-- Seguimientos que se recuerdan y pedidos con estado editable desde el panel.
-- Todo aditivo, se puede ejecutar varias veces.

-- Seguimientos marcados como hechos (para que no vuelvan a salir durante 14 dias)
create table if not exists seguimientos_hechos (
  id uuid primary key default gen_random_uuid(),
  clienta_id uuid references clientas(id) on delete cascade,
  motivo text not null,
  usuario text,
  created_at timestamptz default now()
);
alter table seguimientos_hechos enable row level security;
revoke all on seguimientos_hechos from anon;
grant select, insert, update, delete on seguimientos_hechos to authenticated;
drop policy if exists seguimientos_hechos_equipo on seguimientos_hechos;
create policy seguimientos_hechos_equipo on seguimientos_hechos for all to authenticated using (true) with check (true);

-- Pedidos de la tienda: el equipo puede verlos y marcarlos como preparado / entregado
alter table pedidos enable row level security;
grant select, update on pedidos to authenticated;
drop policy if exists pedidos_equipo_lee on pedidos;
create policy pedidos_equipo_lee on pedidos for select to authenticated using (true);
drop policy if exists pedidos_equipo_actualiza on pedidos;
create policy pedidos_equipo_actualiza on pedidos for update to authenticated using (true) with check (true);

-- FIN
