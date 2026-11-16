import type { Camera } from '../../core/domain/camera';

/** Puerto de persistencia; podrá recibir un adaptador Supabase sin cambiar la UI. */
export interface CameraRepository {
  load(): Camera[];
  save(cameras: readonly Camera[]): void;
}
