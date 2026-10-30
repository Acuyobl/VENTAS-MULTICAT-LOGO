#!/usr/bin/env node
/* global fetch, console, process, setTimeout */
// Genera 2 catálogos grandes (50 productos cada uno) con imágenes reales de Wikimedia Commons.
// Uso: pnpm --filter @ventascatalogo/api exec node scripts/generate-large-catalogs.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../catalogs');
const UA = 'VentasCatalogoDemo/1.0 (dev@ventascatalogo.local)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// [nombre, categoría, marca, precio, costo, stock, búsqueda, material, color, medida]
const HOGAR = [
  ['Sartén antiadherente 28 cm', 'Cocina', 'Essen', 18900, 11500, 12, 'frying pan', 'Aluminio', 'Negro', '28 cm'],
  ['Olla arrocera eléctrica 1.8 L', 'Cocina', 'Oster', 34900, 22000, 8, 'rice cooker', 'Acero y plástico', 'Blanco', '1.8 L'],
  ['Juego de cuchillos 6 piezas', 'Cocina', 'Tramontina', 24900, 15000, 10, 'kitchen knives', 'Acero inoxidable', 'Negro', '6 piezas'],
  ['Tabla de picar bambú', 'Cocina', 'Bambú', 6900, 3800, 30, 'cutting board bamboo', 'Bambú', 'Natural', '40x30 cm'],
  ['Tetera eléctrica 1.7 L', 'Cocina', 'Oster', 22900, 14000, 15, 'electric kettle', 'Acero inoxidable', 'Plata', '1.7 L'],
  ['Licuadora 600 W', 'Cocina', 'Oster', 31900, 20000, 9, 'blender', 'Plástico y vidrio', 'Negro', '1.5 L'],
  ['Vajilla 18 piezas', 'Cocina', 'Corelle', 45900, 28000, 6, 'dinnerware set', 'Porcelana', 'Blanco', '18 piezas'],
  ['Vasos de vidrio 6 unidades', 'Cocina', 'Libbey', 9900, 5600, 25, 'drinking glasses', 'Vidrio', 'Transparente', '350 ml'],
  ['Cubertería 24 piezas', 'Cocina', 'Tramontina', 27900, 17000, 11, 'cutlery set', 'Acero inoxidable', 'Plata', '24 piezas'],
  ['Cafetera de goteo 12 tazas', 'Cocina', 'Oster', 26900, 16000, 7, 'drip coffee maker', 'Vidrio y plástico', 'Negro', '12 tazas'],
  ['Microondas 0.7 pies cúbicos', 'Cocina', 'Panasonic', 69900, 48000, 5, 'microwave oven', 'Acero y vidrio', 'Negro', '0.7 ft³'],
  ['Tostadora 2 ranuras', 'Cocina', 'Oster', 21900, 13000, 10, 'toaster', 'Acero inoxidable', 'Plata', '2 ranuras'],
  ['Batidora de mano', 'Cocina', 'Oster', 15900, 9500, 14, 'hand mixer', 'Plástico', 'Blanco', '300 W'],
  ['Exprimidor manual', 'Cocina', 'KitchenAid', 7900, 4500, 20, 'citrus juicer', 'Acero y plástico', 'Amarillo', 'Manual'],
  ['Set de utensilios de silicona', 'Cocina', 'Silicone', 12900, 7500, 18, 'silicone utensils', 'Silicona', 'Multicolor', '8 piezas'],
  ['Frascos herméticos 5 unidades', 'Cocina', 'Glasslock', 14900, 8600, 22, 'glass storage containers', 'Vidrio', 'Transparente', '5 piezas'],
  ['Organizador de especias 12 frascos', 'Cocina', 'Spice', 16900, 9900, 9, 'spice rack', 'Metal y vidrio', 'Negro', '12 frascos'],
  ['Tabla de planchar plegable', 'Hogar', 'Wing', 24900, 15000, 5, 'ironing board', 'Metal y tela', 'Gris', '120x38 cm'],
  ['Plancha de ropa 1600 W', 'Hogar', 'Philips', 34900, 22000, 8, 'clothes iron', 'Plástico', 'Azul', '1600 W'],
  ['Aspiradora vertical 2 en 1', 'Hogar', 'Black+Decker', 79900, 55000, 4, 'stick vacuum', 'Plástico', 'Rojo', '2 en 1'],
  ['Escoba de microfibra', 'Hogar', 'Vileda', 7900, 4300, 28, 'mop microfiber', 'Microfibra', 'Turquesa', '1 unidad'],
  ['Trapeador giratorio', 'Hogar', 'Vileda', 12900, 7200, 16, 'spin mop', 'Plástico', 'Azul', '1 unidad'],
  ['Balde con exprimidor', 'Hogar', 'Vileda', 9900, 5800, 18, 'mop bucket', 'Plástico', 'Azul', '12 L'],
  ['Set de escobillas de limpieza', 'Hogar', 'Scotch-Brite', 5900, 3200, 35, 'cleaning brushes', 'Plástico', 'Multicolor', '3 piezas'],
  ['Basurero con pedal 12 L', 'Hogar', 'Simplehuman', 24900, 14500, 12, 'trash can pedal', 'Acero inoxidable', 'Plata', '12 L'],
  ['Cesto de ropa plegable', 'Hogar', 'Honey-Can-Do', 11900, 6800, 14, 'laundry hamper', 'Tela y metal', 'Gris', '1 unidad'],
  ['Set de ganchos adhesivos 6', 'Hogar', 'Command', 4900, 2500, 40, 'adhesive hooks', 'Plástico', 'Blanco', '6 piezas'],
  ['Espejo de pared redondo', 'Decoración', 'Umbra', 19900, 11500, 9, 'round wall mirror', 'Vidrio y metal', 'Dorado', '60 cm'],
  ['Cuadro decorativo abstracto', 'Decoración', 'Art', 15900, 8500, 10, 'abstract wall art', 'Lienzo', 'Multicolor', '50x70 cm'],
  ['Reloj de pared moderno', 'Decoración', 'Umbra', 12900, 7000, 15, 'wall clock', 'Metal', 'Negro', '30 cm'],
  ['Lámpara de mesa de cerámica', 'Iluminación', 'IKEA', 22900, 13000, 8, 'table lamp ceramic', 'Cerámica', 'Blanco', '45 cm'],
  ['Lámpara colgante de ratán', 'Iluminación', 'IKEA', 27900, 16500, 6, 'rattan pendant lamp', 'Ratán', 'Natural', '40 cm'],
  ['Tira LED 5 m', 'Iluminación', 'Govee', 15900, 9000, 20, 'led strip lights', 'Plástico', 'Multicolor', '5 m'],
  ['Velas aromáticas set 3', 'Decoración', 'Yankee', 12900, 7200, 18, 'scented candles', 'Cera', 'Crema', '3 piezas'],
  ['Difusor de aromas ultrasónico', 'Hogar', 'Stadler', 14900, 8600, 12, 'aroma diffuser', 'Plástico', 'Madera', '300 ml'],
  ['Cojines decorativos 2 unidades', 'Textiles', 'IKEA', 9900, 5600, 22, 'decorative pillows', 'Algodón', 'Beige', '45x45 cm'],
  ['Manta de algodón 130x170', 'Textiles', 'IKEA', 19900, 12000, 10, 'cotton throw blanket', 'Algodón', 'Terracota', '130x170 cm'],
  ['Juego de sábanas queen', 'Textiles', 'Cannon', 34900, 21000, 8, 'bed sheets queen', 'Algodón', 'Blanco', 'Queen'],
  ['Cortinas blackout 2 paneles', 'Textiles', 'Deconovo', 24900, 14500, 7, 'blackout curtains', 'Poliéster', 'Gris', '2 paneles'],
  ['Alfombra de área 120x180', 'Textiles', 'Safavieh', 39900, 25000, 5, 'area rug', 'Poliéster', 'Beige', '120x180 cm'],
  ['Organizador de cajones', 'Organización', 'mDesign', 10900, 6200, 18, 'drawer organizer', 'Plástico', 'Transparente', '1 unidad'],
  ['Estante flotante 60 cm', 'Organización', 'IKEA', 8900, 5000, 24, 'floating shelf', 'Madera', 'Blanco', '60 cm'],
  ['Caja organizadora apilable', 'Organización', 'Iris', 6900, 3800, 30, 'storage box', 'Plástico', 'Gris', '20 L'],
  ['Perchero de pie', 'Organización', 'Umbra', 18900, 10500, 8, 'coat rack', 'Madera', 'Natural', '1.7 m'],
  ['Zapatera de 3 niveles', 'Organización', 'Honey-Can-Do', 19900, 11500, 7, 'shoe rack', 'Metal', 'Negro', '3 niveles'],
  ['Maceta de cerámica 20 cm', 'Jardín', 'Elho', 6900, 3800, 25, 'ceramic plant pot', 'Cerámica', 'Blanco', '20 cm'],
  ['Set de herramientas de jardín', 'Jardín', 'Fiskars', 14900, 8600, 10, 'garden tools', 'Acero y plástico', 'Verde', '3 piezas'],
  ['Regadera metálica 1.5 L', 'Jardín', 'Fiskars', 7900, 4400, 18, 'watering can', 'Metal', 'Verde', '1.5 L'],
  ['Maceta autorriego 25 cm', 'Jardín', 'Lechuza', 12900, 7500, 12, 'self watering planter', 'Plástico', 'Gris', '25 cm'],
  ['Mesa auxiliar de madera', 'Muebles', 'IKEA', 29900, 18000, 5, 'side table wood', 'Madera', 'Natural', '45 cm'],
];

const TECNOLOGIA = [
  ['Audífonos Bluetooth ANC', 'Audio', 'AuraSound', 39900, 24000, 12, 'wireless headphones', 'Plástico', 'Negro', 'Bluetooth 5.3'],
  ['Parlante portátil', 'Audio', 'Boom', 29900, 18000, 10, 'bluetooth speaker', 'Plástico', 'Azul', 'Bluetooth'],
  ['Audífonos inalámbricos deportivos', 'Audio', 'AuraSound', 24900, 14500, 15, 'sports earbuds', 'Plástico', 'Verde', 'Bluetooth'],
  ['Barra de sonido 2.0', 'Audio', 'Samsung', 79900, 52000, 5, 'soundbar', 'Plástico', 'Negro', '2.0 canales'],
  ['Micrófono USB', 'Audio', 'Blue', 54900, 33000, 6, 'usb microphone', 'Metal', 'Negro', 'USB-C'],
  ['Teclado mecánico', 'Periféricos', 'KeyPro', 49900, 29000, 8, 'mechanical keyboard', 'Aluminio', 'Gris', 'K68'],
  ['Mouse inalámbrico ergonómico', 'Periféricos', 'Logitech', 19900, 11000, 22, 'wireless mouse', 'Plástico', 'Negro', '2.4 GHz'],
  ['Teclado y mouse inalámbricos', 'Periféricos', 'Logitech', 29900, 17500, 10, 'keyboard mouse set', 'Plástico', 'Negro', 'Combo'],
  ['Monitor 24 pulgadas Full HD', 'Monitores', 'Samsung', 99900, 72000, 4, 'computer monitor', 'Plástico', 'Negro', '24 in'],
  ['Soporte de monitor ajustable', 'Accesorios', 'AmazonBasics', 24900, 14000, 9, 'monitor arm', 'Acero', 'Negro', '1 unidad'],
  ['Hub USB-C 7 en 1', 'Accesorios', 'Anker', 29900, 17500, 14, 'usb c hub', 'Aluminio', 'Gris', '7 en 1'],
  ['Cargador rápido USB-C 65W', 'Accesorios', 'Anker', 24900, 14000, 18, 'usb c charger', 'Plástico', 'Blanco', '65 W'],
  ['Cable USB-C a USB-C 2 m', 'Accesorios', 'Anker', 7900, 4200, 40, 'usb c cable', 'Nylon', 'Negro', '2 m'],
  ['Power bank 20000 mAh', 'Accesorios', 'Anker', 34900, 21000, 12, 'power bank', 'Plástico', 'Negro', '20000 mAh'],
  ['Webcam Full HD', 'Accesorios', 'Logitech', 39900, 24000, 9, 'webcam', 'Plástico', 'Negro', '1080p'],
  ['Lámpara de escritorio LED', 'Iluminación', 'Lumen', 19900, 11000, 16, 'led desk lamp', 'Plástico', 'Blanco', '3 temperaturas'],
  ['Lámpara con carga inalámbrica', 'Iluminación', 'Lumen', 29900, 17500, 10, 'desk lamp wireless charger', 'Plástico', 'Negro', '15 W'],
  ['Reloj inteligente', 'Wearables', 'AuraSound', 89900, 58000, 6, 'smartwatch', 'Aluminio', 'Negro', '1.9 in'],
  ['Pulsera de actividad', 'Wearables', 'Fitbit', 49900, 30000, 8, 'fitness tracker', 'Plástico', 'Azul', '1 unidad'],
  ['Organizador de escritorio', 'Oficina', 'Casa', 9900, 5200, 25, 'desk organizer', 'Madera', 'Natural', '1 unidad'],
  ['Bandeja de documentos', 'Oficina', 'Leitz', 7900, 4200, 20, 'document tray', 'Plástico', 'Negro', '3 niveles'],
  ['Archivador de 3 cajones', 'Oficina', 'Leitz', 39900, 24000, 5, 'filing cabinet', 'Metal', 'Gris', '3 cajones'],
  ['Silla ergonómica', 'Muebles', 'Herman', 129900, 90000, 3, 'ergonomic office chair', 'Malla', 'Negro', '1 unidad'],
  ['Alfombrilla para silla', 'Oficina', 'Office', 15900, 8500, 12, 'chair mat', 'Plástico', 'Transparente', '120x90 cm'],
  ['Reposapiés ajustable', 'Ergonomía', 'AmazonBasics', 19900, 11000, 8, 'footrest', 'Plástico', 'Negro', 'Ajustable'],
  ['Soporte para laptop', 'Ergonomía', 'AmazonBasics', 12900, 7000, 14, 'laptop stand', 'Aluminio', 'Plata', 'Hasta 17 in'],
  ['Base refrigerante para laptop', 'Accesorios', 'Cooler Master', 19900, 11000, 9, 'laptop cooling pad', 'Plástico', 'Negro', '2 ventiladores'],
  ['Disco SSD externo 1 TB', 'Almacenamiento', 'Samsung', 69900, 45000, 6, 'external ssd', 'Aluminio', 'Gris', '1 TB'],
  ['Memoria USB 128 GB', 'Almacenamiento', 'SanDisk', 12900, 7000, 25, 'usb flash drive', 'Plástico', 'Negro', '128 GB'],
  ['Tarjeta microSD 128 GB', 'Almacenamiento', 'SanDisk', 14900, 8200, 20, 'micro sd card', 'Plástico', 'Gris', '128 GB'],
  ['Router Wi-Fi 6', 'Redes', 'TP-Link', 59900, 38000, 5, 'wifi router', 'Plástico', 'Negro', 'Wi-Fi 6'],
  ['Repetidor Wi-Fi', 'Redes', 'TP-Link', 24900, 14000, 10, 'wifi extender', 'Plástico', 'Blanco', '1 unidad'],
  ['Switch de red 8 puertos', 'Redes', 'TP-Link', 29900, 17500, 7, 'network switch', 'Metal', 'Negro', '8 puertos'],
  ['Cámara de seguridad Wi-Fi', 'Smart home', 'TP-Link', 39900, 24000, 8, 'security camera', 'Plástico', 'Blanco', '2K'],
  ['Enchufe inteligente', 'Smart home', 'TP-Link', 9900, 5200, 22, 'smart plug', 'Plástico', 'Blanco', '16 A'],
  ['Bombillo inteligente', 'Smart home', 'Philips', 12900, 7000, 18, 'smart bulb', 'Vidrio', 'Multicolor', 'E27'],
  ['Sensor de movimiento', 'Smart home', 'Aqara', 9900, 5000, 12, 'motion sensor', 'Plástico', 'Blanco', 'Zigbee'],
  ['Timbre inteligente', 'Smart home', 'Ring', 49900, 30000, 6, 'video doorbell', 'Plástico', 'Negro', '1080p'],
  ['Impresora multifuncional', 'Oficina', 'Epson', 89900, 65000, 4, 'printer', 'Plástico', 'Negro', 'Inyección'],
  ['Papel bond 500 hojas', 'Oficina', 'HP', 5900, 3200, 50, 'printer paper', 'Papel', 'Blanco', 'Carta'],
  ['Tóner para impresora', 'Oficina', 'HP', 29900, 18000, 10, 'printer toner', 'Plástico', 'Negro', '1 unidad'],
  ['Engrapadora metálica', 'Oficina', 'Swingline', 5900, 3100, 30, 'stapler', 'Metal', 'Negro', '20 hojas'],
  ['Perforadora de 2 huecos', 'Oficina', 'Swingline', 7900, 4200, 20, 'hole punch', 'Metal', 'Negro', '2 huecos'],
  ['Calculadora científica', 'Oficina', 'Casio', 12900, 7200, 18, 'scientific calculator', 'Plástico', 'Negro', '417 funciones'],
  ['Set de bolígrafos 12', 'Oficina', 'Pilot', 4900, 2500, 40, 'pens set', 'Plástico', 'Multicolor', '12 piezas'],
  ['Cuaderno profesional', 'Oficina', 'Moleskine', 8900, 4800, 25, 'notebook', 'Papel', 'Negro', 'A5'],
  ['Pizarra blanca 90x60', 'Oficina', 'Quartet', 24900, 14000, 6, 'whiteboard', 'Metal', 'Blanco', '90x60 cm'],
  ['Proyector portátil', 'Presentación', 'Epson', 199900, 140000, 3, 'projector', 'Plástico', 'Blanco', '1080p'],
  ['Base para proyector', 'Accesorios', 'Pyle', 19900, 11000, 5, 'projector stand', 'Metal', 'Negro', 'Ajustable'],
  ['Kit de limpieza de pantallas', 'Accesorios', 'Clean', 4900, 2400, 35, 'screen cleaning kit', 'Microfibra', 'Azul', '1 kit'],
];

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function commonsImage(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&generator=search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=900' +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}`;
  const response = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!response.ok) return null;
  const data = await response.json();
  for (const page of Object.values(data?.query?.pages ?? {})) {
    const info = page?.imageinfo?.[0];
    if (!info || !['image/jpeg', 'image/png'].includes(info.mime)) continue;
    if (/logo|map|diagram|chart|poster/i.test(page.title ?? '')) continue;
    const candidate = info.thumburl ?? info.url;
    if (!candidate) continue;
    try {
      const probe = await fetch(candidate, {
        headers: { 'user-agent': BROWSER_UA, accept: 'image/*' },
        redirect: 'follow',
      });
      if (probe.status === 429) {
        await sleep(1200);
        continue;
      }
      if (!probe.ok) continue;
      if (!(probe.headers.get('content-type') ?? '').startsWith('image/')) continue;
      await probe.arrayBuffer();
      return candidate;
    } catch {
      await sleep(600);
    }
  }
  return null;
}

const csvEscape = (value) =>
  /[",\n;]/.test(String(value ?? '')) ? `"${String(value).replaceAll('"', '""')}"` : String(value ?? '');

async function build(name, file, catalogName, rows, prefix) {
  const out = [];
  for (const [index, row] of rows.entries()) {
    const [productName, category, brand, price, cost, stock, term, material, color, size] = row;
    let image = await commonsImage(term);
    if (!image) {
      console.log(`  fallback imagen: ${productName} (${term})`);
      image = await commonsImage(`${category} product`);
    }
    const description = `${productName}. ${material}, ${color}${
      size ? `, ${size}` : ''
    }. ${category} marca ${brand}.`;
    out.push([
      `${prefix}-${String(index + 1).padStart(3, '0')}`,
      productName,
      description,
      category,
      brand,
      price,
      cost,
      stock,
      image ?? '',
      material,
      color,
      size,
    ]);
  }
  const header = [
    'SKU',
    'Nombre',
    'Descripción',
    'Categoría',
    'Marca',
    'Precio',
    'Costo',
    'Stock',
    'Imagen',
    'Material',
    'Color',
    'Medida',
  ];
  const csv = [header, ...out].map((line) => line.map(csvEscape).join(',')).join('\n') + '\n';
  const path = resolve(outDir, file);
  writeFileSync(path, csv, 'utf8');
  const withImage = out.filter((row) => row[8]).length;
  console.log(`${catalogName}: ${out.length} productos · ${withImage} con imagen · ${file}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  await build('Hogar y Cocina', '08-hogar-y-cocina.csv', 'Hogar y Cocina', HOGAR, 'HOG');
  await build('Tecnología y Oficina', '09-tecnologia-y-oficina.csv', 'Tecnología y Oficina', TECNOLOGIA, 'TEC');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
