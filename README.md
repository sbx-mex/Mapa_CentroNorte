# Centro Norte · Regional de tiendas 4.3

Un mapa de tiendas abiertas, con filtro por región Starbucks, conteo de la propuesta y span por DM. El mapa conserva todo el ancho de la pantalla; los paneles se abren encima.

## Uso

1. Abre **Región** o pulsa una región de la leyenda de pines para filtrar. **Desplegar DM** muestra cuántas abiertas tiene cada responsable; seleccionarlo filtra su span.
2. Compara **Base actual** y **Mi propuesta**. Selecciona una tienda, elige su destino y pulsa **Guardar y actualizar conteo**. Su pin toma el color del destino y los conteos se actualizan. También puedes seleccionar varias tiendas.
3. **Auditoría** muestra señales espaciales estimadas para revisión manual. **Mis cambios** reúne los movimientos guardados y permite exportar las abiertas para Excel.

Ya no hay botones Tiendas, Capas ni Balance. Se conservan búsqueda, selección por área, Deshacer, ficha de tienda, notas, asignación DM y ajustes del fondo. Los ajustes cartográficos están en Región → Más filtros. **Ocultar menús** ocupa toda la pantalla de trabajo y **Mostrar menús** recupera los controles y el formulario.

## Colores y datos

| Región Starbucks | Color de pin | Abiertas disponibles | Cobertura de información |
| --- | --- | ---: | --- |
| Centro Norte | Verde | 73 | Base regional actual |
| Centro Sur | Frambuesa | 13 | Catálogo parcial; total regional pendiente |
| Bajío | Ámbar | 14 | Catálogo parcial; total regional pendiente |
| Centro Centro | Azul | Pendiente | Sin catálogo de origen |
| Centro Poniente | Violeta | Pendiente | Sin catálogo de origen |

Son **100 abiertas disponibles**, no un total nacional. La interfaz admite proponer tiendas a cualquiera de las cinco regiones. Una región sin catálogo muestra las tiendas que se le proponen sin presentarlas como su total completo. Los conteos se calculan con los datos vigentes; no dependen de cifras fijas.

Solo se consideran tiendas con estatus Actual y que no estén marcadas inactivas. Las **tres aperturas** permanecen en los datos y en el respaldo JSON, excluidas del mapa, span, auditoría y CSV de abiertas. Los ajustes anteriores a sus fichas se conservan.

Los pines individuales tienen color de región Starbucks. Los grupos de una región usan ese color; los grupos mixtos muestran un anillo con la proporción de cada región. Cambiar DM no cambia región ni color del pin.

El fondo mantiene los cinco colores Centro, Norte, Poniente, Sur y Oriente sobre las 225 geometrías municipales/de alcaldías incluidas. Los rótulos grandes se eliminan; queda una acotación pequeña. INEGI aporta los límites registrados en el proyecto (diciembre de 2025); los grupos por orientación son una referencia ajustable, **no una regionalización oficial de INEGI**. Fondo y regiones Starbucks son independientes.

## Auditoría estimada

El botón revisa las abiertas disponibles en Base o Propuesta, según la vista. Aplica el filtro de región y muestra el número de señales. Sugiere revisar:

- Centro Norte en zona geográfica Sur.
- Una tienda a más de 20 km de la abierta disponible más cercana de su región.
- Tres vecinas disponibles de otra región, todas a menos de 5 km.
- Un punto fuera de los límites cartográficos cargados.

Son reglas orientativas: una región comercial puede cubrir varias zonas. No declaran incorrecta una tienda ni asignan destinos automáticamente. La cercanía es en línea recta y los catálogos incompletos limitan la evaluación. La zona se determina con la posición y el fondo vigente, no con el texto de la ficha.

**Base validada** acredita consistencia de datos, firma, CeCo, fechas y coordenadas. Es independiente de esta revisión espacial. Toreo Walmart, CeCo 43302, conserva su ubicación confirmada: 19.4506098125196, -99.2180774805589.

## Conservar el avance

Se mantiene `centronorte-planning-v4` y compatibilidad con escenarios anteriores. No se reinician las propuestas al instalar esta versión. Si la base cambia, se respaldan los datos anteriores y se conservan ajustes de los CeCo que sigan presentes. Las tiendas ausentes siguen en ese respaldo anterior; no se inventan ni se reinsertan en una base nueva.

Los borradores de cada ficha se guardan por separado en el mismo navegador y se recuperan al volver a la tienda, ocultar menús o recargar. Hasta pulsar Guardar no alteran los conteos. El JSON incluye la propuesta aplicada completa; el CSV incluye solo abiertas. El guardado depende del mismo navegador y origen del sitio; no es sincronización entre equipos. Exporta el avance antes de borrar sus datos.

## Aplicar el ZIP

Actualización incremental sobre **4.2**, commit `de0b8e46de6ad02c160d3ac434d53ad616a78ad9` del repositorio `sbx-mex/Mapa_CentroNorte`.

1. Extrae `Mapa_CentroNorte_Regional_Simple_4_3_0.zip`.
2. Copia su contenido en la **raíz del proyecto existente**, conservando carpetas y reemplazando los archivos coincidentes.
3. Sube los archivos extraídos a GitHub. No subas el ZIP como archivo del sitio ni lo dejes dentro de otra subcarpeta.
4. Espera GitHub Actions y Pages; recarga el sitio para cargar los scripts 4.3.0.

El ZIP incluye solo ocho archivos nuevos/modificados. No requiere regenerar datos ni reemplazar Excel, cartografía, reglas regionales, librerías o workflow.

## Comprobaciones

```bash
python -m compileall -q .
python ACTUALIZAR_MAPA.py --check
node --check static/planning/core.js
node --check static/planning/app.js
python -m unittest discover -s tests -v
node --test tests/planning.test.cjs
```

20 pruebas Python y 36 JavaScript. El paquete se verifica aplicado sobre una copia limpia del commit de origen. El estado remoto de GitHub se confirma después de cargar los archivos.
