-- VALORA · esquema para sincronizar en la nube (opcional)
-- Pégalo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez sin problema.
--
-- Diseño: una fila por usuario con todo el estado del negocio en JSON.
-- Es simple, rápido y suficiente para un negocio pequeño o mediano (hasta unos miles de registros).
-- Cada usuario solo puede ver y modificar su propia fila (Row Level Security).

create table if not exists public.valora_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.valora_state enable row level security;

drop policy if exists "valora_select_own" on public.valora_state;
drop policy if exists "valora_insert_own" on public.valora_state;
drop policy if exists "valora_update_own" on public.valora_state;
drop policy if exists "valora_delete_own" on public.valora_state;

create policy "valora_select_own" on public.valora_state
  for select to authenticated using (auth.uid() = user_id);

create policy "valora_insert_own" on public.valora_state
  for insert to authenticated with check (auth.uid() = user_id);

create policy "valora_update_own" on public.valora_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "valora_delete_own" on public.valora_state
  for delete to authenticated using (auth.uid() = user_id);

-- Nadie sin sesión puede tocar la tabla.
revoke all on public.valora_state from anon;
grant select, insert, update, delete on public.valora_state to authenticated;
