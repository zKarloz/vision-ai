-- VISION AI v1.9.6 | Historial multiusuario compartido con Supabase como fuente de verdad.
-- Ejecutar DESPUÉS de 20261118_user_password_recovery.sql.
-- NO borrar ni reescribir los incidentes remotos existentes; backfill de reportes idempotente.
-- Las decisiones humanas se realizan exclusivamente mediante RPC con auth.uid + membresía.

-- 1. Una carga tardía del sensor original jamás puede deshacer una decisión humana
--    ni volver a abrir un incidente cerrado. Esta protección ocurre ANTES del guard
--    de operador de v1.9.5, para aceptar también reintentos offline obsoletos.
create or replace function public.vision_ai_preserve_shared_decisions()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status = 'closed' then
    -- Los cierres son definitivos incluso frente a un upsert del navegador de origen.
    return old;
  end if;
  if old.status = 'acknowledged' and new.status in ('open', 'escalated') then
    new.status := 'acknowledged';
  end if;
  if old.acknowledged_at is not null then
    new.acknowledged_at := old.acknowledged_at;
    new.acknowledged_by := old.acknowledged_by;
  end if;
  -- No se permite reasignar procedencia ni fechas de apertura en un upsert.
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
     or new.installation_id is distinct from old.installation_id
     or new.local_id is distinct from old.local_id or new.opened_at is distinct from old.opened_at then
    raise exception 'No se permite cambiar la identidad de un incidente';
  end if;
  return new;
end;
$$;
drop trigger if exists vision_ai_00_preserve_shared_decisions on public.vision_incidents;
create trigger vision_ai_00_preserve_shared_decisions
before update on public.vision_incidents for each row
execute function public.vision_ai_preserve_shared_decisions();

-- El guard anterior de v1.9.5 rechazaba cualquier fila en estado reconocido,
-- incluso cuando el operador reenviaba un snapshot igual. Comparar transiciones
-- verdaderas mantiene RBAC y obliga al RPC para TODOS los roles (incluido el propietario).
create or replace function public.vision_ai_guard_operator_incident_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare actor_role text;
begin
  if current_user = 'authenticated' then
    select m.role into actor_role from public.vision_ai_members m where m.user_id = (select auth.uid());
    if actor_role is null or (
      new.acknowledged_at is distinct from old.acknowledged_at
      or new.acknowledged_by is distinct from old.acknowledged_by
      or (new.status = 'acknowledged' and old.status <> 'acknowledged')
      or (new.closure_type = 'human-review' and new.closure_type is distinct from old.closure_type)
    ) then
      raise exception 'Las decisiones humanas requieren una operación RPC autorizada';
    end if;
  end if;
  return new;
end;
$$;

-- 2. Reconocimiento y cierre cruzado de cuenta. No se expone service_role al cliente.
create or replace function public.vision_act_on_incident(
  p_incident_id text, p_action text, p_note text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_email text;
  v_incident public.vision_incidents%rowtype;
  v_at timestamptz := now();
  v_note text := btrim(coalesce(p_note,''));
begin
  if v_actor is null then raise exception 'Sesión no verificada' using errcode='42501'; end if;
  select m.role into v_role from public.vision_ai_members m where m.user_id=v_actor;
  if v_role is distinct from 'administrador' and v_role is distinct from 'supervisor' then
    raise exception 'No autorizado para reconocer o cerrar incidentes' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('acknowledge','close') then
    raise exception 'Acción no permitida' using errcode='22023';
  end if;
  select * into v_incident from public.vision_incidents where id=p_incident_id for update;
  if not found then raise exception 'Incidente inexistente' using errcode='P0002'; end if;
  if v_at < v_incident.opened_at then raise exception 'Fecha de incidente inválida' using errcode='22023'; end if;
  select u.email into v_email from auth.users u where u.id=v_actor;
  v_email := coalesce(v_email, v_actor::text);
  if p_action='acknowledge' then
    if v_incident.status not in ('open','escalated') then
      raise exception 'El incidente ya fue reconocido o cerrado' using errcode='22023';
    end if;
    update public.vision_incidents
       set status='acknowledged', acknowledged_at=v_at, acknowledged_by=v_email, updated_at=v_at
     where id=p_incident_id;
    insert into public.vision_incident_audit(id,incident_id,owner_id,action,at,actor,note)
      values(p_incident_id || ':ACTION:' || gen_random_uuid()::text,
       p_incident_id,v_incident.owner_id,'acknowledged',v_at,v_email,null);
  else
    if length(v_note) < 10 or length(v_note) > 500 then
      raise exception 'Se requiere una nota de revisión de 10 a 500 caracteres' using errcode='22023';
    end if;
    if v_incident.status <> 'acknowledged' then
      raise exception 'Reconoce primero el incidente antes de cerrarlo' using errcode='22023';
    end if;
    update public.vision_incidents
       set status='closed', closed_at=v_at, closure_type='human-review', requires_review=false,
           duration_sec=greatest(0,extract(epoch from (v_at-opened_at))),updated_at=v_at
     where id=p_incident_id;
    insert into public.vision_incident_audit(id,incident_id,owner_id,action,at,actor,note)
      values(p_incident_id || ':ACTION:' || gen_random_uuid()::text,
       p_incident_id,v_incident.owner_id,'closed-by-supervisor',v_at,v_email,v_note);
  end if;
end;
$$;
revoke all on function public.vision_act_on_incident(text,text,text) from public,anon,authenticated;
grant execute on function public.vision_act_on_incident(text,text,text) to authenticated;

-- 3. Auditoría global de reportes (incluye los emitidos por Cron).
create table if not exists public.vision_report_audit (
  id bigint generated always as identity primary key,
  report_key text not null references public.vision_reports(key),
  actor_id uuid references auth.users(id),
  actor text not null,
  action text not null check (action in ('generated','exported')),
  details text not null,
  at timestamptz not null default now()
);
create index if not exists vision_report_audit_at_idx on public.vision_report_audit(at desc);
alter table public.vision_report_audit enable row level security;
revoke all on public.vision_report_audit from public,anon,authenticated;
grant select on public.vision_report_audit to authenticated;
grant select,insert on public.vision_report_audit to service_role;
grant usage,select on sequence public.vision_report_audit_id_seq to service_role;
-- Refuerzo RBAC: la lectura remota de reportes se restringe realmente a
-- administrador/auditor; no basta con ocultar la ruta de Reportes en React.
drop policy if exists vision_reports_member_read on public.vision_reports;
create policy vision_reports_member_read on public.vision_reports
for select to authenticated using (
  exists(select 1 from public.vision_ai_members m where m.user_id=(select auth.uid())
    and m.role in ('administrador','auditor'))
);
drop policy if exists vision_report_audit_member_read on public.vision_report_audit;
create policy vision_report_audit_member_read on public.vision_report_audit
for select to authenticated using (
  exists(select 1 from public.vision_ai_members m where m.user_id=(select auth.uid())
    and m.role in ('administrador','auditor'))
);

create or replace function public.vision_ai_audit_report_creation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_email text;
begin
  select u.email into v_email from auth.users u where u.id=v_actor;
  insert into public.vision_report_audit(report_key,actor_id,actor,action,details)
  values(new.key,v_actor,coalesce(v_email,'Sistema (Cron)'), 'generated',
    case when new.type='daily' then 'Archivo diario compartido' else 'Informe de incidente archivado' end);
  return new;
end;
$$;
drop trigger if exists vision_ai_report_created on public.vision_reports;
create trigger vision_ai_report_created after insert on public.vision_reports
for each row execute function public.vision_ai_audit_report_creation();

-- Los reportes archivados ANTES de crear esta auditoría se identifican
-- como históricos, sin inventar un actor que desconocemos.
insert into public.vision_report_audit(report_key,actor,action,details,at)
select r.key,'Sistema (histórico)','generated','Informe existente antes de la auditoría común',r.generated_at
from public.vision_reports r
where not exists (select 1 from public.vision_report_audit a
  where a.report_key=r.key and a.action='generated');

-- 4. Cada cierre genera su informe compartido. Los cierres ya existentes
--    también se archivan sin duplicar reportes ni reportes diarios de Cron.
create or replace function public.vision_ai_archive_closed_incident()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='closed' and new.closed_at is not null then
    insert into public.vision_reports(key,type,period_start,period_end,content)
    values('incident:' || new.id, 'incident',new.opened_at,new.closed_at,
      jsonb_build_object('incident',to_jsonb(new)))
    on conflict (key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists vision_ai_incident_report on public.vision_incidents;
create trigger vision_ai_incident_report after insert or update on public.vision_incidents
for each row execute function public.vision_ai_archive_closed_incident();
insert into public.vision_reports(key,type,period_start,period_end,content)
select 'incident:' || i.id,'incident',i.opened_at,i.closed_at,
  jsonb_build_object('incident',to_jsonb(i))
from public.vision_incidents i
where i.status='closed' and i.closed_at is not null
on conflict (key) do nothing;

-- 5. Resúmenes diarios reproducibles con los incidentes compartidos de TODOS los usuarios.
--    Se conserva el snapshot de Cron y se evita sobrescribir un informe archivado.
create or replace function public.vision_generate_shared_daily_report(p_day date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_start timestamptz;
  v_end timestamptz;
  v_items jsonb;
  v_rows int;
begin
  select m.role into v_role from public.vision_ai_members m where m.user_id=v_actor;
  if v_actor is null or v_role is distinct from 'administrador' then
    raise exception 'Solo el administrador puede generar reportes' using errcode='42501';
  end if;
  if p_day is null or p_day > ((now() at time zone 'America/Lima')::date) then
    raise exception 'Día inválido o futuro' using errcode='22023';
  end if;
  v_start := (p_day::timestamp + interval '5 hours') at time zone 'UTC';
  v_end := v_start + interval '1 day';
  select coalesce(jsonb_agg(to_jsonb(i) order by i.opened_at), '[]'::jsonb)
    into v_items from public.vision_incidents i
    where i.opened_at >= v_start and i.opened_at < v_end;
  insert into public.vision_reports(key,type,period_start,period_end,content)
  values('daily:' || p_day::text,'daily',v_start,v_end,
    jsonb_build_object('day',p_day::text,'timezone','America/Lima',
      'start',v_start,'end',v_end,'total',jsonb_array_length(v_items),
      'incidents',v_items))
  on conflict (key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function public.vision_generate_shared_daily_report(date) from public,anon,authenticated;
grant execute on function public.vision_generate_shared_daily_report(date) to authenticated;

-- 6. Una descarga realizada por cualquier miembro deja una evidencia auditable.
create or replace function public.vision_record_shared_report_export(p_report_key text,p_format text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_email text;
begin
  if v_actor is null or not exists(select 1 from public.vision_ai_members m where m.user_id=v_actor and m.role in ('administrador','auditor')) then
    raise exception 'Usuario no autorizado' using errcode='42501';
  end if;
  if p_format is null or p_format not in ('PDF','CSV','JSON') then raise exception 'Formato incorrecto' using errcode='22023'; end if;
  if not exists(select 1 from public.vision_reports r where r.key=p_report_key) then
    raise exception 'Informe inexistente' using errcode='P0002';
  end if;
  select u.email into v_email from auth.users u where u.id=v_actor;
  insert into public.vision_report_audit(report_key,actor_id,actor,action,details)
  values(p_report_key,v_actor,coalesce(v_email,v_actor::text),'exported','Descarga '||p_format);
end;
$$;
revoke all on function public.vision_record_shared_report_export(text,text) from public,anon,authenticated;
grant execute on function public.vision_record_shared_report_export(text,text) to authenticated;

-- Informe de instalación: ya existentes = vision_incidents / vision_incident_audit.
-- Nunca compartir el localStorage ni insertar incidentes sin origen YOLO.
