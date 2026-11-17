# VISION AI · Etapa 7 — Calidad y pruebas integrales · v1.9.1

Sistema académico de monitoreo visual con **YOLOv8n real** en ONNX Runtime Web y Web Worker, un mundo industrial **Three.js** compartido por cámaras virtuales, fuentes de video/webcam, zonas restringidas, alarmas, auditoría y reportes. La aplicación está desplegada en Vercel y utiliza Supabase Auth/RLS para el acceso administrador. El motor observa **píxeles reales** del visor/video: las posiciones internas de la escena 3D no sustituyen las detecciones de YOLO.

**Etapa 6:** el usuario verificó un correo real enviado por Resend (15 incidentes) y activó dos tareas Supabase Cron. Al preparar v1.9.0, todavía **falta comprobar la primera ejecución programada**: el estado `sent` del envío manual no prueba que se haya ejecutado Cron. No cambiamos funciones, SQL ni secretos en esta versión.

## Inicio rápido en VSCode / Git Bash

```bash
npm install
npm run test && npm run typecheck && npm run build
npm run dev
```

Si partes de un clon sin modelo, ejecuta también `npm run model:download`. En Vercel, el Build Command validado por el usuario es `npm run model:download && npm run build`. El modelo ONNX y los binarios de ONNX Runtime no se deben subir a GitHub. Las variables de frontend son `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`; **nunca** pongas `sb_secret_*` o `RESEND_API_KEY` en Vercel o en un archivo `VITE_*`.

**Actualización desde v1.9.0:** extrae el ZIP *Actualización* sobre la raíz y reemplaza los archivos. **No reemplaces tu `vercel.json`, `.gitignore`, `.env.local`, `package-lock.json` ni los modelos/recursos descargados.** El ZIP incremental no elimina archivos antiguos: retira `src/modules/quality/QualityPage.tsx` con `git rm` después de aplicarlo. Como cambió la versión en `package.json` sin nuevas dependencias, ejecuta `npm install` para actualizar el `package-lock.json` local antes de hacer commit. Después sube los cambios a GitHub; Vercel volverá a compilar.

## Novedades de la etapa 7

- **Interfaz depurada:** se retiró `/guia`, la tarjeta de motor y las etiquetas de etapas. La validación es interna y se documenta en `docs/GUIA_PRUEBAS_INTERNA.md`. Las notificaciones, temas y sesión se encuentran en el desplegable de cuenta.
- **CI en GitHub Actions:** `/.github/workflows/calidad.yml` ejecuta npm ci, descarga el modelo verificado, pruebas, TypeScript y build en push/PR a `main` (sujeto a los límites gratuitos del repositorio).
- **Pruebas de integración:** contratos de detecciones → tracking → reglas → incidentes → reconocimiento → cierre → PDF/CSV y serialización remota, con regresiones de pérdida de seguimiento, rebotes e idempotencia. No equivalen a evaluar precisión de YOLO sobre un conjunto etiquetado.
- **Accesibilidad:** enlace «Saltar al contenido principal», menú móvil navegable con teclado y cierre con `Escape`, foco visible, tablas con nombre accesible, regiones desplazables por teclado y reducción de animaciones si el sistema lo solicita.
- **Sincronización automática incremental:** a partir del login administrador, cambios YOLO y auditorías se envían sin pulsar «Autorizar». Se guarda un cursor local solo después de un upsert exitoso; se reintenta con Internet restablecido.
- **Información actualizada:** panel principal y Reportes ya no presentan el login/Supabase como no implementados. La web no certifica la entrega del correo: se contrasta con Supabase y el buzón.

## Pruebas de aceptación en Chrome

1. Ejecuta `npm run test && npm run typecheck && npm run build`. **Esperamos 160 pruebas:** 147 esperadas para v1.8.1 + 13 nuevas; confirma el número en tu equipo.
2. Entra a la URL de Vercel. Comprueba acceso con administrador, redirección de sesión cerrada y que `/guia` ya no aparezca ni se abra.
3. Abre el menú de cuenta con teclado y ratón; prueba notificaciones, tema, cerrar sesión y estados de sincronización. Comprueba también 375, 768 y 1280 px y la tecla Escape.
4. Valida el flujo con video real de una persona que ingrese y salga de una zona restringida: entrada confirmada, alarma, reconocimiento, cierre YOLO, reporte PDF/CSV/JSON, sin duplicados.
5. Comprueba la sincronización automática con Supabase al iniciar sesión, su reintento sin red y la eliminación de cambios pendientes tras la recuperación. Para el cierre de etapa 6, registra evidencia de `cron.job_run_details`, `vision_report_jobs` y correo recibido después del horario real programado.

## Limitaciones científicas y de seguridad

- El YOLO preentrenado en COCO reconoce **personas**, pero no garantiza reconocer **conos, cascos ni chalecos**. El paso de precaución por cono del documento rector es una brecha pendiente hasta disponer de un modelo específico.
- YOLO solo funciona mientras la pestaña de Monitoreo está abierta/activa; **no** es vigilancia 24/7. El servidor sí puede enviar reportes de incidentes **ya sincronizados** con el navegador cerrado.
- El único rol habilitado para ingresar a la web es `administrador`. La UI no implementa aún RBAC por módulo; el acceso remoto se protege con Supabase RLS.
- Los historiales y reportes locales todavía pueden pertenecer al navegador, no a una cuenta aislada: **antes de habilitar más usuarios**, migrar/aislar los datos locales por identidad.
- Una aceptación HTTP de Resend no prueba entrega final al buzón. El reporte PDF/CSV/JSON es local; el resumen servidor se envía en HTML.
- No se registran ni exportan clips, fotos ni biometría. Las fuentes webcam/video requieren permiso o selección explícita.

## Documentación consolidada

- `docs/ETAPAS.md`: plan rector de ocho etapas, bitácora y criterios de salida, incluidos los resultados históricos y las pendientes reales.
- `docs/ARQUITECTURA.md`: límites y capas técnicas, navegabilidad, persistencia, autenticación e integridad.

**Estado:** avance v1.9.1 de la etapa 7, **no cierre**. La etapa 6 permanece condicionada a la evidencia de la primera ejecución automática de Cron.
