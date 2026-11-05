import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ProductDetail } from '@ventascatalogo/contracts';
import { ApiError, apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { ProductDetailPanel } from '@/components/backoffice/product-detail-panel';

export const metadata: Metadata = {
  title: 'Detalle del producto',
};

export const dynamic = 'force-dynamic';

interface ProductDetailPageProps {
  params: Promise<{ productId: string }>;
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { productId } = await params;
  const session = await getSession();
  const canWrite = session?.permissions.includes('product:write') ?? false;

  let product: ProductDetail;
  try {
    product = await apiFetch<ProductDetail>(`/products/${encodeURIComponent(productId)}`);
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) notFound();
    throw caught;
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Producto · {product.sku}</span>
          <h1 className="display">
            {product.name.split(' ').slice(0, 3).join(' ')}{' '}
            <em>{product.name.split(' ').slice(3).join(' ') || '·'}</em>
          </h1>
          <p>
            {product.catalogName} · versión v{product.versionNumber} ({product.versionStatus})
          </p>
        </div>
        <div className="page-head__aside">
          <Link className="btn btn--small btn--ghost" href="/panel/productos">
            ← Volver a productos
          </Link>
        </div>
      </header>

      <ProductDetailPanel product={product} canWrite={canWrite} />
    </div>
  );
}
