import { NextRequest, NextResponse } from 'next/server';
import {
  ALLOWED_CLOUDINARY_FOLDERS,
  CloudinaryFolder,
  destroyCloudinaryAsset,
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
} from '@/lib/server/cloudinary';
import {
  assertTrustedOrigin,
  getSessionFromRequest,
  isAdminSession,
} from '@/lib/server/security';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'application/pdf',
]);

export async function POST(req: NextRequest) {
  if (!assertTrustedOrigin(req)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required to upload media.' }, { status: 401 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      {
        error:
          'Cloudinary environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are not configured on the server.',
      },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const folderRaw = String(formData.get('folder') || 'erp/cms').trim();
    const discardTempPublicId = String(formData.get('discardTempPublicId') || '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No media file attached.' }, { status: 400 });
    }

    if (!ALLOWED_CLOUDINARY_FOLDERS.has(folderRaw)) {
      return NextResponse.json({ error: 'Invalid target media folder.' }, { status: 400 });
    }

    const folder = folderRaw as CloudinaryFolder;

    // Enforce portal-level folder permissions
    if (session.portal === 'student' && folder !== 'erp/students-pending') {
      return NextResponse.json(
        { error: 'Students may only upload profile update photos.' },
        { status: 403 }
      );
    }
    if (session.portal === 'teacher' && folder !== 'erp/teachers/avatars' && folder !== 'erp/teachers/signatures') {
      return NextResponse.json({ error: 'Permission denied for this media folder.' }, { status: 403 });
    }
    if (session.portal === 'admin' && !isAdminSession(session)) {
      return NextResponse.json({ error: 'Admin role required.' }, { status: 403 });
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File must be smaller than 5 MB.' },
        { status: 400 }
      );
    }

    const mime = file.type.toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload JPG, PNG, WebP, SVG, ICO, or PDF.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const resourceType = mime === 'application/pdf' ? 'raw' : 'image';

    const uploaded = await uploadBufferToCloudinary(buffer, folder, resourceType);

    // Clean up an unsaved temporary upload replaced inside the same form session
    if (discardTempPublicId && discardTempPublicId.startsWith(`${folder}/`)) {
      await destroyCloudinaryAsset(discardTempPublicId);
    }

    return NextResponse.json({
      url: uploaded.secureUrl,
      publicId: uploaded.publicId,
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to upload media to Cloudinary' },
      { status: 500 }
    );
  }
}
