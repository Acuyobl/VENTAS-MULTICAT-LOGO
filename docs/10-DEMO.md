# Guion de demo — VentasCatálogo v0.1.0

Demo de 8–10 minutos que recorre **las dos caras** y el ciclo completo: catálogo → cotización →
pedido → cobro → tienda → portal. Todo corre local; no depende de servicios externos ni de
credenciales de pago reales.

## 0. Preparación (una vez, antes de la reunión)

```bash
pnpm infra:up        # Postgres/Redis/MinIO/Mailpit
pnpm db:deploy
pnpm db:seed         # usuarios demo, catálogo demo con 37 productos e imágenes
pnpm dev             # API :3001, web :3010
curl http://localhost:3001/api/v1/health/ready
```

| Superficie | URL |
| --- | --- |
| Backoffice | `http://app.localhost:3010` |
| Tienda / catálogo público | `http://tienda.localhost:3010` |
| Catálogo compartible | `http://tienda.localhost:3010/c/catalogo-demo` |
| Swagger API | `http://localhost:3001/api/docs` |

Credenciales: `admin@ventascatalogo.local` / `Demo1234!` (MFA autocompletado en dev),
`cliente@ventascatalogo.local` / `Demo1234!` (cliente).

## 1. Backoffice: el dueño del negocio (2 min)

1. Entrar a `app.localhost:3010` → login del admin; el segundo factor se completa solo (helper de
   desarrollo).
2. **Catálogos**: mostrar `Catálogo Demo` con la versión **v2 activa**, la v1 archivada y el
   histórico. Destacar que las versiones son inmutables y que activar una nueva no toca pedidos.
3. **Productos**: 37 productos con **imágenes**, stock, SKU y precio; subir una foto desde la fila
   para demostrar el permiso `product:write`.
4. **Importación**: subir `tools/fixtures/catalogo-demo.csv` → mostrar el resumen (37 válidas,
   3 SKU duplicados, 2 sin precio) y la **cuarentena** con el motivo de cada fila.

Frase para vender: *"Cada catálogo es una unidad de negocio: su stock, sus precios, sus imágenes y
sus pedidos, sin mezclarse con los demás."*

## 2. Backoffice: cotizar y cobrar (3 min)

1. **Cotizaciones** → elegir cliente demo y 2 unidades de un producto → **Crear cotización**.
   Mostrar número `COT-AAAA-000001`, IVA desglosado y que el precio quedó congelado.
2. **Enviar** → se abre el **PDF** real (A4, cabecera, cliente, ítems, subtotal/IVA/total,
   "Documento no fiscal"). Volver y mostrar el estado `Enviada`.
3. **A pedido** → se crea `PED-AAAA-000001` con los mismos totales.
4. **Pedidos** → **Link de pago** (se copia y abre la página) → **Pagar (sandbox)** → el pedido pasa
   a **Pagado** con saldo ₡0.
5. Mostrar **Registrar pago** (SINPE/transferencia/efectivo) y que el saldo se recalcula; si hay
   pagos, el pedido no se puede cancelar.

## 3. Cara B: la experiencia del cliente (3 min)

1. `tienda.localhost:3010/c/catalogo-demo` → 37 tarjetas con foto; **Agregar** dos productos.
2. **Carrito** (persistente): cambiar cantidades, ver la suma de líneas.
3. **Checkout** como invitado (nombre, teléfono, correo) → confirmar.
4. Llega a `/pedido/<token>`: número, ítems, totales y el enlace privado de consulta.
5. Iniciar sesión como `cliente@ventascatalogo.local` → **Vincular este pedido a mi cuenta** →
   `/mi-cuenta/pedidos` lo muestra con su estado.
6. Cerrar mostrando el **portal**: pedidos, estado y totales del cliente; y que la sesión de
   cliente es distinta de la del backoffice.

## 4. Cierre (1 min)

- **Estado**: F0 cerrado; F1 completo (catálogo, imágenes, ventas, PDF, tienda, carrito, portal);
  F2 con link de pago, webhook y pagos manuales.
- **Pendiente**: Drive (necesita credenciales de Google), PWA offline, configuración de pasarelas
  por organización, reportes financieros, reembolsos (en curso).
- **Calidad**: más de 200 pruebas, CI verde con cobertura, bootstrap medido en 75 s en caliente.

## Guion corto (30 s)

> "VentasCatálogo convierte el catálogo que ya tenés en Drive en una tienda que vende, cotiza y
> cobra. El administrador ve versiones inmutables, importa sin miedo a duplicados y manda PDFs
> profesionales; el cliente compra desde el teléfono, con o sin cuenta. Un backend, dos caras, los
> datos aislados por catálogo."

## Plan B si algo falla

- Si una página no carga, refrescar con `Ctrl + F5` (el servidor de producción local cachea el
  build).
- Si el login del admin pide un código que no aparece: el helper de desarrollo lo autocompleta; en
  su defecto `pnpm --filter @ventascatalogo/api mfa:dev reset admin@ventascatalogo.local` deja el
  próximo login en enrolamiento con QR.
- Si el link de pago apunta a otro puerto, revisar `WEB_PUBLIC_URL` en `.env` (debe ser
  `http://tienda.localhost:3010`) y reiniciar la API.
- Sin Docker: la demo no arranca; verificar `pnpm infra:ps` y `pnpm infra:up`.
