# Verificación de entrega 4.3.0

Base: commit `de0b8e46de6ad02c160d3ac434d53ad616a78ad9`, versión 4.2.
Firma de datos conservada: `eff554032ac83600f0fa`.

## Cambios incluidos

- `index.html`: Región, Base actual/Mi propuesta y Auditoría. Se retiran Balance y Capas. Contador visible y leyendas de pines y fondo independientes.
- `static/planning/app.js`: filtro regional por asignación vigente, span por DM, solo abiertas, colores de pin por región, conteos al guardar, auditoría, continuidad y borradores recuperables.
- `static/planning/core.js`: conteos de abiertas por región y DM, paleta comercial, reglas de auditoría, conservación de ajustes al actualizar fuente y exportación de abiertas.
- `static/planning/map-view.css`: cinco colores de pines, grupos mixtos, panel más sencillo y mapa de ancho completo sin rótulos geográficos grandes.
- `tests/planning.test.cjs`: seis pruebas nuevas para conteos, movimientos, colores, continuidad, auditoría y exportación.
- `README.md`, `LEEME_PRIMERO.txt`, este archivo: aplicación y límites de los datos.

## Comprobaciones

- Compilación Python; validación del Excel, firma, regiones, geografía y datos de revisión.
- Sintaxis de ambos scripts y 20 pruebas Python + 36 pruebas JavaScript.
- Propuesta de una externa: Centro Norte 73 → 74, Bajío 14 → 13, color del pin verde y recuperación tras recargar.
- Propuesta a Centro Poniente: +1 disponible, total regional pendiente; se conserva la incertidumbre del catálogo.
- Selección de dos abiertas cedidas: Centro Norte 73 → 71, Centro Sur 13 → 15; Deshacer recupera 73 y 13.
- Filtro de Enrique César: span de diez abiertas.
- Borrador con destino y notas recuperado al ocultar menús y recargar.
- Ocultar menús: altura del mapa igual a la del área visible del navegador; no se reduce el ancho al abrir paneles.
- Auditoría muestra motivos y carácter estimado. No cambia asignaciones.

Las propuestas de prueba se revierten al terminar. Los datos de origen no se modifican. El ZIP se vuelve a comprobar sobre un archivo limpio del commit de base. Las comprobaciones locales no sustituyen el resultado de la ejecución remota de GitHub después de subir los archivos.
