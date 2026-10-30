# Cartografía independiente · 4.1

Actualización incremental sobre `sbx-mex/Mapa_CentroNorte`, commit `f244ad0` (mejora regional 4.0).

## Cambios

- El fondo usa cinco colores de zona geográfica, incluso cuando los pines están en verde o por DM.
- Los colores se aplican exclusivamente a los polígonos del fondo; sus agrupaciones no se infieren de regiones comerciales Starbucks.
- La leyenda identifica por separado los pines de tiendas y los colores del fondo. Incluye Centro, Norte, Poniente, Sur y Oriente.
- Los nombres geográficos se dibujan sobre la capa cartográfica. Ver territorio completo permite ver las cinco zonas; Centrar tiendas visibles recupera el encuadre de tiendas.
- Editar el fondo por municipio modifica solo `state.areas`. Se eliminó la opción de propagar ese cambio a las tiendas.
- Alternar Base actual / Mi propuesta conserva la misma configuración del fondo.
- Las referencias de app.js, core.js y regional.css tienen versión 4.1.0 para evitar reutilizar estos recursos de 4.0.

## Fuente y alcance

Se conservan las 225 geometrías municipales/de alcaldías y las fuentes INEGI registradas en `static/planning/sources.json`, Marco Geoestadístico de diciembre de 2025. La agrupación Centro/Norte/Poniente/Sur/Oriente está documentada en el proyecto como orientación respecto al Zócalo, ajustable por municipio; no se presenta como regionalización oficial de INEGI. La paleta se elige para distinguir las zonas y no se atribuye como simbología oficial.

No se cambian Excel, datos de tiendas, geografía, reglas regionales de Starbucks ni el indicador de base validada. Se conservan 73 tiendas actuales + 3 aperturas de Centro Norte y las 27 opciones externas.

## Validación

Se comprueba la actualización aplicada sobre una copia limpia del commit de origen con los mismos comandos de GitHub Actions: compilación Python, validador de datos, sintaxis JavaScript, 20 pruebas Python y 30 JavaScript.

Las cinco pruebas nuevas cubren la paleta sobre los 225 municipios, la independencia de DM y regiones internas, la edición exclusiva del fondo, la transparencia y el rechazo de una región Starbucks como zona cartográfica, y la recuperación de ajustes separados al leer una copia del escenario.

La revisión en navegador comprueba colores, nombres y leyenda, el encuadre del territorio, la vista DM y las opciones del fondo. El ZIP no publica cambios: la nueva ejecución de GitHub se confirma cuando se suban los archivos.
