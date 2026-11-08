# gfinanzas

Aplicación web personal para llevar el control de mis inversiones en bolsa.

## Qué hace

- **Registrar operaciones**: compras, ventas y dividendos, con fecha, número de acciones, precio y comisión.
- **Cartera**: acciones que tienes de cada valor, precio medio (con comisiones incluidas), capital invertido y, al escribir el precio actual, ganancia o pérdida latente y peso de cada valor.
- **Ventas**: ganancia o pérdida de cada venta calculada con el método **FIFO** (el que usa Hacienda), con la comisión de compra sumada al coste y la de venta restada del ingreso.
- **Calculadora de venta**: simula cuánto ganarías vendiendo ahora a un precio, sin guardar nada. Al apuntar una venta también ves el resultado antes de guardarla.
- **Gráficos**: evolución del capital invertido, distribución de la cartera, ganancia latente por valor, resultados por año y ganancia realizada acumulada.
- **Fiscalidad**: resumen por año (ganancias, pérdidas, dividendos, retenciones, base del ahorro e IRPF estimado), aviso de la regla de los dos meses y exportación a CSV de las ventas del año, lote a lote, para la declaración de la renta.
- **Datos**: copia de seguridad en JSON, exportación e importación de operaciones en CSV, tema claro/oscuro y elección de moneda.

## Cómo usarla

Es una página estática, sin servidor ni instalación:

- **En local**: abre `index.html` en el navegador.
- **Online con GitHub Pages**: en el repositorio, *Settings → Pages → Source: Deploy from a branch → `main` / root*. Quedará en `https://<usuario>.github.io/gfinanzas/`.

Los datos se guardan **solo en tu navegador** (localStorage). No se envían a ningún sitio. Si cambias de navegador o de dispositivo, usa *Datos → Descargar copia* y *Restaurar copia*.

Para probarla rápido: *Datos → Cargar datos de ejemplo*.

## Formato CSV

```
fecha;tipo;valor;nombre;cantidad;precio;comision;notas
2024-01-15;compra;SAN;Banco Santander;300;3,75;5;
2024-07-22;venta;SAN;Banco Santander;100;4,10;5;
2024-11-04;dividendo;SAN;;;15,40;2,93;
```

En los dividendos, `precio` es el importe bruto cobrado y `comision` la retención.

## Avisos

- La estimación del IRPF es orientativa (escala del ahorro 19 %–30 %): no tiene en cuenta pérdidas de años anteriores ni otros rendimientos.
- Los precios actuales se introducen a mano.

## Estructura

```
index.html      interfaz
css/styles.css  estilos (claro y oscuro)
js/calc.js      cálculos (FIFO, posiciones, fiscalidad); sin dependencias
js/app.js       lógica de la interfaz y gráficos (Chart.js desde CDN)
```
