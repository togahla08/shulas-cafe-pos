# Shulas Café — Sistema de Punto de Venta (POS)

Sistema completo y sencillo para **Shulas Café · Café.Restaurante**:
menú editable, mesas, pedidos, cobros con ticket impreso, reportes de ventas
(diario, semanal y mensual), inventario, gastos y control de personal con
chequeo de entrada/salida y firma en pantalla.

Todo funciona **sin internet** y **sin instalar programas adicionales**
(solo Node.js). La pantalla es grande y con botones grandes, pensada para
uso fácil por personas de cualquier edad.

---

## 1. Instalación (una sola vez)

1. Instale **Node.js** (versión LTS) desde https://nodejs.org
   — solo siga "Siguiente, Siguiente, Terminar".
2. Copie esta carpeta donde guste (por ejemplo `C:\ShulasCafe`).
3. Haga **doble clic en `start.bat`**.
   - Se abre el sistema en su navegador (`http://localhost:5178`).
   - Esa ventana negra **debe quedarse abierta** mientras se usa el sistema.
     Si la cierra, el sistema se apaga.

> Consejo: para que se abra solo al encender la PC, cree un acceso directo
> de `start.bat` dentro de la carpeta `Inicio` de Windows
> (`Win + R` → escriba `shell:startup` → Enter → pegue el acceso directo).

## 2. Usarlo desde tablets o celulares (misma red WiFi)

1. En la PC del mostrador, abra "Símbolo del sistema" y escriba `ipconfig`.
   Anote la **Dirección IPv4**, por ejemplo `192.168.1.50`.
2. En la tablet o celular (conectado al **mismo WiFi**), abra Chrome y vaya a:
   `http://192.168.1.50:5178` (use la IP anotada).
3. Opcional: en el navegador de la tablet use "Agregar a pantalla de inicio"
   para tener un ícono como una app.

## 3. Impresora térmica por Bluetooth (tickets de 80 mm)

**Preparación (una sola vez):**
1. Encienda la impresora y póngala en modo de emparejamiento.
2. En Windows: `Configuración → Bluetooth y dispositivos → Agregar dispositivo`
   y empareje la impresora.

**Imprimir tickets (desde la PC del mostrador con Chrome o Edge):**
1. Al cobrar (o en Reimpresiones), presione **🖨️ Bluetooth**.
2. La primera vez el navegador le pedirá elegir la impresora — selecciónela.
3. El ticket sale impreso. Las siguientes veces se usa la misma impresora.

**Alternativas:** el botón **🖨️ Ventana** abre una vista del ticket para
imprimir con el diálogo normal del navegador (útil en tablets o si la
impresora también tiene USB).

> La impresión directa por Bluetooth solo está disponible en la PC del
> mostrador (así funciona Chrome/Edge). Las tablets usan el botón
> "Ventana" o pueden mandar reimprimir desde la PC.

## 4. Guía rápida de uso diario

- **Mesas**: toque una mesa → toque los productos → **Cobrar**.
- **Para llevar**: botón "Nuevo pedido para llevar" → productos → Cobrar.
- **Cobrar**: elija Efectivo (indica el cambio), Tarjeta o Transferencia.
- **Menú**: agregue o cambie categorías, productos y precios cuando quiera.
- **Reportes**: vea ventas del día, la semana o el mes, gastos y ganancia.
  Botones para exportar todo a **Excel (CSV)**.
- **Inventario**: registre insumos con su stock mínimo; el sistema avisa
  cuando queda poco. Puede vincular un producto del menú a un insumo para
  que se descuente automáticamente en cada venta.
- **Gastos**: registre compras y pagos del negocio en segundos.
- **Personal**: cada trabajador marca **ENTRADA** y **SALIDA** firmando con
  el dedo (o mouse). El sistema guarda horarios y calcula horas trabajadas.

## 5. Respaldos

Vaya a **Ajustes → Respaldos**:
- **Descargar respaldo** guarda una copia de toda la información.
- **Restaurar** la recupera (pide confirmación).

También puede copiar manualmente la carpeta `data/` a una USB.

## 6. Solución de problemas

| Problema | Solución |
|---|---|
| No abre la página | Verifique que la ventana negra esté abierta y sin errores. |
| La tablet no conecta | Ambos equipos deben estar en el mismo WiFi; revise la IP con `ipconfig`. |
| No aparece la impresora Bluetooth | Emparejela primero en Windows y use Chrome o Edge en la PC del mostrador. |
| El ticket sale con símbolos raros | En Ajustes pruebe cambiar el ancho (58/80 mm). |
| Se borró algo por error | Restaure el último respaldo en Ajustes. |

---

Hecho con cariño para Shulas Café. ☕
