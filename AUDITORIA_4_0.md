# Verificación de la mejora regional 4.0

Base revisada: `sbx-mex/Mapa_CentroNorte`, commit `e9c127a`.

## Datos

- 103 ubicaciones: Centro Norte 76 (73 actuales + 3 aperturas), Bajío 14, Centro Sur 13.
- Coordenadas, nombres y DM del Excel conservados. La interfaz presenta Moni Morales como Mónica Morales.
- Toreo Walmart 43302 conserva latitud 19.4506098125196 y longitud -99.2180774805589. La confirmación solo cubre ese punto.
- Cinco destinos: Centro Sur, Centro Norte, Bajío, Centro Centro y Centro Poniente.
- Base, revisión y referencias HTML comparten la firma generada por Python.

## Comportamiento comprobado

- Tomar Galerias Pachuca desde Bajío cambia 76 a 77; ceder Zona Azul a Centro Poniente devuelve el total a 76. Ambos movimientos se muestran por separado.
- El resumen regional es independiente de filtros y conserva origen y destino.
- Seleccionar tres opciones (una ya tomada) y proponer Centro Norte suma solo las dos adicionales; Deshacer recupera el balance anterior.
- La propuesta permanece después de recargar.
- Mostrar DM muestra colores por responsable; Ocultar DM devuelve todos los pines al mismo verde y oculta los nombres DM del listado.
- Las ubicaciones externas y sus grupos aparecen huecos en la vista regional. Las aperturas siguen con forma de rombo.
- Toreo muestra Ubicación confirmada por el Regional.
- Base actual y Mi propuesta conservan estados independientes; CSV exporta regiones y movimientos; JSON conserva el escenario.

## Verificación automatizada

Se ejecutan los mismos comandos que el workflow de GitHub: compilación Python, validación de instantánea y recursos, sintaxis JavaScript, 20 pruebas Python y 25 JavaScript. No se omiten ni desactivan comprobaciones para obtener verde.

Las pruebas incluyen regiones de origen, futuras filas con región explícita, tomar, ceder aperturas, transferencias externas, selección mixta, independencia del DM, copia del escenario, migración 3.0, CSV, coordenadas, fechas, duplicados, cercanías y rechazo de un informe con totales regionales alterados.

El ZIP se comprueba aplicado sobre una copia limpia del commit de origen. Su inventario incluye únicamente archivos nuevos o modificados; conserva las rutas del repositorio. No incluye el Excel, librerías ni cartografía repetidos.

La ejecución de GitHub Actions y la publicación del sitio se producen cuando se suban los archivos. Esta entrega no publica cambios en el repositorio.
