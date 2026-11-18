# VISION AI · Etapa 7 — Calidad y pruebas integrales · v1.9.2

Sistema académico de monitoreo visual con **YOLOv8n real** en ONNX Runtime Web y Web Worker, un mundo industrial **Three.js** compartido por cámaras virtuales, fuentes de video/webcam, zonas restringidas, alarmas, auditoría y reportes. La aplicación está desplegada en Vercel y utiliza Supabase Auth/RLS para el acceso administrador. El motor observa **píxeles reales** del visor/video: las posiciones internas de la escena 3D no sustituyen las detecciones de YOLO.

**Etapa 6:** el usuario verificó un correo real enviado por Resend (15 incidentes) y activó dos tareas Supabase Cron. Al preparar v1.9.0, todavía **falta comprobar la primera ejecución programada**: el estado `sent` del envío manual no prueba que se haya ejecutado Cron. No cambiamos funciones, SQL ni secretos en esta versión.

## Inicio rápido en VSCode / Git Bash

```bash
npm install
npm run test && npm run typecheck && npm run build
npm run dev
```

Si partes de un clon sin modelo, ejecuta también `npm run model:download`. En Vercel, el Build Command validado por el usuario es `npm run model:download && npm run build`. El modelo ONNX y los binarios de ONNX Runtime no se deben subir a GitHub. Las variables de frontend son `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`; **nunca** pongas `sb_secret_*` o `RESEND_API_KEY` en Vercel o en un archivo `VITE_*`.

**Actualización desde v1.9.1:** extrae el ZIP *Actualización* sobre la raíz, conservando tu `vercel.json`, `.gitignore`, `.env.local`, `package-lock.json` y modelo ONNX descargado. Esta versión añade aislamiento local por cuenta y copia automáticamente, una sola vez, los incidentes, reportes y configuraciones heredados de la v1.9.1 a la primera cuenta administradora autorizada de ese navegador. **Realiza un respaldo antes de actualizar**, especialmente si varias personas utilizan el mismo perfil de Chrome. Los datos locales antiguos no se borran para evitar pérdidas irreversibles. Ejecuta `npm install` para actualizar el lockfile, luego `npm run test && npm run typecheck && npm run build`.

## Novedades de la etapa 7

- **Interfaz depurada:** se retiró `/guia`, la tarjeta de motor y las etiquetas de etapas. La validación es interna y se documenta en `docs/GUIA_PRUEBAS_INTERNA.md`. Las notificaciones, temas y sesión se encuentran en el desplegable de cuenta.
- **CI en GitHub Actions:** `/.github/workflows/calidad.yml` ejecuta npm ci, descarga el modelo verificado, pruebas, TypeScript y build en push/PR a `main` (sujeto a los límites gratuitos del repositorio).
- **Pruebas de integración:** contratos de detecciones → tracking → reglas → incidentes → reconocimiento → cierre → PDF/CSV y serialización remota, con regresiones de pérdida de seguimiento, rebotes e idempotencia. No equivalen a evaluar precisión de YOLO sobre un conjunto etiquetado.
- **Accesibilidad:** enlace «Saltar al contenido principal», menú móvil navegable con teclado y cierre con `Escape`, foco visible, tablas con nombre accesible, regiones desplazables por teclado y reducción de animaciones si el sistema lo solicita.
- **Aislamiento local por cuenta:** después de verificar Supabase Auth/RLS, los centros de cámaras, incidentes y reportes usan claves separadas por UUID de usuario. La primera cuenta administradora del navegador recupera los datos legados sin pisar cambios existentes; otra cuenta no verá ese historial desde la interfaz. **No es cifrado de navegador ni sustituye RBAC/RLS.**
- **Diálogos accesibles:** el menú lateral móvil y el modal compartido recuperan el foco si un script externo lo desplaza; Escape y Tab mantienen comportamiento previsible.
- **Sincronización automática incremental:** a partir del login administrador, cambios YOLO y auditorías se envían sin pulsar «Autorizar». Se guarda un cursor local solo después de un upsert exitoso; se reintenta con Internet restablecido.
- **Información actualizada:** panel principal y Reportes ya no presentan el login/Supabase como no implementados. La web no certifica la entrega del correo: se contrasta con Supabase y el buzón.

## Pruebas de aceptación en Chrome

1. Ejecuta `npm run test && npm run typecheck && npm run build`. Se añadieron **16 pruebas** de privacidad local y teclado en v1.9.2; confirma el total y el build en tu equipo.
2. Entra a la URL de Vercel. Comprueba acceso con administrador, redirección de sesión cerrada y que `/guia` ya no aparezca ni se abra.
3. Abre el menú de cuenta con teclado y ratón; prueba notificaciones, tema, cerrar sesión y estados de sincronización. Comprueba también 375, 768 y 1280 px y la tecla Escape.
4. Valida el flujo con video real de una persona que ingrese y salga de una zona restringida: entrada confirmada, alarma, reconocimiento, cierre YOLO, reporte PDF/CSV/JSON, sin duplicados.
5. Comprueba la sincronización automática con Supabase al iniciar sesión, su reintento sin red y la eliminación de cambios pendientes tras la recuperación.
6. Verifica que el historial anterior sigue visible bajo el administrador habitual después de migrar y que cerrar sesión no permite consultar los módulos. Los tests automatizados cubren el aislamiento entre dos cuentas sobre el mismo navegador; no habilites todavía otros roles de producto. Para el cierre de etapa 6, registra evidencia de `cron.job_run_details`, `vision_report_jobs` y correo recibido después del horario real programado.

## Limitaciones científicas y de seguridad

- El YOLO preentrenado en COCO reconoce **personas**, pero no garantiza reconocer **conos, cascos ni chalecos**. El paso de precaución por cono del documento rector es una brecha pendiente hasta disponer de un modelo específico.
- YOLO solo funciona mientras la pestaña de Monitoreo está abierta/activa; **no** es vigilancia 24/7. El servidor sí puede enviar reportes de incidentes **ya sincronizados** con el navegador cerrado.
- El único rol habilitado para ingresar a la web es `administrador`. La UI no implementa aún RBAC por módulo; el acceso remoto se protege con Supabase RLS.
- Los historiales y reportes locales se separan por usuario autenticado **en la aplicación**, pero `localStorage` del mismo perfil de navegador no está cifrado. Quien controle el perfil del navegador puede leerlo con herramientas de desarrollador. Antes de habilitar RBAC multiusuario productivo, definir políticas de retención/borrado local, aislamiento de sesiones y controles de servidor.
- Una aceptación HTTP de Resend no prueba entrega final al buzón. El reporte PDF/CSV/JSON es local; el resumen servidor se envía en HTML.
- No se registran ni exportan clips, fotos ni biometría. Las fuentes webcam/video requieren permiso o selección explícita.

## Documentación consolidada

- `docs/ETAPAS.md`: plan rector de ocho etapas, bitácora y criterios de salida, incluidos los resultados históricos y las pendientes reales.
- `docs/ARQUITECTURA.md`: límites y capas técnicas, navegabilidad, persistencia, autenticación e integridad.

**Estado:** avance v1.9.2 de la etapa 7, **no cierre**. La etapa 6 permanece condicionada a la evidencia de la primera ejecución automática de Cron.


### Auditoría previa al despliegue (etapa 7)

Después de instalar dependencias y compilar, ejecutar:

```bash
npm run model:download
npm run test && npm run typecheck && npm run build
npm run audit:release
```

`audit:release` verifica el artefacto que se publicará (modelo ONNX con SHA-256, WASM de ONNX Runtime, rutas SPA, archivos `.env` y patrones conocidos de secretos). GitHub Actions ejecuta la misma revisión después del build. Este control **no mide la precisión ni el rendimiento de YOLO** y tampoco sustituye las pruebas de RLS de Supabase. Los protocolos de pruebas manuales y limitaciones están en `docs/GUIA_PRUEBAS_INTERNA.md`.

### Administración de usuarios (v1.9.5)

El rol `administrador` dispone de la ruta protegida `/usuarios`. Para habilitarla en Supabase existente ejecuta `supabase/migrations/20261117_user_management_rbac.sql` **una sola vez** y despliega la Edge Function:

```bash
npx supabase functions deploy vision-manage-users
```

La función requiere un JWT de usuario y vuelve a comprobar la membresía de administrador en PostgreSQL. Para evitar SMTP/dominio de pago, el alta genera una contraseña temporal que se muestra una vez al administrador y que el usuario deberá reemplazar al iniciar sesión. Nunca se guardan claves secretas en el frontend. Consulta la matriz RBAC y las limitaciones multiusuario en `docs/ETAPAS.md`.

Tras aplicar la actualización, ejecutar `npm install` para sincronizar `package-lock.json` con la versión de `package.json` antes de hacer commit.
