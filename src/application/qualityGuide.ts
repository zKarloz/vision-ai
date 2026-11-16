/**
 * Guion de aceptación de la etapa 7, basado en el PDF rector de VISION AI v2.0.
 * No inyecta detecciones ni marca pruebas automáticamente: las confirma una persona.
 * Las acciones remotas se validan desde Supabase/Resend, no desde el frontend.
 */
export interface QualityStep {
  id: string;
  title: string;
  description: string;
  expected: string;
  path: '/' | '/camaras' | '/monitoreo' | '/zonas' | '/incidentes' | '/reportes' | '/configuracion';
  action: string;
  category: 'funcional' | 'seguridad' | 'interfaz' | 'remoto';
}

export const QUALITY_STEPS: readonly QualityStep[] = [
  {
    id: 'auth', title: 'Acceso y cierre de sesión', category: 'seguridad',
    description: 'En una ventana privada, abre /monitoreo. Comprueba el redireccionamiento a /login. Inicia sesión como administrador y prueba cerrar sesión.',
    expected: 'Ningún módulo se muestra sin sesión y rol autorizado.',
    path: '/', action: 'Ir al inicio',
  },
  {
    id: 'config', title: 'Configuración válida e inválida', category: 'funcional',
    description: 'Carga un ejemplo válido y uno inválido. Comprueba que el segundo se rechaza sin sustituir la configuración activa. Repite la carga válida.',
    expected: 'Validación, versionado y auditoría; sin duplicados por repetir la carga.',
    path: '/configuracion', action: 'Ir a configuración',
  },
  {
    id: 'camera', title: 'Cámara fija, zona y señal', category: 'funcional',
    description: 'Configura una cámara 3D fija, o usa video en bucle/webcam, y una zona restringida asociada a esa perspectiva. Prueba una pérdida de señal.',
    expected: 'No se abre un incidente nuevo por pérdida de imagen. El barrido opcional no evalúa zonas fijas mientras se mueve.',
    path: '/camaras', action: 'Ir a cámaras',
  },
  {
    id: 'yolo', title: 'Confirmación temporal con YOLO', category: 'funcional',
    description: 'Inicia Monitoreo y habilita el sonido con un clic. Usa una persona real visible. Comprueba que un paso momentáneo por el borde no dispara una alarma.',
    expected: 'Solo una entrada confirmada en una zona restringida genera un incidente YOLO y alarma.',
    path: '/monitoreo', action: 'Abrir monitoreo',
  },
  {
    id: 'incident', title: 'Reconocimiento y cierre', category: 'funcional',
    description: 'Reconoce la alarma desde Monitoreo. Después verifica la salida de la zona o usa cierre manual con una nota justificada.',
    expected: 'El sonido se silencia sin cerrar por reconocimiento; queda registrada la causa real del cierre.',
    path: '/incidentes', action: 'Ir a incidentes',
  },
  {
    id: 'report', title: 'Reporte y auditoría', category: 'funcional',
    description: 'Comprueba la creación de un reporte por incidente cerrado; descarga PDF, CSV y JSON. Recarga la aplicación y revisa la bandeja.',
    expected: 'Datos coherentes, sin duplicaciones ni fotografías; registro auditable de generación y descarga.',
    path: '/reportes', action: 'Ir a reportes',
  },
  {
    id: 'remote', title: 'Persistencia remota', category: 'remoto',
    description: 'Autoriza expresamente la sincronización y comprueba las filas del incidente en Supabase. No publiques claves secretas en el navegador.',
    expected: 'Metadatos YOLO y auditorías persistidos con una cuenta administradora; RLS aplicado.',
    path: '/reportes', action: 'Revisar sincronización',
  },
  {
    id: 'email', title: 'Entrega automática diaria', category: 'remoto',
    description: 'Comprueba un trabajo ejecutado por Cron sin intervención manual, el estado en vision_report_jobs y la recepción del correo correspondiente al día anterior en Lima.',
    expected: 'Un solo envío por día confirmado; distinguir aceptación de Resend de recepción en la bandeja.',
    path: '/reportes', action: 'Revisar trabajos',
  },
  {
    id: 'responsive', title: 'Accesibilidad y diseño responsive', category: 'interfaz',
    description: 'Prueba anchos de 375, 768 y 1280 px, navegación solo con Tab/Enter/Escape, menú lateral, foco visible y tema claro/oscuro.',
    expected: 'Sin bloqueos de navegación, controles etiquetados ni información indispensable oculta por tamaño o color.',
    path: '/', action: 'Volver al panel',
  },
];

/** Progreso informativo, nunca equivalente a ejecución automatizada ni a certificación. */
export function qualityProgress(done: ReadonlySet<string>): { completed: number; total: number; percent: number } {
  const completed = QUALITY_STEPS.filter(step => done.has(step.id)).length;
  return { completed, total: QUALITY_STEPS.length, percent: Math.round(100 * completed / QUALITY_STEPS.length) };
}
