# gfinanzas

Aplicación web personal para llevar el control total de mi dinero: cuentas, gastos e ingresos del día a día e inversiones en bolsa.

## Qué hace

- **Patrimonio**: cuánto tienes en total (cuentas + inversiones), con su evolución mes a mes.
- **Cuentas**: banco, efectivo, ahorro, bróker… con su saldo, que se actualiza con lo que apuntas. Transferencias entre cuentas (también entre monedas) y «Ajustar saldo» para cuadrar con el banco.
- **Gastos e ingresos**: apunte rápido con categorías (y categorías propias), resumen de cada mes, límites mensuales por categoría y comparación de los últimos 12 meses.
- **Registrar operaciones**: compras, ventas y dividendos, con fecha, número de acciones, precio y comisión.
- **Cartera**: acciones que tienes de cada valor, precio medio (con comisiones incluidas), capital invertido y, al escribir el precio actual, ganancia o pérdida latente y peso de cada valor.
- **Ventas**: ganancia o pérdida de cada venta calculada con el método **FIFO** (el que usa Hacienda), con la comisión de compra sumada al coste y la de venta restada del ingreso.
- **Calculadora de venta**: simula cuánto ganarías vendiendo ahora a un precio, sin guardar nada. Al apuntar una venta también ves el resultado antes de guardarla.
- **Gráficos**: evolución del capital invertido, distribución de la cartera, ganancia latente por valor, resultados por año y ganancia realizada acumulada.
- **Ventas**: resumen por año (ganancias, pérdidas, dividendos), indicador orientativo de si superas los límites para tener que declarar (1.000 € de ganancia o 500 € de pérdida), aviso de la regla de los dos meses y exportación a CSV. Los impuestos están al **0 %** por defecto; se pueden activar en *Datos → Ajustes → Impuestos* (escala del ahorro o porcentaje fijo).
- **Pantalla de bloqueo con contraseña**: la primera vez que abres la app eliges tu contraseña. Los datos se guardan cifrados (AES-256, clave derivada con PBKDF2-SHA256 de 600.000 iteraciones), se bloquea sola tras unos minutos sin usarla y frena los intentos repetidos. La contraseña no está en el código ni se guarda en ningún sitio, y se puede cambiar en *Datos → Seguridad*.
- **Barra superior**: hora y fecha actuales y tu resultado total (latente + ventas + dividendos), siempre visible.
- **Precios automáticos**: con una clave gratuita de [Finnhub](https://finnhub.io/register) (en *Datos → Ajustes*) los precios de tus posiciones abiertas se buscan solos cada 5 minutos. Puedes corregir cualquiera a mano.
- **Multidivisa**: cada operación lleva su moneda (EUR, USD…). Los importes de cada valor se muestran en su moneda y los totales se convierten a la moneda principal con el tipo de cambio de *Datos → Ajustes*.
- **Datos**: copia de seguridad en JSON, exportación e importación de operaciones en CSV y tema claro/oscuro.

## Cómo usarla

Es una página estática, sin servidor ni instalación:

- **En local**: abre `index.html` en el navegador.
- **Online con GitHub Pages**: en el repositorio, *Settings → Pages → Source: Deploy from a branch → `main` / root*. Quedará en `https://<usuario>.github.io/gfinanzas/`.

Los datos se guardan **solo en tu navegador** (localStorage). No se envían a ningún sitio. Si cambias de navegador o de dispositivo, usa *Datos → Descargar copia* y *Restaurar copia*.

Para probarla rápido: *Datos → Cargar datos de ejemplo*.

## Formato CSV

```
fecha;tipo;valor;nombre;cantidad;precio;comision;moneda;notas
2024-01-15;compra;SAN;Banco Santander;300;3,75;5;EUR;
2024-07-22;venta;SAN;Banco Santander;100;4,10;5;EUR;
2024-11-04;dividendo;SAN;;;15,40;2,93;EUR;
```

En los dividendos, `precio` es el importe bruto cobrado y `comision` la retención.

## Avisos

- Si activas los impuestos, la estimación es orientativa: no tiene en cuenta pérdidas de años anteriores ni otros rendimientos.
- Google y Yahoo no permiten consultar cotizaciones desde una página web; por eso se usa Finnhub, que en su plan gratuito cubre sobre todo acciones de EE. UU. Para otras bolsas indica el símbolo o escribe el precio a mano.
- El tipo de cambio se actualiza con el oficial del BCE (frankfurter.dev) salvo que lo fijes a mano.
- Se usa un único tipo de cambio por moneda; para la renta, Hacienda pide el de la fecha de cada operación.
- **No subas tus datos a este repositorio**: es público. Guarda tus copias JSON fuera de él.

## Estructura

```
index.html      interfaz
css/styles.css  estilos (claro y oscuro)
js/vault.js     cifrado de los datos con la contraseña
js/wealth.js    cuentas, gastos, ingresos y patrimonio
js/calc.js      cálculos (FIFO, posiciones, fiscalidad); sin dependencias
js/app.js       lógica de la interfaz y gráficos (Chart.js desde CDN)
```
