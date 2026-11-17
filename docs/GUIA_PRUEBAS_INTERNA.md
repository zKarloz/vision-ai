# VISION AI — Guía interna de pruebas (no incluida en navegación)

Esta lista es exclusivamente para validación de desarrollo y defensa académica. Las pruebas automatizadas viven en `tests/` y GitHub Actions. Las casillas manuales no modifican los datos de producción.

1. Acceso: entrar directamente a `/monitoreo` sin sesión; debe solicitar login.
2. Configuración: importar JSON válido e inválido; el inválido no debe sustituir datos.
3. Cámara: comprobar vista 3D fija, video local y webcam; no interpretar pérdida de señal como salida.
4. YOLO: confirmar persona dentro de zona tras confirmación temporal, sin inventar clases EPP/cono.
5. Incidentes: reconocer alarma y comprobar cierre YOLO o cierre manual con motivo y auditoría.
6. Reportes: descargar PDF, CSV, JSON, comprobar idempotencia y recarga.
7. Remoto: con sesión autorizada, comprobar sincronización automática, reintentos, estado y RLS.
8. Cron: comprobar ejecución del servidor, aceptación del proveedor y recepción real en el buzón. Verificar que no hay duplicados.
9. Accesibilidad: anchos 375/768/1280px, teclado Tab/Enter/Escape, ambos temas y foco visible.

**Limitaciones:** el navegador cerrado no ejecuta YOLO; el modelo actual identifica personas, no certifica detección de cascos, chalecos ni conos. El monitoreo y la configuración de fuentes locales no son multiusuario hasta implementar RBAC y almacenamiento compartido.


### Control interno de v1.9.2 (no mostrar en el producto)

- Respaldar la instalación y verificar que al entrar como administrador habitual el historial de incidentes, reportes, cámaras y zonas permanece accesible después de la migración.
- Cerrar sesión y comprobar que las rutas directas no muestran información local.
- Validar en pruebas automatizadas que una segunda cuenta con otro UUID no restaura el historial anterior desde el mismo navegador. No habilitar otro rol operativo únicamente para esta comprobación.
- Desconectar Internet con la sesión previamente validada, provocar un incidente auténtico YOLO y comprobar que queda pendiente de sincronización; restaurar conexión y verificar su envío idempotente.
- Abrir modal y menú lateral móvil: Tab, Shift+Tab y Escape deben funcionar sin fuga de foco. Verificar zoom de navegador 200% y tema oscuro.
- Verificar que GitHub Actions y Vercel compilan la versión sin modificar Supabase Cron ni Resend.


### Protocolo final reproducible de calidad (v1.9.3, solo desarrollo)

1. **CI y artefactos:** en Git Bash ejecutar `npm run model:download`, `npm run test`, `npm run typecheck`, `npm run build`, `npm run audit:release`. Confirmar que GitHub Actions y Vercel hacen lo mismo. Un fallo de descarga/hash de ONNX debe bloquear el despliegue, nunca reemplazarse por detecciones simuladas.
2. **Seguridad:** sin sesión, visitar directamente `/monitoreo` y `/reportes`; deben exigir login. Usar dos cuentas administradoras de prueba para confirmar aislamiento local. Comprobar manualmente que el segundo usuario no puede modificar filas remotas ajenas; no publicar credenciales ni claves de servicio. Probar cierre de sesión y restauración.
3. **Fiabilidad:** con sesión válida y monitoreo abierto, desactivar red, generar un incidente real, comprobar estado pendiente; restaurar red y observar sincronización. Consultar PostgreSQL para confirmar un solo ID compuesto y las acciones de auditoría correctas. Verificar que una pérdida de tracking no cierre automáticamente el incidente.
4. **Rendimiento en Chrome:** probar una cámara fija 3D y una fuente MP4/webcam en dispositivo concreto, anotar navegador, GPU, WebGPU/WASM, intervalo y resolución. Con al menos 60 s de monitoreo visible anotar FPS analizados por cámara y media/p95 de la latencia total inferida desde DevTools o trazas instrumentadas. En otra medición cronometrar desde confirmación YOLO hasta la visualización/sonido de la alarma. La sección 8.3 del PDF presenta *objetivos a medir*: 5–15 análisis/s por cámara y <1,5 s hasta alarma. Registrar cualquier desviación y si el origen es 3D, captura, inferencia o navegador; no sustituir números por estimaciones.
5. **Accesibilidad y responsive:** revisar login, dashboard, Monitoreo, Incidentes y Reportes con 375/768/1280 px; tema claro y oscuro; zoom 200%; teclado Tab/Shift+Tab/Enter/Escape, foco, mensajes de error legibles y sirena acompañada de aviso visual/textual.
6. **Automatización:** no cerrar etapa 6 hasta comprobar que Supabase Cron genera el envío diario sin intervención del navegador. `cron.job_run_details` confirma ejecución SQL; `net._http_response` confirma HTTP; `vision_report_jobs.status = sent` confirma aceptación por proveedor; bandeja de entrada confirma recepción. Un resultado no sustituye los demás.

**Registro de evidencia sugerido:** fecha, versión Git, sistema operativo, navegador, dispositivo, fuente, cámara, tipo de ejecución, métrica observada, objetivo, resultado, captura o consulta y observaciones. Las evidencias y mediciones de laboratorio permanecen en `docs/evidencias/`, nunca como módulo visible del producto.

**Advertencia técnica de rendimiento:** con el selector actual de captura en 300 ms, el máximo teórico es ~3,33 análisis/s para una cámara, incluso si YOLO fuese instantáneo. Con round-robin sobre varias cámaras, el máximo por cámara se reduce. Por tanto, el objetivo de 5–15 FPS por cámara del PDF no puede considerarse cumplido con esta política; registrarlo explícitamente como desviación y discutir una optimización con medición antes de cambiar el planificador. No presentar FPS del renderizador 3D como FPS de inferencia.
