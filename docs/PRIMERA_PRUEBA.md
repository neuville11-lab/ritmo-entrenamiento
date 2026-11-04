# Primera prueba de Ritmo

## Recorrido rápido

1. Abre el panel privado de Ritmo y entra en **Ajustes → Cargar datos de prueba**.
2. Vuelve a **Resumen** y pulsa **Analizar mi contexto**. La lectura usa reglas locales; no llama a un modelo de IA.
3. En **Entrenamientos**, añade una sesión manual o importa una sesión desde un archivo Polar Flow.
   Pulsa **Analizar** en esa sesión para ver ritmo, frecuencia cardiaca, vueltas y ritmo por kilómetro, y cuando estén incluidos: cadencia, desnivel, calorías, traza GPS y contexto diario. Si añades el sueño, alimentación o clima después, pulsa **Analizar** otra vez. Si la sesión TCX se importó antes de esta actualización, vuelve a importarla para añadir sus métricas.
   Para ver los colores de las zonas, configura tu FC máxima y opcionalmente cuatro límites de ritmo en **Ajustes → Zonas para las gráficas**. Los límites solo se guardan en el navegador actual.
4. En Polar Flow web, abre una sesión, elige **Exportar** y descarga TCX, GPX o CSV. Vuelve a Ritmo y selecciona **Importar TCX, GPX o CSV**.
5. En **Progreso**, selecciona el entrenamiento para cargar su fecha y registrar sueño, energía, hidratos (categoría y gramos), líquidos y clima de la fecha. Para los últimos siete días se usa el modelo reciente de Open-Meteo; para fechas anteriores, su reanálisis histórico. Los datos se guardan por día y se comparten con las sesiones de esa fecha. También puedes elegir un día de descanso.
   En **Registros recientes**, cada fila indica su origen cuando se conoce y tiene un botón **Borrar** con confirmación.
6. En **Mi plan**, elige **Maratón · Método Hanson**, indica la fecha de carrera, tu tiempo objetivo y los kilómetros semanales actuales. Ritmo calcula la referencia en min/km y añade las sesiones propuestas a **Entrenamientos**; desde allí puedes recorrer los meses y seleccionar cada día. Marca las sesiones como completadas u omitidas en **Mi plan**. El borrador es una adaptación general, no el plan oficial del libro.
   El botón **Borrar todo** elimina el plan y sus sesiones programadas del calendario, y conserva los entrenamientos ya realizados y los datos de recuperación.
7. En **Ajustes**, exporta tus datos como JSON o borra la información de prueba del navegador.

## Qué es real y qué está en modo de prueba

- Los formularios, cálculos del panel, importación TCX/GPX/CSV, clima histórico, exportación JSON y almacenamiento local funcionan en el navegador. TCX solo puede aportar las métricas que estén presentes en el archivo; no todos incluyen frecuencia cardiaca, GPS, cadencia o altitud.
- El análisis individual y las sugerencias del plan se generan mediante reglas locales; no son una respuesta de IA. El calendario Hanson es una propuesta original de prueba basada en principios generales; para seguir el plan oficial consulta el libro o los recursos de Hansons [Training Plans](https://hansons-running.com/content/training-plans).
- El botón de Google y la persistencia multiusuario necesitan completar el proyecto Supabase.
- La sincronización automática Polar requiere AccessLink; importar un archivo exportado sí está disponible para la primera prueba.
- Los datos de demostración son ficticios. Para probar datos personales, impórtalos o introdúcelos manualmente; el modo local guarda los resúmenes en este navegador.
