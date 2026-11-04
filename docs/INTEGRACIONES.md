# Preparación de integraciones

## Cuentas y persistencia

Propuesta: **Supabase Auth + PostgreSQL**. El modelo tiene relaciones naturales entre cuentas, entrenamientos, partes diarios de recuperación, carreras objetivo y sesiones planificadas. Supabase ofrece inicio social con Google y políticas Row Level Security para limitar cada registro a su propietario.

Para conectar el proyecto:

1. Crea un proyecto de Supabase.
2. Activa Google como proveedor de autenticación en Supabase Auth.
3. En Google Cloud, registra el cliente OAuth y añade la URL de callback que indica el panel de Supabase.
4. Configura el origen y las URL de retorno autorizadas para el dominio de Ritmo.
5. Añade las políticas RLS antes de guardar datos de usuarios.

El navegador puede conocer la URL del proyecto y la clave publicable de Supabase. La clave `service_role`, claves OAuth privadas y tokens de Polar nunca deben llegar al navegador ni al repositorio.

## Polar Flow

La integración requiere una aplicación de Polar AccessLink. El titular debe crearla con su cuenta de Polar Flow, registrar una URL de retorno OAuth y guardar el identificador y secreto de cliente. El intercambio OAuth, los tokens de acceso y la sincronización se implementarán en el servidor. Cada usuario deberá autorizar expresamente el acceso a sus datos.

## Datos y análisis

- Actividad: proveedor, identificador externo, inicio, duración, distancia, ritmo, frecuencia cardiaca y tipo de sesión cuando el proveedor los comparta.
- Contexto diario: sueño, energía, alimentación declarada, esfuerzo percibido, notas y clima observado.
- Plan: carrera objetivo, disponibilidad semanal, experiencia, objetivo y sesiones propuestas.
- Análisis: separar datos importados, datos declarados y recomendaciones generadas; explicar las señales utilizadas y conservar siempre la decisión de la persona.

La versión actual solo usa almacenamiento local del navegador y datos de ejemplo. Este esquema aún no está conectado a cuentas ni a una base de datos.

## Referencias oficiales

- [Google como proveedor de Supabase Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Polar AccessLink API](https://www.polar.com/accesslink-api/)
