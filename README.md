# VISION AI — Etapa 6: acceso obligatorio y conexión remota · v1.8.1

Plataforma académica de monitoreo visual con **YOLOv8n real** (ONNX Runtime Web + Web Worker). Las cámaras 3D comparten un único mundo Three.js, y las fuentes MP4/WebM y webcam también permiten inferencia real sobre fotogramas. Los personajes 3D son sintéticos, **pero su detección se realiza sobre píxeles**, no mediante sus posiciones internas.

## Instalar en VSCode / Git Bash

```bash
npm install
npm run model:download
npm run test && npm run typecheck && npm run build
npm run dev
```

Abre `http://127.0.0.1:5173/`: se redirige a `/login` hasta iniciar sesión como administrador. Si actualizas desde v1.6.0, aplica el ZIP de actualización sobre la raíz del proyecto y conserva `node_modules/`, `public/models/` y la configuración local. Detén Vite con `Ctrl+C` antes de reemplazar archivos. Si el modelo ONNX ya está descargado, no necesitas repetir su descarga.

## Etapa 5: prueba guiada de alarmas

1. En **Monitoreo**, pulsa **Activar alarmas sonoras**. Chrome sólo permite iniciar Web Audio tras esta interacción; después de cada recarga se requiere habilitarlo nuevamente.
2. Selecciona una cámara fija con una zona restringida calibrada. Activa YOLO real con WebGPU (o WASM si no está disponible). Usa un video con una persona que entre y salga, o CAM-02 en el mundo 3D.
3. Cuando el tracker confirme la intrusión según la regla, aparecerá un incidente real YOLO y una señal visual persistente. La sirena se reproduce sólo si el audio fue habilitado.
4. Pulsa **Reconocer aquí** en Monitoreo e introduce un nombre de supervisor *de prueba*. Se silencia ese incidente, pero **la inferencia no se detiene y el incidente no se cierra**. Si quedan otros incidentes no reconocidos, la sirena continúa.
5. Tras una **salida visual confirmada**, el incidente se cierra automáticamente. Si se pierde el tracking o la señal, no se inventa una salida y el incidente queda pendiente de revisión.
6. En **Incidentes**, revisa el historial y la auditoría con filtros y paginación. Se puede reconocer y, después del reconocimiento, registrar un **cierre manual con nota de al menos 10 caracteres**, distinguible de un cierre observado por YOLO.
7. Recarga la aplicación y vuelve a Incidentes: los metadatos del historial se restauran de `localStorage`, si el navegador lo permite. Puedes exportar los metadatos como JSON. No se guardan imágenes, clips ni datos biométricos.

Los incidentes abiertos que permanezcan **60 segundos sin reconocer** se marcan como `escalated` y pasan a severidad crítica si eran de severidad alta. El sonido está activado por *un clic del usuario*, no por ese temporizador.

## Cámaras y fuentes compatibles

- **Cámara virtual fija (predeterminada):** crea una perspectiva desde Cámaras con el editor visual. Dibuja el polígono restringido en su captura RGB. CAM-01 y CAM-02 son perspectivas originales; el barrido permanece opcional.
- **Barrido horizontal:** detecta personas con YOLO, pero **suspende la evaluación de polígonos fijos** durante el movimiento.
- **MP4/WebM/Ogg en bucle:** archivo local hasta 150 MB, seleccionado cada vez que se abre esa fuente. El archivo no se sube ni persiste.
- **Webcam:** requiere permiso del navegador; funciona con dispositivos físicos o webcams virtuales (por ejemplo, OBS). Los tracks y el Worker se liberan al desconectar.
- **Multicámara 3D:** turnos alternados sobre un único Worker; más cámaras reducen los FPS de análisis por cámara. Las fuentes webcam y MP4 son individuales cuando están seleccionadas.

## Arquitectura y límites honestos

- Detección `person` real con YOLO; conos, cascos y chalecos **aún no están entrenados ni detectados** por este modelo. Las etiquetas verde/rojo/gris describen la zona del punto inferior de la caja, y la apertura requiere confirmación temporal.
- Un **centro de incidentes compartido** mantiene estados, auditoría y alarmas entre rutas. Los cambios se publican mediante suscripción local; `localStorage` conserva hasta 300 incidentes y 1200 entradas de auditoría. **No es sincronización multiusuario ni una base de datos servidor.** Si el almacenamiento está bloqueado, la interfaz lo advierte y los eventos quedan solo en memoria.
- La entrada de la plataforma usa Supabase Auth y una membresía RLS de administrador. **Todavía no existe RBAC por módulos** ni identidad verificada para el nombre escrito en un reconocimiento manual; esa atribución sigue siendo académica. Se deben revisar retención, permisos de servidor y trazabilidad antes de producción.
- El monitoreo YOLO **se pausa cuando la pestaña está oculta** y termina al abandonar Monitoreo. Los incidentes ya abiertos permanecen en el historial; no se afirma vigilancia 24/7. Los reportes locales de la etapa 6 ya están implementados; **el envío de correo desde servidor todavía requiere conexión remota y credenciales privadas**.
- Aún no hay soporte RTSP/IP ni backend FastAPI, sin alterar la estructura preparada para futuros adaptadores.

## Etapa 6: reportes y automatización (avance v1.7.0)

- Al cerrar un incidente YOLO se genera **automáticamente un reporte individual** en la bandeja local. Se guarda su cronología y estadísticas; recibe una clave idempotente `incident:{id}` y **no se duplica** al recargar o repetir snapshots.
- Al abrir la app se prepara el resumen del día **anterior en horario de Lima**, si hubo incidentes; el operador puede simular el cierre de un día específico en `Reportes`. El contador diario considera incidentes por **hora de apertura**, no dos veces por cierre o reconocimiento.
- `Reportes` permite filtrar la bandeja, descargar **PDF (A4), CSV y JSON**, y visualizar el log de generación/descargas. CSV protege contra fórmulas al abrirlo en hojas de cálculo.
- **Toda la bandeja está marcada DEMO / LOCAL / NO ENVIADO**. La persistencia es `localStorage` del navegador y no implica que el correo se mande al administrador. El navegador cerrado no puede ejecutar reportes programados.
- Incluidos, **sin desplegar**, `supabase/migrations/20261115_reports_pending.sql` y `supabase/functions/vision-daily-report/` como base de automatización remota con Resend. No se deben activar sin sincronización autenticada de incidentes y configuración segura de Supabase.

### Prueba manual de etapa 6

1. Entra a Monitoreo, confirma la apertura/cierre de un incidente YOLO; entra en **Reportes** y verifica el informe individual automático.
2. Descarga el archivo PDF, CSV y JSON; comprueba cronología, cámara, zona, confianza y responsable si se reconoció.
3. Recarga la web: la bandeja conserva el informe y no crea un duplicado.
4. Pulsa **Generar resumen diario**, seleccionando el día de prueba en horario Lima; repite la operación y confirma que no aparece otro registro para ese día.
5. Comprueba que la interfaz **no** afirma haber enviado correos electrónicos.

### Puesta en producción de correos (pendiente)

**Actualización v1.8.0:** el flujo remoto seguro está implementado de manera opt-in (Auth, RLS y sincronización de incidentes). Usa `@supabase/server` con clave `sb_secret_*` guardada en Vault para la tarea diaria, y `RESEND_API_KEY` exclusivamente en Edge Secrets. La guía vigente y el orden de activación están en `docs/ETAPAS.md`; no utilices el procedimiento de secret propio de la v1.7.0.

**Documentación consolidada:** `docs/ARQUITECTURA.md` (decisiones técnicas) y `docs/ETAPAS.md` (cronología y criterios de aceptación), conforme al PDF rector v2.0.


## Conexión remota opcional (v1.8.0)

La versión local v1.7.0 sigue funcionando sin Supabase. Para autenticar usuarios,
sincronizar incidentes YOLO y activar el reporte diario con Resend, sigue el capítulo
**«Etapa 6 · v1.8.0»** de `docs/ETAPAS.md`. **No se envían correos reales hasta
configurar usuarios, migraciones, secretos y Cron.** Los incidentes solo se sincronizan
tras autorización expresa desde Reportes.

Ejecuta `npm install` después de aplicar el ZIP, porque se añadió
`@supabase/supabase-js`. Las variables VITE_* son únicamente URL y clave publicable;
nunca añadas el service role o `RESEND_API_KEY` al frontend.


## Inicio de sesión obligatorio — v1.8.1

1. Conserva en `.env.local` `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca incluyas `sb_secret_*` ni claves de Resend en Vite.
2. Tras `npm run dev`, entra en `/login` y utiliza la cuenta de Supabase que ya tenga `role = administrador` en `public.vision_ai_members`. El menú, Monitoreo y Reportes no aparecen antes de validar el rol.
3. Al entrar, las rutas anteriores y los centros locales quedan disponibles. El botón de salida está arriba a la derecha; al salir se vuelve a `/login`.
4. En Reportes, el panel de Supabase conserva **Autorizar y habilitar sincronización**; iniciar sesión por sí mismo no sincroniza incidentes.
5. Si la cuenta tiene rol operador, supervisor, auditor o no tiene membresía, se muestra acceso restringido: los permisos RBAC se acordarán más adelante. No habilites estos roles con acceso total antes de aislar el almacenamiento local entre usuarios.

La protección de rutas frontend es adicional a RLS, no sustituye la seguridad PostgreSQL. La integración Resend/Cron aún necesita su prueba de entrega real.
