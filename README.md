# Centro Norte · Mapa y propuesta regional 4.2

La apertura da prioridad al mapa. Muestra las cinco zonas geográficas, colores de fondo más intensos y toda la superficie de trabajo, con menús cerrados que se despliegan encima del mapa.

## Menús a demanda

| Control | Acción |
| --- | --- |
| Tiendas | Abre búsqueda, filtros, selección y nombre del escenario en un panel lateral superpuesto. |
| Capas | Abre Base/Mi propuesta, mostrar u ocultar tiendas, colores por DM y ajustes del fondo. |
| Balance | Muestra los totales de Centro Norte cuando se necesitan. |
| Ver zonas | Encuadra el territorio completo con las cinco zonas geográficas. |
| Centrar tiendas visibles | Acerca el mapa a las tiendas que cumplen los filtros. |
| Ocultar menús | Oculta encabezado, paneles, leyenda y controles; el mapa ocupa la pantalla de trabajo completa. |
| Mostrar menús | Recupera los controles y los paneles que estaban abiertos. Conserva la selección, el formulario en edición y las decisiones guardadas. |
| Propuesta | Abre el resumen de movimientos y balance entre regiones internas. |
| Exportar | Descarga CSV para Excel o JSON con el escenario completo. |

Los menús no reducen el ancho del mapa. Sus botones mantienen los estados de apertura accesibles; el listado, capas y balance tienen cierre propio. Escape cierra paneles o recupera los controles de la vista Solo mapa. El atajo `/` abre Tiendas y enfoca la búsqueda.

Al abrir o recargar, el mapa vuelve a mostrar el territorio y los paneles comienzan cerrados. Las decisiones guardadas se recuperan del navegador. Ocultar menús no reinicia la propuesta ni reencuadra una ubicación que se esté revisando.

## Dos capas independientes

- **Fondo cartográfico:** Centro, Norte, Poniente, Sur y Oriente, sobre los 225 límites municipales/de alcaldías INEGI que ya tiene el proyecto. Se abre con intensidad de 50%, regulable entre 5% y 75%, y nombres de zona más grandes.
- **Tiendas Starbucks:** regiones internas para conservar, tomar o ceder. Ocultar DM conserva los cinco colores del fondo. Capas también permite ocultar los pines para revisar solo la geografía.

Los límites proceden del Marco Geoestadístico INEGI registrado en el proyecto, diciembre de 2025. Las cinco zonas son agrupaciones de referencia por orientación, ajustables por municipio; no se presentan como una regionalización oficial de INEGI. Se conservan las geometrías de origen.

Pintar un municipio modifica únicamente su fondo. No cambia CeCo, DM, región interna, coordenadas ni balance. La intensidad mayor y las líneas municipales más finas permiten distinguir mejor las zonas.

## Base de origen

| Región interna | Tiendas actuales | Aperturas | Ubicaciones |
| --- | ---: | ---: | ---: |
| Centro Norte | 73 | 3 | 76 |
| Bajío · David Carrasco | 14 | 0 | 14 |
| Centro Sur · Mónica Morales | 13 | 0 | 13 |
| Total disponible | 100 | 3 | 103 |

Centro Centro y Centro Poniente siguen disponibles como destinos. Sus cifras corresponden solo a las ubicaciones incluidas en este mapa. Moni Morales del Excel se presenta como Mónica Morales en la interfaz.

Toreo Walmart, CeCo 43302 (Toreo Waltmar en el Excel), conserva **19.4506098125196, -99.2180774805589** y su confirmación del Regional.

## Aplicar el ZIP

Actualización incremental sobre `sbx-mex/Mapa_CentroNorte`, versión 4.1, commit `ef83152`.

1. Extrae `Mapa_CentroNorte_Mapa_Principal_4_2_0.zip`.
2. Copia su contenido en la **raíz del proyecto existente**, conservando carpetas y reemplazando archivos coincidentes.
3. Conserva Excel, bases, librerías, cartografía, configuración regional y workflow existentes. No subas el ZIP como archivo del sitio ni lo dejes dentro de una subcarpeta.
4. Sube los archivos extraídos y espera la validación de GitHub Actions y la publicación de Pages. Comprueba Base validada.

No es necesario regenerar datos con Python para aplicar este ajuste. Los scripts modificados y el nuevo CSS llevan versión 4.2.0 en `index.html`.

## Propuestas y continuidad

Selecciona una tienda en el mapa o el listado. En Región interna propuesta, elige Centro Norte para conservar una propia o tomar una externa; elige otra región para ceder una propia. Guarda para confirmar el movimiento. Las casillas o el botón de área permiten asignar un destino común a varias tiendas.

La base permanece independiente de la propuesta. Cambiar DM o zona no cambia la región interna. El balance completo y el CSV conservan origen y destino. El guardado automático es local al navegador; el JSON conserva una copia técnica. La interfaz no incluye carga ni importación manual de archivos. Una propuesta compatible anterior se recupera y, si cambia su fuente, el escenario previo se respalda antes de iniciar uno compatible.

## Actualizar datos en el futuro

1. Edita `cms/Mapa_CentroNorte_CMS.xlsx`, hoja Ubicaciones. Conserva CC, Nombre Tienda, DM, Fecha Apertura, Municipio, Cobertura, Latitud y Longitud.
2. La columna opcional Región define un origen comercial explícito. Si está vacía, se aplican las reglas de DM de `static/planning/regional-rules.json` y Centro Norte para los demás responsables. Las filas sin fecha son Aperturas.
3. Ejecuta `python ACTUALIZAR_MAPA.py --no-open` con Python 3.10 o posterior.
4. Sube Excel e instantáneas regeneradas: `index.html`, `static/planning/base.js`, `static/planning/insights.js`. Incluye las reglas regionales si las cambiaste.

Un error conserva la base previa y bloquea el indicador. `--check` no escribe y comprueba los datos y los totales de la revisión. Las calles requieren conexión al servicio INEGI; el fondo y los pines son locales. Las distancias son en línea recta.

## Verificación

```bash
python -m compileall -q .
python ACTUALIZAR_MAPA.py --check
node --check static/planning/core.js
node --check static/planning/app.js
python -m unittest discover -s tests -v
node --test tests/planning.test.cjs
```

20 pruebas Python y 30 JavaScript, además de revisión de menús y edición en navegador. El paquete se comprueba aplicado sobre una copia limpia del commit de origen. La nueva ejecución de GitHub se confirma cuando se suban los archivos.
