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
