/**
 * VISION AI · Reporte diario protegido mediante @supabase/server.
 * Solo servicios con la clave secreta de Supabase pueden ejecutar esta función.
 * La clave va en `apikey` desde Supabase Vault/Cron, NUNCA en el navegador.
 * El ID que devuelve Resend acredita aceptación por API, no entrega a bandeja.
 */
import { withSupabase } from 'npm:@supabase/server@1';
import { htmlReport, countDailySeverities, type DailySnapshot, type SummaryIncident } from '../_shared/dailySummary.ts';

const env = (key: string) => Deno.env.get(key)?.trim() ?? '';
const reply = (payload: unknown, status = 200) => Response.json(payload, { status });
function previousDayInLima(now: Date): string {
  // Lima = UTC−05 durante todo el año. Cron se ejecuta a las 05:05 UTC.
  const local = new Date(now.getTime() - 5 * 3_600_000);
  local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}
function limaRange(day: string) {
  const start = new Date(`${day}T05:00:00.000Z`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (request, ctx) => {
    if (request.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
    const apiKey = env('RESEND_API_KEY');
    const from = env('REPORT_FROM');
    const to = env('REPORT_TO');
    if (!apiKey || !from || !to) return reply({ error: 'Configuración Resend incompleta' }, 503);

    const day = previousDayInLima(new Date());
    const jobKey = `vision-daily-${day}-admin`;
    let claimed = false;
    try {
      const { data: claim, error: claimError } = await ctx.supabaseAdmin.rpc('vision_claim_report_job', {
        p_key: jobKey, p_day: day, p_destination: to,
      });
      if (claimError) throw new Error(`No se pudo reclamar el trabajo: ${claimError.message}`);
      if (claim !== true) return reply({ ok: true, job: jobKey, alreadyClaimed: true });
      claimed = true;

      // Reutilizar snapshot archivado preserva el mismo contenido con la misma
      // Idempotency-Key en los reintentos de Resend (ventana limitada a 24 h).
      const { data: existing, error: readError } = await ctx.supabaseAdmin.from('vision_reports')
        .select('content').eq('key', `daily:${day}`).maybeSingle();
      if (readError) throw new Error(`No se pudo consultar reporte: ${readError.message}`);
      let content: DailySnapshot;
      if (existing?.content) {
        content = existing.content as DailySnapshot;
      } else {
        const { start, end } = limaRange(day);
        const { data, error: eventsError } = await ctx.supabaseAdmin.from('vision_incidents')
          .select('id,camera_id,track_id,zone_id,rule_id,severity,status,confidence,opened_at,acknowledged_at,closed_at,duration_sec')
          .gte('opened_at', start).lt('opened_at', end).order('opened_at', { ascending: true }).limit(10000);
        if (eventsError) throw new Error(`No se pudieron consultar incidentes: ${eventsError.message}`);
        const incidents = (data ?? []) as SummaryIncident[];
        if (incidents.length >= 10000) throw new Error('Más de 9999 incidentes diarios; requiere paginación.');
        const counts = countDailySeverities(incidents);
        const snapshot: DailySnapshot = { day, timezone: 'America/Lima', start, end,
          total: incidents.length, ...counts, incidents };
        const { error: archiveError } = await ctx.supabaseAdmin.from('vision_reports').upsert({
          key: `daily:${day}`, type: 'daily', period_start: start, period_end: end, content: snapshot,
        }, { onConflict: 'key', ignoreDuplicates: true });
        if (archiveError) throw new Error(`No se archivó el reporte: ${archiveError.message}`);
        const { data: archived, error: readArchivedError } = await ctx.supabaseAdmin.from('vision_reports')
          .select('content').eq('key', `daily:${day}`).single();
        if (readArchivedError) throw new Error(`Reporte archivado inaccesible: ${readArchivedError.message}`);
        content = archived.content as DailySnapshot;
      }

      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': jobKey },
        body: JSON.stringify({ from, to: [to], subject: `VISION AI · Reporte ${day}`, html: htmlReport(content) }),
      });
      const response: { id?: string } = await sent.json().catch(() => ({}));
      if (!sent.ok || !response.id) throw new Error(`Resend rechazó la solicitud HTTP ${sent.status}`);
      const { error: updateError } = await ctx.supabaseAdmin.from('vision_report_jobs').update({
        status: 'sent', provider_message_id: response.id, provider_accepted_at: new Date().toISOString(), last_error: null,
      }).eq('key', jobKey);
      if (updateError) throw new Error(`Correo aceptado, pero no se registró: ${updateError.message}`);
      return reply({ ok: true, job: jobKey, acceptedByProvider: true, total: content.total });
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Error inesperado';
      console.error('vision-daily-report:', details); // No incluye claves privadas ni payload completo.
      if (claimed) {
        const { error: jobError } = await ctx.supabaseAdmin.from('vision_report_jobs')
          .update({ status: 'failed', last_error: details.slice(0, 160) }).eq('key', jobKey);
        if (jobError) console.error('No se pudo registrar fallo de trabajo');
      }
      return reply({ error: 'No se completó la tarea; consultar historial remoto', job: jobKey }, 502);
    }
  }),
};
