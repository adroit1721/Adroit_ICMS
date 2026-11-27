'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Scissors,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface ImageCropUploadProps {
  mode: 'passport' | 'signature';
  label: string;
  value: string;
  publicId?: string;
  folder: string;
  onChangeMedia: (media: { url: string; publicId?: string }) => void;
  buttonLabel?: string;
  helperText?: string;
  placeholder?: string;
}

export default function ImageCropUpload({
  mode,
  label,
  value,
  publicId,
  folder,
  onChangeMedia,
  buttonLabel,
  helperText,
  placeholder,
}: ImageCropUploadProps) {
  const isPassport = mode === 'passport';
  const aspectRatio = isPassport ? 35 / 45 : 3 / 1;
  const exportW = isPassport ? 420 : 480;
  const exportH = isPassport ? 540 : 160;
  const aspectLabel = isPassport ? '35:45 (420×540 px)' : '3:1 (480×160 px)';

  const [showCropper, setShowCropper] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgRenderSize, setImgRenderSize] = useState({ w: 0, h: 0 });
  const [cropScale, setCropScale] = useState(isPassport ? 0.85 : 0.9);
  const [cropPos, setCropPos] = useState({ x: 0, y: 0 });

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getCropDimensions = (w: number, h: number, scale: number) => {
    if (w <= 0 || h <= 0) {
      return {
        cropW: isPassport ? 210 : 300,
        cropH: isPassport ? 270 : 100,
      };
    }
    const maxW = Math.min(w, h * aspectRatio);
    const maxH = maxW / aspectRatio;
    return {
      cropW: maxW * scale,
      cropH: maxH * scale,
    };
  };

  const clampCropPos = (
    x: number,
    y: number,
    w: number,
    h: number,
    cropW: number,
    cropH: number
  ) => ({
    x: Math.max(0, Math.min(x, Math.max(0, w - cropW))),
    y: Math.max(0, Math.min(y, Math.max(0, h - cropH))),
  });

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(String(reader.result));
      setCropScale(isPassport ? 0.85 : 0.9);
      setImgRenderSize({ w: 0, h: 0 });
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const { cropW, cropH } = getCropDimensions(
    imgRenderSize.w,
    imgRenderSize.h,
    cropScale
  );
  const clampedCrop = clampCropPos(
    cropPos.x,
    cropPos.y,
    imgRenderSize.w,
    imgRenderSize.h,
    cropW,
    cropH
  );

  const handleConfirmCrop = () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || imgRenderSize.w <= 0 || imgRenderSize.h <= 0) return;

    const dims = getCropDimensions(imgRenderSize.w, imgRenderSize.h, cropScale);
    const clamped = clampCropPos(
      cropPos.x,
      cropPos.y,
      imgRenderSize.w,
      imgRenderSize.h,
      dims.cropW,
      dims.cropH
    );

    canvas.width = exportW;
    canvas.height = exportH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportW, exportH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const scaleX = img.naturalWidth / imgRenderSize.w;
    const scaleY = img.naturalHeight / imgRenderSize.h;
    ctx.drawImage(
      img,
      clamped.x * scaleX,
      clamped.y * scaleY,
      dims.cropW * scaleX,
      dims.cropH * scaleY,
      0,
      0,
      exportW,
      exportH
    );

    const mimeType = isPassport ? 'image/jpeg' : 'image/png';
    const fileName = isPassport ? 'portrait_35x45.jpg' : 'signature_3x1.png';

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        setUploading(true);
        setShowCropper(false);
        setErrorMsg(null);
        setStatusMsg(null);
        try {
          const fd = new FormData();
          fd.append('file', blob, fileName);
          fd.append('folder', folder);
          if (publicId) {
            fd.append('discardTempPublicId', publicId);
          }

          const res = await fetch('/api/media/upload', {
            method: 'POST',
            headers: { 'x-requested-with': 'erp-client' },
            credentials: 'include',
            body: fd,
          });
          const data = (await res.json().catch(() => ({}))) as {
            url?: string;
            publicId?: string;
            error?: string;
          };
          if (res.ok && data.url) {
            onChangeMedia({ url: data.url, publicId: data.publicId || '' });
            setStatusMsg(`Auto-cropped (${aspectLabel}) & uploaded.`);
          } else {
            setErrorMsg(data.error || 'Upload failed.');
          }
        } catch {
          setErrorMsg('Network error during upload.');
        } finally {
          setUploading(false);
        }
      },
      mimeType,
      isPassport ? 0.92 : 1
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
          {label}
        </label>
        <span className="text-[10px] font-mono font-semibold text-primary-container bg-primary-fixed/40 px-2 py-0.5 rounded-md">
          Auto-Crop {aspectLabel}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-2xl bg-surface-container-low/70 border border-outline-variant/25">
        {value ? (
          <div
            className={`shrink-0 overflow-hidden border border-outline-variant/30 bg-white flex items-center justify-center ${
              isPassport
                ? 'w-[70px] h-[90px] rounded-xl'
                : 'w-44 h-14 rounded-xl px-2'
            }`}
          >
            <img
              src={value}
              alt={label}
              referrerPolicy="no-referrer"
              className={`w-full h-full ${
                isPassport ? 'object-cover' : 'object-contain'
              }`}
            />
          </div>
        ) : (
          <div
            className={`shrink-0 border border-dashed border-outline-variant/50 bg-surface-container-lowest flex flex-col items-center justify-center text-on-surface-variant/70 text-[10px] font-semibold text-center px-2 ${
              isPassport
                ? 'w-[70px] h-[90px] rounded-xl'
                : 'w-44 h-14 rounded-xl'
            }`}
          >
            <span>{isPassport ? '35:45' : '3:1 Sign'}</span>
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>
                {uploading
                  ? 'Uploading...'
                  : buttonLabel ||
                    (isPassport ? 'Select & Auto-Crop Photo' : 'Select & Auto-Crop Signature')}
              </span>
            </button>

            {value && (
              <button
                type="button"
                onClick={() => {
                  onChangeMedia({ url: '', publicId: '' });
                  setStatusMsg(null);
                  setErrorMsg(null);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-error-container/30 hover:bg-error-container/50 text-error text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <input
            type="text"
            value={value}
            onChange={(e) => {
              const nextUrl = e.target.value;
              onChangeMedia({
                url: nextUrl,
                publicId: nextUrl.trim() ? publicId : '',
              });
            }}
            placeholder={
              placeholder || 'https://res.cloudinary.com/... or auto-crop upload above'
            }
            className="w-full px-3 py-1.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-[11px] font-mono text-on-surface"
          />

          {helperText && (
            <p className="text-[11px] text-on-surface-variant">{helperText}</p>
          )}

          {statusMsg && (
            <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{statusMsg}</span>
            </p>
          )}
          {errorMsg && (
            <p className="text-[11px] font-semibold text-error flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </p>
          )}
        </div>
      </div>

      {/* Interactive Crop Modal */}
      {showCropper && rawImageSrc && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-outline-variant/30">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <Scissors className="w-4 h-4 text-primary-container" />
                <span>
                  {isPassport
                    ? 'Crop Passport Photo (Locked 35:45 → 420×540 px)'
                    : 'Crop Specimen Signature (Locked 3:1 → 480×160 px)'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCropper(false)}
                className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center bg-surface-container-low rounded-xl p-4 overflow-hidden select-none">
              <div className="relative inline-block overflow-hidden rounded-lg">
                <img
                  ref={imageRef}
                  src={rawImageSrc}
                  alt="Crop source"
                  draggable={false}
                  className="max-h-[320px] max-w-full object-contain block pointer-events-none"
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    const w = el.clientWidth;
                    const h = el.clientHeight;
                    setImgRenderSize({ w, h });
                    const initialScale = isPassport ? 0.85 : 0.9;
                    const { cropW: cw, cropH: ch } = getCropDimensions(
                      w,
                      h,
                      initialScale
                    );
                    setCropPos({
                      x: Math.max(0, (w - cw) / 2),
                      y: Math.max(0, (h - ch) / 2),
                    });
                  }}
                />
                {imgRenderSize.w > 0 && imgRenderSize.h > 0 && (
                  <div
                    role="presentation"
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragRef.current = {
                        active: true,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: clampedCrop.x,
                        origY: clampedCrop.y,
                      };
                    }}
                    onPointerMove={(e) => {
                      if (!dragRef.current.active) return;
                      const dx = e.clientX - dragRef.current.startX;
                      const dy = e.clientY - dragRef.current.startY;
                      setCropPos(
                        clampCropPos(
                          dragRef.current.origX + dx,
                          dragRef.current.origY + dy,
                          imgRenderSize.w,
                          imgRenderSize.h,
                          cropW,
                          cropH
                        )
                      );
                    }}
                    onPointerUp={() => {
                      dragRef.current.active = false;
                    }}
                    style={{
                      left: `${clampedCrop.x}px`,
                      top: `${clampedCrop.y}px`,
                      width: `${cropW}px`,
                      height: `${cropH}px`,
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                    }}
                    className="absolute border-2 border-white cursor-move touch-none"
                  >
                    <div className="absolute inset-0 border border-primary-container/60 pointer-events-none" />
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                <span>
                  Crop Frame Size ({isPassport ? 'Locked 35:45' : 'Locked 3:1'})
                </span>
                <span className="font-mono">{Math.round(cropScale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.35}
                max={1}
                step={0.02}
                value={cropScale}
                onChange={(e) => {
                  const nextScale = parseFloat(e.target.value);
                  setCropScale(nextScale);
                  const { cropW: nw, cropH: nh } = getCropDimensions(
                    imgRenderSize.w,
                    imgRenderSize.h,
                    nextScale
                  );
                  setCropPos((prev) =>
                    clampCropPos(
                      prev.x,
                      prev.y,
                      imgRenderSize.w,
                      imgRenderSize.h,
                      nw,
                      nh
                    )
                  );
                }}
                className="w-full accent-primary-container"
              />
              <p className="text-[11px] text-on-surface-variant text-center">
                {isPassport
                  ? 'Drag the frame to center the face. Output is exported at 420 × 540 px.'
                  : 'Drag the frame over the handwritten signature. Output is exported at 480 × 160 px.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setShowCropper(false)}
                className="px-4 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCrop}
                className="px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow cursor-pointer"
              >
                Crop &amp; Upload ({exportW}&times;{exportH})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
