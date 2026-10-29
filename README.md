# Centro Norte · Mapa de decisiones 3.0

Herramienta para que Regional evalúe ubicaciones y pruebe asignaciones de DM y región en el mapa. Parte del repositorio `sbx-mex/Mapa_CentroNorte`, commit `53f6e9b2001880ceefb7f741352b860436121d26`, y del Excel proporcionado `Mapa_CentroNorte_CMS(2).xlsx`.

## Abrir sin instalar

1. Extrae **todo** el ZIP en una carpeta.
2. Abre **index.html** con Chrome o Edge.
3. Empieza por **Cómo usarlo** o selecciona una tienda del listado.

La base, los pines, las librerías y los límites municipales están incluidos y funcionan sin conexión. El mapa base de calles de INEGI requiere internet. Si ese servicio no responde, permanecen los límites y las tiendas. No hace falta una API key, Python ni instalar paquetes para usar `index.html`.

## Qué puedes hacer

| Control | Resultado |
| --- | --- |
| Buscar y filtros | Localizar por CeCo, nombre, DM, municipio, región, estatus y decisión. |
| Listado / pin | Abrir la ficha de una tienda y acercar el mapa. |
| Guardar evaluación | Definir Conservar, Reasignar o No considerar, DM, región y motivo. |
| Casillas / selección por área ▣ | Evaluar varias tiendas a la vez. La selección permanece al cambiar filtros. |
| Comparar cercanía | Comparar distancias de los pares de tiendas seleccionadas. |
| Por DM / Por región | Cambiar el color de los pines y su leyenda. Los grupos muestran los colores que contienen. |
| Evaluar fondo | Seleccionar un municipio, cambiar su región y, opcionalmente, asignarla a las tiendas que contiene. |
| Intensidad / nombres / entidades vecinas | Revisar el fondo geográfico con diferentes niveles de detalle. |
| Ajustar pin | Arrastrar una ubicación dentro de la propuesta; las coordenadas originales se conservan en Base. |
| Base / Propuesta | Comparar los datos originales con el escenario actual. |
| ↶ Deshacer | Revertir hasta 35 cambios durante la sesión. También funciona Ctrl+Z fuera de los formularios. |
| DM y colores | Cambiar colores y añadir DM para probar otras distribuciones. |
| Ver reparto | Comparar el número de tiendas por DM antes y después de la propuesta. |
| Exportar escenario | Descargar un JSON completo y/o un CSV de decisiones para Excel. |
| Exportar → Nueva propuesta | Empezar otro escenario conservando las ubicaciones de la base. |
| Cargar | Recuperar un escenario JSON o importar la hoja Ubicaciones de un Excel CMS. |

El buscador también se abre con `/`. Esc cancela una selección de área. Una tienda marcada **No considerar** permanece visible con × y se excluye del reparto propuesto; no se borra de la base.

## Datos incluidos y revisión

- **103 ubicaciones**: 100 con fecha y 3 aperturas sin fecha, según la instrucción del usuario.
- **8 DM**, incluidos David Carrasco y Moni Morales. Los DM se obtienen de Ubicaciones, no del catálogo desactualizado del Excel.
- **Aperturas**: 43300 GasoSur Dt, 43301 Plaza Centella y 43302 Toreo Waltmar. Se conservan los nombres del archivo.
- Tres latitudes tenían una coma sobrante al final: 43164, 43170 y 43183. Se normalizó exclusivamente esa forma de pegado, sin estimar coordenadas nuevas.
- Las 103 coordenadas encuentran un municipio dentro del fondo cartográfico incluido.
- **Validar 43302 Toreo Waltmar**: el Excel dice Naucalpan, Estado de México, pero la coordenada cae en Miguel Hidalgo, CDMX. La ficha muestra ambos datos; la ubicación no se corrigió automáticamente.
- Las ubicaciones sin indicadores se aceptan: el objetivo de esta versión es geográfico. El Excel original no se modifica al abrirlo o importarlo.

## Fondo de regiones

Los límites proceden del **Marco Geoestadístico de INEGI, diciembre de 2025**, según los metadatos devueltos por el servicio. Se incluyen 125 municipios del Estado de México, 16 alcaldías de CDMX y 84 municipios de Hidalgo, además de los contornos de Morelos, Puebla, Tlaxcala, Michoacán y Querétaro.

**Norte, Poniente, Centro, Oriente y Sur son sugerencias de trabajo**, no regiones comerciales confirmadas ni regiones definidas por INEGI. El Excel no trae ese campo. La asignación inicial usa el centro de la caja geográfica de cada municipio respecto al Zócalo: zona Centro hasta 0.115 grados; fuera de ella, orientación del eje dominante. Se puede modificar municipio por municipio en Evaluar fondo. La región de una tienda también se puede cambiar de forma independiente.

Las geometrías están en longitud/latitud WGS84, redondeadas a 5 decimales y simplificadas aproximadamente a 0.00022 grados para visualización. Cambiar el fondo agrupa municipios; no altera sus límites.

Fuentes:

- [Servicio de claves y geometrías INEGI](https://www.inegi.org.mx/servicios/catalogounico.html)
- [Servicio de mapas web INEGI](https://www.inegi.org.mx/servicios/wsinfogeo/default.html)
- Endpoints y metadatos originales: `static/planning/sources.json`.

Las distancias usan Haversine en línea recta. No representan trayectos, tráfico ni tiempo de traslado y no determinan automáticamente qué tienda conservar.

## Guardar y compartir

Se guarda automáticamente **un escenario en este navegador y origen** mediante localStorage. Cambiar de navegador, equipo, dirección o carpeta puede abrir un almacenamiento diferente. Si el navegador bloquea el almacenamiento, la aplicación indica que debes exportar.

El **JSON** incluye la base del escenario, asignaciones, decisiones, notas, coordenadas ajustadas, colores y cambios de fondo. Cárgalo en otro equipo con Cargar → Escenario. El **CSV** tiene una fila por tienda con columnas de base y propuesta; sirve para revisión en Excel, no para recuperar el fondo. El CSV protege las celdas de texto que podrían interpretarse como fórmulas.

Los archivos se leen y procesan en el navegador. No hay colaboración simultánea ni sincronización de escenarios con GitHub. El mapa base hace solicitudes al servicio de INEGI para la zona visible. El ZIP no contiene decisiones de prueba.

## Estructura para mejorar el proyecto

```text
index.html                       Entrada estática para archivo local y GitHub Pages
static/planning/app.js            Interfaz y acciones sobre el mapa
static/planning/core.js           Validación, filtros, escenarios y distancias
static/planning/planning.css      Diseño adaptable
static/planning/base.js           Instantánea geográfica de las 103 tiendas
static/planning/geography.js      Límites y regiones iniciales locales
static/planning/sources.json      Procedencia, reglas y metadatos
static/vendor/                    Leaflet, MarkerCluster y lector Excel, con licencias
cms/Mapa_CentroNorte_CMS.xlsx      Excel proporcionado, conservado sin editar
data/stores.json                  Base canónica compatible con el CMS anterior
data.csv                         Exportación compatible anterior
tools/build_remaster.py           Regenera instantáneas desde CMS y servicio INEGI
tests/planning.test.cjs           Pruebas del motor del mapa y sus escenarios
app.py / cms_service.py           Servidor y administración CMS conservados
```

Para GitHub Pages basta publicar la carpeta con `index.html` y `static/`. El ZIP se preparó para revisión y no publica cambios en el repositorio automáticamente.

Para actualizar la base de trabajo dentro del navegador usa Cargar → Excel. Para actualizar la base estática que verán todos al abrir `index.html`, reemplaza el CMS y ejecuta:

```bash
pip install -r requirements.txt
python tools/build_remaster.py
```

El constructor descarga geometrías INEGI y las reutiliza en `.geo-cache`. También admite `--geo-cache /ruta/al/cache`. No modifica el Excel. Después publica los archivos regenerados junto con la interfaz. La administración Python anterior actualiza JSON/CSV; para que esa actualización llegue a la entrada estática también debes regenerar `base.js` con este comando.

Servidor opcional: `python app.py`, luego `http://127.0.0.1:8000/mapa`. Se conservaron las rutas anteriores de directorio y administración. La remasterización abre desde `index.html` y no depende de ellas.

## Verificación

```bash
node --check static/planning/app.js
node --test tests/planning.test.cjs
python -m unittest discover -s tests -v
```

Se comprobaron en navegador búsqueda, reasignación, guardado, recarga, Base/Propuesta, evaluación de grupos, comparación de cercanía, selección rectangular, cambio de fondo municipal, color por región, carga del Excel proporcionado, descarga JSON/CSV, ajuste de pin y Deshacer.

Dependencias locales: Leaflet 1.9.4, Leaflet.markercluster 1.5.3, SheetJS CE 0.18.5 (lectura XLSX). Sus licencias se incluyen en `static/vendor`. No hay dependencias de Node que instalar para ejecutar o probar el mapa.
