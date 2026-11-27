'use client';

import { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { CloudinaryFolder } from '@/lib/server/cloudinary';

interface MediaUploadInputProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onChangeMedia?: (media: { url: string; publicId?: string }) => void;
  folder?: CloudinaryFolder;
  cloudinaryCloudName?: string;
  cloudinaryUploadPreset?: string;
  placeholder?: string;
  helperText?: string;
  previewShape?: 'square' | 'wide' | 'icon';
  maxWidth?: number;
  buttonLabel?: string;
}

export default function MediaUploadInput({
  label,
  value,
  onChange,
  onChangeMedia,
  folder = 'erp/cms',
  placeholder = 'https://res.cloudinary.com/... or click Upload',
  helperText,
  previewShape = 'square',
  buttonLabel = 'Upload Photo',
}: MediaUploadInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTempPublicIdRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatusMsg(null);
    setErrorMsg(null);
    setImgFailed(false);

    try {
      const body = new FormData();
      body.append('file', file);
      body.append('folder', folder);
      if (lastTempPublicIdRef.current) {
        body.append('discardTempPublicId', lastTempPublicIdRef.current);
      }

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'erp-client',
        },
        body,
      });

      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      if (rawText && !rawText.trim().startsWith('<')) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          data = {};
        }
      }
      if (res.ok && typeof data.url === 'string' && data.url) {
        lastTempPublicIdRef.current = typeof data.publicId === 'string' ? data.publicId : null;
        onChange(data.url);
        onChangeMedia?.({
          url: data.url,
          publicId: typeof data.publicId === 'string' ? data.publicId : undefined,
        });
        setStatusMsg('Hosted on Cloudinary');
      } else {
        setErrorMsg(
          (typeof data.error === 'string' && data.error) ||
            'Cloudinary upload failed. Check server environment keys.'
        );
      }
    } catch {
      setErrorMsg('Upload request failed. Verify network connection and Cloudinary configuration.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const previewClass =
    previewShape === 'wide'
      ? 'w-28 h-16 rounded-lg'
      : previewShape === 'icon'
      ? 'w-11 h-11 rounded-lg'
      : 'w-14 h-14 rounded-xl';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
          {label}
        </label>
        {statusMsg && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {statusMsg}
          </span>
        )}
        {errorMsg && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-error">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[260px]" title={errorMsg}>
              {errorMsg}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`${previewClass} bg-surface-container-low border border-outline-variant/30 overflow-hidden flex items-center justify-center shrink-0`}
        >
          {value && !imgFailed ? (
            <img
              src={value}
              alt={label}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-contain bg-white"
              referrerPolicy="no-referrer"
            />
          ) : (
            <ImageIcon className="w-5 h-5 text-on-surface-variant/60" />
          )}
        </div>

        <div className="flex-1 flex flex-col sm:flex-row gap-2 min-w-0">
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setImgFailed(false);
              setErrorMsg(null);
              const val = e.target.value;
              onChange(val);
              onChangeMedia?.({ url: val, publicId: val.trim() ? undefined : '' });
            }}
            placeholder={placeholder}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 text-xs font-mono text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/20 focus:bg-white"
          />
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.ico"
            onChange={handleFilePick}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-outline-variant/30 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60 transition-colors"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4 text-primary-container" />
            )}
            <span>{uploading ? 'Uploading...' : buttonLabel}</span>
          </button>
        </div>
      </div>

      {helperText && <p className="text-[11px] text-on-surface-variant">{helperText}</p>}
    </div>
  );
}
