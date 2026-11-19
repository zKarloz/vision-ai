-- VISION AI v2.0 · Bloques B y C · SOLO LECTURA (19/11/2026).
-- Ejecutar cada SELECT por separado en Supabase SQL Editor; no modificar datos ni programaciones.
-- SQL Editor usa privilegios elevados: los resultados no prueban RLS bajo JWT.
-- No enviar capturas con correos, secretos, comandos Cron, identificadores personales ni tokens.

-- B.1 · Cobertura exacta. El resultado previo del usuario fue 67 cerrados,
-- 65 informes de incidente y 0 cierres SIN informe; las cantidades pueden
-- diferir por cierres sin closed_at. Esta consulta lo determina sin conjeturas.
select
  count(*) filter (where i.status = 'closed') as incidentes_cerrados,
  count(*) filter (where i.status = 'closed' and i.closed_at is null) as cerrados_sin_fecha,
  count(*) filter (where i.status = 'closed' and i.closed_at is not null) as cierres_validos_para_trigger,
  count(*) filter (where i.status = 'closed' and i.closed_at is not null and r.key is null) as cierres_validos_sin_reporte,
  (select count(*) from public.vision_reports where type = 'incident') as informes_incidente_total
from public.vision_incidents i
left join public.vision_reports r on r.key = 'incident:' || i.id and r.type = 'incident';

-- B.2 · Reportes sin incidente asociado o con snapshot incompleto.
-- El reporte por incidente es un documento JSONB compartido, no un PDF/CSV persistido.
select
  count(*) filter (where i.id is null) as informes_sin_incidente,
  count(*) filter (where jsonb_typeof(r.content -> 'incident') is distinct from 'object') as informes_sin_objeto_incidente,
  count(*) filter (where r.content -> 'incident' ->> 'id' is distinct from i.id) as informes_con_id_snapshot_incoherente,
  count(*) filter (where r.content -> 'incident' ->> 'status' is distinct from 'closed') as informes_con_snapshot_no_cerrado,
  count(*) filter (where i.status = 'closed' and r.period_end is distinct from i.closed_at) as informes_con_fecha_distinta
from public.vision_reports r
left join public.vision_incidents i on r.key = 'incident:' || i.id
where r.type = 'incident';

-- B.3 · Cada informe generado debe tener al menos una auditoría de creación,
-- excepto si hay una migración aún pendiente o una corrupción histórica.
select
  count(*) as informes_totales,
  count(*) filter (where not exists (
    select 1 from public.vision_report_audit a
    where a.report_key = r.key and a.action = 'generated'
  )) as informes_sin_auditoria_generacion
from public.vision_reports r;

-- B.4 · Auditar duplicados de generación para un mismo informe.
select count(*) as reportes_con_auditoria_generacion_duplicada
from (
  select report_key from public.vision_report_audit
  where action = 'generated' group by report_key having count(*) > 1
) duplicados;

-- B.5 · Comprobar que solo el envío diario usa la cola existente.
-- Tener informes de incidente NO demuestra que exista un trabajo por incidente.
select
  count(*) as trabajos_totales,
  count(*) filter (where key like 'vision-daily-%') as trabajos_diarios,
  count(*) filter (where key like 'incident:%') as trabajos_incidente
from public.vision_report_jobs;

-- C.1 · Horarios PROGRAMADOS en el servidor, sin exponer la URL ni el header
-- secreto incluidos en cron.command. El SQL del repositorio propone 05:05,
-- 05:35 y 06:05 UTC (00:05, 00:35 y 01:05 en Lima).
select jobname, schedule, active
from cron.job
where jobname like 'vision-ai-daily-report%'
order by jobname;

-- C.2 · Ejecuciones INICIADAS POR Cron en últimos 14 días.
-- "succeeded" indica que finalizó el SQL de pg_net, no que Resend aceptó
-- el correo o que el destinatario lo recibió.
select j.jobname, d.status, count(*) as ejecuciones,
  min(d.start_time) as primera_ejecucion,
  max(d.start_time) as ultima_ejecucion
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname like 'vision-ai-daily-report%'
  and d.start_time >= now() - interval '14 days'
group by j.jobname, d.status
order by j.jobname, d.status;

-- C.3 · Estados de la cola, sin mostrar direcciones de destinatarios.
select status, count(*) as trabajos,
  sum(attempts) as intentos_totales,
  count(*) filter (where provider_accepted_at is not null) as aceptados_por_resend,
  max(last_attempt_at) as ultimo_intento
from public.vision_report_jobs
group by status
order by status;

-- C.4 · Últimos trabajos en detalle no sensible: acceptance_id y la columna
-- delivered_at NO son prueba de entrega a la bandeja. Revisar Resend por separado.
select day_lima, status, attempts, created_at,
  last_attempt_at, (provider_message_id is not null) as hay_id_resend,
  provider_accepted_at, (last_error is not null) as hubo_error
from public.vision_report_jobs
order by created_at desc
limit 14;

-- C.5 · Cobertura de resúmenes diarios en Supabase (sin mostrar incidentes).
select type,
  count(*) as informes,
  max(generated_at) as ultimo_informe
from public.vision_reports
group by type order by type;

-- C.6 · Integridad de clave diaria: reportes y trabajos solo deben tener una
-- fila por día/clave gracias a sus PK. Una misma fecha puede tener varios
-- trabajos si se creó manualmente una clave distinta: revisarlo.
select count(*) as dias_con_mas_de_un_trabajo
from (
  select day_lima from public.vision_report_jobs
  where key like 'vision-daily-%'
  group by day_lima having count(*) > 1
) repeticiones;

-- C.7 · Un trabajo con estado "sent" debe tener confirmación de aceptación
-- del proveedor (esto NO confirma entrega en Inbox).
select count(*) as enviados_sin_id_o_aceptacion
from public.vision_report_jobs
where status = 'sent'
  and (provider_message_id is null or provider_accepted_at is null);

-- Después de los SELECT: comprobar en Supabase Edge Functions logs y en el
-- panel de Resend el ID del correo del día. No ejecutar net.http_post manual
-- ni reprogramar jobs hasta confirmar la evidencia automática.
