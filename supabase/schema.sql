-- Ejecuta esto UNA vez en Supabase → SQL Editor → New query → Run.
-- Crea la tabla del panel y la protege para que cada usuaria solo vea sus datos.

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  module      text not null check (module in ('emprendimiento', 'tfm', 'finanzas')),
  kind        text not null,            -- tarea, hito, idea, capítulo, referencia, gasto, ingreso...
  title       text not null,
  notes       text,
  amount      numeric(12, 2),           -- solo finanzas
  status      text not null default 'pendiente',
  due_date    date,
  created_at  timestamptz not null default now()
);

create index if not exists entries_user_module_idx on public.entries (user_id, module);

-- Permiso para usuarias con sesión iniciada (RLS limita a sus propias filas).
-- Los visitantes anónimos (anon) NO reciben ningún permiso.
grant select, insert, update, delete on public.entries to authenticated;

-- Seguridad a nivel de fila (RLS): imprescindible porque la clave "anon" es pública.
alter table public.entries enable row level security;

drop policy if exists "ver mis filas" on public.entries;
drop policy if exists "crear mis filas" on public.entries;
drop policy if exists "editar mis filas" on public.entries;
drop policy if exists "borrar mis filas" on public.entries;

create policy "ver mis filas"    on public.entries for select to authenticated using (user_id = auth.uid());
create policy "crear mis filas"  on public.entries for insert to authenticated with check (user_id = auth.uid());
create policy "editar mis filas" on public.entries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "borrar mis filas" on public.entries for delete to authenticated using (user_id = auth.uid());
