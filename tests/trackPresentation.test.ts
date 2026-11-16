import { describe, expect, it } from 'vitest';
import { getTrackPresentation } from '../src/domain/trackPresentation';

describe('presentación temporal sin falsas detecciones', () => {
  it('distingue observación real, última posición y ocultación', () => {
    expect(getTrackPresentation({seen:true,lastSeenAt:100}, 1000)).toBe('observed');
    expect(getTrackPresentation({seen:false,lastSeenAt:100}, 1100)).toBe('last-known');
    expect(getTrackPresentation({seen:false,lastSeenAt:100}, 1900)).toBe('hidden');
    expect(getTrackPresentation({seen:false,lastSeenAt:2000}, 1000)).toBe('hidden');
  });
});
