-- Ejecutar manualmente DESPUÉS de validar Supabase Auth/RLS y Resend.
-- En Supabase Vault configurar:
-- vision_ai_job_url = https://PROJECT.supabase.co/functions/v1/vision-daily-report
-- vision_ai_job_key = sb_secret_... (API key secreta de Supabase; NUNCA publishable)
-- El wrapper @supabase/server valida el header apikey.
-- 05:05 UTC = 00:05 Lima; dos reintentos 05:35 y 06:05 UTC.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'vision-ai-daily-report-lima',
  '5,35 5 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'vision_ai_job_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'vision_ai_job_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
select cron.schedule(
  'vision-ai-daily-report-lima-retry',
  '5 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'vision_ai_job_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'vision_ai_job_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
-- Para desactivar:
-- select cron.unschedule('vision-ai-daily-report-lima');
-- select cron.unschedule('vision-ai-daily-report-lima-retry');
