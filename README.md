# Centro Norte · CMS y directorio regional 4.4

Un solo Excel define **Región → DM → Tienda** para mapa, directorio y datos derivados. La región de origen se respeta: no se deduce de la ubicación ni cambia por ocultar una capa. Las propuestas se guardan aparte.

## Directorio integrado

| Región | Abiertas | Color de pin |
| --- | ---: | --- |
| Centro Norte | 73 | Verde |
| Centro Sur | 100 | Frambuesa |
| Centro Poniente | 100 | Violeta |
| Centro Centro | 86 | Azul |
| Bajío | 96 | Ámbar |
| Total | 455 | Cinco regiones |

El botón **Directorio** despliega cada región, sus DM y las tiendas del DM. Centro Norte abre primero; Enrique César tiene diez abiertas y Nancy Rodríguez trece. La búsqueda admite región, DM, nombre o CeCo. Pulsar una tienda la ubica en el mapa. El botón **Región** conserva los filtros y span por DM.

El directorio de origen permanece igual aunque una tienda se proponga para otra región. En Mi propuesta, el pin usa el color del destino y los conteos cambian al guardar. El selector de DM ofrece responsables de la región destino; una tienda puede quedar **Por asignar**. La región y DM de origen siguen disponibles en la ficha y exportación.

Solo las abiertas activas aparecen en el mapa y el directorio desplegable. El CMS conserva **482 registros: 455 abiertas, cinco próximas aperturas, ocho cierres temporales y 14 cierres definitivos**. Ocho registros figuran abiertos en Alsea y con cierre temporal en Ops: se conserva el estatus más específico de Ops, el estatus Alsea y una observación. No se oculta la diferencia ni se inventa una reapertura.

## Un Excel CMS

Archivo: `cms/Mapa_CentroNorte_CMS.xlsx`.

- **Inicio:** resumen conectado de abiertas, ubicables, pendientes, aperturas y cierres por región.
- **Ubicaciones:** tabla maestra. Primero Región, DM, CeCo, Tienda y Estatus; después fecha, municipio, coordenadas y datos operativos. Contiene listas de región, DM dependiente de región, estatus y activa.
- **Indicadores:** se conservan los 72 registros y sus datos originales. Las nuevas tiendas no reciben indicadores inventados.
- **Catalogos:** pares Región/DM válidos, nombre completo de directorio y etiqueta para mostrar en la interfaz. Al dar de alta un DM, insértalo junto a los de su región.
- **Validacion:** identifica combinación Región/DM, CeCo duplicado y disponibilidad de ubicación.

Los nombres cortos existentes se conservan para recuperar propuestas previas; el nombre completo del directorio queda separado. `Mostrar como` controla la etiqueta visible. La combinación Región/DM se valida antes de generar o publicar; un error bloquea la actualización.

Las coordenadas existentes se conservan. Los puntos recibidos completan las otras tiendas y el directorio Alsea aporta las coordenadas faltantes cuando están disponibles. Una abierta sin coordenadas permanece en el directorio y el conteo, con ubicación pendiente y sin pin estimado. Las 455 abiertas entregadas tienen coordenadas. Toreo Walmart 43302 mantiene **19.4506098125196, -99.2180774805589** y su confirmación; sigue como próxima apertura fuera del conteo de abiertas.

## Aplicar esta actualización

Incremental sobre **4.3**, commit `794488d128c5d37b5a3028769084a766db1c98e1`, repositorio `sbx-mex/Mapa_CentroNorte`.

1. Extrae `Mapa_CentroNorte_CMS_Integrado_4_4_0.zip`.
2. Copia el contenido a la **raíz del proyecto existente**, conservando carpetas y reemplazando coincidencias. Incluye el workflow de `.github/workflows/ci.yml`.
3. Sube los archivos extraídos al repositorio.
4. Para la actualización automática desde Excel, selecciona **Settings → Pages → Build and deployment → Source: GitHub Actions** una sola vez. El workflow incluido reemplaza la publicación directa desde una rama.

Después basta reemplazar `cms/Mapa_CentroNorte_CMS.xlsx` en el repositorio. Actions genera mapa y directorio, ejecuta las pruebas, prepara el sitio y publica el resultado validado. No cambia asignaciones del Excel ni escribe commits generados en el repositorio. Un Pull Request valida sin publicar.

La configuración de Pages se debe seleccionar en GitHub; el ZIP no cambia los ajustes de la cuenta. Guía oficial: https://docs.github.com/es/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

Para actualizar localmente:

```bash
python ACTUALIZAR_MAPA.py --no-open
```

La misma ejecución actualiza `base.js`, `insights.js`, las referencias de `index.html`, `data/stores.json` y `data.csv`. El servidor Python también regenera el mapa al cargar un CMS válido. `/directorio` utiliza la misma interfaz, no una base alternativa. El sitio estático incluye `directorio/` y permite descargar el mismo Excel.

## Conservar el avance

La clave `centronorte-planning-v4` y los borradores se conservan. Al detectar la base ampliada, los CeCo existentes recuperan sus ajustes y se respalda el escenario anterior. Las propuestas sobre una tienda ahora cerrada permanecen en el respaldo y estado, fuera del mapa de abiertas. El guardado corresponde al mismo navegador y origen del sitio; exporta antes de borrar sus datos.

Base actual y Mi propuesta son independientes. El CSV de abiertas incluye origen, destino, DM, estatus operativo y fuente del directorio. El JSON conserva el escenario completo. Los borradores se aplican al pulsar Guardar. No se cambia automáticamente una región por posición, auditoría o DM.

## Cartografía y auditoría

Se mantienen los cinco colores del fondo y la acotación pequeña, sin rótulos grandes. Los límites municipales/de alcaldías son los ya incluidos del Marco Geoestadístico INEGI, diciembre de 2025. Centro, Norte, Poniente, Sur y Oriente son grupos por orientación, no una regionalización oficial ni regiones Starbucks.

El fondo municipal disponible no cubre todos los puntos de Bajío. Sus tiendas permanecen visibles; la auditoría indica la cobertura faltante, no una ubicación incorrecta por defecto. La auditoría es orientativa y no reasigna tiendas. Los colores de pines dependen de la región Starbucks.

## Comprobación

```bash
python -m compileall -q .
python ACTUALIZAR_MAPA.py --check
node --check static/planning/core.js
node --check static/planning/app.js
python -m unittest discover -s tests -v
node --test tests/planning.test.cjs
```

25 pruebas Python y 41 JavaScript. Se revisan coherencia de mapa/directorio, estatus explícito, jerarquía, filtros, continuidad, colores y propuestas. Los conteos de prueba comparan con controles independientes del CMS, permitiendo ampliar la base sin fijar las cifras actuales en el código. El paquete se comprueba sobre una copia limpia del commit de origen. La publicación y el resultado remoto se verifican al subirlo a GitHub.
