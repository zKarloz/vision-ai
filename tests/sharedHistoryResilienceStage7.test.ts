import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { settleSharedRows } from '../src/application/remote/sharedHistory';

/** Garantiza que una tabla auxiliar no inutilice los incidentes confirmados. */
describe('v1.9.6 · tolerancia a errores parciales del historial', () => {
  it('conserva los incidentes aunque falle la auditoría de reportes', async () => {
    const [incidents, reportAudit] = await Promise.allSettled([
      Promise.resolve([{ id: 'incidente-remoto' }]),
      Promise.reject(new Error('relation vision_report_audit does not exist')),
    ]);
    expect(settleSharedRows(incidents).rows).toEqual([{ id: 'incidente-remoto' }]);
    expect(settleSharedRows(incidents).error).toBe('');
    expect(settleSharedRows(reportAudit).rows).toBeNull();
    expect(settleSharedRows(reportAudit).error).toContain('vision_report_audit');
  });

  it('una tabla con cero registros no se confunde con un fallo', () => {
    expect(settleSharedRows({ status: 'fulfilled', value: [] })).toEqual({ rows: [], error: '' });
    expect(settleSharedRows({ status: 'rejected', reason: 'no disponible' })).toEqual({
      rows: null, error: 'Error consultando Supabase.',
    });
  });

  it('las consultas dejan de ser una transacción de lectura todo o nada', () => {
    const provider = readFileSync(resolve('src/app/providers/SharedHistoryProvider.tsx'), 'utf8');
    expect(provider).toContain('Promise.allSettled');
    expect(provider).toContain('reportsLoaded');
    expect(provider).toContain('auditError');
    expect(provider).toContain('reportAuditError');
    expect(provider).toContain("error.code === 'PGRST202'");
    expect(provider).toContain('center.reconcileSharedDecisions');
  });
});
