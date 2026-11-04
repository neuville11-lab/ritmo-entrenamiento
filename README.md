# Ritmo

Ritmo ayuda a corredores populares a reunir sus entrenamientos y entenderlos junto a la recuperación, el sueño, la alimentación y las condiciones del día.

## Estado

La web publicada es una versión privada para pruebas. Permite registrar, editar, borrar e importar sesiones TCX/GPX/CSV; analizar TCX con un botón usando métricas presentes en el archivo y ver curvas de FC/ritmo; asociar contexto diario y consultar clima histórico; y exportar JSON. En Mi plan se puede elegir un borrador original de maratón inspirado en principios generales de Hanson, indicar fecha, tiempo objetivo y volumen actual, y volcar las sesiones propuestas al calendario de Entrenamientos. Permite borrar el plan completo sin borrar las sesiones realizadas. El análisis usa reglas locales, no IA. Por ahora los datos viven en el navegador. Google/Supabase, sincronización automática de Polar y análisis con IA aún requieren configuración.

## Próximas fases

1. Configurar el proyecto Supabase, Google OAuth, ejecutar la migración y completar `dist/config.js`.
2. Registrar Ritmo en Polar AccessLink y sincronizar actividades mediante OAuth, guardando credenciales únicamente en el servidor.
3. Conectar un modelo de IA para complementar el análisis explicable del modo local.
4. Ampliar las reglas del entrenador y los criterios para ajustar sesiones omitidas.
5. Preparar pagos y planes cuando producto, condiciones y modelo de soporte estén definidos.

## Desarrollo

La web inicial se sirve desde `dist/`. Las integraciones externas requieren credenciales de desarrollo y configuración en sus respectivos servicios; no se deben incluir claves privadas en el navegador ni subir archivos `.env` a GitHub.

Los pasos para configurar Google/Supabase y Polar están en [`docs/INTEGRACIONES.md`](docs/INTEGRACIONES.md).

El recorrido de prueba está descrito en [`docs/PRIMERA_PRUEBA.md`](docs/PRIMERA_PRUEBA.md).

## Datos

Los registros actuales son de demostración y viven en el navegador de la persona que los introduce. No usar esta versión para almacenar información real de salud o entrenamiento.
