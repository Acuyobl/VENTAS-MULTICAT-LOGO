# Guion de demo — VentasCatálogo v0.3.3

Demo de **10–12 minutos** que recorre las dos caras y el ciclo completo: catálogo → cotización →
pedido → cobro → tienda → portal, más contenido, temas y catálogos reales. Todo corre local; no
depende de credenciales externas (pagos e IA en modo demo/sandbox).

## 0. Preparación

```bash
pnpm infra:up        # Postgres/Redis/MinIO/Mailpit
pnpm db:deploy
pnpm db:seed         # usuarios demo + catálogo demo (37 productos con imágenes)
# Opcional: cargar los 5 catálogos de ejemplo (ver catalogs/README.md)
# pnpm --filter @ventascatalogo/api exec node scripts/import-demo-catalogs.mjs
pnpm dev             # API :3001, web :3010
curl http://localhost:3001/api/v1/health/ready
```

| Superficie | URL |
| --- | --- |
| Backoffice | `http://app.localhost:3010` |
| Tienda / catálogo público | `http://tienda.localhost:3010` |
| Catálogo compartible | `http://tienda.localhost:3010/c/catalogo-demo` |
| Catálogo real de ejemplo | `http://tienda.localhost:3010/c/sublimania-cr` |
| Mailpit (correos) | `http://localhost:8025` |
| Swagger API | `http://localhost:3001/api/docs` |

Credenciales: `admin@ventascatalogo.local` / `Demo1234!` (MFA autocompletado en dev),
`cliente@ventascatalogo.local` / `Demo1234!`.

## 1. Backoffice: la promesa (2 min)

1. Entrar a `app.localhost:3010`; el segundo factor se completa solo.
2. **Resumen**: leer la frase *«Subí tu catálogo como sea…»* y mostrar las 4 tarjetas de entrada:
   Excel/CSV disponible; PDF, foto y WhatsApp «en camino».
3. **Catálogos**: lista con los catálogos demo y de ejemplo; el contador de productos y el botón
   **Eliminar catálogo** en cada fila (pide confirmación; si hay pedidos abiertos responde 409).
4. **Cargar catálogo**: elegir un archivo de [`catalogs/`](../catalogs/README.md) o probar un
   **PDF con texto / JSON / TSV / TXT** → el analizador propone mapeo/campos extra → importar
   (Reemplazar pregunta antes; Fusionar conserva lo que no venga) → activar la versión.
5. **Renombrar** un catálogo desde la fila (nombre y slug) y mostrar que la tienda pública cambia
   de enlace; **Eliminar** pide confirmación y libera el slug.
6. **OCR**: con `OCR_PROVIDER=tesseract` en la API, subir `catalogs/06-lista-ocr.png` (foto de una
   lista) y `catalogs/07-lista-ocr-escaneada.pdf` (PDF sin texto): el agente reconoce los productos
   y precios sin escribir una columna.

## 2. Catálogo real y productos (2 min)

1. **Productos** → elegir catálogo: la lista muestra **solo** ese catálogo, con tarjetas ordenadas
   (foto 4:3, nombre a 2 líneas, precio y stock).
2. Abrir un producto → **modal de detalle** en la tienda y panel de edición en backoffice, con
   imagen cuadrada, métricas de precio/costo/stock y atributos (`talla`, `tela`, `tipo`…).
3. **Sublimania CR**: 3 camisas con fotos incrustadas extraídas del pedido real, precio sugerido y
   atributos; mostrar su tienda `/c/sublimania-cr`.

## 3. Temas visuales (1 min)

**Ajustes → Tema visual de la app**:

1. *Clásica* (serif, menú lateral) → *Moderna* (sans, barra superior, menús reordenados) →
   *Compacta* (mono, rail angosto, densidad alta).
2. Guardar; la interfaz cambia en backoffice, tienda y portal. Volver a Clásica.

## 4. Cotizar y cobrar (2 min)

1. **Cotizaciones** → cliente demo + 2 unidades → **Crear** (`COT-…`), IVA desglosado y precio
   congelado; **Enviar** → PDF A4 real.
2. **A pedido** → `PED-…` con los mismos totales; **Link de pago** → **Pagar (sandbox)** → Pagado.
3. **Registrar pago** manual (SINPE/efectivo), **recordatorio por correo** (ver en Mailpit) y
   **reembolso** con motivo (si el rol lo permite).

## 5. Finanzas y contenido (2 min)

1. **Finanzas** → rango de fechas, ventas/pagos/reembolsos/gastos/utilidad y **Reporte PDF**.
2. **Gastos** → crear uno y ver la utilidad ajustada.
3. **Contenido** → elegir un producto y generar con *Instagram / Cercano / Ventas*; cambiar a
   *TikTok / Divertido / Lanzamiento* y luego *WhatsApp / Premium / Recordatorio*: título, CTA,
   insignias, colores e imagen cambian. **Regenerar** con otro diseño (EDITORIAL/PROMO).

## 6. Cara B: el cliente (2 min)

1. `tienda.localhost:3010/c/catalogo-demo` (o `/c/boutique-mar`) → agregar 2 productos.
2. **Carrito** → checkout como invitado → `/pedido/<token>` con totales y enlace privado.
3. Login como `cliente@` → **Vincular pedido** → `/mi-cuenta/pedidos`.
4. **Chat del cliente**: `/mi-cuenta/chat` → enviar mensaje; en el backoffice `/panel/chat` aparece
   con **no leído** y se puede responder.
5. **PWA**: instalar la tienda desde Chrome; abrir `/offline` demuestra el fallback.

## 7. Cierre (1 min)

- **Promesa**: «Subí tu catálogo como sea y el agente lo deja vendible, publicable y cobrable».
  Hoy Excel/CSV (y hojas de pedido/data URI) están disponibles; PDF, foto y WhatsApp en camino.
- **Calidad**: API 360 unit + 158 e2e, web 19; CI verde con cobertura (~1,1 MB); tags hasta
  `v0.3.2`.
- **Pendiente**: Drive, PDF/OCR, foto/visión, WhatsApp de entrada, variantes, publicación real,
  onboarding/planes y credenciales reales.

## Guion corto (30 s)

> «VentasCatálogo convierte el archivo que ya tenés —Excel, CSV o una hoja de pedido— en una tienda
> que cotiza, cobra y publica. El agente propone el mapeo sin tocar columnas, el admin elige el
> diseño de toda la app y el cliente compra desde el teléfono. Un backend, dos caras, todo aislado
> por catálogo.»

## Plan B si algo falla

- Refrescar con `Ctrl + F5` (el servidor de producción local cachea el build).
- Si el login pide un código: `pnpm --filter @ventascatalogo/api mfa:dev reset admin@ventascatalogo.local`.
- Si el link de pago apunta a otro puerto: revisar `WEB_PUBLIC_URL` (`http://tienda.localhost:3010`)
  y reiniciar la API.
- Si un catálogo no se ve: verificar que tenga versión activa en `/panel/catalogos/<id>`.
- Sin Docker no arranca la demo; `pnpm infra:ps` y `pnpm infra:up`.
