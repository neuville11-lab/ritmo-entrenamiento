# Ritmo

Ritmo ayuda a corredores populares a reunir sus entrenamientos y entenderlos junto a la recuperación, el sueño, la alimentación y las condiciones del día.

## Estado

La web publicada es una primera versión privada. La interfaz permite explorar las secciones de entrenamientos, progreso, plan y ajustes. Los formularios de esta fase guardan datos de prueba en el almacenamiento local del navegador; aún no hay cuentas de usuario, copia en la nube, inicio con Google, sincronización Polar ni análisis con IA.

## Próximas fases

1. Configurar autenticación Google y una base de datos multiusuario con permisos por cuenta.
2. Completar el registro de actividad, contexto diario y calendario de preparación.
3. Registrar Ritmo en Polar AccessLink y sincronizar actividades mediante OAuth, guardando credenciales únicamente en el servidor.
4. Añadir clima histórico y análisis explicables del entrenamiento y la recuperación.
5. Crear planes originales ajustables por fecha de carrera, experiencia y disponibilidad; evaluar la respuesta antes de mover sesiones omitidas.
6. Preparar pagos y planes cuando producto, condiciones y modelo de soporte estén definidos.

## Desarrollo

La web inicial se sirve desde `dist/`. Las integraciones externas requieren credenciales de desarrollo y configuración en sus respectivos servicios; no se deben incluir claves privadas en el navegador ni subir archivos `.env` a GitHub.

## Datos

Los registros actuales son de demostración y viven en el navegador de la persona que los introduce. No usar esta versión para almacenar información real de salud o entrenamiento.
