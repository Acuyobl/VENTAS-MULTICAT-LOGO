'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface ShareCatalogModalProps {
  catalogName: string;
  organizationName: string;
  versionNumber: number;
  shareUrl: string;
  onClose: () => void;
}

export function ShareCatalogModal({
  catalogName,
  organizationName,
  versionNumber,
  shareUrl,
  onClose,
}: ShareCatalogModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback si los permisos de portapapeles fallan
      setCopied(false);
    }
  }

  const waMessage = encodeURIComponent(
    `¡Hola! Te comparto el catálogo *${catalogName}* de *${organizationName}* (v${versionNumber}):\n${shareUrl}`
  );
  const waShareUrl = `https://wa.me/?text=${waMessage}`;

  return (
    <div
      className="share-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="share-modal-card">
        <button
          type="button"
          className="share-modal__close"
          onClick={onClose}
          aria-label="Cerrar ventana de compartir"
        >
          ✕
        </button>

        <div className="share-modal__head">
          <span className="eyebrow">Difusión digital</span>
          <h2 id="share-modal-title" className="share-modal__title">
            Compartir catálogo
          </h2>
          <p className="share-modal__subtitle">
            <strong>{catalogName}</strong> · {organizationName} (v{versionNumber})
          </p>
        </div>

        <div className="share-modal__qr-wrap">
          <div className="share-modal__qr">
            {shareUrl ? (
              <QRCodeSVG
                value={shareUrl}
                size={184}
                bgColor="#FFFBEB"
                fgColor="#0F766E"
                level="M"
              />
            ) : null}
          </div>
          <p className="share-modal__qr-hint">
            Escaneá este código QR con la cámara de tu celular para abrir el catálogo directamente.
          </p>
        </div>

        <div className="stack" style={{ gap: '0.6rem' }}>
          <label className="mono faint" htmlFor="share-catalog-url-input">
            Enlace directo al catálogo
          </label>
          <div className="share-modal__copy-row">
            <input
              id="share-catalog-url-input"
              type="text"
              readOnly
              value={shareUrl}
              className="share-modal__input"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              className="btn btn--secondary share-modal__copy-btn"
              onClick={handleCopy}
            >
              {copied ? '✓ Copiado' : 'Copiar enlace'}
            </button>
          </div>
        </div>

        <a
          href={waShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--whatsapp btn--wide"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.08l-.29-.17-3.12.82.83-3.04-.19-.3a8.17 8.17 0 0 1-1.25-4.47c0-4.54 3.7-8.23 8.24-8.23m4.52 11.63c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.01-1.24-.74-.66-1.25-1.48-1.39-1.73-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.18-.47-.3" />
          </svg>
          Compartir por WhatsApp
        </a>
      </div>
    </div>
  );
}
