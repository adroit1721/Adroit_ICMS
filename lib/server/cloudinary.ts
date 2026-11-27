import { v2 as cloudinary } from 'cloudinary';
import { CMSConfig, Exam, Notice, Student, Teacher } from '@/lib/types';

export type CloudinaryFolder =
  | 'erp/students'
  | 'erp/students-pending'
  | 'erp/teachers/avatars'
  | 'erp/teachers/signatures'
  | 'erp/cms'
  | 'erp/exams'
  | 'erp/notices';

export const ALLOWED_CLOUDINARY_FOLDERS = new Set<string>([
  'erp/students',
  'erp/students-pending',
  'erp/teachers/avatars',
  'erp/teachers/signatures',
  'erp/cms',
  'erp/exams',
  'erp/notices',
]);

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim()
  );
}

function configureCloudinary(): void {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    api_key: process.env.CLOUDINARY_API_KEY?.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
    secure: true,
  });
}

export interface UploadedCloudinaryAsset {
  secureUrl: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: CloudinaryFolder,
  resourceType: 'image' | 'auto' | 'raw' = 'image'
): Promise<UploadedCloudinaryAsset> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary environment variables are not configured.');
  }
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        overwrite: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload failed without result'));
          return;
        }
        resolve({
          secureUrl: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );
    stream.end(buffer);
  });
}

export function extractCloudinaryPublicId(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('res.cloudinary.com')) return null;
  const uploadMarker = '/upload/';
  const idx = url.indexOf(uploadMarker);
  if (idx === -1) return null;
  let rest = url.slice(idx + uploadMarker.length).split('?')[0];
  // Strip optional version prefix like v1700000000/
  rest = rest.replace(/^v\d+\//, '');
  // Strip file extension
  const lastDot = rest.lastIndexOf('.');
  if (lastDot > 0) {
    rest = rest.slice(0, lastDot);
  }
  return rest || null;
}

export async function destroyCloudinaryAsset(
  publicId?: string | null,
  fallbackUrl?: string | null
): Promise<boolean> {
  const targetId = publicId?.trim() || extractCloudinaryPublicId(fallbackUrl);
  if (!targetId || !isCloudinaryConfigured()) return false;
  configureCloudinary();
  const isRawUrl = Boolean(fallbackUrl && fallbackUrl.includes('/raw/upload/'));
  try {
    const primaryType = isRawUrl ? 'raw' : 'image';
    const result = await cloudinary.uploader.destroy(targetId, {
      invalidate: true,
      resource_type: primaryType,
    });
    if (result?.result === 'ok') return true;
    if (result?.result === 'not found' && !isRawUrl) {
      const rawRetry = await cloudinary.uploader.destroy(targetId, {
        invalidate: true,
        resource_type: 'raw',
      });
      return rawRetry?.result === 'ok' || rawRetry?.result === 'not found';
    }
    return result?.result === 'not found';
  } catch (err) {
    console.error('Cloudinary destroy failed for', targetId, err);
    return false;
  }
}

export async function destroyManyCloudinaryAssets(
  entries: Array<{ publicId?: string | null; url?: string | null }>
): Promise<void> {
  const seen = new Set<string>();
  const tasks: Array<Promise<boolean>> = [];
  for (const item of entries) {
    const id = item.publicId?.trim() || extractCloudinaryPublicId(item.url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tasks.push(destroyCloudinaryAsset(id));
  }
  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

export function collectCmsMediaIds(cms: Partial<CMSConfig>): Set<string> {
  const ids = new Set<string>();
  const add = (pid?: string, url?: string) => {
    const id = pid?.trim() || extractCloudinaryPublicId(url);
    if (id) ids.add(id);
  };
  add(cms.crestPublicId, cms.crestUrl);
  add(cms.faviconPublicId, cms.faviconUrl);
  add(cms.principalPhotoPublicId, cms.principalPhotoUrl);
  for (const slide of cms.heroSlides || []) {
    add(slide.imagePublicId, slide.imageUrl);
  }
  for (const card of cms.extraLeadershipCards || []) {
    add(card.photoPublicId, card.photoUrl);
  }
  return ids;
}

export function collectTeacherMediaEntries(teacher: Partial<Teacher>) {
  return [
    { publicId: teacher.avatarPublicId, url: teacher.avatarUrl },
    { publicId: teacher.signaturePublicId, url: teacher.signatureUrl },
  ];
}

export function collectStudentMediaEntries(student: Partial<Student>) {
  return [
    { publicId: student.avatarPublicId, url: student.avatarUrl },
    { publicId: student.updateRequest?.avatarPublicId, url: student.updateRequest?.avatarUrl },
  ];
}

export function collectExamMediaIds(exam: Partial<Exam>): Set<string> {
  const ids = new Set<string>();
  const add = (pid?: string, url?: string) => {
    const id = pid?.trim() || extractCloudinaryPublicId(url);
    if (id) ids.add(id);
  };
  add(exam.marksheetBgPublicId, exam.marksheetBgUrl);
  for (const sig of exam.signatories || []) {
    add(sig.signaturePublicId, sig.signatureImgUrl);
  }
  return ids;
}

export function collectNoticeMediaEntries(notice: Partial<Notice>) {
  return [{ publicId: notice.attachmentPublicId, url: notice.attachmentUrl }];
}
