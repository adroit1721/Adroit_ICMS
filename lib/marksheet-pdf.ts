'use client';

import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

const A4_PORTRAIT_W_PX = 794; // 210mm at 96dpi
const A4_PORTRAIT_H_PX = 1123; // 297mm at 96dpi
const A4_LANDSCAPE_W_PX = 1123; // 297mm at 96dpi
const A4_LANDSCAPE_H_PX = 794; // 210mm at 96dpi

const DYNAMIC_PAGE_STYLE_ID = 'marksheet-dynamic-page-style';

function resolveSheetOrientation(el?: HTMLElement | null): 'portrait' | 'landscape' {
  if (!el) return 'portrait';
  if (
    el.getAttribute('data-orientation') === 'landscape' ||
    el.classList.contains('a4-landscape')
  ) {
    return 'landscape';
  }
  return 'portrait';
}

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
 * Generates an exact single-page A4 Portrait (210x297mm) or Landscape (297x210mm) PDF
 * from a rendered MarksheetDocument node using compact rhythm + inverse-width compensation
 * so even 12+ subject transcripts fit edge-to-edge on one crisp A4 sheet.
 */
export async function downloadMarksheetAsPdf(
  sourceEl: HTMLElement,
  filenameBase: string,
  orientationOverride?: 'portrait' | 'landscape'
): Promise<void> {
  if (typeof window === 'undefined' || !sourceEl) return;

  const orientation = orientationOverride || resolveSheetOrientation(sourceEl);
  const targetW = orientation === 'landscape' ? A4_LANDSCAPE_W_PX : A4_PORTRAIT_W_PX;
  const targetH = orientation === 'landscape' ? A4_LANDSCAPE_H_PX : A4_PORTRAIT_H_PX;
  const mmW = orientation === 'landscape' ? 297 : 210;
  const mmH = orientation === 'landscape' ? 210 : 297;
  const autoFit = sourceEl.getAttribute('data-auto-fit') !== 'false';

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-12000px';
  host.style.top = '0';
  host.style.width = `${targetW}px`;
  host.style.height = `${targetH}px`;
  host.style.overflow = 'hidden';
  host.style.backgroundColor = '#ffffff';
  host.style.zIndex = '-1';
  host.style.pointerEvents = 'none';

  const stage = document.createElement('div');
  stage.style.width = `${targetW}px`;
  stage.style.height = `${targetH}px`;
  stage.style.backgroundColor = '#ffffff';
  stage.style.display = 'flex';
  stage.style.flexDirection = 'column';
  stage.style.alignItems = 'flex-start';
  stage.style.justifyContent = 'flex-start';
  stage.style.overflow = 'hidden';

  const clone = sourceEl.cloneNode(true) as HTMLElement;
  clone.style.width = `${targetW}px`;
  clone.style.maxWidth = `${targetW}px`;
  clone.style.minHeight = `${targetH}px`;
  clone.style.margin = '0';
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  clone.style.border = 'none';
  clone.style.transform = 'none';
  clone.style.zoom = '1';

  clone.querySelectorAll('.no-print, .studio-edit-indicator').forEach((el) => el.remove());

  stage.appendChild(clone);
  host.appendChild(stage);
  document.body.appendChild(host);

  try {
    await inlineExternalImages(clone);
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    // Reset minHeight briefly to measure true natural content height
    clone.style.minHeight = '0px';
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    let measuredHeight = clone.scrollHeight;

    if (autoFit && measuredHeight > targetH - 4) {
      // Pass 1: tighten vertical table/section rhythm
      clone.setAttribute('data-compact-fit', 'true');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      measuredHeight = clone.scrollHeight;

      if (measuredHeight > targetH - 4) {
        // Pass 2: inverse-width stage compensation so scale fits edge-to-edge across 100% width
        const initialScale = Math.max(0.58, (targetH - 6) / measuredHeight);
        clone.style.width = `${(targetW / initialScale).toFixed(2)}px`;
        clone.style.maxWidth = `${(targetW / initialScale).toFixed(2)}px`;
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const remeasuredHeight = clone.scrollHeight;
        const finalScale = Math.min(1, Math.max(0.58, (targetH - 6) / remeasuredHeight));
        clone.style.width = `${(targetW / finalScale).toFixed(2)}px`;
        clone.style.maxWidth = `${(targetW / finalScale).toFixed(2)}px`;
        clone.style.minHeight = `${Math.floor(targetH / finalScale)}px`;
        clone.style.transformOrigin = 'top left';
        clone.style.transform = `scale(${finalScale.toFixed(4)})`;
      } else {
        clone.style.minHeight = `${targetH}px`;
      }
    } else {
      clone.style.minHeight = `${targetH}px`;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    let dataUrl: string;
    try {
      dataUrl = await toPng(stage, {
        width: targetW,
        height: targetH,
        pixelRatio: 2.5,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
    } catch {
      dataUrl = await toPng(stage, {
        width: targetW,
        height: targetH,
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
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, mmW, mmH, undefined, 'FAST');
    pdf.save(sanitizeMarksheetFilename(filenameBase));
  } finally {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

export function calibrateMarksheetForPrint(targetSheet?: HTMLElement | null): void {
  if (typeof window === 'undefined') return;
  const sheet =
    targetSheet || document.querySelector<HTMLElement>('.a4-marksheet-sheet');
  if (!sheet) return;

  const orientation = resolveSheetOrientation(sheet);
  const targetW = orientation === 'landscape' ? A4_LANDSCAPE_W_PX : A4_PORTRAIT_W_PX;
  const targetH = orientation === 'landscape' ? A4_LANDSCAPE_H_PX : A4_PORTRAIT_H_PX;
  const autoFit = sheet.getAttribute('data-auto-fit') !== 'false';

  // Inject dynamic @page orientation rule so system print preview selects Portrait/Landscape automatically
  let styleEl = document.getElementById(DYNAMIC_PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = DYNAMIC_PAGE_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print { @page { size: A4 ${orientation}; margin: 0mm; } }`;

  // Temporarily clear previous calibration to measure cleanly
  sheet.removeAttribute('data-compact-fit');
  sheet.style.removeProperty('--ms-print-zoom');
  sheet.style.removeProperty('--ms-print-width');
  sheet.style.removeProperty('--ms-print-min-height');

  // Measure natural height at exact A4 target width using a quick inline check
  const prevWidth = sheet.style.width;
  const prevMaxWidth = sheet.style.maxWidth;
  const prevMinHeight = sheet.style.minHeight;
  sheet.style.width = `${targetW}px`;
  sheet.style.maxWidth = `${targetW}px`;
  sheet.style.minHeight = '0px';

  let naturalHeight = sheet.scrollHeight;

  if (autoFit && naturalHeight > targetH - 6) {
    sheet.setAttribute('data-compact-fit', 'true');
    naturalHeight = sheet.scrollHeight;

    if (naturalHeight > targetH - 6) {
      const initialZoom = Math.max(0.58, (targetH - 10) / naturalHeight);
      const widenedPx = targetW / initialZoom;
      sheet.style.width = `${widenedPx.toFixed(2)}px`;
      sheet.style.maxWidth = `${widenedPx.toFixed(2)}px`;

      const remeasuredHeight = sheet.scrollHeight;
      const finalZoom = Math.min(1, Math.max(0.58, (targetH - 10) / remeasuredHeight));
      const finalWidthPx = targetW / finalZoom;
      const finalMinHeightPx = Math.floor((targetH - 6) / finalZoom);

      sheet.style.setProperty('--ms-print-zoom', finalZoom.toFixed(4));
      sheet.style.setProperty('--ms-print-width', `${finalWidthPx.toFixed(2)}px`);
      sheet.style.setProperty('--ms-print-min-height', `${finalMinHeightPx}px`);
    } else {
      sheet.style.setProperty('--ms-print-zoom', '1');
      sheet.style.setProperty('--ms-print-width', `${targetW}px`);
      sheet.style.setProperty('--ms-print-min-height', `${targetH - 6}px`);
    }
  } else {
    sheet.style.setProperty('--ms-print-zoom', '1');
    sheet.style.setProperty('--ms-print-width', `${targetW}px`);
    sheet.style.setProperty('--ms-print-min-height', `${targetH - 6}px`);
  }

  // Restore on-screen styles immediately (print styles only read CSS custom props inside @media print)
  sheet.style.width = prevWidth;
  sheet.style.maxWidth = prevMaxWidth;
  sheet.style.minHeight = prevMinHeight;
}

export function cleanupMarksheetPrintCalibration(): void {
  if (typeof window === 'undefined') return;
  document.documentElement.classList.remove('printing-marksheet');
  const styleEl = document.getElementById(DYNAMIC_PAGE_STYLE_ID);
  if (styleEl && styleEl.parentNode) {
    styleEl.parentNode.removeChild(styleEl);
  }
  document.querySelectorAll<HTMLElement>('.a4-marksheet-sheet').forEach((sheet) => {
    sheet.removeAttribute('data-compact-fit');
    sheet.style.removeProperty('--ms-print-zoom');
    sheet.style.removeProperty('--ms-print-width');
    sheet.style.removeProperty('--ms-print-min-height');
  });
}

let globalCalibratorRegistered = false;

export function registerGlobalMarksheetPrintCalibrator(): void {
  if (typeof window === 'undefined' || globalCalibratorRegistered) return;
  globalCalibratorRegistered = true;

  window.addEventListener('beforeprint', () => {
    const activeSheet = document.querySelector<HTMLElement>('.a4-marksheet-sheet');
    if (activeSheet) {
      document.documentElement.classList.add('printing-marksheet');
      calibrateMarksheetForPrint(activeSheet);
    }
  });

  window.addEventListener('afterprint', () => {
    cleanupMarksheetPrintCalibration();
  });
}

/**
 * Triggers clean single-page vector browser printing with isolated modal overrides,
 * orientation-matched @page geometry, single-page zoom calibration, and PDF filename title.
 */
export function printMarksheetDocument(documentTitle?: string): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const prevTitle = document.title;
  if (documentTitle) {
    document.title = documentTitle;
  }
  root.classList.add('printing-marksheet');
  calibrateMarksheetForPrint();

  const cleanup = () => {
    cleanupMarksheetPrintCalibration();
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  requestAnimationFrame(() => {
    window.print();
    setTimeout(cleanup, 1500);
  });
}
