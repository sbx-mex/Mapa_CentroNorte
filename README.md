# Centro Norte · Mesa de propuesta regional 4.0

Herramienta para que el Regional conserve, tome y ceda tiendas en un solo mapa. La región de origen se mantiene como referencia; cada cambio se guarda como propuesta.

| Base de origen | Tiendas actuales | Aperturas | Ubicaciones |
| --- | ---: | ---: | ---: |
| Centro Norte | 73 | 3 | 76 |
| Bajío · David Carrasco | 14 | 0 | 14 |
| Centro Sur · Moni Morales / Mónica Morales | 13 | 0 | 13 |
| Total disponible en el mapa | 100 | 3 | 103 |

Centro Centro y Centro Poniente están disponibles como destinos. Sus cifras representan únicamente las tiendas que reciban en esta propuesta; la base actual no incluye sus portafolios completos.

## Aplicar el ZIP de mejora

Es una actualización incremental de `sbx-mex/Mapa_CentroNorte`, base `e9c127a`. Contiene únicamente archivos nuevos o modificados.

1. Extrae el ZIP y copia su contenido en la **raíz del proyecto existente**, conservando las carpetas y reemplazando los archivos coincidentes.
2. Conserva el Excel de `cms/`, `static/planning/geography.js`, las librerías de `static/vendor/` y los demás archivos del proyecto.
3. Sube el contenido extraído a GitHub, incluida `.github/workflows/ci.yml`. No subas el ZIP como un archivo del sitio ni lo dejes dentro de una subcarpeta.
4. Espera la ejecución de **Validación de propuesta regional** y la publicación de GitHub Pages. Abre el mapa y comprueba que diga **Base validada** y **73 actuales + 3 aperturas**.

La base y su revisión ya están regeneradas. No es necesario ejecutar Python para aplicar esta entrega sobre la versión indicada. El estado de la nueva ejecución en GitHub se confirma al terminar esa carga; las verificaciones locales se describen en `AUDITORIA_4_0.md`.

## Proponer con el mapa

- **Selecciona un pin o una tienda.** La ficha muestra región de origen y región propuesta.
- **Tomar:** elige Centro Norte como destino de una tienda externa.
- **Ceder:** elige Centro Sur, Bajío, Centro Centro o Centro Poniente como destino de una tienda propia.
- **Conservar:** deja Centro Norte para una tienda propia. Guarda para marcarla como revisada.
- **Guardar en la propuesta:** confirma la decisión y actualiza el balance completo, aunque tengas filtros activos.
- **Mostrar DM / Ocultar DM:** enciende o apaga los colores por responsable. La vista inicial usa un solo verde; las opciones externas son huecas, las entradas llevan + y las salidas ↗.
- **Base actual / Mi propuesta:** compara las dos estructuras. Cambiar de vista no borra decisiones.
- **Casillas o selección por área:** reúne tiendas y usa Proponer selección para asignarles un destino común.
- **Todas / Mi región / Opciones / Cambios:** muestra todo, la región propuesta, los orígenes externos o los movimientos.
- **Revisar propuesta:** consulta el balance entre regiones y el detalle de entradas y salidas. Las cifras no dependen de los filtros del mapa.
- **Exportar propuesta:** descarga CSV para Excel o JSON con el escenario completo.
- **Deshacer:** recupera el cambio anterior durante la sesión.

Las propuestas se guardan en este navegador. Una descarga JSON conserva una copia para continuidad técnica; la interfaz no tiene botón Cargar ni importación de archivos. Las decisiones no modifican por sí mismas la base oficial.

Si se encuentra una propuesta 3.x sobre las mismas ubicaciones, conserva notas, evaluaciones y asignaciones, aplicando las regiones de origen corregidas. Cuando cambia la fuente, respalda el escenario previo en el navegador y abre uno compatible. La vista Base permanece independiente.

## Reglas regionales y Toreo Walmart

`static/planning/regional-rules.json` es la configuración compartida por Python y el motor JavaScript. Define las cinco regiones y las asignaciones de origen de David Carrasco y Mónica Morales. Se reconoce el nombre Moni Morales del Excel; la interfaz muestra Mónica Morales.

Toreo Walmart, CeCo **43302** (Toreo Waltmar en el Excel), conserva exactamente **19.4506098125196, -99.2180774805589**. La confirmación del Regional elimina el aviso pendiente de esta coordenada; no se mueve el pin. La confirmación solo se aplica mientras esas coordenadas sean las mismas.

Cambiar DM, zona o color no cambia la región. La zona geográfica es una referencia del fondo INEGI; el destino comercial se elige expresamente en Región propuesta.

## Actualizar la base después

1. Actualiza `cms/Mapa_CentroNorte_CMS.xlsx`, hoja **Ubicaciones**.
2. Conserva CC, Nombre Tienda, DM, Fecha Apertura, Municipio, Cobertura, Latitud y Longitud. La columna opcional **Región** permite especificar un origen comercial; cuando está vacía se aplican las reglas de DM y, para los demás responsables, Centro Norte.
3. Ejecuta Python 3.10 o posterior:

```bash
python ACTUALIZAR_MAPA.py --no-open
```

4. Sube el Excel y los archivos regenerados: `index.html`, `static/planning/base.js`, `static/planning/insights.js`. Si modificaste reglas regionales, sube también `regional-rules.json`.

Las filas sin fecha son Aperturas. Python valida CeCo, coordenadas, fechas, regiones y recursos locales; prepara cercanías y totales. Un error conserva la base anterior y bloquea el indicador. `--check` no escribe y también detecta totales regionales incorrectos en una revisión que declare estado verde.

## Verificaciones

```bash
python -m compileall -q .
python ACTUALIZAR_MAPA.py --check
node --check static/planning/core.js
node --check static/planning/app.js
python -m unittest discover -s tests -v
node --test tests/planning.test.cjs
```

20 pruebas Python y 25 pruebas JavaScript. La navegación, el guardado, el balance, tomar, ceder, selección múltiple, deshacer, la vista DM y Toreo se revisaron en navegador.

El mapa base de calles de INEGI requiere conexión; el fondo municipal y los pines son locales. Las distancias son en línea recta y no representan tiempos ni rutas de traslado.
