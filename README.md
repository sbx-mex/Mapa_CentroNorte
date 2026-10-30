# Centro Norte · Directorio en Región

Región reúne filtro, directorio y tiendas en un mismo apartado. Despliega un DM, busca por CeCo o nombre y pulsa la tienda para ubicarla. Centrar este DM ajusta el mapa a su equipo. La ficha vuelve al mismo directorio.

Centro Norte muestra **73 abiertas + tres aperturas**. Las aperturas llevan un pin + y se cuentan aparte. Se pueden seleccionar y proponer, con sus indicadores pendientes cuando no existen. Base actual conserva el origen y Mi propuesta actualiza el destino.

## Datos de esta rama

El CMS y las instantáneas de datos conservan exactamente la versión vigente de `main` (4.4). Esta rama integra la interfaz, la lectura de indicadores y la validación. La actualización de indicadores de septiembre preparada en el paquete se incorporará por separado.

Región, DM, estatus y coordenadas se respetan desde el CMS. Validar datos, dentro de Región, identifica cobertura de ubicación e indicadores. La ficha admite el corte tradicional Corte YTD y los cortes separados de Perfil y Negocio; los meses no informados se omiten. No se sustituyen indicadores faltantes por otros.

## Actualizar y validar

```bash
python ACTUALIZAR_MAPA.py --no-open
python ACTUALIZAR_MAPA.py --check
python -m unittest discover -s tests -v
node --test tests/planning.test.cjs
```

El mismo CMS alimenta mapa, directorio, JSON y CSV. Python rechaza métricas no finitas y relaciones Región/DM inválidas. El servidor restaura la versión anterior si una carga se interrumpe y serializa cargas simultáneas.

`tools/preparar_indicadores.py` prepara un CSV desde un dashboard.json validado de Perfil de Tienda, respetando el universo CeCo del CMS. No cambia región, DM ni ubicación. Los datos preparados deben incorporarse en Indicadores del CMS antes de regenerar las vistas.

## Publicación y continuidad

Actions regenera y comprueba el mapa antes de ejecutar 31 pruebas Python y 43 JavaScript. Los PR validan sin publicar. La publicación desde main requiere Pages → Source → GitHub Actions; ese ajuste no se modifica desde esta rama.

Se mantienen la clave centronorte-planning-v4, borradores y respaldo anterior. Mis cambios distingue abiertas y aperturas; el CSV incluye ambas con estatus y el JSON conserva el escenario completo. El guardado corresponde al mismo navegador y origen.

Los cinco colores de pin corresponden a regiones Starbucks. Las cinco zonas del fondo son referencias por orientación sobre los límites municipales INEGI incluidos, independientes de Starbucks. Auditoría es orientativa y no reasigna tiendas.
