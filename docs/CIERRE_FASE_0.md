# Acta de cierre — Fase 0 de VISION AI

**Fecha del cierre documental:** 14 de noviembre de 2026
**Versión del laboratorio corregido:** 0.3.2 (derivada de 0.3.1)
**Decisión:** viabilidad **demostrada para avanzar a Etapa 1**, con verificación final de `npm run test`, `npm run typecheck` y `npm run build` **pendiente en Windows**.

## 1. Objetivo y conclusión

Validar si es viable un sistema de seguridad industrial basado en **escenarios 3D con cámaras virtuales**, detección visual **real** YOLO ONNX y alertas por zonas de riesgo. La simulación geométrica y la inferencia visual se mantienen deliberadamente separadas.

**Conclusión:** la solución es viable como proyecto académico y como base técnica, por los resultados de cámara/escenario, inferencia ONNX, zonas por imagen, seguimiento y eventos. El sistema **no se considera un producto de vigilancia de seguridad listo para producción** ni acredita todavía monitoreo YOLO de cuatro cámaras en paralelo.

## 2. Evidencia registrada

| Experimento             | Configuración                                                                            | Resultado                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 0, webcams         | Video externo, WASM                                                                      | ~3.2 FPS, inferencia media 259.5 ms, P95 extremo a extremo 296 ms; prueba exploratoria                                                                      |
| Fase 0, multicámara 3D  | Dos fuentes virtuales                                                                    | Escenas independientes, alertas globales de CAM-02 mientras se visualiza CAM-01, pausa, reanudación, cierre y trazabilidad local, observados por el usuario |
| Fase 0.2, estilos A/B/C | 40 muestras/estilo, WASM, umbral 10 %, IoU ≥ 0.20                                        | A 8/40 (20 %), B 34/40 (85 %), C 31/40 (77.5 %). B más detecciones a umbral bajo; C confianza media mayor (45.6 %)                                          |
| Fase 0.3, zonas YOLO    | CAM-02, WebGPU seleccionado, 25 %, zoom 1.5×, 84 últimas muestras                        | 67/84 muestras con persona (79.8 %), 1.82 FPS, inferencia media 66.25 ms, P95 166 ms; eventos de apertura y salida                                          |
| Fase 0.3.1, estabilidad | CAM-02, WebGPU seleccionado, **10 %**, zoom 1.5×, intervalo 300 ms, 120 últimas muestras | 105/120 muestras con persona (87.5 %), 3.333 FPS, inferencia media 43.51 ms, P95 98 ms; 16 pérdidas breves, 16 recuperadas, 0 expiradas                     |

**Precisión de la interpretación:** los porcentajes `framesWithPeople` son fracciones de capturas con detección, **no** exactitud frente a anotaciones. Los experimentos 0.3 y 0.3.1 **no son comparación controlada**: el umbral cambió del 25 % al 10 %. Los 120 registros son una ventana de muestras recientes; el historial de eventos contiene un periodo más amplio. Un motor WebGPU seleccionado no equivale por sí solo a una comparación controlada con WASM.

Los archivos JSON originales del usuario se incluyen como `docs/evidencias/` con nombres normalizados. No incluyen imágenes de personas ni clips.

## 3. Correcciones del paquete final (0.3.2)

1. `src/app/App.tsx`: `severity: 'danger' | 'success' | 'info'` se conserva como tipo literal `as const` en los tres callbacks `setFeed`, resolviendo los tres errores TS2345 reportados.
2. `tests/visualTracking.test.ts`: la expectativa de que CAM-01 reutilizara Track ID `1` era incorrecta. La implementación **no transfiere tracks** al cambiar de cámara, pero mantiene el **contador global** para evitar reutilizar IDs. La prueba ahora exige un ID mayor y ausencia de herencia de alerta.
3. Se añade prueba para garantizar que una zona de CAM-02 no produzca incidentes de CAM-01 y que un polígono de la propia cámara abra un evento solo tras confirmaciones nuevas.
4. No se han modificado los adaptadores de inferencia ONNX, los pesos del modelo, las reglas geométricas ni los umbrales del seguimiento.

**Validación efectuada en el entorno de preparación:** análisis sintáctico de 27 archivos `.ts/.tsx` sin errores y 7 comprobaciones independientes de la lógica del motor sin errores. **No equivale al comando Vitest ni a una compilación completa con dependencias**.

**Límite verificable:** la instalación npm no concluyó en este entorno (sin acceso operativo a los paquetes); por tanto **no se afirma** que `test`, `typecheck` o `build` hayan pasado en la versión 0.3.2. Esa verificación corresponde al equipo Windows con npm instalado.

## 4. Qué queda fuera del cierre y pasa a etapas siguientes

- Procesamiento real YOLO de varias cámaras simultáneas: la simulación 3D progresa para distintas cámaras, pero el laboratorio analiza **una cámara YOLO seleccionada**.
- Capacidad de añadir y quitar cámaras sin editar código; políticas de planificación, límites por cámara y operación en segundo plano.
- Objetivo de 5–15 FPS de análisis para fuente única y latencia de alerta <1.5 s: no verificados con el producto definitivo.
- Resistencia a errores prolongados, múltiples trabajadores, oclusiones y falsos positivos; fiabilidad del seguimiento en otros escenarios.
- Backend FastAPI, Supabase, autenticación/roles, auditoría, reportes, correo diario, almacenamiento local offline y despliegue: pertenecen al proyecto principal, no al laboratorio.

## 5. Criterios de traspaso a Etapa 1

- [x] El escenario multicámara 3D muestra eventos aun si otra cámara está seleccionada.
- [x] YOLO ONNX recibe fotogramas RGB renderizados y puede detectar personas.
- [x] Se pueden definir polígonos de riesgo y emitir eventos visuales por observaciones reales.
- [x] El tracker no confunde una pérdida temporal con una salida confirmada.
- [x] Se registran métricas reproducibles con limitaciones explícitas.
- [x] Se incorporaron las correcciones de fuente de los tres errores TypeScript y la prueba errónea entre cámaras.
- [ ] **Ejecutar en Windows** `npm run test`, `npm run typecheck` y `npm run build` y confirmar resultado sin errores.

**Decisión de gestión:** empezar Etapa 1 sin abrir nuevas fases experimentales. Esta última casilla es una verificación de calidad del paquete de archivo, no una condición para diseñar la arquitectura de Etapa 1. Si falla algo más, arreglarlo como mantenimiento del laboratorio y no como nueva fase.
