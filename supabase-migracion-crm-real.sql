-- Ventas del Punto de Venta (TPV). Cada venta guarda sus artículos en JSON
-- (servicio o producto de stock, cantidad y precio en el momento de la venta).
create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  items jsonb not null,
  subtotal numeric not null,
  total numeric not null,
  metodo_pago text not null,
  cliente_email text,
  created_at timestamptz not null default now()
);

alter table public.ventas enable row level security;
create policy "ventas: autenticado lee y escribe" on public.ventas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Facturas reales (no las de Stripe, las que Louie/Natalia emiten a mano desde el panel).
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  cliente_email text,
  cliente_nombre text not null,
  items text not null,
  total numeric not null,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now()
);

alter table public.facturas enable row level security;
create policy "facturas: autenticado lee y escribe" on public.facturas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Clientas: permitir que el panel también inserte/actualice, no solo el webhook de Stripe.
alter table public.clientas enable row level security;
drop policy if exists "clientas: autenticado lee y escribe" on public.clientas;
create policy "clientas: autenticado lee y escribe" on public.clientas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Permitir que el panel descuente stock al vender.
drop policy if exists "stock: autenticado actualiza" on public.stock;
create policy "stock: autenticado actualiza" on public.stock
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
