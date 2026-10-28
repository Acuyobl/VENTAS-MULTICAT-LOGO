---
title: Brief original del proyecto
tipo: transcripcion
estado: fuente-de-verdad
idioma: es-CR
nota: Transcripcion UTF-8 del archivo original en Windows-1252. No editar el original; este documento es la copia legible.
---

Entendido. Si vas a desarrollar esto usando DeepSeek (que es excelente para programar y razonar lógica compleja), he adaptado el prompt para que la IA entienda exactamente qué stack usar y, lo más importante, he integrado el nuevo Módulo de Generación de Contenido para Redes Sociales.

Aquí tienes el prompt actualizado. Cópialo y guárdalo en tu archivo .txt.

txt
PROMPT MAESTRO — APLICACIÓN DE VENTAS MULTICATÁLOGO CON IA PARA REDES SOCIALES, DRIVE, COBROS, FINANZAS Y CHAT

ROL
Actúa como un equipo senior de arquitectura de software, desarrollo full-stack y producto. Vas a diseñar y programar una aplicación web (PWA) lista para producción llamada provisionalmente “VentasCatálogo”. Utilizarás tus capacidades avanzadas de generación de código (DeepSeek) para entregar el código completo, modular, seguro y funcional. Documenta los supuestos y trabaja de forma iterativa.

OBJETIVO GENERAL
Crear una plataforma que importe catálogos desde Google Drive, genere un modelo comercial aislado por catálogo y permita operar módulos de Ventas, Cobros, Finanzas, WhatsApp, Chat en Vivo, y un NUEVO MÓDULO DE GENERACIÓN DE CONTENIDO con IA para redes sociales basado en los productos del catálogo activo. Cada catálogo es una unidad independiente (sus ventas, finanzas y posts no se mezclan con otros).

DEFINICIONES CLAVE
- Catálogo: Archivo en Drive (Excel, CSV, Sheets, PDF) con productos, precios, stock, imágenes y categorías.
- Separación por catálogo: Todos los registros (ventas, pagos, posts generados) llevan un `catalog_id` y `catalog_version_id`. Los históricos no se alteran al cambiar de catálogo.
- Generación de Contenido IA: Uso de un LLM (a través de API) para crear copies, hashtags y guiones para redes sociales basados en las características de los productos del catálogo cargado.

ALCANCE FUNCIONAL

1. MÓDULO DE CONEXIÓN E IMPORTACIÓN DESDE GOOGLE DRIVE
- Autenticación OAuth2 con Google Drive (solo lectura).
- Selección de carpeta raíz y subcarpetas (cada subcarpeta = 1 catálogo).
- Importación de Google Sheets, Excel, CSV y PDF (con OCR opcional).
- Mapeo visual de columnas (SKU, nombre, descripción, categoría, precio, costo, stock, variantes, imagen, etc.).
- Validaciones de integridad (SKUs duplicados, precios vacíos).
- Versionado de catálogo (borrador, validado, activo, archivado).
- Botón "Usar este catálogo en ventas": Cambia el modelo de ventas y de IA al catálogo seleccionado sin romper datos históricos.

2. MÓDULO DE VENTAS
- Dashboard del catálogo activo con buscador y filtros.
- Carrito, cotizador y generación de PDFs compartibles.
- Conversión de cotización a pedido y a venta.
- Gestión de estados (borrador, cotizado, pagado, entregado, etc.).
- Base de datos de clientes y asignación de vendedores.
- Bloqueo estricto: No se pueden vender productos de catálogos archivados.

3. MÓDULO DE COBRO
- Configuración de pasarelas de pago (Stripe, MercadoPago, PayPal).
- Generación de links de pago vinculados al pedido.
- Webhooks para confirmar pagos automáticos.
- Registro de pagos totales y parciales, con recibos descargables.
- Recordatorios de cobro automatizados por correo o WhatsApp.

4. MÓDULO DE FINANZAS
- Panel de ingresos, egresos, costos, margen bruto/neto y flujo de caja.
- Registro de gastos con comprobantes.
- Reportes por catálogo, periodo, vendedor y método de pago.
- Exportación a CSV/Excel.

5. MÓDULO DE WHATSAPP
- Integración con WhatsApp Business Cloud API.
- Envío de plantillas aprobadas (cotizaciones, links de pago, confirmaciones).
- Bandeja de entrada para agentes.

6. MÓDULO DE CHAT EN VIVO CON EL CLIENTE
- Widget embebible y chat dentro de la app para clientes autenticados.
- Mensajería en tiempo real (WebSockets).
- Historial vinculado al cliente y al pedido.

7. NUEVO MÓDULO: GENERADOR DE CONTENIDO PARA REDES SOCIALES (IA)
- Motor de IA: Integración con la API de DeepSeek (o similar) para procesar los datos del catálogo.
- Selección de productos: El usuario elige uno o varios productos del catálogo activo.
- Configuración de la publicación: Plataforma destino (Instagram, Facebook, TikTok, LinkedIn, X/Twitter), tono (profesional, humorístico, urgente, inspirador), y objetivo (venta directa, engagement, educativo).
- Generación de Texto: La IA debe crear:
  - Título atractivo.
  - Cuerpo del texto (Copy) adaptado a la plataforma.
  - Hashtags optimizados.
  - Call to Action (CTA) claro (ej. "Pídemelo por WhatsApp").
- Generación de Ideas Visuales: La IA debe sugerir qué imagen del producto usar o qué video corto grabar basado en la descripción.
- Historial y Aprobación: Guardar los textos generados en un "Borrador" para que el usuario los copie, edite o programe su publicación. Vincular cada post generado al `catalog_id`.
- Generación Masiva: Opción de generar un calendario de contenidos (ej. "Genera 5 posts para esta semana usando los productos con más stock").

8. ADMINISTRACIÓN Y SEGURIDAD
- Roles: superadmin, admin de catálogo, vendedor, finanzas, social media manager, agente de chat, cliente.
- Autenticación JWT y Google OAuth.
- Auditoría de acciones.
- Límites de uso en la generación de IA para controlar costos de API.

STACK TECNOLÓGICO RECOMENDADO (Ajustable según DeepSeek)
- Frontend: Next.js / React con Tailwind CSS.
- Backend: Node.js / NestJS o Python / FastAPI (ideal para IA).
- Base de Datos: PostgreSQL con Prisma ORM.
- Caché y Colas: Redis (para procesos de IA en segundo plano).
- IA: SDK oficial de DeepSeek / OpenAI para generación de contenido.
- Comunicación en tiempo real: Socket.IO.
- Despliegue: Docker y Docker Compose.

MODELO DE DATOS MÍNIMO
Entidades: User, Role, Catalog, CatalogVersion, Product, Customer, Quote, Order, Payment, Expense, WhatsAppMessage, ChatConversation, ChatMessage, AuditLog, y NUEVAS: SocialPostGeneration (id, catalog_id, product_ids, platform, prompt, generated_text, status, created_at).

API MÍNIMA ESPERADA
- Auth: POST /auth/login
- Drive: POST /catalogs/import, POST /catalogs/:id/activate
- Ventas: GET /products, POST /orders, POST /quotes
- Pagos: POST /payments/link, POST /payments/webhook
- IA Social: POST /social/generate (recibe producto, plataforma y tono; devuelve texto generado), GET /social/history
- Chat: WebSocket /chat

FLUJOS PRINCIPALES
1. Importación: Admin conecta Drive -> Mapea columnas -> Activa catálogo.
2. Venta: Vendedor cotiza -> Cliente recibe link de pago -> Pago confirmado -> Finanzas actualizado.
3. Generación de Contenido: Social Media Manager selecciona 3 productos del catálogo -> Elige Instagram y tono "Divertido" -> La IA genera 3 copys diferentes con hashtags -> El manager copia el texto y descarga la imagen del producto para publicar.
4. Cambio de Catálogo: Admin activa catálogo "Verano 2026" -> El módulo de ventas y el generador de IA ahora solo ofrecen productos de Verano 2026, manteniendo las ventas de "Invierno 2025" intactas en los reportes.

CRITERIOS DE ACEPTACIÓN
- El sistema importa y aísla correctamente los catálogos.
- El módulo de IA genera textos coherentes, persuasivos y con hashtags basados en los datos reales del producto.
- El módulo de IA permite elegir la red social y el tono, devolviendo un formato listo para copiar y pegar.
- Los cobros y el chat en vivo funcionan en tiempo real.
- La arquitectura permite desplegarse con Docker y escalar.

FORMA DE TRABAJO (Para DeepSeek)
1. Genera primero la estructura de carpetas del proyecto (Frontend, Backend, Docker).
2. Genera el esquema de base de datos (Prisma Schema o SQL).
3. Construye el backend módulo por módulo (Auth, Drive, Ventas, Pagos, IA, Chat).
4. Construye el frontend con componentes reutilizables (Tablas, Modales, Formularios).
5. Proporciona las instrucciones de instalación paso a paso (`.env`, base de datos, dependencias).
6. Escribe el código completo, sin fragmentos incompletos ni comentarios tipo "aquí va tu lógica".