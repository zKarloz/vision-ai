/**
 * VISION AI · Representación segura del correo diario (sin acceso a Supabase ni Resend).
 *
 * La RPC administrativa vision_generate_shared_daily_report(date) archiva un
 * snapshot SIN critical/high; la Edge Function también puede archivarlo CON ellos.
 * Para evitar cifras vacías o desactualizadas, se recalculan desde los incidentes
 * almacenados. Ningún dato HTML se inserta sin escapar.
 */
export interface SummaryIncident {
  id: string;
  camera_id: string;
  track_id: string | null;
  zone_id: string;
  rule_id: string;
  severity: string;
  status: string;
  confidence: number;
  opened_at: string;
  acknowledged_at: string | null;
  closed_at: string | null;
  duration_sec: number | null;
}

export interface DailySnapshot {
  day: string;
  timezone: string;
  start: string;
  end: string;
  total: number;
  // Son opcionales porque los snapshots anteriores creados por RPC no los incluyen.
  critical?: number;
  high?: number;
  incidents: SummaryIncident[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Conteos derivados del snapshot, no de agregados opcionales o antiguos. */
export function countDailySeverities(incidents: readonly Pick<SummaryIncident, 'severity'>[]): { critical: number; high: number } {
  return {
    critical: incidents.filter(incident => incident.severity === 'critical').length,
    high: incidents.filter(incident => incident.severity === 'high').length,
  };
}

/** Produce el cuerpo HTML sin alterar ni rearchivar el reporte de PostgreSQL. */
export function htmlReport(content: DailySnapshot): string {
  const { critical, high } = countDailySeverities(content.incidents);
  const rows = content.incidents.map(i => `<tr><td>${escapeHtml(i.id)}</td><td>${escapeHtml(i.camera_id)}</td>` +
    `<td>${escapeHtml(i.zone_id)}</td><td>${escapeHtml(i.severity)}</td><td>${escapeHtml(i.status)}</td>` +
    `<td>${escapeHtml(i.duration_sec ?? '—')}</td></tr>`).join('');
  return `<h1>VISION AI · Resumen diario ${escapeHtml(content.day)}</h1>` +
    `<p>${content.total} incidentes detectados por YOLO · Críticos: ${critical} · Altos: ${high}</p>` +
    `<p>Periodo: ${escapeHtml(content.start)} — ${escapeHtml(content.end)} (Lima)</p>` +
    '<table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>ID</th><th>Cámara</th>' +
    '<th>Zona</th><th>Severidad</th><th>Estado</th><th>Duración (s)</th></tr></thead>' +
    `<tbody>${rows}</tbody></table><p>Solo metadatos, sin fotografías ni clips.</p>`;
}
