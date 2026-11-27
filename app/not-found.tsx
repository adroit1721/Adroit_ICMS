import Link from 'next/link';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-on-surface flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-8 text-center space-y-5 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-primary-fixed/50 text-primary-container flex items-center justify-center mx-auto">
          <FileQuestion className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Page Not Found</h1>
          <p className="text-sm text-on-surface-variant">
            The page you requested could not be found or has been moved.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary text-sm font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return Home</span>
        </Link>
      </div>
    </div>
  );
}
