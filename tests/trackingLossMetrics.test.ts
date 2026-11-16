import { describe, expect, it } from 'vitest';
import { TrackingLossMonitor } from '../src/domain/trackingLossMetrics';
import type { VisionTrack } from '../src/domain/visualTracking';

const track = (seen: boolean, missed: number, lastSeenAt: number, id = 1): VisionTrack => ({
  id, seen, missed, lastSeenAt, confidence: 0.5,
  box: { x: .3, y: .3, width: .2, height: .5 },
  inside: true, foot: {x:.4,y:.8}, state: seen ? 'inside' : 'unknown', alertOpen: true,
});

describe('registro de pérdidas y recuperaciones', () => {
  it('cuenta episodios, no un episodio nuevo por cada captura perdida', () => {
    const m = new TrackingLossMonitor();
    m.observe('CAM-02', [track(true, 0, 100)], 100);
    m.observe('CAM-02', [track(false, 1, 100)], 400);
    m.observe('CAM-02', [track(false, 2, 100)], 700);
    expect(m.getSummary(700)).toMatchObject({ interruptions: 1, currentMissing: 1, missedFramesTotal: 2, longestMissStreak: 2 });
    m.observe('CAM-02', [track(true, 0, 1000)], 1000);
    expect(m.getSummary(1000)).toMatchObject({ interruptions: 1, currentMissing: 0, recovered: 1, expired: 0, longestGapMs: 900 });
    expect(m.getHistory()[0]).toMatchObject({missedFrames:2, gapMs:900, outcome:'recovered'});
  });
  it('expira si el track desaparece del resultado en el umbral maxMisses', () => {
    const m = new TrackingLossMonitor();
    m.observe('CAM-02', [track(false, 1, 100)], 400);
    m.observe('CAM-02', [track(false, 2, 100)], 700);
    m.observe('CAM-02', [], 1000);
    expect(m.getSummary(1000)).toMatchObject({ expired: 1, recovered: 0, currentMissing: 0, longestGapMs: 900 });
    expect(m.getHistory()[0].outcome).toBe('expired');
  });
  it('no confunde tracks simultáneos y reinicia las métricas', () => {
    const m = new TrackingLossMonitor();
    m.observe('CAM-02', [track(false,1,100,1),track(false,1,120,2)], 400);
    m.observe('CAM-02', [track(true,0,600,1),track(false,2,120,2)], 600);
    expect(m.getSummary(600)).toMatchObject({ interruptions:2, recovered:1, currentMissing:1 });
    m.reset();
    expect(m.getHistory()).toEqual([]);
    expect(m.getSummary(600)).toMatchObject({ interruptions:0, recovered:0, currentMissing:0 });
  });
});
