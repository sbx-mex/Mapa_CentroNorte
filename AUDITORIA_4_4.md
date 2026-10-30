# Verificación del CMS integrado 4.4.0

Origen de código: `794488d128c5d37b5a3028769084a766db1c98e1` (4.3).

## Fuentes y cruce

- Puntos proporcionados en Markdown: 474 CeCo únicos de cinco regiones, sin conflictos regionales con el directorio Alsea.
- Ops Octubre 2026.xlsx: región, DM, estatus, fecha y datos de ubicación. La hoja Directorio coincide con las asignaciones del archivo Ops Octubre 2026(5).xlsm para este alcance.
- Tiendas Alsea MX 2026_10.csv: cruce exacto por CeCo, región y nombre de DM; coordenadas de respaldo donde faltaban puntos.
- CMS anterior: coordenadas existentes y tres aperturas se conservan, incluida la confirmación de Toreo Walmart.

Resultado: 482 registros. Las 455 abiertas se distribuyen en 73 Centro Norte, 100 Centro Sur, 100 Centro Poniente, 86 Centro Centro y 96 Bajío. Hay 37 grupos Región/DM con abiertas. Permanecen cinco aperturas, ocho cierres temporales y 14 definitivos. Los ocho estatus distintos entre Ops y Alsea se conservan visibles en columnas separadas y una observación, priorizando el cierre temporal de Ops.

No se asigna una región por geografía. Las cinco regiones coinciden entre las fuentes que permiten cotejo. Las coordenadas originales se conservan; las nuevas vienen de datos recibidos, sin geocodificar ni estimar puntos.

## Integración

- CMS con cinco pestañas conservadas y tabla maestra Región/DM/CeCo/Tienda/Estatus.
- Listas desplegables, DM dependiente de la región y validación de pares antes de generar.
- Los 72 registros originales de Indicadores se conservan.
- Un mismo normalizador prepara mapa y directorio, con estatus explícito y coordenadas pendientes permitidas.
- El workflow construye desde el CMS, prueba y publica en Pages cuando la fuente de Pages sea GitHub Actions. No se ha publicado esta entrega desde la conversación.
- Se conserva la clave de almacenamiento anterior, los CeCo conocidos, borradores y respaldo de la fuente previa.

## Pruebas

25 pruebas Python y 41 JavaScript, compilación, sintaxis y comparación de datos derivados. Se cubren estatus explícitos, pares Región/DM inválidos, origen independiente de propuesta, jerarquía, colores, continuidad y nuevas cantidades de tiendas.

Recalculo en el motor de hojas del entorno e inspección sin errores de fórmula. No se abrió Excel de escritorio. Resumen 455 abiertas/455 ubicables/482 registros. Se comprobó un cambio de estatus y la incorporación de una nueva fila en una copia de prueba. Se verificaron validaciones XML, fórmulas y vistas de las cinco pestañas. Los datos de prueba no se incluyen.

Navegador: despliegue de Centro Norte, Enrique César y Nancy Rodríguez; búsqueda por CeCo y DM; propuesta de San Miguel Izcalli hacia Centro Poniente, color violeta y conteos 72/101. El directorio conserva Centro Norte/Enrique César. Las pruebas de propuesta se revierten al terminar.

La cartografía municipal cargada no cubre todo Bajío. Sus puntos se mantienen; el aviso de cobertura no acredita error de región o coordenada. Base validada acredita consistencia estructural, no una aprobación automática de cada decisión territorial.
