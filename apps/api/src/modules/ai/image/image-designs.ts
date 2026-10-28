import { formatMoney, type ImageDesignListResponse } from '@ventascatalogo/contracts';
import { toDataUri } from './image-data-uri';
import { buildMockSocialSvg } from './svg-image';

export interface ImageDesignDefinition {
  key: 'CLASICA' | 'EDITORIAL' | 'PROMO';
  label: string;
  description: string;
}

export const IMAGE_DESIGNS: ImageDesignDefinition[] = [
  {
    key: 'CLASICA',
    label: 'Clásica',
    description:
      'Foto a sangre con overlay oscuro y los datos abajo. Sobria, sirve para cualquier producto.',
  },
  {
    key: 'EDITORIAL',
    label: 'Editorial',
    description:
      'Composición tipo revista: panel crema con título en serif y foto a sangre a la derecha.',
  },
  {
    key: 'PROMO',
    label: 'Promo',
    description:
      'Más agresiva: badge «OFERTA», banda diagonal, precio enorme y CTA en píldora coral.',
  },
];

/** Miniaturas deterministas de los 3 diseños (sin foto, `data-photo="false"`). */
export function buildImageDesignCatalog(): ImageDesignListResponse {
  return {
    items: IMAGE_DESIGNS.map((design, index) => {
      const svg = buildMockSocialSvg({
        title: 'Café de altura',
        cta: 'Pedí el tuyo',
        productName: 'Café de altura',
        productPrice: formatMoney(6_000n, 'CRC'),
        visualSuggestion: null,
        photoDataUri: null,
        variant: index + 1,
        design: design.key,
      });
      return {
        ...design,
        // Se incrusta como SVG en data URI para que Ajustes muestre la miniatura.
        previewDataUri: toDataUri(Buffer.from(svg, 'utf8'), 'image/svg+xml'),
      };
    }),
  };
}
