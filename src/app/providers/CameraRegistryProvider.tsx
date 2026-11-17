import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { registerCamera, removeCamera, setCameraEnabled, updateCamera } from '../../application/cameras/CameraRegistry';
import { validateImagePolygon, type ImagePoint } from '../../core/domain/spatial';
import { cameraMonitoringPolicy, invalidatesImageZone } from '../../core/domain/cameraMonitoringPolicy';
import { hasVirtualPerspective, type Camera, type CameraDraft } from '../../core/domain/camera';
import { STARTER_PERSON_RULE, STARTER_RESTRICTED_ZONE } from '../../core/domain/zone';
import { VersionedLocalConfigRepository, type ConfigState } from '../../infrastructure/config/VersionedLocalConfigRepository';
import { useAccountStorage } from './AccountStorageProvider';
import { normalizedConfig, validateConfig, type ConfigSnapshot } from '../../application/config/configSchema';

interface CameraContextValue {
  cameras: Camera[];
  config: ConfigSnapshot;
  configState: ConfigState;
  create: (draft: CameraDraft) => void;
  update: (id: string, draft: CameraDraft) => void;
  remove: (id: string) => void;
  toggle: (id: string, enabled: boolean) => void;
  setImagePolygon: (id: string, points: ImagePoint[]) => void;
  importConfig: (input: unknown) => boolean;
  rollbackConfig: (target: number) => boolean;
  exportConfig: () => string;
}

const Context = createContext<CameraContextValue | null>(null);

/** Única fuente local de verdad para cámaras, zonas y reglas versionadas. */
export function CameraRegistryProvider({ children }: { children: ReactNode }) {
  const storage = useAccountStorage();
  const [repo] = useState(() => new VersionedLocalConfigRepository(storage));
  const [configState, setConfigState] = useState<ConfigState>(() => repo.load());
  const config = repo.current(configState).snapshot;

  function publish(input: unknown, action: 'camera' | 'zone' | 'import'): boolean {
    const result = repo.commit(input, action);
    setConfigState(result.state);
    return result.changed;
  }
  function withCameras(next: Camera[]) { publish({ ...config, cameras: next }, 'camera'); }

  const value = useMemo<CameraContextValue>(() => ({
    cameras: config.cameras,
    config,
    configState,
    create: draft => withCameras(registerCamera(config.cameras, draft)),
    update: (id, draft) => {
      if (hasVirtualPerspective(id) && draft.sourceType !== 'virtual-3d') {
        throw new Error(`${id} es una perspectiva semilla y debe conservar el tipo Escenario 3D.`);
      }
      const existing = config.cameras.find(camera => camera.id === id);
      const cameras = updateCamera(config.cameras, id, draft);
      // El encuadre movido o cambio de fuente invalida los polígonos en píxeles.
      // Desactivar sin borrar mantiene la versión anterior disponible para auditoría.
      const reconfiguration = existing && invalidatesImageZone(existing, draft, id);
      const zones = reconfiguration ? config.zones.map(zone => zone.cameraId === id ? { ...zone, enabled: false } : zone) : config.zones;
      publish({ ...config, cameras, zones }, 'camera');
    },
    remove: id => {
      if (hasVirtualPerspective(id)) throw new Error(`${id} es una perspectiva fija de la escena y no puede eliminarse.`);
      const cameras = removeCamera(config.cameras, id);
      const zones = config.zones.filter(zone => zone.cameraId !== id);
      const zoneIds = new Set(zones.map(zone => zone.id));
      publish({ ...config, cameras, zones, rules: config.rules.filter(rule => zoneIds.has(rule.zoneId)) }, 'camera');
    },
    toggle: (id, enabled) => withCameras(setCameraEnabled(config.cameras, id, enabled)),
    setImagePolygon: (cameraId, points) => {
      const source = config.cameras.find(camera => camera.id === cameraId);
      if (!source) throw new Error(`La cámara ${cameraId} no existe.`);
      if (points.length && !cameraMonitoringPolicy(source).imageZones) {
        throw new Error('Para evaluar zonas de imagen debes usar una cámara fija y habilitada.');
      }
      if (points.length) {
        const error = validateImagePolygon(points);
        if (error) throw new Error(error);
      }
      const zoneId = `Z-VIS-${cameraId}`;
      const zones = config.zones.filter(zone => zone.id !== zoneId);
      const rules = config.rules.filter(rule => rule.zoneId !== zoneId);
      if (points.length) {
        const old = config.zones.find(zone => zone.id === zoneId);
        zones.push({ ...STARTER_RESTRICTED_ZONE, ...old, id: zoneId, cameraId,
          name: old?.name ?? `Zona restringida ${cameraId}`, polygon: points.map(point => ({...point})), configVersion: configState.active, enabled: true });
        const oldRule = config.rules.find(rule => rule.zoneId === zoneId);
        rules.push(oldRule ?? { ...STARTER_PERSON_RULE, id: `R-PERSON-${cameraId}`, zoneId });
      }
      publish({ ...config, zones, rules }, 'zone');
    },
    importConfig: input => publish(validateConfig(input), 'import'),
    rollbackConfig: target => {
      const result = repo.rollback(target); setConfigState(result.state); return result.changed;
    },
    exportConfig: () => JSON.stringify(normalizedConfig(config), null, 2),
  // El estado se actualiza solo tras la escritura atómica del repositorio.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [configState]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCameraRegistry() {
  const context = useContext(Context);
  if (!context) throw new Error('useCameraRegistry requiere CameraRegistryProvider.');
  return context;
}
