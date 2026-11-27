'use client';

import { useState } from 'react';
import { useERPStore } from '@/lib/store';

export default function SmsTab() {
  const { isHydrated } = useERPStore();
  return <SmsTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function SmsTabInner() {
  const { state, updateSmsConfig, sendSmsBroadcast } = useERPStore();
  const { smsConfig, smsLogs, students, invoices, academicClasses, cmsConfig } = state;

  const [provider, setProvider] = useState(smsConfig.provider);
  const [senderId, setSenderId] = useState(smsConfig.senderId);
  const [endpointUrl, setEndpointUrl] = useState(smsConfig.endpointUrl);
  const [autoResultSms, setAutoResultSms] = useState(smsConfig.autoResultSms);
  const [autoFeeReceiptSms, setAutoFeeReceiptSms] = useState(smsConfig.autoFeeReceiptSms);

  const [targetGroup, setTargetGroup] = useState('ALL_GUARDIANS');
  const [message, setMessage] = useState(
    'Dear Guardian, please check the Student Portal for updated Term Examination schedules and academic circulars.'
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  const unpaidCount = invoices.filter((i) => i.status !== 'Paid').length;

  const getEstimatedRecipients = () => {
    if (targetGroup === 'ALL_GUARDIANS') return { label: 'All Active Student Guardians', count: students.length };
    if (targetGroup === 'UNPAID_FEES') return { label: 'Unpaid Fee Defaulters', count: unpaidCount };
    return { label: `${targetGroup} Guardians`, count: students.filter((s) => s.className === targetGroup).length };
  };

  const applyTemplate = (tpl: 'result' | 'due' | 'notice') => {
    if (tpl === 'result') {
      setMessage(
        `${cmsConfig.schoolName}: Examination results have been published! Search online using Roll & Captcha or view A4 Marksheet in Student Portal.`
      );
    } else if (tpl === 'due') {
      setMessage(
        'Dear Guardian, monthly tuition invoice is currently due. Kindly settle via bKash/Nagad/Rocket inside your Student Portal.'
      );
    } else {
      setMessage(
        'Important Notice: Campus academic schedule update posted. Please visit the official Notice Board for full circular details.'
      );
    }
  };

  const handleSaveGateway = (e: React.FormEvent) => {
    e.preventDefault();
    updateSmsConfig({
      provider,
      senderId,
      endpointUrl,
      autoResultSms,
      autoFeeReceiptSms,
    });
    setFeedback('SMS gateway settings and automated triggers saved.');
    setTimeout(() => setFeedback(null), 3200);
  };

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    const est = getEstimatedRecipients();
    if (!message.trim() || est.count === 0) return;
    sendSmsBroadcast(est.label, est.count, message.trim());
    setFeedback(`Dispatched SMS broadcast to ${est.count} recipient(s) in "${est.label}".`);
    setTimeout(() => setFeedback(null), 3200);
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      <div>
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
          Guardian &amp; Faculty Communication
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
          SMS Management &amp; Automated Alerts
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
          Configure SMS HTTP gateway (BulkSMSBD / SSL Wireless / Twilio), automate result &amp; fee alerts, and send targeted guardian broadcasts.
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Compose Broadcast */}
        <form
          onSubmit={handleSendBroadcast}
          className="lg:col-span-7 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-on-surface border-b border-outline-variant/20 pb-3">
            Send SMS Broadcast
          </h2>

          <div className="space-y-2 text-xs">
            <label className="block font-semibold text-on-surface-variant">Target Audience</label>
            <select
              value={targetGroup}
              onChange={(e) => setTargetGroup(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
            >
              <option value="ALL_GUARDIANS">All Active Guardians ({students.length} students)</option>
              <option value="UNPAID_FEES">Unpaid Fee Defaulters ({unpaidCount} pending invoices)</option>
              {academicClasses.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} Guardians Only
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-on-surface-variant font-medium self-center mr-1">Quick Templates:</span>
            <button
              type="button"
              onClick={() => applyTemplate('result')}
              className="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container font-semibold cursor-pointer"
            >
              Result Published
            </button>
            <button
              type="button"
              onClick={() => applyTemplate('due')}
              className="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container font-semibold cursor-pointer"
            >
              Fee Due Reminder
            </button>
            <button
              type="button"
              onClick={() => applyTemplate('notice')}
              className="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container font-semibold cursor-pointer"
            >
              General Notice
            </button>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-on-surface-variant">
              <label className="font-semibold">SMS Message Body</label>
              <span className="font-mono tabular-nums">{message.length} chars ({Math.ceil(message.length / 160)} SMS part)</span>
            </div>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={getEstimatedRecipients().count === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container hover:bg-primary disabled:opacity-50 text-on-primary text-xs font-bold shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              Dispatch SMS to {getEstimatedRecipients().count} Recipient(s)
            </button>
          </div>
        </form>

        {/* Gateway Config */}
        <form
          onSubmit={handleSaveGateway}
          className="lg:col-span-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-4 text-xs"
        >
          <h2 className="text-base font-bold text-on-surface border-b border-outline-variant/20 pb-3">
            Gateway API &amp; Triggers
          </h2>

          <div>
            <label className="block font-semibold text-on-surface-variant mb-1">SMS Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
            >
              <option value="BulkSMSBD">BulkSMSBD (Bangladesh Local)</option>
              <option value="SSLWireless">SSL Wireless (Masking / Non-Masking)</option>
              <option value="Twilio">Twilio Programmable SMS</option>
              <option value="CustomHTTP">Custom REST Webhook</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-on-surface-variant mb-1">Approved Sender ID / Mask</label>
            <input
              type="text"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
            />
          </div>

          <div>
            <label className="block font-semibold text-on-surface-variant mb-1">Provider API Endpoint</label>
            <input
              type="text"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono"
            />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoResultSms}
                onChange={(e) => setAutoResultSms(e.target.checked)}
              />
              <span className="font-semibold">Auto-send GPA summary SMS on Result Publication</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoFeeReceiptSms}
                onChange={(e) => setAutoFeeReceiptSms(e.target.checked)}
              />
              <span className="font-semibold">Auto-send Receipt confirmation on MFS fee payment</span>
            </label>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-secondary text-on-secondary font-bold cursor-pointer"
          >
            Save Gateway Configuration
          </button>
        </form>
      </div>

      {/* SMS Log Table */}
      <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20">
          <h3 className="text-sm font-bold text-on-surface">Recent SMS Dispatch History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant">
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold">Target Audience</th>
                <th className="py-3 px-4 font-semibold text-center">Recipients</th>
                <th className="py-3 px-4 font-semibold">Message</th>
                <th className="py-3 px-4 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15">
              {smsLogs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-container-low/40">
                  <td className="py-3 px-4 font-mono tabular-nums text-on-surface-variant whitespace-nowrap">
                    {log.sentAt}
                  </td>
                  <td className="py-3 px-4 font-semibold text-on-surface">{log.recipientGroup}</td>
                  <td className="py-3 px-4 text-center font-mono font-bold tabular-nums">{log.recipientCount}</td>
                  <td className="py-3 px-4 text-on-surface-variant max-w-md">{log.message}</td>
                  <td className="py-3 px-4 text-right font-semibold text-emerald-800">{log.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
