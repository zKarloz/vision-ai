import type { ReportDocument } from '../../core/domain/report';

const MIME = { PDF: 'application/pdf', CSV: 'text/csv;charset=utf-8', JSON: 'application/json;charset=utf-8' } as const;
export type ReportFormat = keyof typeof MIME;

function safeCsv(value: unknown): string {
  const text = String(value ?? '');
  // Evita inyección de fórmulas al abrir CSV en aplicaciones de hojas de cálculo.
  const secured = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${secured.replaceAll('"', '""')}"`;
}
export function reportCsv(report: ReportDocument): string {
  const fields = ['reporte', 'tipo', 'incidente', 'camara', 'zona', 'estado', 'severidad', 'confianza',
    'apertura', 'reconocimiento', 'responsable', 'cierre', 'tipo_cierre', 'duracion_s'];
  const records = report.incidents.map(i => [report.key, report.type, i.id, i.cameraId, i.zoneId, i.status, i.severity,
    i.confidence, i.openedAt, i.acknowledgedAt, i.acknowledgedBy, i.closedAt, i.closureType, i.durationSec]);
  return '\uFEFF' + [fields, ...records].map(row => row.map(safeCsv).join(',')).join('\r\n') + '\r\n';
}

/** PDF sin librerías externas, Unicode básico WinAnsi, 1 o más páginas A4. */
export function reportPdf(report: ReportDocument): Uint8Array {
  type Line = { text: string; size: number; bold: boolean; color: [number, number, number] };
  const lines: Line[] = [];
  const add = (text: string, size = 10, bold = false, color: [number, number, number] = [0.12, 0.17, 0.23]) => {
    const maxWidth = 500;
    const width = (value: string) => [...value].reduce((sum, ch) => sum + size * (/[WM@]/.test(ch) ? 0.94 : /[ilI.,:; !]/.test(ch) ? 0.32 : 0.55), 0);
    // Divide líneas largas sin cortar datos ni permitir desbordes horizontales.
    for (const paragraph of text.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        if (width(current ? `${current} ${word}` : word) > maxWidth && current) {
          lines.push({ text: current, size, bold, color }); current = '';
        }
        if (width(word) > maxWidth) {
          if (current) { lines.push({ text: current, size, bold, color }); current = ''; }
          let part = '';
          for (const char of word) {
            if (width(part + char) > maxWidth) { lines.push({ text: part, size, bold, color }); part = ''; }
            part += char;
          }
          current = part;
        } else current += (current ? ' ' : '') + word;
      }
      lines.push({ text: current, size, bold, color });
    }
  };
  const line = (label: string, value: string | number | undefined | null) => add(`${label}: ${value ?? '—'}`);
  add('VISION AI  /  REPORTE OPERATIVO', 18, true, [0.09, 0.17, 0.25]);
  add(report.title, 13, true);
  add(`Origen: ${report.origin === 'local-demo' ? 'Bandeja local DEMO - NO ENVIADO' : 'Servidor'}`, 9, true, [0.45, 0.27, 0.10]);
  line('Generado', report.generatedAt);
  line('Periodo desde', report.period.start);
  line('Periodo hasta', report.period.end);
  add(' ');
  add('RESUMEN', 12, true);
  line('Incidentes', report.stats.total);
  line('Criticos / Altos', `${report.stats.critical} / ${report.stats.high}`);
  line('Reconocidos / Cerrados', `${report.stats.acknowledged} / ${report.stats.closed}`);
  line('Respuesta media', report.stats.averageResponseSec === null ? 'Sin datos' : `${report.stats.averageResponseSec} s`);
  line('Duracion media', report.stats.averageDurationSec === null ? 'Sin datos' : `${report.stats.averageDurationSec} s`);
  add(' ');
  add('INCIDENTES', 12, true);
  if (!report.incidents.length) add('No se registraron incidentes YOLO en este periodo.');
  report.incidents.forEach((i, idx) => {
    add(`${idx + 1}. ${i.id}  -  ${i.cameraId} / ${i.zoneId}`, 10, true);
    add(`Estado: ${i.status}  |  Severidad: ${i.severity}  |  Confianza: ${(i.confidence * 100).toFixed(1)}%`);
    add(`Apertura: ${i.openedAt}  |  Cierre: ${i.closedAt ?? 'Pendiente'}`);
    add(`Reconoce: ${i.acknowledgedBy ?? 'Nadie'}  |  Tipo de cierre: ${i.closureType ?? 'No aplica'}`);
    if (i.closingNote) add(`Nota: ${i.closingNote}`);
    add(' ');
  });
  add('CRONOLOGIA AUDITADA', 12, true);
  if (!report.audit.length) add('Sin eventos de auditoria asociados.');
  report.audit.forEach(a => add(`${a.at}  ${a.incidentId}  ${a.action}  ${a.actor} ${a.note ?? ''}`));
  add(' ');
  add('Documento de datos estructurados. No incluye identificacion biometrica, fotos ni clips.', 9);

  // Comandos de texto PDF; los offsets del xref se calculan sobre bytes WinAnsi.
  function encode(text: string): number[] {
    const special: Record<number, number> = { 0x20AC: 128, 0x201A: 130, 0x201C: 147, 0x201D: 148,
      0x2013: 150, 0x2014: 151, 0x2022: 149 };
    return [...text].map(char => {
      const n = char.codePointAt(0)!;
      return n <= 255 ? n : special[n] ?? 63;
    });
  }
  const bytes = (text: string) => encode(text);
  const escape = (text: string) => text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const pages: string[] = [];
  let commands: string[] = [];
  let y = 794;
  function closePage() { pages.push(commands.join('\n') + '\n'); commands = []; y = 794; }
  for (const item of lines) {
    if (y < 57) closePage();
    const [r, g, b] = item.color;
    commands.push(`BT /${item.bold ? 'F2' : 'F1'} ${item.size} Tf ${r} ${g} ${b} rg 44 ${y} Td (${escape(item.text)}) Tj ET`);
    y -= item.size >= 13 ? 23 : 15;
  }
  closePage();
  // 1 Catalogo, 2 Paginas, 3 y 4 fuentes, resto objetos de pagina y streams.
  const objects: string[] = ['', '<</Type /Catalog /Pages 2 0 R>>', '',
    '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>',
    '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding>>'];
  const kids: string[] = [];
  pages.forEach((content, index) => {
    const stream = `${content}BT /F1 8 Tf 0.42 0.45 0.49 rg 44 28 Td (VISION AI - Pagina ${index + 1} de ${pages.length}) Tj ET\n`;
    const pageId = 5 + index * 2;
    const streamId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    objects[pageId] = `<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources <</Font <</F1 3 0 R /F2 4 0 R>>>> /Contents ${streamId} 0 R>>`;
    objects[streamId] = `<</Length ${bytes(stream).length}>>\nstream\n${stream}endstream`;
  });
  objects[2] = `<</Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length}>>`;
  const output: number[] = [...bytes('%PDF-1.4\n%VAI\n')];
  const positions = [0];
  const push = (input: string) => { for (const byte of bytes(input)) output.push(byte); };
  for (let id = 1; id < objects.length; id++) {
    positions[id] = output.length;
    push(`${id} 0 obj\n${objects[id]}\nendobj\n`);
  }
  const xref = output.length;
  push(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < objects.length; id++) push(`${String(positions[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<</Size ${objects.length} /Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`);
  return Uint8Array.from(output);
}

/** Descarga local explícita: no comunica archivos ni datos a servicios remotos. */
export function downloadReport(report: ReportDocument, format: ReportFormat): void {
  const text = format === 'CSV' ? reportCsv(report) : format === 'JSON' ? JSON.stringify(report, null, 2) : null;
  const data = format === 'PDF' ? reportPdf(report) : text!;
  const blob = new Blob([data as BlobPart], { type: MIME[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vision-ai-${report.key.replaceAll(':', '-')}.${format.toLowerCase()}`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
