# Centro Norte · Región y directorio 4.5

**Región** reúne filtro, directorio y tiendas en un mismo menú. El mapa abre con **73 abiertas y las tres aperturas de Centro Norte**. El Excel CMS conserva las asignaciones originales de las cinco regiones.

## Usar el mapa

1. Abre **Región**, elige región Starbucks y despliega un **DM**.
2. Busca por tienda, DM completo, municipio o CeCo. Pulsa una tienda para ubicarla; **Centrar este DM** ajusta el mapa a su equipo.
3. Elige **Región propuesta** y guarda. **Base actual** conserva origen; **Mi propuesta** actualiza destino, pin y conteos.
4. **Validar datos**, dentro de Región, muestra ubicaciones e indicadores disponibles. **Auditoría** mantiene la revisión territorial orientativa de abiertas.

Hay una sola lista con desplazamiento. Los DM desplegados y la selección se conservan durante la navegación. **Ocultar menús** libera la pantalla y conserva borradores. La ficha vuelve al directorio con **Región / DM**. La tienda enfocada mantiene su pin al cambiar de destino, aunque quede fuera del filtro actual.

Las aperturas usan pin **+** y borde discontinuo. Se pueden ubicar, seleccionar y proponer; se cuentan aparte de las abiertas.

| Región | Abiertas | Aperturas |
| --- | ---: | ---: |
| Centro Norte | 73 | 3 |
| Centro Sur | 100 | 0 |
| Centro Poniente | 100 | 0 |
| Centro Centro | 86 | 0 |
| Bajío | 96 | 2 |
| Total | 455 | 5 |

Centro Norte incluye **GasoSur Dt 43300**, **Plaza Centella 43301** y **Toreo Walmart 43302** (nombre conservado del CMS: Toreo Waltmar). Toreo mantiene exactamente **19.4506098125196, -99.2180774805589**. No se estiman coordenadas ni indicadores faltantes. Los 22 cierres permanecen en el CMS, fuera de la planeación visible; se conserva el cierre temporal de Ops cuando difiere de Alsea.

## Un solo Excel CMS

Archivo: `cms/Mapa_CentroNorte_CMS.xlsx`.

- **Ubicaciones:** 482 registros, Región, DM, CeCo, Tienda, estatus y coordenadas. Listas de región y DM dependiente conservadas.
- **Indicadores:** datos reales por CeCo desde **sbx-mex/Perfil_Tienda_DM**, con cortes propios de operación y negocio, meses disponibles y fuente. Las 455 abiertas tienen datos; las aperturas permanecen sin indicadores.
- **Catalogos:** combinaciones Región/DM, nombres completos, etiquetas y fuentes.
- **Inicio / Validacion:** resumen conectado y revisión de identificadores, jerarquía y ubicación. Las aperturas con coordenadas y activas también figuran como ubicables.

Se reconstruyó el perfil desde los motores del commit `2a6b0d21379739482f0b4c7be9b0f9a022e15f5b`, porque la instantánea publicada terminaba antes que el XLSX fuente. Operación y ventas llegan a **septiembre de 2026**. No se trasladan datos personales de partners.

Venta suma meses disponibles; rotación usa el último dato; otros indicadores promedian valores disponibles. Diferencias de Labor, Costo y EBITDA usan meses con ambos datos. Venta vs. presupuesto: suma real / suma PPTO − 1 en meses comparables. OMT: diferencia vs. AA del motor de negocio. **NPS y CTC quedan vacíos**, sin sustituirlos por otro indicador.

Para preparar otra actualización desde un `dashboard.json` validado de Perfil:

```bash
python tools/preparar_indicadores.py --perfil /ruta/dashboard.json --commit COMMIT_FUENTE --output Indicadores.csv
```

Pega sus columnas en **Indicadores** del CMS. El comando conserva el universo CeCo del CMS y no modifica región, DM ni ubicación. Actualiza todas las vistas con:

```bash
python ACTUALIZAR_MAPA.py --no-open
python ACTUALIZAR_MAPA.py --check
```

Esta ejecución sincroniza mapa, directorio, JSON y CSV. Métricas no finitas, CeCo duplicados o relaciones Región/DM inválidas bloquean la actualización. El servidor Python restaura el CMS y sus derivados anteriores si una importación se interrumpe.

## Instalar el ZIP

Incremental sobre **4.4**, `sbx-mex/Mapa_CentroNorte`, commit **8e28526af7f675fe11b3efb0c2c6902713f7312d**.

1. Extrae el ZIP en la **raíz del proyecto existente**, conservando carpetas y reemplazando coincidencias.
2. Sube los archivos extraídos, incluida **.github/workflows/ci.yml**. No subas el ZIP como archivo único.
3. Actualización automática solo desde CMS: selecciona una vez **Settings → Pages → Build and deployment → Source: GitHub Actions**. El workflow genera, prueba y publica; el ZIP no cambia ese ajuste de la cuenta.

Con Source en GitHub Actions basta sustituir el CMS en el repositorio. El paquete ya contiene los archivos generados de esta versión. Las pruebas locales pasan; la ejecución remota se comprueba al subir los archivos.

## Continuidad y cartografía

Se mantienen `centronorte-planning-v4`, borradores y respaldo anterior. Notas, DM, coordenadas y aperturas se conservan por CeCo. **Mis cambios** incluye tiendas con ajustes guardados y distingue abiertas y aperturas. El CSV incluye ambas con estatus; el JSON conserva toda la propuesta. El guardado depende del mismo navegador y origen; exporta antes de borrar sus datos.

El fondo conserva cinco colores por orientación sobre los límites municipales INEGI incluidos. Centro, Norte, Poniente, Sur y Oriente son agrupaciones de referencia independientes de Starbucks. El color de pin corresponde a la región Starbucks de cada tienda. La auditoría no reasigna tiendas. El fondo disponible no cubre todos los municipios de Bajío.

## Comprobación

```bash
python -m compileall -q .
python ACTUALIZAR_MAPA.py --check
node --check static/planning/core.js
node --check static/planning/app.js
python -m unittest discover -s tests -v
node --test tests/planning.test.cjs
```

31 pruebas Python y 43 JavaScript. Se verifican indicadores, blanco vs. cero, periodos, recuperación de importaciones fallidas, aperturas, conteos y continuidad. Interfaz revisada en navegador, fórmulas recalculadas y controles nativos inspeccionados en el Excel exportado. No se ejecutó Excel de escritorio ni se publicó el repositorio desde esta entrega.
