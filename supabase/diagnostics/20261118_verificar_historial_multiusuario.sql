-- VISION AI v2.0 | Bloque A | Diagnóstico multiusuario, SOLO LECTURA.
-- Ejecutar cada consulta por separado en Supabase SQL Editor del proyecto correcto.
-- No ejecuta UPDATE/INSERT/DELETE, no cambia RLS ni invoca las RPC de escritura.
-- IMPORTANTE: SQL Editor suele ejecutarse con permisos elevados; estas consultas
-- inspeccionan la configuración, pero NO demuestran los permisos de usuarios reales.
-- No compartir JWT, claves, direcciones de correo ni UUID de usuarios en capturas.

-- A0.1. Presencia de funciones y tablas. Una firma NULL requiere revisar migraciones
-- aplicadas antes de probar la interfaz; NO reaplicarlas automáticamente.
select
  to_regprocedure('public.vision_act_on_incident(text,text,text)')::text as rpc_reconocer_cerrar,
  to_regprocedure('public.vision_generate_shared_daily_report(date)')::text as rpc_reporte_diario,
  to_regprocedure('public.vision_record_shared_report_export(text,text)')::text as rpc_auditar_descarga,
  to_regclass('public.vision_incidents')::text as tabla_incidentes,
  to_regclass('public.vision_incident_audit')::text as tabla_auditoria_incidentes,
  to_regclass('public.vision_reports')::text as tabla_reportes,
  to_regclass('public.vision_report_audit')::text as tabla_auditoria_reportes;

-- A0.2. RLS por tabla, incluyendo FORCE RLS y políticas efectivamente existentes.
-- Una política adicional permisiva puede ampliar accesos: revisar TODAS las filas.
select c.relname as tabla, c.relrowsecurity as rls_activo,
  c.relforcerowsecurity as rls_forzado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'vision_ai_members', 'vision_incidents', 'vision_incident_audit',
  'vision_reports', 'vision_report_audit', 'vision_report_jobs')
order by c.relname;

select tablename as tabla, policyname as politica, permissive as tipo,
  roles as roles_postgres, cmd as operacion, qual as condicion_lectura,
  with_check as condicion_escritura
from pg_policies
where schemaname = 'public' and tablename in (
  'vision_ai_members', 'vision_incidents', 'vision_incident_audit',
  'vision_reports', 'vision_report_audit', 'vision_report_jobs')
order by tablename, cmd, policyname;

-- A0.3. Privilegios de tablas concedidos a los roles de PostgREST.
-- Se esperan lecturas autenticadas; UPDATE de incidentes propios es usado por el
-- sensor, pero reconocer/cerrar por revisión humana debe pasar por la RPC.
select t.tabla,
  has_table_privilege('anon', 'public.' || t.tabla, 'SELECT') as anon_lectura,
  has_table_privilege('authenticated', 'public.' || t.tabla, 'SELECT') as autenticado_lectura,
  has_table_privilege('authenticated', 'public.' || t.tabla, 'INSERT') as autenticado_insercion,
  has_table_privilege('authenticated', 'public.' || t.tabla, 'UPDATE') as autenticado_actualizacion,
  has_table_privilege('authenticated', 'public.' || t.tabla, 'DELETE') as autenticado_borrado
from (values ('vision_incidents'), ('vision_incident_audit'), ('vision_reports'),
  ('vision_report_audit'), ('vision_ai_members')) as t(tabla)
order by t.tabla;

-- A0.4. Privilegios de las RPC: anon debe carecer de EXECUTE.
-- NULL implica función ausente y exige detener la prueba antes de mutar datos.
with f as (
  select to_regprocedure('public.vision_act_on_incident(text,text,text)') as firma
)
select firma::text as funcion,
  has_function_privilege('anon', firma::oid, 'EXECUTE') as anon_puede_ejecutar,
  has_function_privilege('authenticated', firma::oid, 'EXECUTE') as autenticado_puede_ejecutar
from f;

-- A0.5. Triggers necesarios para prevenir regresiones y archivar cierres.
select c.relname as tabla, t.tgname as trigger,
  t.tgenabled as habilitado, p.proname as funcion
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('vision_incidents', 'vision_reports')
order by tabla, trigger;

-- A0.6. Cobertura de las cuatro clases de miembros, sin revelar identidades.
select role, count(*) as cuentas
from public.vision_ai_members
 group by role order by role;

-- A0.7. Estado real de la persistencia compartida; un cero NO prueba RLS correcto.
select count(*) as total,
  count(*) filter (where status in ('open','escalated')) as pendientes,
  count(*) filter (where status = 'acknowledged') as reconocidos,
  count(*) filter (where status = 'closed') as cerrados,
  count(distinct owner_id) as cuentas_con_incidentes,
  count(distinct installation_id) as instalaciones_con_incidentes
from public.vision_incidents;

select (select count(*) from public.vision_incident_audit) as acciones,
  (select count(*) from public.vision_reports where type = 'incident') as reportes_incidente,
  (select count(*) from public.vision_report_audit) as acciones_reporte;

-- A0.8. Integridad estructural y temporal, sin exponer IDs.
-- La ausencia de reconocimiento en un cierre puramente YOLO es válida.
select
  count(*) filter (where status = 'acknowledged' and acknowledged_at is null) as reconocidos_sin_hora,
  count(*) filter (where status = 'closed' and closed_at is null) as cerrados_sin_hora,
  count(*) filter (where closed_at < opened_at) as cierre_anterior_apertura,
  count(*) filter (where acknowledged_at < opened_at) as reconocimiento_anterior_apertura,
  count(*) filter (where duration_sec < 0) as duracion_negativa
from public.vision_incidents;

select count(*) as auditorias_con_propietario_incoherente
from public.vision_incident_audit a
join public.vision_incidents i on i.id = a.incident_id
where a.owner_id is distinct from i.owner_id;

-- A0.9. Idempotencia: una operación humana no debe aparecer duplicada para
-- el mismo incidente. Este contador requiere investigación si resulta > 0.
select
  count(*) filter (where action = 'acknowledged') as incidentes_con_reconocimiento_duplicado,
  count(*) filter (where action = 'closed-by-supervisor') as incidentes_con_cierre_humano_duplicado
from (
  select incident_id, action
  from public.vision_incident_audit
  where action in ('acknowledged','closed-by-supervisor')
  group by incident_id, action
  having count(*) > 1
) duplicados;

-- A0.10. Cada cierre archivado debe producir una clave de informe por incidente.
select count(*) as cierres_sin_reporte_compartido
from public.vision_incidents i
left join public.vision_reports r on r.key = 'incident:' || i.id and r.type = 'incident'
where i.status = 'closed' and i.closed_at is not null and r.key is null;

-- A1. Tras efectuar el flujo entre sesiones, volver a ejecutar A0.7-10 y
-- contrastar el MISMO ID completo desde las tres cuentas en la interfaz.
-- La autorización del Auditor y la concurrencia de Supervisores NO se certifican
-- con SQL Editor elevado: deben comprobarse con JWT de cada rol real.
-- En ausencia de evidencia, NO aplicar ni modificar migraciones/RLS.
