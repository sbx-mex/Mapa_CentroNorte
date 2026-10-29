# Centro Norte · Mapa de decisiones 3.1

Todas las tiendas son de **Región Centro Norte**. El mapa sirve para revisar ubicaciones, evaluar tiendas y comparar una propuesta de reparto por DM. Norte, Poniente, Centro, Oriente y Sur son **zonas geográficas del fondo**, no otras regiones comerciales.

## Aplicar esta mejora

Este paquete es incremental para la versión 3.0 subida a `sbx-mex/Mapa_CentroNorte` (base `c9bc1c729120971e7fb07b8bd36aa51312429396`). Contiene únicamente archivos nuevos o modificados.

1. Extrae el ZIP y copia su contenido en la raíz de tu proyecto, conservando las rutas y reemplazando los archivos coincidentes.
2. Conserva el Excel de `cms/`, la cartografía de `static/planning/geography.js` y las librerías de `static/vendor/` que ya existen en el proyecto.
3. Abre `index.html` para probar. La base validada y sus resultados ya vienen preparados.
4. Para GitHub, sube los archivos de la mejora con sus carpetas, incluida `.github/workflows/ci.yml`. GitHub Actions ejecutará las validaciones; el resultado de esa nueva carga se confirma cuando termine la ejecución.

No extraigas el ZIP en una subcarpeta del sitio para publicarlo. Debe reemplazar los archivos en la raíz existente. No es un proyecto independiente ni contiene de nuevo las librerías, la cartografía o el Excel.

## Navegación

| Acción | Uso |
| --- | --- |
| Buscar CeCo / Responsable DM | Encontrar una tienda o un grupo. |
| Seleccionar tienda o pin | Abrir la evaluación en el mismo mapa. |
| Guardar evaluación | Definir Conservar, Reasignar o No considerar, DM y motivo. |
| Datos listos / Base validada | Revisar la calidad de los datos y abrir los puntos que necesitan atención. |
| Ver reparto | Comparar barras de Base/Propuesta por DM. Tocar una tarjeta muestra sus tiendas en el mapa. |
| Base / Propuesta | Comparar la información original y las decisiones. |
| Zonas del mapa | Evaluar el fondo municipal. Cambiar una zona conserva Región Centro Norte. |
| Por DM / Por zona | Cambiar los colores de los pines. |
| Guardar propuesta | Descargar decisiones CSV para Excel o una copia JSON de la propuesta. |
| Casillas / selección por área | Evaluar varias tiendas al mismo tiempo. |
| Deshacer | Recuperar el estado anterior durante la sesión. |

La navegación **no incluye Cargar ni entradas de archivos**. Las propuestas se conservan en este navegador. La copia JSON es un respaldo técnico; esta interfaz no ofrece importación manual de archivos. Si una base publicada cambia, se conserva un respaldo local del escenario anterior y se inicia una propuesta compatible con los datos vigentes.

## Qué aporta Python

`ACTUALIZAR_MAPA.py` lee directamente la hoja Ubicaciones del Excel. Usa la biblioteca estándar de Python; no instala paquetes ni consulta servicios externos.

- Valida encabezados, CeCo de cinco dígitos y sin duplicados, nombres, DM, fechas y coordenadas finitas.
- Clasifica como Apertura las filas sin fecha.
- Asigna Región Centro Norte a todas las tiendas y mantiene las zonas en un campo independiente.
- Revisa la coordenada contra la cartografía local e identifica diferencias de entidad y ubicaciones fuera del fondo.
- Calcula las tres tiendas más cercanas y la extensión geográfica base por DM.
- Genera la base y el informe que alimentan el indicador verde, la revisión interactiva y las tarjetas del reparto.
- Cambia las referencias de datos por su firma para reducir la mezcla de recursos anteriores en la caché del navegador.

La extensión base es la distancia máxima en línea recta entre dos tiendas del mismo DM. No es un tiempo de traslado ni una recomendación automática de asignación.

**Datos listos** significa que la estructura de la base pasó la validación. Los avisos de ubicación se muestran aparte. Actualmente hay 103 tiendas, ocho DM y tres aperturas. El CeCo 43302 requiere revisar la diferencia entre Naucalpan en el Excel y Miguel Hidalgo en su coordenada. Los valores originales se conservan.

## Actualizar información futura

1. Actualiza `cms/Mapa_CentroNorte_CMS.xlsx`, hoja **Ubicaciones**. Conserva CC, Nombre Tienda, DM, Fecha Apertura, Municipio, Cobertura, Latitud y Longitud. Formato, Formato Comercial, Tier y Activa pueden estar vacíos.
2. Ejecuta Python 3.10 o posterior:

```bash
python ACTUALIZAR_MAPA.py
```

El proceso valida, prepara los datos y abre el mapa. Para terminal o automatización usa `python ACTUALIZAR_MAPA.py --no-open`.

3. Sube el Excel actualizado y los archivos regenerados: `index.html`, `static/planning/base.js` y `static/planning/insights.js`.

Las cantidades de tiendas y DM pueden cambiar sin editar las pruebas. Si Python detecta un archivo inválido, conserva la última base y marca la revisión como bloqueada. Corrige los errores y ejecútalo otra vez. `--check` solo verifica, no modifica archivos y devuelve un código de error real si hay problemas o la vista no coincide con el Excel.

El mapa en GitHub Pages sigue siendo estático. Python prepara y valida la información antes de subirla; no se ejecuta dentro de GitHub Pages. Las decisiones realizadas en el navegador se reflejan al instante mediante la interfaz.

## Verificación

```bash
python ACTUALIZAR_MAPA.py --check
python -m unittest discover -s tests -v
node --check static/planning/app.js
node --check static/planning/core.js
node --test tests/planning.test.cjs
```

Se verificaron 15 pruebas de Python y 16 del motor de la interfaz. Incluyen futuras cantidades de tiendas/DM, región única, separación de zonas, fechas vacías, duplicados, coordenadas inválidas, respaldo ante error, cercanías y migración de escenarios 3.0.

Se comprobó en navegador la revisión de datos, el acceso desde un aviso a su pin, el guardado de evaluaciones, el avance de revisión y el reparto visual. La navegación mantiene la base, el mapa y las librerías locales. Las calles de INEGI requieren conexión; el fondo municipal y los pines continúan disponibles sin ella.
