-- VISION AI | Etapa 6 | Estructura REMOTA PREPARATORIA (no aplicada automáticamente).
-- SEGURIDAD: no hay políticas para acceso anon/authenticated. Solo servicios con service_role.
-- El frontend local todavía NO sincroniza incidentes a estas tablas; no habilitar envíos
-- reales hasta implementar autenticación, ingesta y verificación de extremo a extremo.
create table if not exists public.vision_incidents (
  id text primary key,
  camera_id text not null,
  zone_id text not null,
  rule_id text not null,
  source text not null default 'yolo' check (source = 'yolo'),
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null check (status in ('open','acknowledged','escalated','closed')),
  confidence numeric not null check (confidence between 0 and 1),
  opened_at timestamptz not null,
  acknowledged_at timestamptz,
  acknowledged_by text,
  closed_at timestamptz,
  closure_type text,
  duration_sec numeric check (duration_sec >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists vision_incidents_opened_at_idx on public.vision_incidents (opened_at);
alter table public.vision_incidents enable row level security;

create table if not exists public.vision_report_jobs (
  key text primary key,
  day_lima date not null,
  destination text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_error text,
  provider_message_id text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.vision_report_jobs enable row level security;

create table if not exists public.vision_reports (
  key text primary key,
  type text not null check (type in ('daily','incident')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  generated_at timestamptz not null default now(),
  content jsonb not null
);
alter table public.vision_reports enable row level security;

-- Reclamación atómica: dos ejecuciones cron no deben enviar el mismo reporte en paralelo.
-- La API usa service_role y una función con permisos limitados; no permitir acceso público.
create or replace function public.vision_claim_report_job(p_key text, p_day date, p_destination text)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed text;
begin
  insert into public.vision_report_jobs(key, day_lima, destination)
    values (p_key, p_day, p_destination) on conflict (key) do nothing;
  update public.vision_report_jobs
     set status = 'sending', attempts = attempts + 1, last_attempt_at = now(), last_error = null
   where key = p_key and status in ('pending', 'failed', 'sending')
     and attempts < 3
     and (last_attempt_at is null or last_attempt_at < now() - interval '20 minutes')
   returning key into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.vision_claim_report_job(text,date,text) from public, anon, authenticated;
grant execute on function public.vision_claim_report_job(text,date,text) to service_role;
