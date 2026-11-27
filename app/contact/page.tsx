'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';
import PublicShell from '@/components/public/PublicShell';

function ContactContent() {
  const { state } = useERPStore();
  const { cmsConfig } = state;
  const contactCfg = cmsConfig.contactPageConfig;
  const showForm = contactCfg?.showInquiryForm !== false;

  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderName.trim() || !senderEmail.trim() || !message.trim()) return;
    setSent(true);
    setSenderName('');
    setSenderEmail('');
    setSubject('');
    setMessage('');
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-10">
      <section className="rounded-[2rem] bg-white/80 backdrop-blur-2xl border border-outline-variant/25 shadow-[0_16px_40px_-8px_rgba(19,27,46,0.05)] p-8 sm:p-12 space-y-3">
        <span className="inline-block px-3 py-1 rounded-full bg-primary-fixed/60 text-primary-container font-label-sm text-xs uppercase tracking-widest font-semibold">
          Campus Helpdesk &amp; Inquiries
        </span>
        <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
          {contactCfg?.heading || `Contact ${cmsConfig.schoolName}`}
        </h1>
        <p className="text-sm text-on-surface-variant max-w-2xl">
          Reach our Registrar&apos;s Office, Admissions Desk, or Academic Administration during official working hours (
          {contactCfg?.officeHours || 'Sunday – Thursday, 08:00 AM – 04:00 PM'}).
        </p>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className={`${showForm ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-4`}>
          <div className="p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-outline-variant/25 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-fixed/60 text-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">location_on</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">Campus Address</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">{cmsConfig.address}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-fixed/60 text-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">call</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">Phone &amp; Helpline</h3>
                <p className="text-xs text-on-surface-variant font-mono mt-0.5">{cmsConfig.phone}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-tertiary-fixed/60 text-tertiary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[20px]">mail</span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">Official Email</h3>
                <p className="text-xs text-on-surface-variant font-mono mt-0.5">{cmsConfig.email}</p>
              </div>
            </div>

            {contactCfg?.officeHours && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-container-low text-primary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">schedule</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Office Working Hours</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">{contactCfg.officeHours}</p>
                </div>
              </div>
            )}

            {contactCfg?.mapNote && (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-container-low text-secondary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">directions</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Directions &amp; Campus Access</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">{contactCfg.mapNote}</p>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-outline-variant/20 flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full bg-surface-container-low text-[11px] font-mono font-semibold text-on-surface">
                {cmsConfig.eiin}
              </span>
              <span className="px-3 py-1 rounded-full bg-surface-container-low text-[11px] font-mono font-semibold text-on-surface">
                {cmsConfig.boardCode}
              </span>
            </div>
          </div>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-7 rounded-[2rem] bg-white/85 backdrop-blur-2xl border border-outline-variant/25 shadow-sm p-6 sm:p-8 space-y-4"
          >
            <h2 className="text-lg font-bold text-on-surface border-b border-outline-variant/20 pb-3">
              Send an Inquiry to Administration
            </h2>

            {sent && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>Your inquiry has been received. Our office will respond within 1 working day.</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface block">Your Name *</label>
                <input
                  type="text"
                  required
                  value={senderName}
                  onChange={(e) => {
                    setSenderName(e.target.value);
                    setSent(false);
                  }}
                  placeholder="Guardian / Visitor Name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-on-surface block">Email Address *</label>
                <input
                  type="email"
                  required
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface block">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Admission Query, Transcript Verification"
                className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface block">Message *</label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your inquiry..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/60 bg-surface-container-low text-sm focus:outline-hidden focus:ring-2 focus:ring-primary-container"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-full bg-primary-container hover:bg-primary text-on-primary text-xs font-semibold shadow-sm cursor-pointer transition-colors"
            >
              Submit Message
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export default function ContactPage() {
  return (
    <PublicShell activePath="/contact">
      <ContactContent />
    </PublicShell>
  );
}
