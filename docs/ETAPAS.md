# VISION AI — Plan de etapas y bitácora de entregas

**Documento rector:** «VISION AI — Sistema de monitoreo visual en tiempo real», v2.0, sección 17 (páginas 16–17), **8 etapas**. Cambio aprobado: IA real desde el inicio, sin confundir simulación 3D con detección geométrica.

## Plan vigente

| Etapa | Entregable y condición de salida |
| --- | --- |
| **1. Base** | React/Vite/TypeScript/Tailwind/Lucide, rutas, dos temas, componentes compartidos, gestor inicial de cámaras. Compila y navega. |
| **2. Dominio** | Camera, Zone, Rule, Detection, Track, Incident, ZoneEvaluator, RuleEngine, máquina de estados y pruebas. **Ampliación aprobada:** incorporar un solo mundo Three.js y YOLO real en Monitoreo. |
| **3. Carga de datos** | Validación formal (Zod), archivos, versionado/reversión, carga atómica e idempotente, Supabase, auditoría y configuración persistente. |
| **4. Flujo de vídeo** | Fuente 3D dinámica, vídeo en bucle, webcam, otras fuentes compatibles; contrato VideoSource y optimización de tracking/scheduling. |
| **5. Alarma y tiempo real** | Alarmas Web Audio, reconocimientos, incidente completo persistido, eventos realtime y dashboard. |
| **6. Reportes automáticos** | Reportes de incidentes, bandeja, consolidado diario por correo con planificación servidor, reintentos e idempotencia. |
| **7. Calidad** | E2E, pruebas de rendimiento y accesibilidad, seguridad, responsive y despliegue reproducible. |
| **8. IA real extendida** | Validación etiquetada, clase cono (y EPP si aplica), optimización/multicámara y FastAPI opcional. |

## Etapa 1 — Cierre de pruebas técnicas en Windows

El usuario reportó el **14 de noviembre de 2026**:

- `npm run test`: **10 archivos, 33 pruebas aprobadas**.
- `npm run typecheck`: finalizó sin errores.
- `npm run build`: finalizó correctamente en Vite 6.4.6, con advertencia informativa de un chunk experimental >500 KB.
- Aprobado el diseño visual de la maqueta. Se solicitó retirar el laboratorio y migrar el prototipo a Monitoreo como parte del producto.

**Nota:** la salida de consola confirma las verificaciones de etapa 1 ejecutadas por el usuario; no equivale por sí sola a una auditoría funcional del navegador.

## Etapa 2 — Entrega v1.1.0-stage2

### Incluido

- Núcleo de dominio sin dependencias técnicas: entidades tipadas `Zone`, `SafetyRule`, `Incident` y modelos complementarios; validación de polígonos, `ZoneEvaluator`, `RuleEngine`, máquina de estados de incidentes.
- `VisualIncidentCoordinator`: recibe eventos confirmados de `VisualZoneMonitor` **solo si source es YOLO**, aplica reglas y produce apertura/cierre en memoria. Un evento `lost` marca revisión sin cerrar.
- Eliminados `lab.html`, `src/lab/main.tsx`, `src/app/App.tsx` experimental y `src/styles.css`; el producto se sirve por una sola entrada.
- Una instancia de `SimulationWorld` con dos cámaras reales en el mundo 3D; selección CAM-01/CAM-02 dentro de `/monitoreo`; sin iframe.
- Captura RGB a 640×480, ONNX Runtime Worker, cajas de YOLO y tracks en overlay de cámara; selección WebGPU/WASM, umbral, intervalo y zoom.
- Zona de seguridad normalizada por cámara, editor de polígono, persistencia local, relectura de configuración de fase 0 y polígono inicial de CAM-02 proveniente de evidencia real del usuario (zoom 1.5×).
- Eventos e incidentes de sesión, métricas y exportación JSON; vista de Zonas y reglas como resumen de configuración, vinculada a editor de Monitoreo.
- Carga diferida del módulo 3D/ONNX y textos de navegación actualizados a «Monitoreo» sin laboratorio.
- Nuevas pruebas unitarias del dominio, integrador de eventos visuales y repositorio local de zonas; se conservan las 33 pruebas anteriores.

### Qué se verificó aquí y qué debe verificarse en Windows

- [x] TypeScript del núcleo de dominio (sin dependencias npm): comprobación estática con `tsc` global.
- [x] Migración de archivos experimentales fuera de la ruta de producto, preservando Worker/SimulationWorld.
- [ ] `npm run test` con Vitest y dependencias del proyecto.
- [ ] `npm run typecheck` del proyecto completo, incluyendo React/Three, con dependencias instaladas.
- [ ] `npm run build` con Vite y comprobación del artefacto final.
- [ ] Verificación visual en Chrome: cámara seleccionada, imagen RGB, YOLO/WebGPU o WASM, zona y alertas, tema claro/oscuro.

**Cierre condicionado a pruebas del usuario:** no afirmar que las pruebas npm o la inferencia visual se ejecutaron en este entorno. Entregar errores si los hay para correcciones puntuales antes de etapa 3.

### Riesgos y límites conocidos

- Se procesa una cámara YOLO a la vez; un mundo compartido **no** equivale a inferencia simultánea de dos cámaras.
- Datos de incidentes solo en memoria; se reinician al cambiar cámara, umbral, zoom o zona (el historial global llegará después).
- Se mantienen dos perspectivas fijas 3D (CAM-01/CAM-02); pueden editarse/deshabilitarse pero no eliminarse desde la interfaz. Nuevas cámaras de la tabla todavía no obtienen vistas automáticas.
- Las detecciones de conos/casco/chaleco no se han implementado con un modelo real.
- Cambiar el zoom puede exigir redibujar zona. El modo WASM es fallback a WebGPU.
- El audio y reconocimiento son de etapa 5; la ausencia de detección no dispara salida falsa.

## Próximo trabajo: etapa 3

Con las pruebas de etapa 2 aprobadas, integrar esquemas Zod, repositorios Supabase, versionado, carga validada y auditoría de cámaras/zonas/reglas. Se conservará documentación por etapa en estos archivos, no un documento por cambio menor.


## Etapa 3 — Preparación v1.2.0-stage3 (2026-11-14)

**Ajuste aprobado de modelado 3D:** el personaje C de fase 0 (rostro, chaleco reflectante, manos, botas y casco) queda como único operario procedimental de referencia. Tanto el trabajador de almacén como el de maquinaria utilizan C en la misma escena Three.js. Se eliminan de renderizado los diseños A y B y el selector experimental; se conservan los resultados históricos de benchmarking.

**Motivo científico:** en los ensayos de fase 0.2, C obtuvo la mayor confianza media (0.456) y mejor proporción de coincidencias con confianza >= 0.50; B obtuvo más coincidencias con umbral bajo (34/40 frente a 31/40). Ningún resultado se interpreta como precisión validada fuera de esas muestras.

### Incluido en esta actualización

- `ConfigSnapshot` con `schemaVersion`, cámaras, zonas y reglas; validación estricta Zod, referencias cruzadas, unicidad, polígonos normalizados sin autointersección, umbrales y tamaños.
- Importación de archivos JSON UTF-8, validación previa a la confirmación y mensajes por campo.
- Persistencia **local** de una sola clave atómica para versión activa, 20 versiones conservadas, 100 registros de auditoría y huella FNV-1a de comprobación no criptográfica.
- Idempotencia de configuración, auditoría de operaciones sin cambios y reversión que publica nueva versión; las operaciones de cámara y edición de polígonos pasan por el repositorio versionado.
- Migración inicial de registros locales anteriores cuando son válidos; ejemplos JSON válido/inválido para la defensa.
- Script SQL de referencia con tablas y RLS básicas para Supabase: todavía sin conexión, autenticación o sincronización activas.

### Criterios de cierre de etapa 3

1. `npm install`, `npm run test`, `npm run typecheck`, `npm run build` en Windows.
2. Cargar JSON inválido: mensaje por campo y configuración activa intacta.
3. Cargar archivo válido, repetirlo y verificar que no duplica una versión.
4. Modificar cámara o polígono, comprobar publicación de versión; revertir y comprobar valores en Cámaras y Monitoreo.
5. Confirmar detecciones YOLO reales en CAM-02 con personaje C (WebGPU o WASM) y que las zonas mantengan el encuadre.

**Pendiente para conexión real a Supabase:** crear proyecto y usuario administrador con Auth, aplicar migraciones y construir el adaptador remoto/API con transacciones e idempotencia en el servidor. No afirmar que la sincronización multiusuario o el envío de correo estén operativos hasta probarlos.

**Alcances posteriores:** fuentes de vídeo dinámicas (4), alarmas y auditoría de incidentes (5), reportes y Resend (6).


## Etapa 4 — Avance multicámara v1.3.0 (2026-11-14)

**Ajuste solicitado:** las etiquetas de seguimiento sobre la captura YOLO pasan de fondo negro permanente a semáforo basado en el polígono de la cámara: **verde fuera, rojo dentro**, gris si no existe zona o la observación se perdió. El color cambia inmediatamente con la evaluación espacial, mientras que el incidente sigue exigiendo `minFrames` y `exitFrames` para evitar falsas alarmas. Los colores verde/rojo son semánticos también en el tema oscuro.

**Primer incremento de etapa 4 (no cierre de toda la etapa):**

- `CameraRoundRobin` alterna CAM-01 y CAM-02 habilitadas o prioriza únicamente la seleccionada, usando un solo Worker YOLO. No hay dos inferencias en paralelo ni dos mundos Three.js.
- `VisualZoneMonitor` independiente por cámara, sin intercambio de tracks; `VisualIncidentCoordinator` mantiene una sola sesión global con claves cámara/zona/track.
- Métricas de personas detectadas por cámara, suma de detecciones activas (NO de individuos únicos) y descarte temporal de resultados antiguos.
- La previsualización y las cajas se muestran únicamente para la perspectiva actualmente seleccionada; el render del mundo continúa sin reiniciarse.
- Los incidentes solo proceden de los fotogramas realmente analizados por ONNX. El semáforo es evaluado con el punto inferior de cada caja detectada, no con coordenadas internas de la escena.
- Nuevas pruebas unitarias para semáforo, scheduler y separación de eventos entre cámaras.

**Verificaciones realizadas aquí:** comprobación sintáctica de TypeScript/TSX e importaciones locales; typecheck aislado de utilidades puras; pruebas ejecutadas sin npm para scheduler/frescura/colores. **Pendiente** `npm run test`, `npm run typecheck`, `npm run build` y validación visual/WebGPU-WASM en Windows. El rendimiento en modo alternado debe medirse en equipo real.

**No completado todavía en etapa 4:** adaptador de vídeo en bucle, webcam, cámaras virtuales creadas dinámicamente, estado de pérdidas de señal para esas fuentes y soporte RTSP. No se deben presentar registros `video-loop` o `webcam` como conectados hasta que existan esos adaptadores. Sigue pendiente de etapa 3 la activación y validación de Supabase/Auth/RLS.


### Corrección v1.3.1 — Compatibilidad de pruebas y tipos (14/11/2026)

Tras la validación funcional del semáforo verde/rojo, la consola Windows reportó 70/71 pruebas correctas y 4 errores TS en la v1.3.0. Se aplicó una corrección puntual sin cambiar el motor ONNX, los colores del visor ni el planificador multicámara:

- `benchmark.test.ts`: la prueba antigua ya no depende de `benchmarkPose` (eliminada con los personajes A/B); verifica la trayectoria determinista `workerRestrictedPath` que utiliza actualmente `SimulationWorld`. Se mantienen las pruebas IoU y de separación entre confianza y tasa de aciertos.
- `VersionedLocalConfigRepository.ts`: la entrada de auditoría `unchanged` se declara explícitamente como `ConfigAudit`, evitando que TypeScript la ensanche a `string`; se conserva la idempotencia de importaciones.
- `SettingsPage.tsx`: las claves numéricas de las tablas de versiones y auditoría se convierten a cadena, conforme al contrato reutilizable de `DataTable`.

**Criterio de aceptación:** repetir `npm run test`, `npm run typecheck` y `npm run build` en Windows; objetivo 71/71 pruebas y ninguna falla de tipado. En el entorno de preparación no se dispone de dependencias npm para verificar el proyecto completo.


### Corrección v1.3.2 — FPS al regresar a una pestaña (14/11/2026)

En el ensayo Windows se observó una frecuencia inicial de ~3,3 FPS para una cámara y ~1,6 FPS por cámara al alternar dos, que bajaba al cambiar de pestaña. La causa identificada en código fue el promedio sobre hasta 120 muestras (incluidas pausas largas), combinado con la limitación de timers y `requestAnimationFrame` de Chrome en pestañas ocultas.

- Usar `visibilitychange` para pausar nuevos muestreos y la previsualización al ocultarse la pestaña, y retomarlos al volver sin reinicializar el motor ONNX.
- Conservar incidentes/tracking y muestras históricas; borrar solo los resultados visibles obsoletos cuando la página deja de estar visible. No generar detecciones artificiales durante la pausa.
- Calcular los FPS recientes a partir de un segmento continuo de hasta 12 s, posterior a la última activación de la pestaña, e informar «Midiendo…» hasta tener muestras suficientes.
- Nuevas pruebas del cálculo de frecuencia, discontinuidades y caducidad de muestras.

**Pendiente de validación en Windows:** `npm run test && npm run typecheck && npm run build`, y alternancia pestaña→Monitoreo para medir recuperación. Los ~3,3/1,6 FPS son máximos de muestreo por cámara con 300 ms, no una garantía. Esta corrección no aporta monitoreo autónomo en segundo plano; esa característica necesitaría un servicio externo.

## Etapa 4 — Fuentes locales de vídeo y webcam v1.4.0 (14/11/2026)

**Continuidad aprobada:** se conserva una sola escena Three.js con CAM-01 y CAM-02, una sesión ONNX por vista activa y la pausa de análisis de v1.3.2 al ocultar la pestaña. No se añade un laboratorio independiente.

### Incremento implementado

- El gestor de Cámaras permite registrar fuentes **Vídeo en bucle** o **Webcam**. El selector de Monitoreo abre cada registro compatible sin mezclarlo con la configuración de las dos vistas 3D.
- `BrowserMediaSource` reproduce MP4/WebM/Ogg del equipo con `URL.createObjectURL` o webcam mediante `getUserMedia`, siempre por permiso explícito, y libera pistas y URL al cerrar. No se suben ni almacenan medios; es necesario seleccionar nuevamente un vídeo al recargar.
- El fotograma real se ajusta a 640 × 480 conservando proporciones y se envía a **YOLOv8n ONNX Runtime Web** mediante el mismo adaptador `OnnxWorkerVisionEngine`; las cajas y zonas usan idénticas coordenadas normalizadas.
- Seguimiento, estado de zonas verde/rojo/gris y apertura/cierre de incidentes solo consumen detecciones reales de ONNX y reglas por cámara. Una pérdida de señal interrumpe el muestreo, **no equivale a salida confirmada**.
- La vista externa es de **una cámara seleccionada**; las dos perspectivas 3D mantienen el análisis alternado existente. Al cambiar entre tipos de fuente se cierran recursos anteriores para evitar Workers simultáneos. La configuración y los polígonos siguen versionados localmente.
- Las capturas e inferencias se pausan con `visibilitychange` y los FPS se calculan sobre las muestras del tramo visible reciente. Se mantiene la política de no procesamiento con la pestaña cerrada.
- Pruebas nuevas para proporción 16:9, proporción vertical, tamaños inválidos, formatos de archivo y límite de 150 MB.

### Límites y decisiones pendientes

- Las fuentes externas se conectan únicamente cuando un usuario las selecciona en Monitoreo. **No se analizan simultáneamente todas las webcams/MP4 con el planificador 3D** en este incremento.
- Las cámaras 3D registradas después de CAM-02 todavía no generan una perspectiva automáticamente. Esto requiere diseñar un editor de posiciones/orientaciones; no equivale a crear un segundo mundo.
- RTSP/IP, almacenamiento remoto en Supabase/Auth/RLS, ejecución 24/7 con pestaña cerrada, sirena/acuse y reportes automáticos aún están pendientes.
- La clase reconocida es `person`. El casco, chaleco y cono requieren modelos diferentes.
- El archivo de vídeo no se incluye en la exportación JSON de configuración por privacidad y tamaño.

### Validaciones pendientes en Windows

1. `npm run test && npm run typecheck && npm run build` y lanzamiento `npm run dev`.
2. Registrar cámara `video-loop`, elegir un vídeo válido y verificar movimiento, bucle, cajas de YOLO, zona y eventos sin origen geométrico.
3. Registrar `webcam`, conceder permiso; comprobar visualización, inferencia, deshabilitación de la cámara y liberación del permiso/pistas al salir.
4. Cambiar pestañas; verificar pausa de muestreo, recuperación FPS y que no se abran incidentes por falta de fotogramas.
5. Volver a CAM-01 y CAM-02 y comprobar que siguen compartiendo una sola escena y que el modo Ambas cámaras conserva su comportamiento anterior.

No se afirma cierre de la etapa 4 mientras falten validación completa y cámaras 3D configurables.

### Corrección v1.4.1 — conflicto de nombres en vista de fuentes locales (14/11/2026)

El usuario confirmó **81/81 pruebas Vitest correctas** en v1.4.0, pero `tsc --noEmit` falló por importaciones duplicadas de `Camera` (icono de Lucide y tipo de dominio) en `BrowserMediaMonitoring.tsx`. Se corrigió el alias de ambos símbolos para evitar la colisión que impedía compilar la vista de vídeo y webcam. **No se modificaron** la captura, el motor ONNX, el mundo Three.js, el seguimiento ni las reglas. La compilación `npm run typecheck && npm run build` y la apertura de fuentes se deben validar en Windows; el arranque de Vite por sí solo no confirma que el módulo cargue correctamente.


### Etapa 4 — Editor de perspectivas 3D dinámicas v1.5.0 (15/11/2026)

- Se incorpora `VirtualCameraPose` al dominio (posición, objetivo, FOV con límites y distancia mínima). `Camera.virtualPose` es **opcional** para conservar la compatibilidad con versiones 1.4.1: CAM-01 y CAM-02 usan sus poses originales si no tienen configuración explícita.
- El importador/exportador JSON y el repositorio versionado validan/publican poses de cámara y las auditan; las fuentes externas no pueden contener poses 3D.
- `SimulationWorld` conserva **una única escena y dos operarios**, pero sus perspectivas se mantienen ahora en un `Map` dinámico. `setVirtualCameras` cambia solamente los objetos `PerspectiveCamera` sin recrear la escena. La vista previa del formulario abre una instancia temporal *únicamente cuando se edita en Cámaras*, y la libera al cerrar; Monitoreo y el editor son rutas alternativas, no escenas simultáneas.
- El registro permite crear/editar/deshabilitar/eliminar perspectivas nuevas. CAM-01/02 siguen protegidas contra eliminación por compatibilidad. En Monitoreo todas las cámaras 3D habilitadas entran al planificador round-robin, con tracking, polígonos, métricas e incidentes separados por ID. Se mantiene **un Worker ONNX** y una sola inferencia en tránsito.
- Las cajas verdes/rojas siguen proviniendo exclusivamente del análisis YOLO de píxeles RGB; los datos geométricos del mundo 3D no se suministran como detecciones.
- Zona restringida: la configuración es por imagen de perspectiva, no una zona 3D global; una nueva cámara comienza sin zona hasta que se dibuja. El piso rojo 3D permanece como señalización visual de la escena.
- Pruebas añadidas: recuperación de poses legado, alta de tercera cámara, edición inmutable, rangos inválidos, importación con pose, rechazo de pose en fuentes no 3D y versionado idempotente.

**Criterios pendientes**: confirmar 88 pruebas y build en Windows, prueba visual de nueva cámara (incluido redibujo de zona y detección YOLO) y verificar que CAM-01/CAM-02 conservan imagen y rendimiento. La etapa 4 no se declara cerrada antes de validación.

**Compatibilidad**: actualiza sobre v1.4.1; no borrar `localStorage`, `node_modules` ni el modelo ONNX. Respaldar exportación JSON si se desea probar importaciones/reversiones.


### Etapa 4 — v1.5.1: editor visual y barrido horizontal
- Las perspectivas virtuales se editan arrastrando el encuadre 3D y con controles de zoom, sin introducir coordenadas manualmente.
- Cada cámara 3D admite un barrido opcional (amplitud por lado 5–75°, ciclo 4–30 segundos). Persistido y validado en la configuración versionada; importaciones anteriores siguen vigentes.
- El barrido usa una sola escena Three.js y el mismo Worker YOLO. Es un movimiento de orientación, no crea cámaras ni objetos adicionales.
- **Seguridad:** los polígonos actuales se definen en coordenadas de imagen fija. Durante el barrido no se evalúan zonas ni se abren incidentes por esos polígonos. Los cuadros YOLO se muestran en estado neutro. Cambiar el encuadre de una cámara fija deshabilita las zonas de píxeles anteriores; redibujarla las reactiva. Para zonas dinámicas será necesario calibrarlas en el mundo 3D y reproyectarlas fotograma a fotograma.
- Esta mejora no agrega PTZ real, RTSP ni servicio de monitoreo en segundo plano.


### Etapa 4 — Consolidación de cámaras fijas v1.5.2 (14/11/2026)

**Decisión confirmada:** priorizar perspectivas 3D **estáticas** por encima de barridos. El barrido permanece opcional y está oculto tras controles avanzados; no está activo al crear cámaras. Se conserva un mundo Three.js con un Worker YOLO y fuentes de navegador MP4/webcam como adaptadores separados.

**Cambios:**

1. `createStaticVirtualCameraDraft` genera un registro 3D fijo con pose independiente por formulario. El diálogo de alta lo utiliza por defecto; las cámaras existentes y su historial local siguen intactos.
2. La política de monitoreo de zonas de imagen (`cameraMonitoringPolicy`) distingue cámara fija, barrido, fuente externa, fuente deshabilitada e IP sin adaptador. El barrido conserva detección YOLO pero **no genera incidentes por zonas de píxeles**.
3. Modificar una perspectiva o cambiar de tipo de fuente desactiva la zona de imagen anterior (sin borrar su registro ni su historial). Guardar un polígono para barrido/registro inactivo se rechaza.
4. El zoom de captura queda bloqueado mientras haya una zona restringida activa; para recalibrar, quitar zona → zoom → redibujar. El polígono del suelo 3D es una señalización visual independiente del polígono sobre imagen.
5. Pruebas agregadas: nuevas cámaras fijas, seguridad de zonas, transición de perspectiva, planificador de tres cámaras, apertura/cierre de incidentes desde eventos de detección y ausencia de falsas salidas sin fotogramas. **No** equivalen a mediciones de precisión real de YOLO.

**Criterio de aceptación (pendiente del equipo Windows):** `npm run test && npm run typecheck && npm run build`, **106 casos esperados**; crear CAM-03 fija y monitorear con YOLO; importar configuración previa sin pérdida; cambiar perspectiva/tipo de fuente y comprobar desactivación de zona; crear webcam y video en bucle y comprobar capturas; cambiar de pestaña y confirmar recuperación FPS; sin errores críticos en consola. No se declara cierre de la etapa 4 hasta completar estos controles.

**Siguiente paso aprobado en el plan:** etapa 5, alarmas sonoras Web Audio tras gesto explícito, ciclo de incidente (abierto/reconocido/escalado/cerrado), bus de eventos e historial persistente. La alarma seguirá dependiendo exclusivamente de eventos confirmados por YOLO y la seguridad deberá acompañarse siempre de texto/señal visual. Supabase/Auth/RLS remotos continúan pendientes: no se debe confundir una simulación local con persistencia servidor.


### Hotfix v1.5.3 — Restauración de cámara fija tras barrido (15/11/2026)

El usuario ejecutó Vitest en Windows y obtuvo 105/106 pruebas. La prueba de reversibilidad
fallaba porque `updateCamera` conservaba propiedades opcionales de la cámara anterior
al aplicar un borrador sin `virtualSweep`. Por ello, al desactivar el barrido, la política
de seguridad seguía impidiendo evaluar las zonas de imagen.

**Corrección:** `updateCamera` sustituye explícitamente `virtualSweep` y `virtualPose`,
incluido el valor `undefined`, manteniendo intacto el resto del registro. Esto corrige
también el riesgo de conservar una pose 3D al cambiar una cámara dinámica a video/webcam.
La política `cameraMonitoringPolicy` **no se modifica**: durante el barrido continúa
prohibida la evaluación de polígonos fijos y solo se restablece al volver a modo fijo.

Pruebas de regresión: ida/vuelta fijo → barrido → fijo, edición inmutable y cambio de
fuente 3D → video con validación del esquema. Se esperan **107 pruebas** (106 anteriores
+ 1 regresión adicional). Requiere verificación final con `npm run test && npm run typecheck && npm run build`
en Windows y revisión visual de que las zonas no generen falsas alarmas.

### Etapa 4 cerrada — Validación v1.5.3 (15/11/2026)

El usuario confirmó en Windows que la corrección de cámara fija después del barrido ya no muestra errores, y que el editor, el barrido opcional y las fuentes anteriores funcionan. Se considera **cerrada la etapa 4** dentro del alcance académico acordado: un mundo Three.js con perspectivas fijas configurables, MP4 y webcam, detección YOLO real y zonas por encuadre. La ejecución ininterrumpida en segundo plano y RTSP no forman parte de este alcance.

### Etapa 5 — Centro de alarmas e incidentes v1.6.0 (15/11/2026)

**Implementación incluida (pendiente de validar en Windows):**

- `application/incidents/IncidentCenter`: centro de incidentes separado de React y del motor ONNX. Integra los snapshots de incidentes REAL YOLO de cámaras 3D y fuentes MP4/webcam, deduplica por cámara/zona/regla/track/hora de apertura, y asigna identificadores locales únicos. La fuente geométrica DEMO no puede activar la sirena.
- Registro local de **apertura, tracking perdido, reconocimiento, escalamiento, cierre visual confirmado por YOLO y cierre por revisión humana**, con timestamps y actor. Se restaura desde localStorage entre rutas/recargas y avisa si no puede persistir. Conserva los últimos 300 incidentes y 1200 eventos. Sin imágenes ni clips.
- `IncidentCenterProvider` + `Siren`: un único bus local suscrito por la app y un AudioContext compartido. El navegador exige pulsar **Activar alarmas sonoras**; se escucha la sirena mientras exista al menos un incidente abierto/escalado sin reconocer, y se silencia cuando todos fueron reconocidos o cerrados. Tras recargar, el sonido vuelve a estar deshabilitado hasta otra interacción.
- Panel principal, Monitoreo y cabecera muestran avisos visuales persistentes. El botón **Reconocer aquí** en Monitoreo permite acuse sin desmontar el visor ni interrumpir inferencia. El historial `/incidentes` tiene tabla paginada, filtros por estado/cámara, reconocimiento, cierre humano con nota, auditoría y exportación JSON.
- Una pérdida de señal/tracking **no cierra** incidentes. La salida confirmada por YOLO sí cierra; si ya hubo reconocimiento, conserva nombre y hora. El escalamiento se aplica una vez a los 60 s sin reconocimiento, sin inventar detecciones.
- El nombre del supervisor introducido en la interfaz es **identidad de demostración, no autenticada**. El almacenamiento es local, no Supabase, no sincroniza múltiples usuarios y no reemplaza una operación 24/7.

**Pruebas nuevas:** `tests/incidentCenter.test.ts` cubre deduplicación, aislamiento por cámara, reconocimiento, cierre por YOLO, tracking perdido, escalamiento, cierre humano documentado, idempotencia, restauración local, fallas de almacenamiento y rechazo de origen DEMO. Se añaden 12 pruebas del centro de incidentes y 5 de `alarmPolicy.test.ts` para garantizar cuándo debe sonar o callar la sirena: **124 pruebas esperadas** sobre las 107 de v1.5.3. `npm run test && npm run typecheck && npm run build` y las pruebas de audio/YOLO en Chrome deben ejecutarse en el entorno del alumno antes de cerrar formalmente la etapa 5.

**Pendientes para etapa 6:** `ReportJob`, reportes PDF/CSV, planificación diaria según zona horaria, bandeja de reportes, idempotencia de envíos e integración Resend. **Pendiente de integración de datos de etapa 3:** Supabase/Auth/RLS con prueba real de permisos y migración desde los repositorios locales, antes de producción.


### Etapa 5 — Cierre validado v1.6.0 (15/11/2026)

El usuario confirmó **124/124 pruebas, TypeScript, build y los seis casos funcionales** de alarmas, reconocimiento, cierre, auditoría y persistencia. Se cierra la etapa 5 dentro de su alcance local académico, sin afirmar tiempo real entre usuarios ni operación continua fuera de Monitoreo.

### Etapa 6 — Primer incremento v1.7.0 (15/11/2026)

**Alcance implementado:**

- `ReportCenter`: consume `IncidentCenter`, genera reportes individuales de **incidentes YOLO cerrados** y resume eventos que se abrieron en un día determinado. Claves `incident:<id>` y `daily:<YYYY-MM-DD>` idempotentes. Guarda hasta 250 reportes y 500 eventos de auditoría en `localStorage`; si no hay almacenamiento, indica modo memoria.
- Día diario de la planta definido en `America/Lima` con intervalo UTC **[05:00 del día, 05:00 del siguiente)**. En el navegador se genera el resumen del día anterior cuando se abre/queda abierto y hay incidentes. El cierre manual del día es demostrable desde Reportes.
- Descarga de PDF A4, CSV protegido contra inyección de fórmulas y JSON. No incluye datos biométricos, fotos o clips. El PDF usa una implementación TypeScript de texto WinAnsi sin nuevas dependencias de runtime; puede inspeccionarse con cualquier lector PDF estándar.
- `ReportCenterProvider` se conserva entre rutas; la pantalla de Reportes utiliza las tablas y paneles compartidos y distingue origen local de detección YOLO real.
- Migración SQL y Edge Function **preparatorias** para tablas remotas de incidentes y trabajos de envío diario. RLS está activada **sin políticas de lectura/escritura para el navegador**. Solo un servicio autorizado podrá procesar reportes. El endpoint comprueba un secreto privado en un encabezado y usa idempotencia de Resend. **No se ha desplegado ni enviado correo real.**

**Pruebas nuevas:** `tests/reportStage6.test.ts` (11 casos) para fechas Lima, límites diarios, filtros de origen, estadísticas, idempotencia, persistencia, exportación CSV/PDF y no afirmar envío. **Esperadas 135 pruebas** (124 anteriores + 11 nuevas) al ejecutar en Windows.

**Integración crítica pendiente para completar y cerrar etapa 6:** establecer Supabase/Auth/RLS y sincronización de incidentes YOLO desde una cuenta autenticada; configurar destino verificado y Resend en el servidor; aplicar migraciones, desplegar/autorizar Edge Function, programar Cron, probar correo real y reintento, comprobar que una doble ejecución no envía dos emails y documentar fallos. El navegador **no garantiza** operación cuando está cerrado.

**Nota histórica de v1.7.0:** se propuso un secreto específico del trabajo. **Sustituido en v1.8.0** por la autenticación de servicio `@supabase/server` y la clave `sb_secret_*` almacenada en Vault. La Edge Function consulta la base remota, nunca `localStorage`.

---

## Etapa 6 · v1.8.0 — Conexión remota segura (ENTREGA PARA ACTIVACIÓN)

**Base validada:** v1.7.0, 124 pruebas previas más las de reportes; seis pruebas funcionales de reporte local confirmadas por el usuario.

### Cambios
- Supabase Auth con correo/contraseña y roles existentes en `vision_ai_members`.
- Sincronización opt-in de incidentes **YOLO** y auditorías; conserva el almacenamiento local como respaldo.
- IDs remotos `<auth.uid()>:<uuid de instalación>:<INC local>` para evitar choques entre navegadores.
- Migración nueva `20261116_remote_auth_sync.sql` que aplica RLS y aísla escritura por usuario; auditoría append-only.
- Función diaria para consolidar incidentes remotos, guardar un snapshot y solicitar a Resend el correo a las 00:05 de Lima.
- Cron SQL separado, **NO habilitado automáticamente**; los secretos nunca se incluyen en el frontend ni ZIP.
- Panel remoto en Reportes con inicio de sesión, activación explícita, errores, sincronización y trabajos de envío (solo administrador).

### Orden de activación remota (por el propietario de cuentas)
1. Crear proyecto **Supabase**. En Authentication configurar usuarios de prueba con correo verificado, desactivar registro abierto para la demo y activar protección apropiada de contraseñas/MFA si procede.
2. Aplicar, **en orden**, SQL de `supabase/migrations/20261114_config_baseline.sql`, `20261115_reports_pending.sql` y `20261116_remote_auth_sync.sql` desde Supabase SQL Editor. Si hay tablas remotas preexistentes con datos, **no ejecutar SET NOT NULL** sin migrar propietarios; revisar primero.
3. En SQL Editor, después de crear un usuario mediante Supabase Auth, asignar su rol desde una sesión administrativa confiable:
   `insert into public.vision_ai_members(user_id, role) values ('UUID-REAL-DEL-USUARIO', 'administrador') on conflict (user_id) do update set role=excluded.role;`
   No poner ese SQL en la SPA ni permitir que usuarios se asignen un rol.
4. Copiar `.env.example` a `.env.local` y completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` de **API Keys / publishable**. Reiniciar Vite. Son valores públicos; las claves secretas NO deben comenzar por `VITE_`.
5. Entrar en **Reportes → Supabase**, iniciar sesión, verificar el rol, pulsar *Autorizar y habilitar sincronización* y comprobar que aparecen filas YOLO en `public.vision_incidents` y auditorías en `vision_incident_audit`. Confirmar que no se suben fotos ni clips y que un usuario sin rol no puede leer ni escribir.
6. Crear cuenta en **Resend** y verificar un dominio remitente propio. En **Supabase Edge Function Secrets**, configurar `RESEND_API_KEY`, `REPORT_FROM` (remitente verificado), `REPORT_TO` (correo administrador). Estas variables **no** van a `.env.local` ni al repositorio.
7. Desplegar la función `vision-daily-report` (CLI: `npx supabase functions deploy vision-daily-report`, usando `supabase/config.toml` (verify_jwt=false), tras `supabase login` y `supabase link --project-ref ...`). El SDK `@supabase/server` exige una clave `sb_secret_*` en el header `apikey`, incluso con `verify_jwt=false`. Probarla primero desde una herramienta segura con esa clave, revisar `vision_report_jobs` y el log de Resend. **No publicar el secreto en una captura ni un navegador público.**
8. En Supabase Dashboard → Vault crear secretos `vision_ai_job_url` (URL HTTPS de la función) y `vision_ai_job_key` (clave secreta `sb_secret_*` del proyecto, nunca publicable). Ejecutar `supabase/cron/schedule_daily.sql` desde SQL Editor para activar Cron a las **05:05 UTC = 00:05 Lima**, con dos invocaciones de reintento a las 05:35 y 06:05 UTC. Consultar ejecuciones y confirmar el estado remoto.

### Pruebas de seguridad imprescindibles
- Sin cuenta / rol: RLS deniega escritura y lectura remota, aunque se conozcan la URL y la clave publicable.
- Auditor no puede sincronizar. Un operador no puede modificar los incidentes cuyo propietario es otro usuario.
- Repetir el mismo cierre o ejecutar cron dos veces no duplica el resumen ni el trabajo.
- Resend devuelve un **ID de mensaje aceptado**, no una prueba de entrega final al destinatario. Se necesita webhook de entregas para confirmar recepción.
- La idempotencia del proveedor tiene una ventana limitada (Resend: 24 horas). Una caída prolongada tras aceptar el correo y antes de registrar `sent` requiere conciliación manual; no afirmar exactamente una entrega en todas las circunstancias.
- La sincronización solo se ejecuta mientras el navegador está abierto. **No hay vigilancia continua 24/7** ni detecciones en segundo plano.
- Los reportes locales ya generados no se convierten automáticamente en archivos PDF remotos; el servidor produce un **resumen HTML por correo** basado en los incidentes sincronizados. El PDF/CSV/JSON local se conserva.

**Estado:** implementación preparada para configurar y probar cuentas remotas, **sin correo enviado ni migraciones aplicadas** en esta entrega. **Etapa 6 sigue abierta** hasta verificar extremo a extremo en Supabase/Resend.

**Seguridad de Edge Functions:** Supabase 2026 recomienda usar `@supabase/server` y las nuevas claves `sb_secret_*`. `SUPABASE_SERVICE_ROLE_KEY` legado no se usa en este código. El header `apikey` de Cron queda protegido dentro de Vault.

**Alcance de reportes remotos:** email HTML consolidado, conservando las descargas PDF/CSV/JSON en la bandeja local. El sistema no adjunta un PDF automáticamente en esta entrega. Los datos remitidos por distintas instalaciones no se fusionan en una misma identidad física: pueden existir observaciones duplicadas si dos cámaras o clientes analizan a una misma persona.

---

## Etapa 6 · v1.8.1 — Acceso obligatorio antes del producto (16/11/2026)

**Cambio solicitado:** después de confirmar el funcionamiento de la base Supabase, la app ya no permitirá navegar libremente a los módulos sin iniciar sesión.

- `AuthProvider` consulta Supabase Auth con `getUser()` y el rol real en `vision_ai_members` (RLS). Durante la comprobación no se montan los centros locales de cámaras, incidentes, reportes ni el visor YOLO.
- Ruta pública `/login` con correo/contraseña, diseño responsivo, mostrar/ocultar contraseña, mensajes de error y temas claro/oscuro. Los enlaces directos a `/monitoreo`, `/incidentes`, etc. redirigen al login si no hay sesión. Se restaura la sesión autorizada al recargar.
- **Política temporal de acceso:** únicamente `administrador`. Aunque el dominio contiene los roles `supervisor`, `operador` y `auditor`, no se habilitan hasta decidir en conjunto los permisos RBAC, por ruta/acción y sus políticas del servidor. Cuentas sin membresía o con otro rol reciben acceso denegado.
- Cabecera con sesión administrativa y botón **Cerrar sesión**. Al salir se desmonta Monitoreo y se liberan los recursos de cámaras y Web Workers.
- El antiguo formulario de login situado en Reportes desaparece. Allí queda únicamente el panel de sincronización opt-in con Supabase y consulta de trabajos; iniciar sesión no sincroniza sin aprobación explícita.
- Los datos locales que ya existían en la instalación se conservan para la cuenta administradora de este prototipo. **Antes de crear otros usuarios** hay que aislar los repositorios locales por ID de usuario o migrarlos a Supabase para evitar mostrar datos de otra cuenta en un navegador compartido. No se debe habilitar ningún otro rol con acceso total sin esta migración.
- El control de rutas es una protección de interfaz, **no reemplaza permisos SQL/RLS**. Las consultas/alteraciones de servidor siguen limitadas por políticas de Supabase. El rol no se deduce del email ni del formulario.
- No se modifica el modelo ONNX ni la automatización Cron/Resend; el envío real permanece pendiente de comprobación.

**Regresión esperada:** 141 pruebas anteriores + 6 pruebas nuevas de política de acceso = **147 pruebas**. Ejecutar `npm run test && npm run typecheck && npm run build` en Windows. Comprobar con Chrome la redirección a `/login`, restauración de sesión, bloqueo al cerrar sesión, y funcionamiento de Monitoreo/Reportes tras acceder.

---

## Etapa 6 · Evidencia real de despliegue y correo (16/11/2026)

El usuario confirmó después de la v1.8.1:

- Proyecto subido a **GitHub**, publicado mediante **Vercel**, con login Supabase e inferencia YOLO en el navegador funcionando.
- Migraciones, membresía `administrador`, RLS y sincronización de incidentes ejecutadas satisfactoriamente en su Supabase.
- Edge Function `vision-daily-report` desplegada y secretos de Resend configurados en servidor.
- Envío real manual de informe diario: `net._http_response.status_code = 200`, respuesta `acceptedByProvider: true` y `total: 15`, trabajo `vision-daily-2026-11-15-admin` con `status = sent`, un intento, sin errores; **el usuario confirmó recepción del correo**.
- Se activaron las tareas Cron `vision-ai-daily-report-lima` (`5,35 5 * * *` UTC) y `vision-ai-daily-report-lima-retry` (`5 6 * * *` UTC): equivalen a 00:05/00:35 y 01:05 hora de Lima. Las dos figuraban con `active = true`.
- Al verificar `cron.job_run_details` inmediatamente después de programar, aún no existían ejecuciones: `Success. No rows returned`.

**Pendiente para cierre definitivo de etapa 6:** evidencia de al menos una ejecución automática de Cron, su respuesta HTTP y el envío correspondiente (con recepción o trazabilidad del proveedor), asegurando que los reintentos no lo dupliquen. Cron no ejecuta ni mantiene abierto YOLO cuando el navegador está cerrado.

## Etapa 7 · Primer avance v1.9.0 — Calidad, responsive y guía (16/11/2026)

**Criterio del PDF rector, sección 17:** «Pruebas integrales, accesibilidad, responsive, demo guiada», con salida «Sin errores críticos». Se conserva el cambio anterior: **YOLO real** es el motor de detección; los datos sintéticos de pruebas ejercitan su contrato, no fabrican resultados del modelo.

### Implementado

- Ruta protegida **`/guia`**, accesible desde la barra lateral. Nueve pasos manuales cubren validación de configuración, entrada/salida, reconocimiento, reporte, sincronización y Cron. Incluye resultados esperados, navegación a módulos y progreso; las casillas son **manuales y temporales**, no equivalen a pruebas automatizadas.
- Cobertura de flujo completo desde **detecciones de contrato YOLO → VisualZoneMonitor → VisualIncidentCoordinator → IncidentCenter → ReportCenter → exportación y payload remoto**, con seguimiento perdido, rebote, seguridad de origen, cierre manual vs. automático, auditoría, persistencia e idempotencia.
- Accesibilidad mejorada: **skip link**, enfoque del menú móvil, contención de Tab y salida con `Escape`, ocultación del menú fuera de pantalla, etiquetas de tabla, scroll accesible, respeto a `prefers-reduced-motion` y estados de progreso con `aria-live`/`progressbar`.
- Actualización de textos obsoletos de inicio y Reportes que se referían a Supabase como inexistente. **No se afirma ejecución automática de Cron hasta verla.**
- **Sin cambios** en lógica de YOLO/ONNX, cámara 3D, Edge Function, migraciones, credenciales o programación SQL. Se conserva la personalización de `vercel.json` y `.gitignore` realizada por el usuario.

### Verificación técnica disponible

- 13 nuevas pruebas en `tests/integratedAcceptanceStage7.test.ts` y `tests/qualityGuideStage7.test.ts`, ejecutadas en una comprobación Node aislada del núcleo sin depender de npm.
- **Objetivo en Windows:** las 147 pruebas previstas para v1.8.1 más 13 = **160**. `npm run test && npm run typecheck && npm run build` debe ejecutarse en VSCode y validarse en Vercel.
- La comprobación aislada no equivale a un resultado positivo de Vitest, React ni build de Vite; no se afirma haber probado WebGPU, lectores de pantalla o varios dispositivos aquí.

### Pruebas de aceptación que debe hacer el usuario

1. Confirmar 160 pruebas y build sin errores; comprobar que el nuevo `/guia` se abre tras autenticar y no aparece sin sesión.
2. **Responsive:** probar viewport 375 px, 768 px y 1280 px, ambos temas y navegadores móviles si están disponibles; comprobar tablas desplazables, sidebar, cámara y paneles sin desbordes críticos.
3. **Teclado y accesibilidad:** navegar con Tab/Shift+Tab, abrir menú móvil, cerrarlo con Escape, verificar foco visible y salto a contenido. Revisar contraste y utilizar un lector de pantalla si es posible.
4. **Flujo completo:** cuenta administradora → cámara fija/video → zona → YOLO persona → alarma → reconocimiento → salida confirmada/cierre → reportes → sincronización. Repetir un paso y verificar ausencia de duplicados.
5. **Errores/robustez:** cargar configuración inválida; simular señal ausente; recargar sesión; perder conexión Supabase y recuperar; sin crear falsos cierres.
6. **Automatización:** esperar la primera ejecución programada; consultar Cron, respuesta de `pg_net`, trabajo e inbox de Resend; verificar una sola entrega por día.

### Brechas conocidas que no deben ocultarse

- El criterio de **cono detectado, precaución ámbar sin sirena** pertenece al PDF, pero **no está implementado** por el modelo COCO actual. Requiere datos etiquetados y modelo especializado; no simular detección como si fuese YOLO real.
- La validación con lectores de pantalla, auditoría de contraste WCAG y pruebas cross-browser automatizadas aún no están certificadas.
- Pruebas de precisión cuantitativa de IA sobre datos anotados y flujo WebSocket/Python pertenecen a la etapa 8 si se decide ese enfoque. Las 13 pruebas nuevas no evalúan exactitud visual del modelo.
- Antes de abrir RBAC a otros usuarios: aislamiento o migración de datos locales y reglas servidor detalladas, con pruebas de seguridad multiusuario.

**Estado de etapa 7:** avance, **no cerrada** hasta aceptación integral y corrección de errores críticos encontrados.

### Integración continua en GitHub (primer avance de etapa 7)

Se incorpora `.github/workflows/calidad.yml` para ejecutar `npm ci`, descarga del modelo YOLO con el hash verificado por el script del proyecto, Vitest, TypeScript y Vite Build con Node 22 ante push/PR a `main`, además de activación manual. No necesita secretos del frontend, Resend o Supabase y **no despliega por sí sola**; Vercel conserva el despliegue de la rama.

**Antes de hacer push**, ejecutar `npm install` en el proyecto actualizado para que el `package-lock.json` del repositorio refleje la versión de `package.json` (sin paquetes nuevos). Un `npm ci` sin lockfile correcto fallaría y no implica fallo de la lógica del proyecto. La descarga del modelo requiere acceso a su origen externo, por lo que una indisponibilidad de la red puede producir una ejecución roja aunque el código no haya cambiado. Verificar en GitHub → Actions el resultado real, no afirmar que CI está verde sin evidencia.


## Etapa 7 — Actualización v1.9.1 · Interfaz de producto y sincronización

- Se retira la vista `/guia` del frontend y del menú: la lista de aceptación pasa a `docs/GUIA_PRUEBAS_INTERNA.md`; GitHub Actions, Vitest y pruebas internas siguen presentes. La validación académica no se expone al usuario operativo.
- El sidebar elimina la tarjeta «Motor de visión» y el pie de etapa; las cabeceras de módulos ya no muestran etiquetas de desarrollo. Se retira el indicador de avance académico del dashboard en favor del estado de persistencia.
- El topbar presenta una sola cuenta desplegable que muestra identidad y rol reales, notificaciones de incidentes pendientes, alternancia de tema y cierre de sesión. Cierra mediante Escape, click fuera o navegación; mantiene el menú lateral móvil accesible.
- La sincronización remota se inicia automáticamente tras acceso autorizado y se reintenta cuando el navegador detecta conexión, al regresar a la pestaña o periódicamente. Solo transmite metadatos YOLO y auditorías; no se envían imágenes/clip ni claves privadas.
- Las actualizaciones son incrementales mediante un checkpoint local por usuario e instalación. El cursor solo avanza tras completar los upserts de incidente y auditoría; fallos mantienen datos en el IncidentCenter local. Se conserva un botón de reintento y un estado visible.
- **Límite:** el histórico local de incidentes/reportes sigue basado en el navegador y no está segregado por usuario. RBAC y aislamiento local multiusuario quedan explícitamente pendientes antes de autorizar nuevas cuentas (actualmente solo administrador ingresa).
- **Pruebas nuevas:** `tests/remoteCheckpointStage7.test.ts` agrega seis escenarios de incremento/idempotencia/cursor; la aceptación completa depende de `npm run test && npm run typecheck && npm run build` en el equipo del usuario y de GitHub Actions/Vercel.
- **Etapa 6:** el envío manual con Resend fue confirmado por el usuario, y Cron tiene dos tareas activas; se espera evidencia de la primera ejecución programada para su cierre. No se alteran migraciones ni Edge Functions.


## Etapa 7 · v1.9.2 — Aislamiento local por cuenta y navegación accesible (16/11/2026)

**Motivación:** el login y RLS ya protegen el backend, pero en v1.9.1 las claves de incidentes, reportes y configuración vivían bajo `localStorage` global. Dos administradores con el mismo perfil de Chrome podían mezclar historiales y sincronizar datos de otra sesión. Debe resolverse antes de diseñar RBAC de múltiples usuarios.

**Implementación:**
- `AccountStorageProvider` se monta únicamente tras verificar Supabase Auth y el rol autorizado. Los repositorios de cámara/configuración, incidentes y reportes reciben el mismo adaptador `createAccountScopedStorage`, que antepone el UUID del usuario verificado. La temática claro/oscuro y el token propio de Supabase no se alteran.
- Migración idempotente desde seis claves heredadas: las copias se atribuyen **únicamente a la primera cuenta administradora** autenticada en ese navegador. Una cuenta diferente no puede reutilizar esa importación a través de la aplicación. No se reemplazan datos ya guardados en el nuevo espacio. Si una escritura falla por falta de cuota o bloqueo de `localStorage`, la migración no se declara completada y se muestra un error recuperable, en lugar de continuar con un historial aparentemente vacío.
- **Importante:** los valores legados originales permanecen como respaldo. `localStorage` no está cifrado ni protege datos de un usuario que tiene control del perfil de navegador/devtools. Este aislamiento reduce mezclas accidentales de cuentas en la interfaz pero **NO autoriza habilitar RBAC multiusuario de producción todavía**. Antes de habilitarlo, revisar retención, borrado, permisos remotos y pruebas con dos usuarios distintos.
- Mejora de accesibilidad: `wrappedFocusTarget` se usa en el menú móvil y el componente `Modal` para contener el foco con Tab/Shift+Tab, incluso si una integración externa movió el foco fuera del diálogo.
- Se añadieron **16 pruebas Vitest**: 11 de almacenamiento/migración, 5 de foco. Las 16 pasaron en una comprobación aislada con Node y TypeScript transpilation. **No se ejecutaron aquí Vitest completo, typecheck React ni build de Vite** por ausencia de dependencias npm. Validar localmente y comprobar GitHub Actions antes de subir a producción.

**Plan de aceptación v1.9.2:** respaldo del navegador → actualización incremental → `npm run test && npm run typecheck && npm run build` → login administrador → conservar cámaras, zonas, incidentes y reportes → confirmar sincronización Supabase → comprobar diálogos con Tab/Shift+Tab/Escape y diseño móvil → verificar GitHub Actions / Vercel.

**Etapa 6 aún pendiente:** primera ejecución automática real de Supabase Cron confirmada en `cron.job_run_details`, trabajo remoto y correo del día correcto. El correo manual ya fue recibido, pero no equivale a la prueba programada.


### Etapa 7 — v1.9.3: pruebas finales y verificación de despliegue (16/11/2026)

**Base confirmada:** el usuario validó las siete pruebas funcionales de v1.9.2, incluyendo acceso, conservación de datos por cuenta, accesibilidad básica, YOLO y sincronización. Se conserva su configuración GitHub/Vercel/Supabase.

- Se incorpora `npm run audit:release`, ejecutado en GitHub Actions tras `npm run build`: comprueba el HTML inicial, JavaScript de Vite, modelo ONNX con SHA-256, binarios WASM, fallback SPA y ausencia de secretos conocidos/.env en `dist`. El flujo CI descarga primero el modelo oficial verificado. **No realiza llamadas a Supabase ni Resend.**
- El cursor de sincronización remota elimina IDs/firmas que el centro local ya no conserva. Así se evita crecimiento ilimitado de metadatos en sesiones largas; si reaparece una fila, el upsert idempotente remoto impide duplicarla. No cambia el contrato de la base de datos.
- Pruebas nuevas: retención del cursor, restauración sin duplicados, recursos de despliegue ausentes, modelo alterado, filtración de secretos y rutas SPA. Las pruebas de navegador y el rendimiento real siguen siendo criterios manuales de cierre.
- **Seguridad:** RLS/roles se deben verificar con cuentas de prueba reales en Supabase. Las pruebas unitarias no sustituyen una auditoría de permisos ni cifran `localStorage`. Evitar habilitar operadores/supervisores/auditores hasta definir RBAC.
- **Rendimiento:** sección 8.3 del PDF fija objetivos *a medir* de alarma < 1,5 s y 5–15 FPS de análisis por cámara. No se afirma que se cumplan sin mediciones en Chrome con un dispositivo y fuente especificados; usar la guía interna de pruebas.
- **Etapa 6:** envío real manual con Resend confirmado y dos tareas Cron activas; resta evidencia de la primera ejecución automática con `cron.job_run_details`, `vision_report_jobs` y correo recibido.

**Criterio de cierre de etapa 7:** Vitest completo, TypeScript, build, auditoría de release, CI GitHub y despliegue Vercel en verde; pruebas manuales en 375/768/1280 px y zoom 200 %, flujo YOLO/alarma/reporte en navegador, sesión/RLS con cuenta alternativa y medición de rendimiento documentada; sin defectos críticos abiertos. Hasta esas verificaciones, v1.9.3 es un avance y no un cierre declarado.

**Observación de rendimiento:** el selector vigente de 300/400/550 ms fija como máximo teórico a 300 ms aproximadamente 3,33 análisis/s para un solo flujo (menos con round-robin). Ese límite es inferior al objetivo 5–15 FPS/cámara del PDF; requiere registrar desviación o realizar una optimización posterior con datos reales, sin modificar el comportamiento validado a ciegas.


### Etapa 7 — Experimento de rendimiento: captura 100 ms (sobre v1.9.3)

- El selector de Monitoreo, tanto para cámara virtual 3D como vídeo/webcam, comienza en **100 ms** y permite 150, 200, 300, 400 o 550 ms como alternativas de comparación o retroceso. No se cambia el modelo ONNX, su resolución, el Worker compartido ni las reglas de seguridad.
- El planificador actual usa `setInterval` y un indicador de inferencia ocupada; **no lanza inferencias simultáneas**. Cuando un ciclo tarda más que 100 ms, se omiten intentos de captura mientras está ocupado. **100 ms no garantiza 10 FPS**: captura, render 3D, transferencia, inferencia y React tienen costos adicionales. Con dos cámaras, el máximo teórico ideal es 5 análisis/s por cámara; comprobar resultados reales.
- **No es todavía un planificador adaptativo**. La intención es aislar primero el efecto de reducir el intervalo. Evitar prometer objetivo 5–15 FPS/cámara sin mediciones.
- Protocolo: medir cámara única con 300 ms durante 30 s, cambiar a 100 ms y medir 30 s; repetir con todas las cámaras activas (mismas condiciones de WebGPU/escena). Anotar FPS recientes, promedio y último ciclo de inferencia, cantidad de cámaras, carga perceptible, detecciones, falsas alarmas y estabilidad. Volver a 300 ms si aparecen bloqueos o temperatura/consumo excesivos.
- Los criterios `minFrames`/`exitFrames` operan en **fotogramas**, por lo que al capturar más frecuentemente las confirmaciones y cierres pueden ocurrir antes en tiempo real. Revisar si es necesario migrarlos a ventanas temporales en futuras iteraciones, conservando la protección ante pérdida de tracking.
- Actualización incremental: únicamente `src/modules/monitoring/{captureInterval.ts,useVirtualMonitoring.ts,useBrowserMediaMonitoring.ts,VirtualMonitoringContent.tsx,BrowserMediaMonitoring.tsx}`, `tests/{captureIntervalStage7.test.ts,analysisPerformance.test.ts}` y esta documentación. No requiere migraciones ni variables nuevas.


### Etapa 7 — Ensayo ampliado de captura a 75 y 60 ms (parche sobre v1.9.3 + 100 ms)

- El selector ofrece ahora **60, 75, 100, 150, 200, 300, 400 y 550 ms** en los visores 3D, vídeo y webcam; el valor de inicio sigue siendo **100 ms**. Los dos intervalos nuevos se etiquetan como **alta carga** y muestran una advertencia contextual.
- Se mantiene un solo Worker/modelo ONNX y el bloqueo de inferencia concurrente. `setInterval` solicita ciclos, pero omite los nuevos cuando la inferencia anterior no ha terminado: un periodo de 60 ms **no garantiza** 16,7 FPS globales ni una carga baja.
- Una mayor frecuencia puede elevar el uso de GPU, temperatura y consumo de batería. Probar primero **75 ms** y después **60 ms** con las mismas cámaras y escena, durante 2–3 minutos, observando el Administrador de tareas, FPS recientes, latencia y falsas alarmas. Volver a 100–300 ms si aparecen cortes, ralentización, calor o pérdida de respuesta.
- Los criterios de seguridad expresados en fotogramas (`minFrames`/`exitFrames`) cambian su duración efectiva cuando aumentan los FPS: evaluar las confirmaciones y los cierres antes de considerar estos intervalos como configuración estable. No se modifica el motor YOLO, el planificador, los umbrales ni Supabase/Resend.


### Etapa 7 — Consolidación de intervalos medidos (parche posterior al ensayo 60/75 ms)

- **Opciones actuales:** `60 ms` (máximo rendimiento), `75 ms` (equilibrado y predeterminado) y `100 ms` (menor carga). Se retiran del selector los intervalos históricos `150/200/300/400/550 ms`; las secciones anteriores conservan la cronología de los experimentos y quedan superadas por esta decisión.
- **Datos reales con tres cámaras:** a 75 ms se registraron ~4,4 análisis/s por cámara, 40,3 ms de inferencia media y 37 % de GPU en una medición; a 60 y 75 ms el uso observado osciló entre 30–40 %, y a 100 ms entre 27–35 %. Temperatura informada: 45–50 °C en las tres configuraciones. Estas mediciones corresponden al equipo de prueba; no son garantías generales.
- La versión usa un solo Worker ONNX, evita inferencias concurrentes y mantiene intactas las reglas de incidentes, zonas y auditoría. **No es aún un planificador adaptativo**; los intervalos son una frecuencia solicitada, no FPS garantizados.
- Los valores antiguos/incorrectos que lleguen al parser vuelven a `75 ms`. Los hooks existentes inicializan su estado con `DEFAULT_CAPTURE_INTERVAL_MS` en los visores 3D y vídeo/webcam.
- **Criterios de comprobación:** ejecutar Vitest, typecheck y build; verificar que los dos selectores presentan solo tres opciones; contrastar 60/75/100 ms con tres cámaras, uso sostenido de GPU, temperatura, pérdida de tracking y falsos incidentes. Al reducir la frecuencia relativa pueden variar las confirmaciones de reglas basadas en fotogramas.
- El cambio afecta únicamente al selector, las etiquetas, mensajes de advertencia, pruebas del contrato de intervalos y esta documentación. No requiere cambios de Supabase, Resend, Cron o Vercel.


### Etapa 7 — v1.9.4: continuidad ante interrupción de monitoreo (17/11/2026)

**Motivo:** la v1.9.3 conservaba incidentes persistidos al detener YOLO, pero reiniciaba la memoria del tracker/coordinador. Al volver con una persona dentro de la zona podía crear otro incidente, y un incidente antiguo sin observación de salida quedaba sin trazabilidad de la interrupción.

**Cambios:**
- `IncidentCenter.markMonitoringInterrupted(cameraIds, reason)` registra en el incidente **requiere revisión** y el momento/motivo de la interrupción; conserva el estado abierto, reconocido o escalado. El historial se sincroniza con Supabase usando `requires_review` y la acción existente `tracking-lost` con nota específica (sin migraciones SQL). Es idempotente.
- Se marca interrupción al detener YOLO, cambiar configuración, ocultar pestaña, salir del visor, cambiar a modo de cámara seleccionada, desconectar/alterar fuente, perder fotogramas o encontrar error de inferencia. Los trackers se reinician cuando se pierde la continuidad de la observación. La recarga marca como interrumpidos los incidentes locales que seguían abiertos. Al excluir una cámara del modo multicámara se descartan únicamente sus tracks efímeros y cooldowns de regla, conservando los de las cámaras todavía activas.
- Tras reanudar, una nueva trayectoria **no identifica a la misma persona**. Cuando hay exactamente un incidente interrumpido de la misma cámara/zona/regla, se asocia como observación provisional y no se crea otra apertura por ese primer track. **Nunca** se cierra el caso anterior por la salida de una trayectoria posterior a la interrupción; se registra la nueva observación y se exige reconocimiento y cierre manual con nota. No se infieren salidas durante ausencia de señal.
- Si hay varias personas previas compatibles, no se fusionan sus identidades sin evidencia: los nuevos incidentes son independientes. Si aparece una segunda trayectoria después de la primera correlación, genera un incidente distinto. Correlación por zona **no equivale a identificación personal** y puede requerir intervención de supervisor.
- El módulo Incidentes muestra «Observación interrumpida · revisión obligatoria» y una indicación de salida posterior no verificada. El reporte diario solo incluye cierres reales; una interrupción no genera un reporte de incidente cerrado.
- **Sin alteraciones** de modelos ONNX, umbrales, confirmación de cuadros, intervalos 60/75/100 ms, roles, políticas RLS, secretos ni funciones de envío. El cierre automático por salida continua observada sigue funcionando normalmente.

**Pruebas nuevas:** `tests/monitoringContinuityStage7.test.ts` cubre pausa idempotente, selección por cámara, zona vacía tras pausa, nuevo track asociado sin duplicar, cierre bloqueado tras pausa, cierre manual auditado, cierre normal continuo, múltiples personas sin fusiones, recarga con historial, sincronización remota y escalamiento. Los casos no generan YOLO simulado en la aplicación; validan exclusivamente el contrato estructurado del seguimiento.

**Validación en Chrome (pendiente):** abrir incidente mediante YOLO real → detener modelo → dejar salir a persona → reiniciar → comprobar que no se cierra ni se duplica → reconocer y cerrar con nota → ver auditoría en local y Supabase; repetir con una persona aún dentro, pérdida de webcam, pestaña oculta y modo cámara seleccionada. Ejecutar `npm run test && npm run typecheck && npm run build` y verificar CI/Vercel antes de aprobar.


### Etapa 7 — Refinamiento de navegación: pestañas de Incidentes y Reportes (v1.9.4, ajuste de interfaz)

- **Incidentes:** dos pestañas, «Incidentes» y «Auditoría de acciones»; las tres tarjetas de resumen (pendientes de reconocer, sin cierre y cerrados) siguen visibles en ambas; el estado sin alarmas se traslada posteriormente a Configuración. Se mantienen filtros, paginación, exportación y modales de reconocimiento/cierre.
- **Reportes:** tres pestañas, «Operación y sincronización» (simulación de cierre diario, envío al administrador y Supabase), «Informes generados» y «Auditoría de reportes». Las tarjetas generales de reportes permanecen visibles. Los avisos de generación/descarga aparecen por encima de las pestañas para ser visibles desde cualquier sección.
- Se incorpora el componente compartido `Tabs`, con semántica `tablist` / `tab` / `tabpanel`, control con flechas izquierda/derecha, `Home`/`End`, foco visible y barra horizontal desplazable en pantallas pequeñas; los paneles inactivos no montan tablas ni lógica innecesaria.
- **Sin cambios funcionales** en inferencia YOLO, estados de incidentes, persistencia, sincronización automática, permisos RLS, Resend ni Cron. Esta es una mejora de presentación, no un nuevo cierre de etapa.
- Validación: `npm run test && npm run typecheck && npm run build`, comprobar tabs con ratón y teclado, filtros y tablas paginadas, las tres tarjetas persistentes y visualización móvil/tema oscuro.


### Etapa 7 — Ajuste UI posterior a v1.9.4: pestañas redondeadas y alerta de Monitoreo (17/11/2026)

- `Tabs` es un componente compartido: barra con fondo, borde y esquinas redondeadas; pestaña activa resaltada como superficie independiente; teclado con flechas y Home/End y adaptación móvil. Se aplica a Incidentes, Reportes y Configuración.
- **Incidentes:** conserva las tres tarjetas de indicadores sobre sus dos pestañas, pero retira la tarjeta de alarma, que no es una tabla ni una acción propia del historial.
- **Configuración:** pestañas «General» (configuración activa, apariencia, importación y tarjeta «Sin alarmas sonoras pendientes» cuando no hay pendientes), «Historial de versiones» (solo su tabla) y «Auditoría local» (solo su tabla). El diálogo de reversión se mantiene fuera del panel para que siga operativo desde la segunda pestaña.
- **Monitoreo:** cuando hay alarmas pendientes, se muestra una notificación flotante compacta en la esquina superior derecha, con reconocimiento, control de audio y enlace a Incidentes. Desaparece al reconocer la última alarma. La tarjeta grande ya no aparece en el Panel principal. El indicador global continúa en el menú de cuenta.
- Solo se modifican elementos de presentación y visibilidad; no cambian el centro compartido de incidentes, la lógica YOLO ni los trabajos remotos. La alerta sonora requiere habilitación explícita del usuario.
- Validar: `npm run test && npm run typecheck && npm run build`; verificar pestañas con teclado y móvil, abrir/reconocer alarmas sin interrumpir YOLO, comprobación de ausencia de notificaciones inactivas en Incidentes/Panel principal y tema oscuro.


### Ajuste de interfaz v1.9.4 — Animación de alarmas y paginación unificada

- La notificación flotante de Monitoreo entra desplazándose suavemente desde arriba y sale hacia arriba cuando la última alarma se reconoce. React conserva el elemento hasta completar la animación de salida, y cancela dicha salida si aparece una nueva alarma. Respeta `prefers-reduced-motion`.
- Todas las tablas del sistema usan `DataTable` y el selector compartido `PageSizeSelector`, con opciones **5, 10 y 20** registros por página. Se muestran **5** al iniciar cada tabla; cambiar la cantidad vuelve a la primera página.
- Se eliminaron tamaños de página específicos de Incidentes y Reportes. Las tablas de Cámaras y Configuración también usan el mismo componente.
- No se alteraron YOLO, reglas de incidentes, sincronización Supabase ni la programación Resend/Cron.
- Verificar en Chrome transiciones de alarma, botones de paginación en todas las pestañas, teclado, tema oscuro y móvil.


### Ajuste visual v1.9.4 — tablas y filtros (2026-11-17)

- `DataTable` conserva selector compartido de 5/10/20 registros, paginación y conteo de páginas, pero ya no muestra la leyenda redundante «Mostrando X–Y de Z».
- En Cámaras, la búsqueda se sitúa a la izquierda del filtro de fuente en escritorio; ambos se apilan sin desbordamiento en móviles.
- Los `<select>` de tarjetas, filtros y formularios comparten una flecha con 0.9 rem de separación desde el extremo derecho y espacio reservado para el texto, adaptada a temas claro y oscuro.
- No se modifican detección YOLO, reglas, alarmas, persistencia ni integraciones remotas.
