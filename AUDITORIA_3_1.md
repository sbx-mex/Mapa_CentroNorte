# Revisión de estabilidad · Centro Norte 3.1

Base analizada: commit `c9bc1c729120971e7fb07b8bd36aa51312429396`, última versión disponible al iniciar la revisión.

La [validación de la versión subida](https://github.com/sbx-mex/Mapa_CentroNorte/actions/runs/40819627078) y su [despliegue de Pages](https://github.com/sbx-mex/Mapa_CentroNorte/actions/runs/40819627051) finalizaron en success. Esta mejora aún necesita su propia ejecución de GitHub Actions después de subirse; no se presenta el resultado anterior como validación remota de código nuevo.

| Hallazgo | Mejora implementada |
| --- | --- |
| Las zonas se trataban como regiones de tiendas. | Región Centro Norte fija; zona geográfica independiente. La región no cambia al reasignar un pin, DM o zona. |
| La carga de archivos añadía pasos al uso del mapa. | Se eliminó Cargar, las entradas de archivos y el lector XLSX de la entrada pública. |
| Las pruebas dependían de 103 tiendas y DM específicos. | Validaciones con conteos variables y casos de bases futuras. |
| Cambiar el Excel podía dejar una instantánea anterior. | Python contrasta Excel, base, informe, cartografía y referencia de la entrada por firma. |
| Se podía abrir una propuesta anterior con otra base. | Se usa la base publicada; los escenarios compatibles se migran. Los incompatibles se respaldan localmente y se inicia una propuesta nueva. |
| La validación no se veía durante la decisión. | Indicador verde verificable, revisión de datos y acceso al aviso desde su pin. |
| La comparación por DM se apoyaba en números de tabla. | Tarjetas con barras Base/Propuesta, extensión geográfica calculada por Python y acceso a las tiendas de cada DM. |
| La lectura del CMS mantenía abierto el libro. | Cierre explícito del archivo incluso ante error; indicadores opcionales para ubicaciones sin métricas. |

Validación local: **31 pruebas aprobadas** (15 Python y 16 del motor de interfaz), comprobación de sintaxis de scripts y revisión del Excel contra los datos preparados. El proceso de Python funciona sin instalar nuevas dependencias y no necesita descargar geometrías ni acceder a una API.

Se conservó el dato original de 43302 Toreo Waltmar: el Excel indica Naucalpan, Estado de México, y la coordenada cae en Miguel Hidalgo, CDMX. Es un aviso para decisión humana, separado del estado estructural de la base.

No se asignaron decisiones operativas por algoritmo. La cercanía y la extensión son distancias en línea recta. El mapa base de calles depende del servicio de INEGI; los límites y pines se mantienen locales. GitHub Pages no ejecuta Python: el proceso prepara los datos antes de publicarlos.
