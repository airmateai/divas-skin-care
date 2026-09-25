create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  concepto text not null,
  categoria text not null default 'Otros',
  monto numeric not null,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.gastos enable row level security;
create policy "gastos: autenticado lee y escribe" on public.gastos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
