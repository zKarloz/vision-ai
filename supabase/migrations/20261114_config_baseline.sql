-- VISION AI — Esquema base para una futura conexión a Supabase.
-- IMPORTANTE: todavía no se utiliza desde el frontend; requiere Auth y roles.
-- Ejecutar solo en un proyecto Supabase propio. No incluir nunca service_role en Vite.

create table if not exists public.vision_ai_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('administrador','operador','supervisor','auditor')),
  created_at timestamptz not null default now()
);

create table if not exists public.vision_ai_config_versions (
  id bigint generated always as identity primary key,
  payload jsonb not null,
  checksum text not null,
  author uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.vision_ai_config_audit (
  id bigint generated always as identity primary key,
  version_id bigint not null references public.vision_ai_config_versions(id),
  actor uuid not null references auth.users(id),
  action text not null default 'publish',
  created_at timestamptz not null default now()
);

alter table public.vision_ai_members enable row level security;
alter table public.vision_ai_config_versions enable row level security;
alter table public.vision_ai_config_audit enable row level security;

-- Cada miembro consulta su propio rol. Los administradores iniciales se asignan
-- manualmente desde la consola SQL de confianza (nunca desde el cliente público).
create policy "vision_ai_member_self_read" on public.vision_ai_members
for select to authenticated using (user_id = (select auth.uid()));

create policy "vision_ai_versions_read" on public.vision_ai_config_versions
for select to authenticated using (
  exists(select 1 from public.vision_ai_members where user_id = (select auth.uid()))
);
create policy "vision_ai_versions_admin_insert" on public.vision_ai_config_versions
for insert to authenticated with check (
  author = (select auth.uid()) and
  exists(select 1 from public.vision_ai_members where user_id = (select auth.uid()) and role = 'administrador')
);
create policy "vision_ai_audit_read" on public.vision_ai_config_audit
for select to authenticated using (
  exists(select 1 from public.vision_ai_members where user_id = (select auth.uid()))
);

-- Auditoría generada por la base, no editable por el cliente.
create or replace function public.vision_ai_audit_config_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.vision_ai_config_audit(version_id, actor, action)
  values (new.id, new.author, 'publish');
  return new;
end;
$$;
drop trigger if exists vision_ai_config_published on public.vision_ai_config_versions;
create trigger vision_ai_config_published after insert on public.vision_ai_config_versions
for each row execute function public.vision_ai_audit_config_publish();

-- No se habilitan UPDATE/DELETE para versiones ni escritura cliente en auditoría.
-- Pendiente: API transaccional, control de concurrencia, autenticación y sincronización.
