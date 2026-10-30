# Apertura centrada en el mapa · 4.2

Base: `sbx-mex/Mapa_CentroNorte`, versión 4.1, commit `ef83152`.

## Cambios observables

- Mapa a todo el ancho del área de trabajo, encabezado compacto de 54 px (52 px en pantallas estrechas) y paneles cerrados al abrir.
- Tiendas, Capas y Balance se despliegan como capas independientes sobre el mapa; no reservan una columna ni desplazan el mapa.
- Ocultar menús oculta también el encabezado y deja un botón Mostrar menús. Los paneles y el formulario permanecen en memoria y se recuperan al mostrar los controles.
- Apertura sobre el territorio completo de las cinco zonas. Colores iniciales de fondo al 50%, regulables hasta 75%; nombres más grandes y contornos municipales más finos.
- Leyenda cartográfica compacta al pie. La leyenda de pines está dentro de Capas, junto a Ocultar/Mostrar tiendas y DM.
- La superficie Leaflet se invalida al cambiar el espacio disponible conservando el centro, para evitar cortes o huecos al ampliar y recuperar los controles.
- Datos, propuestas previas y geometrías de INEGI conservan su identidad y formato. El almacenamiento mantiene la clave compatible de 4.x.

## Revisión en navegador

- Apertura: cinco nombres de zona, paneles cerrados y Base validada.
- Con Tiendas abierto, el ancho del mapa siguió siendo igual al ancho de la pantalla.
- En Solo mapa, su alto coincidió con el alto completo de la pantalla de prueba.
- Se escribió una nota y se eligió Centro Norte en la ficha de una tienda de Bajío. Después de ocultar y mostrar menús, ambos valores siguieron presentes. Guardar cambió el balance de 76 a 77.
- Se restableció esa prueba, comprobando el regreso a 76.
- Capas ocultó los marcadores y los recuperó. Tiendas, Capas y Balance abrieron y cerraron de forma independiente.
- Ver zonas recuperó el encuadre cartográfico con los cinco nombres.

## Validación del paquete

El ZIP se aplica a una copia limpia del commit de origen y ejecuta los mismos comandos del workflow existente: compilación Python, validador de datos, sintaxis JavaScript, 20 pruebas Python y 30 JavaScript. No se omiten comprobaciones.

El paquete contiene únicamente archivos nuevos o modificados. No publica cambios en el repositorio: la ejecución remota y Pages se confirman cuando se suba.
