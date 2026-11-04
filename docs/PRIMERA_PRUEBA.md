# Primera prueba de Ritmo

## Recorrido rápido

1. Abre el panel privado de Ritmo y entra en **Ajustes → Cargar datos de prueba**.
2. Vuelve a **Resumen** y pulsa **Analizar mi contexto**. La lectura usa reglas locales; no llama a un modelo de IA.
3. En **Entrenamientos**, añade una sesión manual o importa una sesión desde un archivo Polar Flow.
   Pulsa **Analizar** en esa sesión para ver ritmo, esfuerzo, notas y el contexto guardado para la misma fecha. Si añades el sueño, alimentación o clima después, pulsa **Analizar** otra vez para actualizar la lectura.
4. En Polar Flow web, abre una sesión, elige **Exportar** y descarga TCX, GPX o CSV. Vuelve a Ritmo y selecciona **Importar TCX, GPX o CSV**.
5. En **Progreso**, registra sueño, energía y carbohidratos. Si quieres, escribe ciudad, fecha y hora y consulta el clima histórico.
6. En **Mi plan**, introduce fecha de carrera, distancia, días disponibles y kilómetros semanales. Marca una sesión como completada o indica que no puedes hacerla para leer la sugerencia de prueba.
7. En **Ajustes**, exporta tus datos como JSON o borra la información de prueba del navegador.

## Qué es real y qué está en modo de prueba

- Los formularios, cálculos del panel, importación TCX/GPX/CSV, clima histórico, exportación JSON y almacenamiento local funcionan en el navegador.
- El análisis individual y las sugerencias del calendario se generan mediante reglas locales; no son contenido de un libro ni una respuesta de IA.
- El botón de Google y la persistencia multiusuario necesitan completar el proyecto Supabase.
- La sincronización automática Polar requiere AccessLink; importar un archivo exportado sí está disponible para la primera prueba.
- Los datos de demostración son ficticios. Para probar datos personales, impórtalos o introdúcelos manualmente; el modo local guarda los resúmenes en este navegador.
