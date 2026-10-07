# Mis Finanzas

Vista para el celular de la planilla **Finanzas personales** de Google Sheets. La app no guarda ni calcula montos: todo sale de la planilla, a través de un Apps Script publicado como aplicación web.

- `index.html`: la app (un solo archivo, sin dependencias).
- `apps-script/Codigo.gs`: el script que lee la planilla y devuelve JSON.

## Instalación (una sola vez)

1. Abrí la planilla y entrá a **Extensiones > Apps Script**.
2. Reemplazá el contenido de `Código.gs` por el de `apps-script/Codigo.gs` y guardá.
3. En **Configuración del proyecto** (ícono de engranaje) > **Propiedades del script**, agregá la propiedad `API_TOKEN` con un valor largo y al azar (por ejemplo, 32 caracteres de un generador de contraseñas).
4. Probá que funcione: en el editor, elegí la función `probar` y tocá **Ejecutar**. La primera vez pide permiso para leer la planilla. En el registro de ejecución tiene que aparecer el tamaño de la respuesta.
5. **Implementar > Nueva implementación**, tipo **Aplicación web**:
   - Ejecutar como: **yo**
   - Quién tiene acceso: **cualquier persona**
6. Copiá la URL que termina en `/exec`.
7. Abrí la app, elegí un PIN de 4 dígitos y, en Configuración, pegá la URL y el token.

Cuando cambies el script, usá **Implementar > Administrar implementaciones > Editar > Nueva versión** para que la URL siga siendo la misma.

## Seguridad

- En el repo no hay URL ni token. Quedan guardados solo en el `localStorage` del dispositivo donde los cargás.
- Sin el token correcto, el script devuelve `{"ok":false,"status":403}`. Apps Script no deja cambiar el código HTTP, así que el 403 va dentro del JSON.
- El PIN se guarda como hash (SHA-256) y bloquea la app al abrirla y cuando estuvo más de 2 minutos en segundo plano. Protege la pantalla, no los datos: el secreto que importa es el token. Si perdés el celular, cambiá `API_TOKEN` en el script.
- **Configuración > Borrar datos del dispositivo** borra la URL, el token, el PIN y la caché.

## Cómo lee la planilla

- **Panel** y **Proyección**: los bloques de indicadores se leen como pares etiqueta/valor (A4:B12 y D4:E12 en Panel, A4:B11 y D4:E11 en Proyección). La app los busca por etiqueta, así que si se agrega un indicador aparece solo en la pantalla Hoy.
- Las tablas de Panel, Proyección y Categorías se ubican buscando la fila cuyo encabezado en la columna A es `Mes` o `Categoría`.
- El resto de las pestañas se lee por **nombre de encabezado** (fila 1), no por posición. Las filas `Total` y las aclaraciones de una sola celda van aparte.
- Números y fechas se leen con `getValues()`. Junto con cada valor va su tipo de formato (`ars`, `usd`, `pct`, `num`, `mes`, `fecha`), y la app los muestra con `Intl.NumberFormat('es-AR')`: `$ 1.234.567`, `US$ 1.597`, `20%`, `oct 2026`.
- La app guarda la última respuesta solo como caché offline. La fecha de actualización se ve arriba a la derecha.

## Pantallas

1. **Hoy**: cuánto reservar ahora para el mes que viene, el resto de la recomendación de Proyección, los indicadores del Panel, el estado de cada tarjeta del mes que viene y los próximos vencimientos de las reservas activas.
2. **Proyección**: ingresos y gastos (barras) y reserva acumulada (línea) a 12 meses, en qué mes se llega a la meta mínima y a la máxima, y la tabla completa con la columna Lectura.
3. **Gastos**: dona del mes y barras apiladas de los próximos meses, a partir de Categorías. Si tocás una categoría, aparecen las cuotas (Movimientos) y los gastos fijos (Fijos) de ese mes.
4. **Tarjetas**: Resúmenes por mes con el estado de cada tarjeta y los totales del Panel.
5. **Ahorro**: reserva de emergencia, inversión del mes contra el objetivo, cartera por tipo y por instrumento, reservas activas y saldos de terceros.

Para actualizar, tirá la pantalla hacia abajo o tocá el botón de actualizar. El ícono del ojo oculta los montos.
