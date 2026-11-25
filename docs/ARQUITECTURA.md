# VISION AI — Arquitectura vigente (etapa 4, incremento multicámara)

Referencia: PDF rector, secciones 4–6, 8–12 y 17. Arquitectura por capas con dependencias hacia el dominio; dominio sin React, Three.js, base de datos ni ONNX.

## Flujo de datos real (implementado)

```text
[Una escena Three.js: almacén + maquinaria]
           ├── [CAM-01: almacén] ──┐
           └── [CAM-02: maquinaria]┤ (muestreo alternado)
                                   ▼
                            CameraRoundRobin
                                   ▼
                         Captura RGB 640x480
                                   ▼
                        Web Worker ONNX Runtime
                                   ▼
                         YOLOv8n (clase person)
                                   ▼
                      cajas y confianza [0,1]
                                   ▼
                VisualZoneMonitor independiente
                  por cámara (punto inferior,
                 polígonos y reglas versionadas)
                                   ▼
               VisualIncidentCoordinator + RuleEngine
                                   ▼
                      IncidentStateMachine
                                   ▼
               estado y eventos en memoria / panel
```

El único `SimulationWorld` contiene la escena y las cámaras. Usa un renderizador para el canvas principal y otro para generar capturas RGB, **sin crear un mundo por cámara**. Los movimientos 3D y su propia regla geométrica se usan para animación y comparación, pero su `onEvent` se descarta al construir el panel integrado; **no** alimentan el coordinador de incidentes visuales. La entrada a este es `VisionEvent.source === 'yolo'` generado por detecciones devueltas por ONNX.

## Capas y rutas

| Capa | Ruta | Responsabilidad |
| --- | --- | --- |
| Dominio | `src/core/domain/` | Camera, Zone, Rule, Incident, Track, validadores, `ZoneEvaluator`, `RuleEngine`, `transitionIncident`, punto en polígono. |
| Aplicación | `src/application/` | `CameraRegistry`, `VisualIncidentCoordinator`, puertos `CameraRepository`, `VideoSource`. |
| Infraestructura | `src/infrastructure/` | `SimulationWorld`, personaje Three.js, ONNX Worker, persistencia local. |
| Presentación | `src/modules/` y `src/app/` | Layout, rutas, gestión de cámaras, editor de zonas y dashboard de monitoreo. |
| Comunes | `src/shared/` | Button, DataTable, Modal, Spinner, Panel, PageHeader, StatusBadge, etc. |
| Pruebas | `tests/` | Tests heredados y nuevos del núcleo. |

Los archivos históricos de fase 0 `src/domain/*` mantienen exportaciones compatibles de tracking y geometría mientras se consolida el contrato de vídeo en la etapa 4. `src/domain/imageZones.ts` reexporta el núcleo `src/core/domain/spatial.ts` para no duplicar algoritmos.

El frontend es **SPA única** (`index.html`, `/monitoreo`), ya no existe `lab.html`. El módulo `MonitoringPage` se carga con `React.lazy` para no descargar Three.js en el Dashboard. El Worker se empaqueta como recurso separado por Vite.

## Decisiones y compromisos

1. **Fuente ≠ modelo:** `Camera.sourceType` describe origen (`virtual-3d`, `video-loop`, `webcam`, `ip-camera`). El motor YOLO se selecciona independientemente (WebGPU/WASM). Solo las dos primeras perspectivas virtuales están implementadas.
2. **Contrato de coordenadas:** polígono, caja, punto inferior y distancia a conos son normalizados [0,1] **en imagen de captura**, no del mundo. El zoom de captura puede invalidar visualmente un polígono existente; el operador debe redibujarlo.
3. **Anti falsas alarmas:** tracking `VisualZoneMonitor` requiere 3 capturas consecutivas dentro y 2 observaciones fuera; pérdidas temporales no confirman salida. `RuleEngine` aplica clase, umbral y cooldown al evento confirmado. `IncidentStateMachine` valida la transición y conserva `requiresReview` ante pérdida de seguimiento.
4. **Visión real:** el Worker solamente reconoce `person` (clase 0 COCO). Conos/casco/chaleco se modelan en el dominio, pero NO se presentan como detecciones reales.
5. **Datos:** cámaras, zonas y reglas en repositorio local versionado con validación Zod, importación atómica, reversión y auditoría local (etapa 3). Los incidentes están solo en memoria de sesión global. Conexión Supabase/Auth/RLS pendiente.
6. **Costos:** Vercel frontend, Supabase/Auth/Cron y Resend posteriormente. Render/FastAPI si se necesita un backend permanente; no desplegar Python en esta etapa.
7. **Identificación DEMO/REAL:** la fuente es `3D virtual` (escena sintética), pero la **inferencia es REAL YOLO**. No equiparar la escena simulada con una detección simulada.

## Relación con el PDF v2.0

Se respetan las secciones 3 (tipos de zona), 4 (pipeline), 5 (independencia de dominio), 6 (dominio), 7 (datos validados), 8 (objetivos de rendimiento), 15 (sin biometría) y 16 (pruebas). Existen diferencias **aprobadas**:

- Se adelanta una integración YOLO real al producto **durante la etapa 2**, en lugar de reservar el detector para la fase real/etapa 8.
- Se retira la entrada experimental y el iframe de la etapa 1, llevando el motor de inferencia a `/monitoreo`.
- La etapa 2 ofrece un editor local de zona por cámara antes del importador versionado de etapa 3.
- El caso de «cono detectado» solo se podrá marcar como real cuando exista un modelo capaz de identificarlo; por ahora es funcionalidad pendiente, no detección simulada.
- La etapa 4 añade **muestreo alternado** de ambas perspectivas mediante un solo Worker de inferencia y seguimiento independiente por cámara; la selección del visor no cambia el mundo compartido.

## Trabajo pendiente y criterios del siguiente incremento

La configuración local de etapa 3 ya dispone de validación Zod, importación atómica, idempotencia, versionado y auditoría **local**. Sigue pendiente integrar y validar Supabase/Auth/RLS con roles reales, sin exponer credenciales privilegiadas al navegador.

La etapa 4 **no está cerrada**: falta implementar VideoSource para archivos de vídeo en bucle, webcam y creación dinámica de nuevas perspectivas del mundo 3D. Un registro `CAM-03` todavía no tiene perspectiva virtual o fuente conectada automáticamente. RTSP/IP requiere una solución de transporte compatible con navegador.


## Decisiones incorporadas en etapa 3

- **Escenario único con operario detallado:** `SimulationWorld` instancia dos `createWorkerCharacter` de un solo diseño (C original). Cámaras CAM-01/CAM-02 son distintas perspectivas de la misma escena. Los datos internos de los personajes no se transmiten al detector ONNX.
- **Carga versionada:** `application/config/configSchema.ts` valida con Zod; `infrastructure/config/VersionedLocalConfigRepository.ts` guarda un único objeto `{active,versions,audit}`. La configuración activa alimenta directamente la gestión de cámaras, zonas y reglas usadas en Monitoreo.
- **Integridad:** FNV-1a es comprobación local de corrupción accidental, NO firma de seguridad. El almacenamiento local no dispone de transacciones multiusuario y el rol Administrador local no es autenticación.
- **Supabase:** se entrega `supabase/migrations/20261114_config_baseline.sql` como esquema de referencia. La etapa 3 no activa una conexión cloud sin credenciales, Auth ni controles de concurrencia. Para producción será necesaria validación del lado servidor, RLS y publicación atómica multiusuario.


## Flujo multicámara y semáforo (incremento de etapa 4)

`CameraRoundRobin` decide qué perspectiva 3D habilitada capturar en cada turno. La captura se realiza en un único `SimulationWorld` y se transfiere al Worker ONNX en un solo turno pendiente. Cada perspectiva cuenta con un `VisualZoneMonitor` independiente: sus IDs de track son **locales a esa cámara**. El coordinador de incidentes conserva las claves cámara/zona/track para evitar colisiones entre perspectivas.

Las etiquetas SVG de `/monitoreo` usan `trackVisualState`:

- `outside` observado = fondo **verde**.
- `inside` observado = fondo **rojo**; no equivale necesariamente a un incidente confirmado.
- `pending` o track `seen=false` = **gris**, nunca se presenta como seguridad confirmada.

El color responde a la evaluación del **polígono en imagen** mediante la caja inferida por YOLO. La zona roja del suelo 3D es decorativa y no es el origen de las detecciones. En CAM-01 sin polígono restringido se muestra gris hasta configurar uno. Al cambiar zoom o configuración se reinician los tracks para no reutilizar coordenadas incompatibles.

La suma multicámara es **suma de detecciones activas**, no deduplicación de personas entre ángulos. Un modo alternado con `intervalMs=300` reduce teóricamente la frecuencia de cada cámara respecto a «Solo seleccionada»; medir sobre el hardware del usuario.

**Alcance:** no se han activado aún vídeo en bucle, webcam, cámaras 3D dinámicas ni sincronización real con Supabase. Este incremento no declara cerrada la etapa 4 ni las tareas cloud de etapa 3.

## Ampliación de etapa 4: fuentes locales y carga diferida (v1.4.0)

**Implementado:** `/monitoreo` ahora tiene un selector general de cámaras habilitadas. Las fuentes `virtual-3d` CAM-01/CAM-02 comparten el `SimulationWorld` original y el planificador alternado. Los registros `video-loop` y `webcam` abren un adaptador `BrowserMediaSource` de navegador que encapsula el elemento `HTMLVideoElement` (archivo temporal con URL local o webcam mediante `getUserMedia`). Cada vista se carga por separado mediante `React.lazy`: la selección de un vídeo o webcam no crea una escena WebGL de Three.js.

El adaptador de fuente externa convierte fotogramas con `drawImage` a un canvas de 640 × 480 con **letterboxing** para respetar la relación de aspecto, y el coordinador `useBrowserMediaMonitoring` transfiere esos fotogramas a `OnnxWorkerVisionEngine`. El análisis de zonas ocurre en el mismo sistema de coordenadas normalizadas de las capturas. La caja y el punto de contacto con el suelo provienen del modelo; el archivo no codifica detecciones manuales.

La configuración guarda el registro de cámara y sus zonas/reglas, **no guarda el vídeo, webcam, clips ni píxeles**. Desconectar o cambiar de tipo de vista llama a `dispose()` y libera pistas, Object URLs y Worker anterior. La webcam requiere autorización del usuario y contexto seguro. Cuando la fuente se pierde no se emiten detecciones ni salidas falsas; el indicador muestra «Sin señal». El estado de los incidentes sigue siendo temporal y local.

**Precisión sobre el alcance:** todavía no se ejecuta una alternancia universal entre cámaras 3D y todas las fuentes externas. El planificador alterna CAM-01/CAM-02 en la vista 3D y la fuente externa procesa solamente la cámara seleccionada. La ampliación a cámaras 3D dinámicas requiere un modelo persistente de pose de cámara y controles del visor. La fuente `ip-camera` sigue sin adaptador real. La persistencia remota con autenticación y la ejecución permanente requieren etapas posteriores. La implementación actual pausa la inferencia al ocultar pestaña y no sustituye la vigilancia desatendida.


## Etapa 4 v1.5 — Perspectivas virtuales configurables

El adaptador Three.js `SimulationWorld` conserva **un único `THREE.Scene`** con los dos personajes C. El registro versionado de cámaras provee las poses `virtualPose` con posición XYZ, punto objetivo XYZ y FOV. Para configuraciones heredadas CAM-01/CAM-02 se conserva un ángulo por defecto idéntico al prototipo. Cambiar una perspectiva reutiliza `THREE.PerspectiveCamera`; no crea más escenas ni más Workers ONNX.

La pantalla Cámaras ofrece un editor con previsualización bajo demanda, validación de rangos y tres presets. En Monitoreo el planificador `CameraRoundRobin` recibe el listado dinámico de cámaras virtuales habilitadas, mantiene un único trabajo de inferencia en tránsito y un `VisualZoneMonitor` **por cámara**. La misma salida real del detector alimenta reglas/estado de incidentes. Zonas de imagen normalizadas, tracks y métricas pertenecen a la perspectiva respectiva. El conteo total suma detecciones recientes por cámara, no individuos únicos.

La fuente MP4 o webcam continúa siendo un adaptador alternativo que analiza solo la fuente seleccionada; no se combina en la alternancia 3D. Persistencia en localStorage versionado, sin sincronización Supabase. La cámara de vista previa no hace inferencia ni guarda datos por sí sola. Los objetos 3D no generan detecciones artificiales.


## Estado de integración v1.5.2 — Política estática de fuentes

El gestor da prioridad a cámaras `virtual-3d` fijas. Cada perspectiva renderiza la misma escena Three.js y el único Worker ONNX analiza el fotograma RGB; la salida de YOLO atraviesa tracking, evaluación espacial y casos de uso de incidentes. Las cámaras MP4/WebM y webcam usan `BrowserMediaSource` y se analizan solo cuando están seleccionadas. No se envía ni guarda vídeo.

`cameraMonitoringPolicy` impide evaluar polígonos de imagen en cámaras 3D que estén realizando barrido. El cambio de perspectiva o de tipo de fuente invalida la zona previa, que queda desactivada y versionada; el zoom de captura no puede cambiarse mientras exista una zona activa. Son decisiones de seguridad para evitar correlacionar una imagen nueva con un polígono anterior. Para cámaras físicas con movimiento, se exigirá recalibración o reproyección al suelo antes de activar reglas de seguridad.

**Etapa 5:** el adaptador de audio y los publicadores en tiempo real se conectarán a los eventos de dominio y no a coordenadas de Three.js. Aún no existe una alarma de producción ni persistencia remota de incidentes; la autenticación de Supabase debe validarse antes de habilitar acciones de supervisor/administrador.

## Etapa 5 — Alarmas y ciclo de incidentes (v1.6.0)

**Evento visual confirmado** `VisualZoneMonitor` → `VisualIncidentCoordinator` → `IncidentCenter.ingest` → suscripción local → dashboard / barra de alarma / historial / auditoría. El centro de incidentes no importa Three.js ni React; sólo acepta incidentes `source='yolo'`. Las claves de evento incluyen cámara, zona, regla, track y momento de apertura; el ID de seguimiento es local por cámara. Las actualizaciones repetidas no reabren incidentes reconocidos.

`IncidentCenterProvider` aloja el centro durante toda la navegación SPA y conecta el puerto de audio mediante `Siren` de Web Audio. **Habilitar audio requiere un gesto del usuario**; la alarma siempre tiene señal visual y texto. Una única sirena continúa mientras queden incidentes `open` o `escalated`. Reconocer uno no silencia los otros. El escalamiento local a los 60 s queda registrado y no se repite; `acknowledged` conserva el incidente abierto hasta que haya salida visual confirmada o un cierre humano con nota y auditoría.

El historial utiliza sólo metadatos estructurados en `localStorage`, con límite de 300 incidentes/1200 eventos. No almacena imágenes ni clips, no verifica identidades de supervisor y no se presenta como **persistencia remota**. Este bus es local a la aplicación; no hay WebSocket/SSE entre equipos hasta integrar los servicios de backend. Con la pestaña oculta se pausa inferencia YOLO y con la vista Monitoreo desmontada no se capturan nuevos fotogramas. Para vigilancia 24/7 hace falta servicio independiente. Los reportes de etapa 6 consumirán eventos cerrados de este centro, con idempotencia por incidente/periodo.


## Etapa 6 — Reportes y automatización local/servidor

Pipeline local: `IncidentCenter` (incidente YOLO confirmado y cerrado) → `ReportCenter.syncClosedIncidents` → `ReportDocument` inmutable con cronología y resumen → `ReportCenterProvider` → `/reportes` → exportadores PDF/CSV/JSON → auditoría local. El evento se recibe por suscripción, pero **sincronizar por snapshots no duplica reportes** gracias a su clave natural. El reporte diario se obtiene por **fecha de apertura en Lima**; los cambios de estado y las auditorías aparecen vinculados al ID local.

- `src/core/domain/report.ts`: datos/estadísticas, periodos y casos puros sin navegador.
- `src/application/reports/ReportCenter.ts`: orquestación idempotente, conservación y auditoría.
- `src/infrastructure/reports/reportDownloads.ts`: exportación local, sin subida a terceros.
- `src/app/providers/ReportCenterProvider.tsx`: puente de suscripción a incidentes y tick local del día anterior.
- `supabase/migrations/20261115_reports_pending.sql`: estructura futura de `vision_incidents`, `vision_reports` y `vision_report_jobs`. RLS habilitada sin permisos de navegador.
- `supabase/functions/vision-daily-report`: ejemplo de worker protegido por secreto propio + Resend; usa los metadatos que **habrá que sincronizar primero** en Supabase. No está desplegado ni conectado al frontend.

**Advertencia de arquitectura:** no existe todavía una sincronización multiusuario confiable ni un envío automático 24/7. El SQL y la Edge Function son preparatorios; no se deben activar como si el repositorio local ya alimentase la base remota. La siguiente integración requiere Auth/RLS, mapeo seguro de usuarios, validación de origen y manejo de conflictos al sincronizar. Los reportes individuales generados en navegador solo existen allí; el correo del servidor dependerá exclusivamente de los incidentes remotos.

### Extensión remota de la etapa 6 (v1.8.0)

El frontend mantiene los centros locales de incidentes y reportes. Una capa opcional de
Supabase Auth/RLS permite subir incidentes `source='yolo'` y eventos de auditoría,
únicamente tras autorizarlo. Se usan IDs con usuario + instalación + incidente local,
para evitar colisiones de los contadores independientes del navegador. Los datos
compartidos son **metadatos del detector, no pruebas biométricas ni imágenes**.

Supabase Cron invoca una Edge Function protegida mediante `@supabase/server` con autenticación `secret` y una clave `sb_secret_*` guardada en Vault. Esta produce un snapshot
del día civil anterior en Lima, lo archiva en PostgreSQL y lo envía como resumen HTML
mediante Resend. `vision_report_jobs` conserva intentos y estado, y el ID de Resend
significa **aceptación de la API**, no entrega confirmada al destinatario. La política
RLS exige membresía y restringe la escritura al propietario de los incidentes.

La inferencia permanece en el navegador y los eventos no existen remotamente si el
navegador no está analizando o si la sincronización no fue autorizada/conseguida.
El panel remoto no almacena claves privadas en el frontend.

### Entrada autenticada de v1.8.1

`ThemeProvider → AuthProvider → AuthenticatedProduct` comprueba sesión real con Supabase Auth y membresía RLS. Solo con rol administrador se montan `CameraRegistryProvider → IncidentCenterProvider → ReportCenterProvider → RemoteSyncProvider` y las rutas del producto. La vista pública `/login` no inicializa cámaras/ONNX, ni consulta incidentes o reportes locales. El módulo de Reportes solo solicita consentimiento independiente para sincronizar datos reales.

La validación de rutas y botones en React **no reemplaza** el aislamiento RLS ni el control de operaciones en servidor. Antes de habilitar usuarios múltiples, migrar/aislar `localStorage` por propietario, diseñar permisos RBAC de módulos y acciones, y probar denegaciones con usuarios autenticados diferentes.

## Etapa 7 · Módulo de calidad y límites de validación (v1.9.0)

La ruta `/guia` está detrás de `AuthenticatedProduct`, exactamente como el dashboard y Monitoreo. No introduce credenciales nuevas ni permite omitir `AuthProvider`/RLS. `QualityPage` consume únicamente snapshots ya existentes de `IncidentCenter`, `ReportCenter` y `RemoteSyncProvider`. `application/qualityGuide.ts` define un guion inmutable, y su progreso vive solo en memoria del componente; **marcar una casilla no altera registros, no dispara sirenas, no simula objetos ni ejecuta servicios remotos**.

`tests/integratedAcceptanceStage7.test.ts` realiza pruebas de integración sobre módulos reales de dominio/aplicación, inyectando eventos que cumplen el contrato de `Detection`. Esto valida transiciones y reportes, **no precisión estadística de inferencia ONNX**. El modelo para clase `person` continúa analizándose únicamente en Monitoreo. No se añade nuevo backend ni se modifica el plan Cron existente.

Accesibilidad: enlace al contenido principal, foco visible, menú móvil con Tab contenido/Escape, navegación responsiva, tablas con `caption` y región desplazable accesible y preferencia de movimiento reducido. Requiere comprobación humana adicional en Chrome con resolución reducida y lectores de pantalla para cerrar la etapa.

Datos y permisos: persistencia local por navegador; sincronización remota solo con aceptación explícita y usuario autorizado. **No habilitar otros roles** hasta aislar el almacenamiento local y probar permisos por acción, no solo visibilidad de rutas. Supabase Cron y Resend ya se configuraron, con una entrega manual validada; la ejecución programada debe verificarse todavía para cerrar etapa 6.


### Ajuste de producto y sincronización v1.9.1

La guía de calidad no se expone en la interfaz: `docs/GUIA_PRUEBAS_INTERNA.md` preserva el protocolo de aceptación; `application/qualityGuide.ts` conserva la especificación verificable por tests. La ruta `/guia` se elimina.

Tras autorizar sesión y membresía, `RemoteSyncProvider` inicia sincronización de incidentes YOLO y auditoría automáticamente; `application/remote/syncCheckpoint.ts` calcula el delta sin considerar el campo `updated_at`, usa un cursor separado por identidad e instalación y lo confirma solo tras la respuesta satisfactoria de PostgreSQL. Los reintentos se programan tras la conectividad, visibilidad de pestaña y cada minuto. Supabase RLS (no el frontend ni el cursor) controla privilegios. No se envían imágenes, clips ni datos de detección falsos. La bandeja local continúa como respaldo del navegador, sin garantía de servicio con el navegador cerrado.

El menú de cuenta reúne notificaciones de incidentes pendientes, tema, estado de sincronización y salida. Se conserva el principio de un único motor ONNX Worker; ningún ajuste de esta entrega toca el algoritmo de inferencia.

**Pendiente de seguridad para RBAC:** separar cámaras, reportes e incidentes en almacenamiento local por identidad antes de habilitar usuarios adicionales; esta versión solo concede acceso completo al administrador.


### Etapa 7 · Separación de datos locales por identidad (v1.9.2)

`AuthProvider` verifica Supabase Auth y la membresía real con RLS; **solo entonces** `RootApp` monta `AccountStorageProvider(userId)` y sus hijos. `AccountScopedStorage` aplica un espacio de claves `vision-ai:account-data:v1:<user_id>:` a los repositorios de cámaras/configuración, incidentes y reportes. El checkpoint de sincronización conserva su propia separación por `user_id + installation_id`. Esto evita que el frontend restaure automáticamente el historial de otro administrador que usó el mismo navegador.

La migración de v1.9.1 es idempotente y se asigna una sola vez a la primera cuenta admin que ingresa tras actualizar. Si falla la copia, se muestra un bloqueo de recuperación y no se inicia Monitoreo ni se suben datos incompletos. Se preservan las claves originales sin modificación para permitir recuperación; **esto no representa cifrado ni protección del almacenamiento frente al dueño del perfil del navegador**. La seguridad de PostgreSQL sigue descansando en RLS, y RBAC completo continúa pendiente de diseño/validación antes de habilitar otros roles.

`Modal` y el menú móvil usan `wrappedFocusTarget` para la accesibilidad del foco circular por teclado. No alteran el estado de YOLO ni las acciones de los incidentes. Supabase Cron, Resend y las migraciones SQL permanecen sin cambios.

### v1.9.6 — Vista multiusuario y límites de escritura

`RootApp` monta centros locales solo después de Auth/RLS y, sobre ellos, `RemoteSyncProvider → SharedHistoryProvider`. La **lectura** de Incidentes/Reportes y contadores comunes viene de Supabase (`vision_incidents`, `vision_incident_audit`, `vision_reports`, `vision_report_audit`), no del centro local de cada cuenta. El **outbox** sigue teniendo identidad usuario+instalación para evitar colisiones. Una respuesta remota del mismo usuario/instalación reconcilia decisiones humanas sin importar eventos ajenos al localStorage.

El administrador y el supervisor pueden gestionar casos de otras cuentas únicamente mediante RPC autorizada por membresía y bloqueo PostgreSQL. La tabla de auditoría es de solo anexado. Los resúmenes e informes por incidente se archivan en servidor y cada exportación se registra mediante RPC, sin claves secretas en React. La importación de datos históricos remotos es idempotente. El refresco de información se hace cada ~12 segundos (no se habilitó Realtime de Supabase ni WebSocket). El almacenamiento de configuración/cámaras, la captura YOLO y la sirena permanecen locales; **no confundirlos con el historial operativo remoto**.


### Bloque A · Contrato de diagnóstico y evidencia (18/11/2026)

La ruta de lectura prevista es `vision_incidents` + `vision_incident_audit` (para los cuatro roles) y `vision_reports` + `vision_report_audit` (administrador y auditor); la navegación cliente restringe módulos, mientras que PostgreSQL RLS y las RPC deben autorizar operaciones efectivas. El origen mantiene `IncidentCenter` + outbox local por cuenta e instalación. La escritura incremental de datos YOLO utiliza `upsert` propio y la lectura común se reconcilia sobre el origen sin copiar incidentes ajenos al almacenamiento local. `vision_act_on_incident` es la única ruta prevista para reconocimiento y cierre por revisión humana; recibe un ID global, no el ID local `INC-...`. El trigger `vision_ai_00_preserve_shared_decisions` busca impedir que un upsert tardío del sensor revierta un reconocimiento/cierre. Todos esos contratos necesitan prueba con JWT reales.

No se han realizado cambios en arquitectura, políticas RLS, esquema ni datos del servidor como parte de este diagnóstico. Se añadió un inventario SQL **de solo lectura** en `supabase/diagnostics/20261118_verificar_historial_multiusuario.sql`; sus consultas son de observación, no simulaciones de usuarios autorizados. Los resultados generados con privilegios del SQL Editor no prueban aislamiento RLS. La aceptación requiere sesiones separadas de administrador/operador, supervisor y auditor, con evidencia redactada de identidad, cronología, acciones concurrentes, lectura compartida y denegaciones.

El refresco de historial es polling aproximado cada 12 segundos, sin garantías de push ni snapshot transaccional entre las cuatro tablas. Las consultas en lotes usan paginación por desplazamiento, por lo que deberá observarse si aparecen saltos/duplicados con escrituras concurrentes antes de plantear cambios de transporte o paginación. Estas limitaciones no alteran el objetivo de las capas de dominio, aplicación e infraestructura de las páginas 5-8 del PDF v2.0.

## Bloques B/C — informes compartidos frente a despacho automático (19/11/2026)

La **fuente oficial** de reportes es `public.vision_reports` (contenido JSONB). Un cierre confirmado en `vision_incidents` ejecuta `vision_ai_incident_report` y archiva `incident:<id>` una vez; el trigger de auditoría crea `vision_report_audit`. El frontend lee ambos mediante `SharedHistoryProvider` y genera PDF/CSV/JSON al descargar. No persiste estos binarios en Supabase. El snapshot de incidente contiene `content.incident` y la cronología visible proviene de `vision_incident_audit`; por ello, la auditoría consultada puede incluir eventos posteriores al archivo.

La cola `vision_report_jobs`, la reclamación RPC `vision_claim_report_job`, `vision-daily-report`, Resend y la programación de `cron.job` se usan **solo para el correo diario**. El correo por cierre individual, sus reintentos y su estado `sent/failed` no existen actualmente. Es una desviación expresa respecto a la orquestación por evento de la página 12 del PDF v2.0; ampliarla requiere previamente definir destinos/canales, tratamiento de errores y efectos sobre RLS/datos. El cambio no se realizó en este incremento.

La Edge Function diaria puede reutilizar un snapshot ya creado por la RPC administrativa o archivar uno nuevo. La RPC **no almacena** `critical`/`high`, mientras que la versión original de la Edge Function sí lo hacía. Un único adaptador puro (`supabase/functions/_shared/dailySummary.ts`) ahora deriva los totales de severidad del arreglo de incidentes al crear el HTML. Esto preserva los snapshots históricos y evita resultados vacíos, sin tocar esquemas ni permisos. El despliegue de la función es independiente del despliegue Vercel.

Evidencia operativa: `cron.job_run_details` acredita la ejecución del SQL de pg_cron, pero no la aceptación por Resend; `vision_report_jobs.status='sent'` más `provider_message_id` acredita aceptación por API, pero no entrega a la bandeja. Comprobar el panel de Resend y el buzón destinatario. Nunca compartir claves, cabeceras de `cron.command`, tokens ni direcciones de destino.

### Evidencia de automatización compartida · 19/11/2026

Se contrastó el flujo con resultados de Supabase de B.1–B.5/C.1–C.7: **70/70 cierres con informe `incident:<id>` y auditoría de generación, sin huérfanos ni duplicados detectados**. Existen **4 reportes diarios** y **4 `vision_report_jobs` diarios en `sent`**, sin trabajos individuales por incidente. Estas cifras confirman archivo estructurado (JSONB) e idempotencia observada, **no** conversión/archivo automático de binarios PDF/CSV/JSON ni envío por cierre. Añadir despacho por incidente supondría ampliar el contrato de `ReportJob` y acordar destino/formato, protección RLS y política de fallo antes de ejecutar migraciones.

El estado efectivo de `cron.job` muestra dos entradas activas y **tres horas de disparo**: 05:05, 05:35 y 06:05 UTC (00:05, 00:35 y 01:05 Lima). `cron.job_run_details` registra 6 ejecuciones exitosas del trabajo principal y 3 de reintento. Los registros de envío contienen cuatro aceptaciones de Resend con identificador, un intento por día y ningún duplicado observado. `cron.job_run_details.status='succeeded'` solo significa que PostgreSQL ejecutó la sentencia de solicitud HTTP; `vision_report_jobs.status='sent'` y `provider_accepted_at` confirman aceptación por proveedor, **no entrega final al inbox**. Validar dicha entrega en Resend/buzón y conservar pruebas de escenarios de error antes de cerrar completamente C.

La corrección de presentación de métricas `critical/high` en el correo diario corresponde al incremento B/C previo y requiere despliegue explícito de la Edge Function; el historial SQL por sí solo no confirma que esa versión del código ya esté desplegada. No hubo cambios adicionales de modelo de datos, RLS o disparadores en este registro documental.


### Bloque D1 · Límite de entradas y mantenimiento de dependencias (19/11/2026)

`application/config/configSchema.ts` conserva la validación Zod y el rechazo atómico de configuración. Además, `validateConfig(unknown)` controla el largo de las tres colecciones de primer nivel (cámaras <= 100, zonas <= 250, reglas <= 500) **antes** de procesar elementos. Es defensa en profundidad ante entradas ajenas al formulario, no sustituye las comprobaciones semánticas ni la restricción de tamaño de archivo (256 KiB) del módulo Configuración. El dominio sigue independiente de Zod y React.

Las dependencias de seguridad se migran **en el equipo del desarrollador**, ejecutando `scripts/upgrade-security-stage7.mjs`. El script cambia únicamente `package.json`, regenera `package-lock.json` con npm y verifica las versiones vulnerables; para aprobar requiere después pruebas, TypeScript, build, auditoría de release y `npm audit`. No se publica un lockfile no verificable ni se modifican esquemas, RLS, cron o Edge Functions. El frontend continúa con React/TypeScript/Tailwind/lucide-react y temas claro/oscuro/automático.

La confirmación operativa del Bloque C incluye un despliegue de `vision-daily-report` y recepción del correo diario en el buzón comunicados por el administrador (19/11/2026). El informe diario es distinto del despacho por cada cierre de incidente, aún pendiente de decisión arquitectónica (página 12 del PDF v2.0).

### Etapa 7 · Instrumentación D2 de rendimiento (19/11/2026)

**Sin cambios de arquitectura/RLS**: los hooks de monitoreo `useVirtualMonitoring` y `useBrowserMediaMonitoring` añaden a cada captura YOLO `cycleMs`, obtenido con `performance.now()` desde adquisición de frame hasta retorno de `IncidentCenter.ingest` y motor de reglas local. El tiempo `inferenceMs` ya lo informa el adaptador ONNX en Web Worker y no incluye el ciclo completo. El nuevo módulo puro `modules/monitoring/performanceEvidence.ts` selecciona el último segmento continuo visible (máximo 12 s, mínimo 5 muestras y 2 s); descarta mediciones obsoletas tras suspender pestaña. `PerformanceDiagnostics` es una presentación común y accesible para escena 3D, webcam y videos.

El rendimiento por cámara se calcula a partir de marcas temporales de las inferencias terminadas; en 3D el planificador alterna perspectivas, **no** hay procesos simultáneos ni GPU por cámara. P95 representa el valor nearest-rank de los tiempos observados, no un contrato de SLA. El JSON exportado contiene solo parámetros y mediciones locales de la sesión, sin envíos, sin fotos, sin ID de usuario y sin relación con `vision_reports`; no sustituye reportes ni auditoría oficial. `cycleMs` **no** mide el comienzo audible de `Siren.start` ni el tiempo de entrada real a una zona; nunca debe utilizarse para declarar cumplida la latencia detección→alarma <1,5 s del PDF pág. 11. Ese resultado sigue pendiente de medición E2E con audio realmente habilitado.

No se han modificado `VisualZoneMonitor`, `VisualIncidentCoordinator`, las transiciones del dominio, `IncidentCenter`, sincronización multiusuario, automatización Cron, tablas, RLS, Edge Functions ni el selector 60/75/100 ms. El incremento D2 no contiene lockfile: en Windows conservar `package.json` + `package-lock.json` seguros previamente aprobados.


### D2 · Reasociación provisional tras pérdida de seguimiento (hotfix de seguridad funcional)

`VisualZoneMonitor.step` emite `VisionEvent` con `box` normalizada de la detección YOLO (solo metadato temporal). `VisualIncidentCoordinator.observeTracks` recibe la última posición visible por cámara; `ingest` continúa aplicando la confirmación temporal ya efectuada y `RuleEngine`/`IncidentStateMachine`. Si un track previamente abierto se pierde, su incidente queda `requiresReview`. Una nueva trayectoria se puede vincular **provisionalmente** a ese incidente solo con coincidencia espacial alta y temporal corta, candidato único y misma cámara/zona/regla. Nunca se presume identidad personal ni continuidad comprobada tras el corte. La salida de una trayectoria provisional NO es un evento de cierre del incidente original; requiere decisión del supervisor.

Los mapas auxiliares de cajas y aliases se vacían al reiniciar seguimiento o excluir la cámara y nunca llegan a `IncidentCenter` persistente ni a Supabase. `IncidentCenter` sigue haciendo persistencia y sincronización de metadatos oficiales de la misma manera. Un segundo trabajador con caja separada, dos trayectorias visibles al mismo tiempo o una entrada nueva tras una salida generan sus propios incidentes. No se han añadido librerías, migraciones, triggers, cambios de RLS o tablas, ni se ha alterado el despacho de reportes. Si siguen apareciendo incidentes múltiples, debe revisarse el log por cámara/track para distinguir detecciones simultáneas, falsos positivos YOLO y nuevas trayectorias tras interrupción; no se deben agrupar todas las alertas de una zona a ciegas.

## Continuidad de tracks virtuales 3D (D2, 19/11/2026)

`VisualZoneMonitor` permanece en dominio, sin dependencia del renderizador ni de identidades de personajes. El seguimiento une cajas por IoU y proximidad; la confirmación de entrada sigue exigiendo fotogramas detectados consecutivos. En cámaras 3D, `useVirtualMonitoring` configura `lossGraceMs: 1200` para tolerar pérdidas cortas de detección de YOLO a ~13 FPS. El valor predeterminado del rastreador sigue siendo 0 ms y las fuentes webcam/video conservan la política existente.

Para cámaras 3D con `lossGraceMs`, el vencimiento se determina por el tiempo monotónico transcurrido desde la última observación real. Si se supera la gracia, se emite `lost` aunque el navegador no haya procesado suficientes capturas vacías para acumular `maxMisses`; esto evita reasociar un track tras suspensiones o saltos del reloj. Sin gracia explícita, las fuentes mantienen la política clásica de `maxMisses`. La pérdida nunca equivale a salida confirmada, y no se emite `left` por falta de imagen. Una detección posterior recibe un track nuevo sin atribución automática de identidad. Las dos personas detectadas en el mismo fotograma se procesan como tracks independientes. `VisualIncidentCoordinator` mantiene su reconciliación conservadora sin cambios. No hay modificaciones a Supabase ni a la máquina de estados.

**Límite de evidencia:** el JSON de CAM-02 solo registra conteos por fotograma y la última caja observada, no la historia de posiciones. Una prueba de regresión puede replicar la intermitencia, pero no garantizar la identidad visual de detecciones pasadas. Si persiste la duplicación, ampliar la telemetría temporal de cajas (solo memoria y exportación local) antes de relajar distancias de asociación.

## Etapa 8 · E1: evaluación offline sin cambiar la arquitectura (19/11/2026)

**Límite de responsabilidad:** `scripts/evaluate-vision-stage8.mjs` es una herramienta local de calidad científica, ajena al pipeline de procesamiento de vídeo en vivo, a `VisualIncidentCoordinator`, a los adaptadores ONNX y a la persistencia. Recibe JSON etiquetado con contrato `vision-ai-eval-v1`: `dataset` (identificador), `frames[]` (`cameraId`, `frameId`, `truth[]`, `predictions[]`); cada elemento contiene `class` (`persona`, `cono`, `casco`, `chaleco`) y `box` normalizada (`x`, `y`, `width`, `height`), y las predicciones incluyen `confidence`. Nunca incluye píxeles, fotos, clips ni claves de acceso. Se valida el límite del archivo y se comprueba que no haya cajas inválidas o frames repetidos de la misma cámara.

**Cálculo:** ordenar las predicciones de cada clase y fotograma por confianza descendente, eliminar las inferiores al umbral solicitado y emparejar una a una con la etiqueta humana libre de mayor IoU, si supera el umbral. TP = emparejamiento; FP = predicción sin coincidencia; FN = etiqueta no emparejada. Informar precisión `TP/(TP+FP)`, recall `TP/(TP+FN)` y F1 (0 cuando el denominador es cero), por clase y conjunto. Los resultados para clases sin datos (support=0) tienen cero convencional y **no** prueban ausencia de errores del modelo. No calcula mAP, tasa de falsas alarmas por hora, calidad de tracking ni métricas de audio.

**Diferencia DEMO/REAL:** `decodePeople()` continúa leyendo exclusivamente `person` (clase 0 COCO). Cualquier resultado para conos/cascos/chalecos en el CLI solo evalúa las predicciones **entregadas** como entrada; no significa que el modelo actual las pueda generar. La integración de un detector para esas clases requerirá validación de modelo, compatibilidad de pre/postprocesado, umbral propio por clase y pruebas de no regresión. Se conserva `VisionEngine`, el Worker, Three.js, la separación por cámara, la auditoría y RLS existentes.

**Comparación de opciones a decidir después de datos etiquetados:** (1) detector compatible con ONNX Runtime Web en el Worker: reutiliza la infraestructura actual, sin servicio nuevo, pero depende del navegador y hardware; (2) API Python + servicio de visión: permitiría ejecución independiente del navegador y modelos mayores, pero requiere servidor disponible, ancho de banda, protocolos seguros, costos y cambios de privacidad; (3) WebSocket/SSE: resuelve distribución más inmediata entre clientes, no mejora por sí mismo la detección ni sustituye la evaluación del modelo. Ninguna alternativa está aprobada o desplegada por este incremento.

## E2.1 — Adaptador de conos independiente (19/11/2026)

`useVirtualMonitoring` mantiene `OnnxWorkerVisionEngine` (COCO persona) y puede
activar `OnnxConeWorkerEngine` (PPE `Safety Cone`, clase 6) manualmente. Cada adaptador
posee un Web Worker y una sesión ONNX aislada; la inferencia secundaria usa
`createImageBitmap` del mismo fotograma RGB a intervalos ≥650 ms. Las coordenadas
proceden únicamente de píxeles y se normalizan sobre la imagen original. La
preparación del segundo modelo respeta la exportación `stretch 640×640` indicada por
su autor (no el letterbox 640×480 del motor de personas).

**Separación invariante:**
`cono.real` → `conePostprocess` → estado temporal/overlay ámbar/JSON local;
**nunca** → `VisualIncidentCoordinator` / `IncidentCenter` / `vision_incidents` /
alarma sonora. `persona.real` sigue el camino de reglas, incidentes y reportes.
`cono.demo` permanece en `PrecautionDemo` y se etiqueta DEMO. No se almacenan imágenes.

El motor secundario se activa bajo demanda: si falla su descarga/inicialización/
inferencia no debe detener el modelo de personas ni falsificar una salida confirmada.
Durante una pestaña oculta se invalidan los resultados de conos. Todavía no hay
asociación geométrica validada persona–cono ni informes oficiales de precaución; se
considerarán en una fase posterior y con una decisión explícita de modelo de datos.

Modelo y ficha del autor: https://huggingface.co/mancalazure/construction-ppe-safety
(fichero `best.onnx`, pesos CC BY 4.0 y SHA-256 fijado en script). No se incluyen
pesos en el ZIP; se descargan explícitamente para desarrollo y opcionalmente en el
build de Vercel tras verificar consumo de recursos.
