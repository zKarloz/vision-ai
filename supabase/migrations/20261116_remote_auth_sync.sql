-- VISION AI | Etapa 6 | Sincronización REAL opcional mediante Supabase Auth/RLS.
-- REQUISITOS: aplicar primero 20261114_config_baseline y 20261115_reports_pending.
-- Diseñado para tablas remotas todavía vacías de la etapa 6 preparatoria.
-- Si ya contienen registros, auditar/backfill de owner_id antes de SET NOT NULL.

alter table public.vision_report_jobs add column if not exists provider_accepted_at timestamptz;

alter table public.vision_incidents add column if not exists owner_id uuid references auth.users(id);
alter table public.vision_incidents add column if not exists installation_id uuid;
alter table public.vision_incidents add column if not exists track_id text;
alter table public.vision_incidents add column if not exists requires_review boolean not null default false;
alter table public.vision_incidents add column if not exists local_id text;
alter table public.vision_incidents alter column owner_id set not null;
alter table public.vision_incidents alter column installation_id set not null;
alter table public.vision_incidents alter column local_id set not null;
alter table public.vision_incidents add constraint vision_incidents_id_matches_owner
  check (id = owner_id::text || ':' || installation_id::text || ':' || local_id);
create index if not exists vision_incidents_owner_idx on public.vision_incidents (owner_id, opened_at);

-- Datos de procedencia única; NO se admiten borrados de la auditoría por el cliente.
create table if not exists public.vision_incident_audit (
  id text primary key,
  incident_id text not null references public.vision_incidents(id),
  owner_id uuid not null references auth.users(id),
  action text not null check (action in ('opened','acknowledged','escalated','closed','tracking-lost','closed-by-supervisor')),
  at timestamptz not null,
  actor text not null,
  note text
);
create index if not exists vision_incident_audit_incident_idx on public.vision_incident_audit (incident_id, at);
alter table public.vision_incident_audit enable row level security;

-- La membresía de vision_ai_members es asignada sólo desde SQL Editor / API confiable.
-- Ninguna cuenta nueva recibe rol mediante el navegador.
drop policy if exists vision_incidents_member_read on public.vision_incidents;
create policy vision_incidents_member_read on public.vision_incidents
for select to authenticated using (
  exists (select 1 from public.vision_ai_members m where m.user_id = (select auth.uid()))
);
drop policy if exists vision_incidents_owner_insert on public.vision_incidents;
create policy vision_incidents_owner_insert on public.vision_incidents
for insert to authenticated with check (
  owner_id = (select auth.uid()) and
  exists (select 1 from public.vision_ai_members m where m.user_id = (select auth.uid())
    and m.role in ('administrador','supervisor','operador'))
);
drop policy if exists vision_incidents_owner_update on public.vision_incidents;
create policy vision_incidents_owner_update on public.vision_incidents
for update to authenticated using (
  owner_id = (select auth.uid()) and
  exists (select 1 from public.vision_ai_members m where m.user_id = (select auth.uid())
    and m.role in ('administrador','supervisor','operador'))
) with check (owner_id = (select auth.uid()));

drop policy if exists vision_incident_audit_member_read on public.vision_incident_audit;
create policy vision_incident_audit_member_read on public.vision_incident_audit
for select to authenticated using (
  exists (select 1 from public.vision_ai_members m where m.user_id = (select auth.uid()))
);
drop policy if exists vision_incident_audit_owner_insert on public.vision_incident_audit;
create policy vision_incident_audit_owner_insert on public.vision_incident_audit
for insert to authenticated with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.vision_incidents i
    where i.id = incident_id and i.owner_id = (select auth.uid()))
  and exists (select 1 from public.vision_ai_members m where m.user_id = (select auth.uid())
    and m.role in ('administrador','supervisor','operador'))
);

-- Solo la cuenta administradora puede conocer destinos y resultados de envío.
drop policy if exists vision_report_jobs_admin_read on public.vision_report_jobs;
create policy vision_report_jobs_admin_read on public.vision_report_jobs
for select to authenticated using (
  exists (select 1 from public.vision_ai_members m where m.user_id = (select auth.uid()) and m.role = 'administrador')
);
drop policy if exists vision_reports_member_read on public.vision_reports;
create policy vision_reports_member_read on public.vision_reports
for select to authenticated using (
  exists (select 1 from public.vision_ai_members m where m.user_id = (select auth.uid()))
);

-- Declaración explícita de permisos. RLS sigue comprobando fila + rol.
revoke all on public.vision_incidents, public.vision_incident_audit,
  public.vision_report_jobs, public.vision_reports from anon;
revoke all on public.vision_incidents, public.vision_incident_audit,
  public.vision_report_jobs, public.vision_reports from authenticated;
grant select, insert, update on public.vision_incidents to authenticated;
grant select, insert on public.vision_incident_audit to authenticated;
grant select on public.vision_report_jobs, public.vision_reports to authenticated;

-- No UPDATE/DELETE cliente sobre audit, report jobs ni reportes.
