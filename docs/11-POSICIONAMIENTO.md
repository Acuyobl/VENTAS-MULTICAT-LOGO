---
title: Posicionamiento — «Subí tu catálogo como sea»
tipo: estrategia-producto
estado: north-star
fecha: 2026-10-28
---

# La frase que guía el rediseño

> **«Subí tu catálogo como sea (Excel, PDF, foto, WhatsApp) y el agente lo convierte en un catálogo
> vendible, publicable y cobrable — sin que toques una columna.»**

Es la promesa central del producto y el criterio para decidir qué construir y cómo se comunica.
Todo lo que agreguemos debe acercar a esa frase o quedar explícitamente marcado como «en camino».

## Por qué esta frase

El dolor real del negocio no es «no tener un catálogo»: es tenerlo **desparramado** en un Excel que
solo entiende una persona, un PDF de la imprenta, una foto del cuaderno de pedidos o un archivo que
llegó por WhatsApp. El cliente no quiere aprender columnas ni plantillas; quiere subir lo que tiene
y que quede **listo para vender**.

## Anatomía de la promesa

| Parte | Qué significa | Cómo se cumple hoy |
|---|---|---|
| **Como sea** | Cuatro entradas: Excel/CSV, PDF, foto, WhatsApp | Excel/CSV y hojas de pedido: **disponible**. PDF, foto y WhatsApp: **en camino** (se muestran con badge «En camino») |
| **El agente** | Analiza el archivo, infiere columnas, propone mapeo, campos extra, precio y cuarentena | Importador adaptativo + agente IA + plantillas por firma de encabezados |
| **Vendible** | Productos con precio, stock, foto y descripción en una tienda | Catálogo versionado, tienda pública, carrito y checkout |
| **Publicable** | Contenido e imágenes para redes a partir del producto real | Generador de contenido + imágenes con 3 diseños; publicación real en redes: **en camino** |
| **Cobrable** | Link de pago, pasarelas, pagos manuales, reembolsos y finanzas | Sandbox/Stripe configurable, link de pago, pagos manuales, reembolsos, reportes |
| **Sin tocar una columna** | Cero trabajo de mapeo manual obligatorio | El preview propone todo; el usuario solo confirma (y puede ajustar si quiere) |

## Regla de comunicación

1. La frase se usa **textual** en login, resumen del panel, carga de catálogo y documentación.
2. No se presenta un canal como disponible si todavía no lo está: **Excel/CSV = Disponible**,
   **PDF/foto/WhatsApp = En camino** hasta que exista el flujo real punta a punta.
3. «Vendible, publicable y cobrable» describe el destino del catálogo; cuando una parte esté en
   sandbox o pendiente (p. ej. publicación real en redes), se aclara en la documentación y en el
   estado del proyecto, no en la promesa.

## Implicaciones de rediseño

- **Login**: la frase abre la pantalla, con los cuatro canales y su estado.
- **Resumen del panel**: hero con la frase + cuatro tarjetas de entrada (Excel/CSV listo, el resto
  «en camino») y el recordatorio de la promesa completa.
- **Cargar catálogo**: mismo hero, chips de estado por canal y el flujo actual (nuevo/existente,
  analizar, reemplazar/fusionar, activar, borrar anterior con confirmación).
- **Roadmap visible**: cada vez que se habilita un canal, su badge pasa de «En camino» a
  «Disponible» y se documenta en `docs/08` y `CHANGELOG`.

## Hoja de ruta para cumplirla entera

1. **PDF/OCR** (F1): extraer tablas de listas de precios y facturas, con revisión del plan.
2. **Foto/visión** (F1.5): OCR + modelo de visión para listas escritas y pizarras.
3. **WhatsApp de entrada** (F2/F3): recibir archivo/foto por el webhook y encolarlo como import.
4. **Publicación real en redes** (F3): publicar el contenido generado con aprobación.
5. **Pagos reales y onboarding** (F4): claves de pasarela, planes, facturación y despliegue.

Cuando esos cinco puntos estén cerrados, la frase deja de tener asteriscos: **cualquier entrada,
sin tocar columnas, termina en un catálogo que se vende, se publica y se cobra**.
