-- VISION AI v1.9.6 — diagnóstico SEGURO, solo lectura.
-- Ejecutar en Supabase > SQL Editor del MISMO proyecto configurado en VITE_SUPABASE_URL.
-- No modificar usuarios ni datos históricos.

-- 1) Debe aparecer una firma para el RPC y una tabla de auditoría.
-- Si alguna columna resulta NULL, no está aplicada íntegramente la migración
-- 20261118_shared_history_multiuser.sql.
select
  to_regprocedure('public.vision_act_on_incident(text,text,text)')::text as rpc_reconocer_cerrar,
  to_regprocedure('public.vision_generate_shared_daily_report(date)')::text as rpc_reporte_diario,
  to_regprocedure('public.vision_record_shared_report_export(text,text)')::text as rpc_auditar_descarga,
  to_regclass('public.vision_report_audit')::text as tabla_auditoria_reportes;

-- 2) Si el número es >0, ya existen incidentes en el servidor.
-- Si sale 0, comprobar sincronización local de la cuenta que ejecutó YOLO.
select count(*) as total,
  count(*) filter (where status in ('open','escalated')) as pendientes,
  count(*) filter (where status = 'acknowledged') as reconocidos,
  count(*) filter (where status = 'closed') as cerrados
from public.vision_incidents;

-- 3) Comprueba que existen miembros con los cuatro roles de prueba.
select role, count(*) as cuentas from public.vision_ai_members group by role order by role;

-- 4) Los permisos y la función se administran en el servidor, no desde React.
-- SI el RPC existe pero la app muestra PGRST202, ejecutar aparte:
-- NOTIFY pgrst, 'reload schema';
