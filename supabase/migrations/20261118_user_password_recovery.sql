-- VISION AI v1.9.5 · Registrar recuperaciones administrativas de contraseña.
-- Ejecutar DESPUÉS de 20261117_user_management_rbac.sql.
-- No modifica cuentas ni contraseñas; amplía el tipo de auditoría permitido.
ALTER TABLE public.vision_ai_user_audit
  DROP CONSTRAINT IF EXISTS vision_ai_user_audit_action_check;
ALTER TABLE public.vision_ai_user_audit
  ADD CONSTRAINT vision_ai_user_audit_action_check
  CHECK (action IN ('created', 'role_changed', 'password_reset'));
