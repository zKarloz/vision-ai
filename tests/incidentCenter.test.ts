import { describe, expect, it, vi } from 'vitest';
import { IncidentCenter, INCIDENT_STORAGE_KEY, type IncidentStorage } from '../src/application/incidents/IncidentCenter';
import { openIncident, transitionIncident } from '../src/core/domain/incident';

function makeStorage(): IncidentStorage & { contents: Map<string, string> } {
  const contents = new Map<string, string>();
  return { contents, getItem: key => contents.get(key) ?? null,
    setItem: (key, value) => { contents.set(key, value); } };
}
const enteredAt = '2026-11-15T12:00:00.000Z';
function incident(cameraId = 'CAM-02', trackId = '1') {
  return openIncident({ id: 'INC-0001', cameraId, zoneId: 'Z-VIS-' + cameraId,
    ruleId: 'R-PERSON-' + cameraId, trackId, source: 'yolo', severity: 'high',
    confidence: .92, openedAt: enteredAt });
}

describe('Etapa 5 · centro de incidentes reales y auditoría', () => {
  it('registra una apertura y no la duplica en el siguiente fotograma', () => {
    const center = new IncidentCenter(makeStorage());
    const spy = vi.fn(); center.subscribe(spy);
    center.ingest([incident()]);
    center.ingest([incident()]);
    expect(center.getSnapshot().incidents).toHaveLength(1);
    expect(center.getSnapshot().audit.map(e => e.action)).toEqual(['opened']);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('conserva IDs independientes aunque dos cámaras utilicen trackId=1', () => {
    const center = new IncidentCenter(makeStorage());
    center.ingest([incident('CAM-01'), incident('CAM-02')]);
    expect(center.getSnapshot().incidents).toHaveLength(2);
    expect(new Set(center.getSnapshot().incidents.map(i => i.id)).size).toBe(2);
  });
  it('reconoce y silencia un incidente sin volver a abrirlo en un nuevo snapshot', () => {
    const center = new IncidentCenter(makeStorage());
    center.ingest([incident()]);
    const id = center.getSnapshot().incidents[0].id;
    center.acknowledge(id, 'Supervisor A', '2026-11-15T12:00:05.000Z');
    center.ingest([incident()]);
    expect(center.getSnapshot().incidents[0].status).toBe('acknowledged');
    expect(center.getSnapshot().audit.map(e => e.action)).toEqual(['acknowledged', 'opened']);
  });
  it('después del reconocimiento, cierra automáticamente por salida confirmada', () => {
    const center = new IncidentCenter(makeStorage());
    const opened = incident();
    center.ingest([opened]);
    const id = center.getSnapshot().incidents[0].id;
    center.acknowledge(id, 'Supervisor A', '2026-11-15T12:00:02.000Z');
    const closed = transitionIncident(opened, { action: 'close', at: '2026-11-15T12:00:08.000Z' });
    center.ingest([closed]);
    const record = center.getSnapshot().incidents[0];
    expect(record.status).toBe('closed');
    expect(record.acknowledgedBy).toBe('Supervisor A');
    expect(record.closureType).toBe('yolo-confirmed');
    expect(record.durationSec).toBe(8);
  });
  it('no cierra por seguimiento perdido ni señal ausente', () => {
    const center = new IncidentCenter(makeStorage());
    const opened = incident();
    center.ingest([opened]);
    center.ingest([transitionIncident(opened, { action: 'tracking-lost', at: '2026-11-15T12:00:03.000Z' })]);
    center.ingest([]);
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'open', requiresReview: true });
    expect(center.getSnapshot().audit.map(event => event.action)).toEqual(['tracking-lost', 'opened']);
  });
  it('escalamiento temporal único a los 60 segundos de espera', () => {
    const center = new IncidentCenter(makeStorage());
    center.ingest([incident()]);
    center.escalateOverdue('2026-11-15T12:00:59.000Z');
    expect(center.getSnapshot().incidents[0].status).toBe('open');
    center.escalateOverdue('2026-11-15T12:01:00.000Z');
    center.escalateOverdue('2026-11-15T12:01:05.000Z');
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'escalated', severity: 'critical' });
    expect(center.getSnapshot().audit.filter(event => event.action === 'escalated')).toHaveLength(1);
  });
  it('no escala incidentes reconocidos', () => {
    const center = new IncidentCenter(makeStorage());
    center.ingest([incident()]);
    center.acknowledge(center.getSnapshot().incidents[0].id, 'Supervisor A', '2026-11-15T12:00:05.000Z');
    center.escalateOverdue('2026-11-15T13:00:00.000Z');
    expect(center.getSnapshot().incidents[0].status).toBe('acknowledged');
  });
  it('no permite cerrar manualmente sin reconocimiento o nota suficiente', () => {
    const center = new IncidentCenter(makeStorage());
    center.ingest([incident()]);
    const id = center.getSnapshot().incidents[0].id;
    expect(() => center.closeReviewed(id, 'Supervisor', 'Verificado')).toThrow('Reconoce primero');
    center.acknowledge(id, 'Supervisor', '2026-11-15T12:00:01.000Z');
    expect(() => center.closeReviewed(id, 'Supervisor', 'breve')).toThrow();
    center.closeReviewed(id, 'Supervisor', 'Revisión personal confirma salida', '2026-11-15T12:00:12.000Z');
    expect(center.getSnapshot().incidents[0]).toMatchObject({ status: 'closed', closureType: 'human-review' });
    expect(center.getSnapshot().audit[0].action).toBe('closed-by-supervisor');
  });
  it('ignora snapshots recibidos después de un cierre manual definitivo', () => {
    const center = new IncidentCenter(makeStorage());
    center.ingest([incident()]);
    const id = center.getSnapshot().incidents[0].id;
    center.acknowledge(id, 'Supervisor', '2026-11-15T12:00:01.000Z');
    center.closeReviewed(id, 'Supervisor', 'Salida verificada mediante supervisor', '2026-11-15T12:00:04.000Z');
    center.ingest([incident()]);
    expect(center.getSnapshot().incidents[0].status).toBe('closed');
    expect(center.getSnapshot().incidents).toHaveLength(1);
  });
  it('persiste e hidrata el historial entre navegaciones y recargas', () => {
    const storage = makeStorage();
    const center = new IncidentCenter(storage);
    center.ingest([incident()]);
    expect(storage.contents.has(INCIDENT_STORAGE_KEY)).toBe(true);
    const restored = new IncidentCenter(storage);
    expect(restored.getSnapshot().incidents).toHaveLength(1);
    expect(restored.getSnapshot().audit).toHaveLength(1);
  });
  it('continúa en memoria si el navegador bloquea el almacenamiento', () => {
    const storage: IncidentStorage = { getItem: () => null, setItem: () => { throw Error('quota'); } };
    const center = new IncidentCenter(storage);
    center.ingest([incident()]);
    expect(center.getSnapshot().incidents).toHaveLength(1);
    expect(center.getSnapshot().storageOk).toBe(false);
  });
  it('ignora incidentes artificiales y no guarda imágenes', () => {
    const center = new IncidentCenter(makeStorage());
    center.ingest([{ ...incident(), source: 'demo' }]);
    expect(center.getSnapshot().incidents).toHaveLength(0);
    center.ingest([incident()]);
    expect(JSON.stringify(center.getSnapshot())).not.toContain('imageData');
  });
});
