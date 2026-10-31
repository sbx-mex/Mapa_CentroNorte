# Verificación 4.5

Base: `sbx-mex/Mapa_CentroNorte`, commit `8e28526af7f675fe11b3efb0c2c6902713f7312d`.

## Datos y Excel

- 482 ubicaciones, regiones, DM, estatus y coordenadas conservados desde 4.4.
- 455 abiertas y cinco aperturas. Centro Norte: 73 abiertas y tres aperturas con ubicación.
- Toreo 43302 conserva la coordenada confirmada. Las aperturas no reciben indicadores estimados.
- Se conserva Catalogos y las seis reglas de validación de Ubicaciones.
- Indicadores tiene 482 filas por CeCo: 455 con datos y los demás valores ausentes en blanco.
- Fuente: motores de `sbx-mex/Perfil_Tienda_DM`, commit `2a6b0d21379739482f0b4c7be9b0f9a022e15f5b`. Se ejecuta su pipeline y se obtiene auditoría sin errores. Su XLSX fuente ya incluía septiembre, ausente de su instantánea publicada.
- Cortes máximos de operación y negocio: 2026-09-30, con corte y meses por CeCo.
- Rotación: último dato. Venta: suma. Otros: promedio disponible. Comparativos usan ambos lados. NPS y CTC no se sustituyen.
- Control independiente CeCo 38862: venta 20,029,054 MXN, IPLH 17.5168996667, rotación 0.258065.
- Excel editado, recalculado y revisado visualmente con Artifact Tool. Inicio mantiene 455 abiertas, cinco aperturas y 482 registros; sin errores de fórmula detectados. No se ejecutó Excel de escritorio.

## Estabilidad e interfaz

- Directorio en Región, con un solo desplazamiento y árbol DM/Tienda; sin un botón ni modal adicional de Directorio. `/directorio` abre el mismo apartado.
- Despliegue de DM y selección conservados durante la navegación. Se evita recalcular auditoría completa con cada búsqueda.
- Pin enfocado conservado al cambiar de destino. Cinco colores comerciales independientes del fondo.
- Validar datos de Centro Norte: 76/76 ubicaciones, 73/73 abiertas con indicadores.
- Navegador: borrador de Toreo recuperado al ocultar menús y recargar. Proponerlo para Centro Sur mantiene CN 73 abiertas + 2 aperturas y CS 100 abiertas + 1 apertura. Mis cambios se recupera al recargar. Prueba restablecida: cero cambios.
- Búsqueda Mónica Morales en Centro Sur: 13 abiertas con región y DM correctos.
- Ficha 38862 muestra cortes de septiembre y valores reales del perfil. Aperturas muestran datos pendientes.
- Python bloquea cargas simultáneas del CMS y restaura archivos anteriores al fallar. Prueba de interrupción después de escrituras parciales aprobada.

## Pruebas y alcance

31 pruebas Python, 43 JavaScript, compilación, sintaxis y `ACTUALIZAR_MAPA.py --check` aprobadas.
ZIP aplicado a una copia limpia del commit base para repetir las comprobaciones y preparar el sitio.
La ejecución de Actions y la publicación remotas dependen de subir los archivos y de Source en Pages; no se modificó el repositorio remoto.
