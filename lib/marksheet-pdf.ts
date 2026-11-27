'use client';

import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

const A4_WIDTH_PX = 794; // 210mm at 96dpi
const A4_HEIGHT_PX = 1123; // 297mm at 96dpi

async function inlineExternalImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return;
      try {
        const res = await fetch(src, { mode: 'cors' });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('read error'));
          reader.readAsDataURL(blob);
        });
        if (dataUrl) {
          img.setAttribute('src', dataUrl);
        }
      } catch {
        // Leave original src if CORS blocks fetch; filter/fallback handles rendering gracefully
      }
    })
  );

  // Also inline CSS background-image url(...) watermarks if present
  const styledEls = Array.from(root.querySelectorAll<HTMLElement>('[style*="background-image"]'));
  await Promise.all(
    styledEls.map(async (el) => {
      const bg = el.style.backgroundImage;
      const match = bg.match(/url\(["']?(https?:[^"')]+)["']?\)/i);
      if (!match) return;
      try {
        const res = await fetch(match[1], { mode: 'cors' });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('read error'));
          reader.readAsDataURL(blob);
        });
        if (dataUrl) {
          el.style.backgroundImage = `url("${dataUrl}")`;
        }
      } catch {
        // Keep original URL if CORS unavailable
      }
    })
  );
}

export function sanitizeMarksheetFilename(baseName: string): string {
  const clean = baseName
    .replace(/[^a-z0-9\-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${clean || 'Official-Marksheet'}.pdf`;
}

/**
 * Generates an exact single-page A4 Portrait PDF (210mm x 297mm) from a rendered MarksheetDocument node.
 * Automatically clones into an unclipped off-screen 794px x 1123px stage and scales tall content cleanly.
 */
export async function downloadMarksheetAsPdf(
  sourceEl: HTMLElement,
  filenameBase: string
): Promise<void> {
  if (typeof window === 'undefined' || !sourceEl) return;

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${A4_WIDTH_PX}px`;
  host.style.height = `${A4_HEIGHT_PX}px`;
  host.style.overflow = 'hidden';
  host.style.backgroundColor = '#ffffff';
  host.style.zIndex = '-1';
  host.style.pointerEvents = 'none';

  const stage = document.createElement('div');
  stage.style.width = `${A4_WIDTH_PX}px`;
  stage.style.minHeight = `${A4_HEIGHT_PX}px`;
  stage.style.backgroundColor = '#ffffff';
  stage.style.display = 'flex';
  stage.style.flexDirection = 'column';
  stage.style.alignItems = 'center';
  stage.style.justifyContent = 'flex-start';

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  // Strip screen-only modal card shadows, rounding, and editor UI
  clone.style.width = `${A4_WIDTH_PX}px`;
  clone.style.maxWidth = `${A4_WIDTH_PX}px`;
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  clone.style.border = 'none';
  clone.style.transform = 'none';

  clone.querySelectorAll('.no-print, .studio-edit-indicator').forEach((el) => el.remove());

  stage.appendChild(clone);
  host.appendChild(stage);
  document.body.appendChild(host);

  try {
    await inlineExternalImages(clone);
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // Measure actual unscaled height and proportionally fit onto 1 A4 sheet if tall (e.g. 13+ subjects)
    const measuredHeight = clone.scrollHeight;
    if (measuredHeight > A4_HEIGHT_PX) {
      const fitScale = Math.max(0.68, (A4_HEIGHT_PX - 12) / measuredHeight);
      clone.style.transformOrigin = 'top center';
      clone.style.transform = `scale(${fitScale.toFixed(4)})`;
    } else if (measuredHeight < A4_HEIGHT_PX) {
      clone.style.minHeight = `${A4_HEIGHT_PX}px`;
    }

    // Allow layout flush
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    let dataUrl: string;
    try {
      dataUrl = await toPng(stage, {
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    } catch {
      // Fallback if external cross-origin fonts/images restrict canvas read
      dataUrl = await toPng(stage, {
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
        filter: (node) => {
          if (node instanceof HTMLImageElement) {
            const src = node.getAttribute('src') || '';
            if (src.startsWith('http') && !src.startsWith(window.location.origin)) {
              return false;
            }
          }
          return true;
        },
      });
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
    pdf.save(sanitizeMarksheetFilename(filenameBase));
  } finally {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

/**
 * Triggers clean single-page vector browser printing with isolated modal overrides and PDF filename title.
 */
export function printMarksheetDocument(documentTitle?: string): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const prevTitle = document.title;
  if (documentTitle) {
    document.title = documentTitle;
  }
  root.classList.add('printing-marksheet');

  const cleanup = () => {
    root.classList.remove('printing-marksheet');
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  requestAnimationFrame(() => {
    window.print();
    setTimeout(cleanup, 1200);
  });
}
