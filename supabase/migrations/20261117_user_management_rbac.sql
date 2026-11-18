-- VISION AI v1.9.5 · Auditoría de la administración de usuarios.
-- Ejecutar una sola vez DESPUÉS de las migraciones anteriores.
-- La creación y modificación de membresías ocurre exclusivamente en Edge Function
-- autenticada; el cliente navegador no recibe privilegios de escritura aquí.
create table if not exists public.vision_ai_user_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  target_id uuid not null references auth.users(id),
  action text not null check (action in ('created','role_changed')),
  old_role text check (old_role in ('administrador','operador','supervisor','auditor')),
  new_role text not null check (new_role in ('administrador','operador','supervisor','auditor')),
  created_at timestamptz not null default now()
);
alter table public.vision_ai_user_audit enable row level security;
revoke all on public.vision_ai_user_audit from public, anon, authenticated;
grant select on public.vision_ai_user_audit to authenticated;
grant select, insert, delete on public.vision_ai_user_audit to service_role;

drop policy if exists vision_ai_user_audit_admin_select on public.vision_ai_user_audit;
create policy vision_ai_user_audit_admin_select on public.vision_ai_user_audit
for select to authenticated using (
  exists (select 1 from public.vision_ai_members m
          where m.user_id = (select auth.uid()) and m.role = 'administrador')
);

-- La membresía se consulta individualmente desde AuthProvider, o desde el
-- servidor con credenciales secretas (que NUNCA pasan a React).
revoke insert, update, delete on public.vision_ai_members from authenticated, anon;
grant select on public.vision_ai_members to authenticated;
-- La opción "no exponer tablas automáticamente" exige grants de servidor explícitos.
grant select, insert, update, delete on public.vision_ai_members to service_role;
grant usage, select on sequence public.vision_ai_user_audit_id_seq to service_role;

-- RBAC servidor: operador puede registrar eventos YOLO propios, pero NO
-- reconocer incidentes ni atribuirse un cierre por revisión humana.
create or replace function public.vision_ai_guard_operator_incident_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare actor_role text;
begin
  if current_user = 'authenticated' then
    select m.role into actor_role from public.vision_ai_members m where m.user_id = (select auth.uid());
    if actor_role = 'operador' and (
      new.acknowledged_at is distinct from old.acknowledged_at
      or new.acknowledged_by is distinct from old.acknowledged_by
      or new.status = 'acknowledged'
      or new.closure_type = 'human-review'
    ) then
      raise exception 'Operador sin permiso de reconocimiento o cierre manual';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists vision_ai_guard_operator_incident on public.vision_incidents;
create trigger vision_ai_guard_operator_incident
before update on public.vision_incidents for each row
execute function public.vision_ai_guard_operator_incident_update();

-- La auditoría creada desde navegador se limita a las acciones del actor.
drop policy if exists vision_incident_audit_owner_insert on public.vision_incident_audit;
create policy vision_incident_audit_owner_insert on public.vision_incident_audit
for insert to authenticated with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.vision_incidents i
    where i.id = incident_id and i.owner_id = (select auth.uid()))
  and exists (select 1 from public.vision_ai_members m
    where m.user_id = (select auth.uid()) and (
      m.role in ('administrador','supervisor')
      or (m.role = 'operador' and action in ('opened','closed','tracking-lost','escalated'))
    ))
);

-- No permitir que un operador cree directamente incidentes 'reconocidos'
-- o cierres manuales desde una sesión manipulada. Supabase sigue sin poder
-- demostrar que un resultado YOLO provenga de una cámara genuina.
drop policy if exists vision_incidents_owner_insert on public.vision_incidents;
create policy vision_incidents_owner_insert on public.vision_incidents
for insert to authenticated with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.vision_ai_members m
    where m.user_id = (select auth.uid()) and (
      m.role in ('administrador','supervisor')
      or (m.role = 'operador'
          and status <> 'acknowledged'
          and acknowledged_at is null and acknowledged_by is null
          and closure_type is distinct from 'human-review')
    ))
);
