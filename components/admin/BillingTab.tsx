'use client';

import { useEffect, useState } from 'react';
import { Receipt, ShieldCheck } from 'lucide-react';
import { useERPStore } from '@/lib/store';
import { StudentInvoice } from '@/lib/types';
import DualCopyPaymentReceiptModal from '@/components/common/DualCopyPaymentReceiptModal';

export default function BillingTab() {
  const { isHydrated } = useERPStore();
  return <BillingTabInner key={isHydrated ? 'hydrated' : 'ssr'} />;
}

function BillingTabInner() {
  const {
    state,
    recordFeePayment,
    generateBulkInvoices,
    updateMfsConfig,
  } = useERPStore();
  const { invoices, students, admissions, cmsConfig, mfsConfig, academicClasses } = state;

  const [subTab, setSubTab] = useState<'ledger' | 'gateway'>('ledger');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<StudentInvoice | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [mfsCaps, setMfsCaps] = useState<{
    bkashLive: boolean;
    nagadLive: boolean;
    rocketLive: boolean;
    smsLive: boolean;
  } | null>(null);

  useEffect(() => {
    fetch('/api/payments/mfs', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok && d.capabilities) setMfsCaps(d.capabilities);
      })
      .catch(() => undefined);
  }, []);

  // Collect form state
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id || '');
  const [feeMonth, setFeeMonth] = useState('November 2024');
  const [amountPayable, setAmountPayable] = useState(mfsConfig.defaultMonthlyFee || 2400);
  const [paymentMethod, setPaymentMethod] = useState<'bKash' | 'Nagad' | 'Rocket' | 'Bank' | 'Cash'>('bKash');
  const [transactionId, setTransactionId] = useState('');

  // Bulk generate state
  const [bulkClass, setBulkClass] = useState('ALL');
  const [bulkMonth, setBulkMonth] = useState('November 2024');
  const [bulkAmount, setBulkAmount] = useState(mfsConfig.defaultMonthlyFee || 2400);

  // MFS API config form state
  const [gatewayDraft, setGatewayDraft] = useState(mfsConfig);

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const totalInvoiced = invoices.reduce((acc, i) => acc + i.totalPayable, 0);
  const totalCollected = invoices.reduce((acc, i) => acc + i.paidAmount, 0);
  const totalOutstanding = Math.max(0, totalInvoiced - totalCollected);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    const matchesSearch =
      inv.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.rollNumber.toString() === searchTerm;
    return matchesStatus && matchesSearch;
  });

  const handleCollectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trx =
      transactionId.trim() ||
      `${paymentMethod.toUpperCase()}-${Math.floor(10000000 + Math.random() * 89999999)}`;
    const created = recordFeePayment({
      studentId: selectedStudentId,
      month: feeMonth,
      amount: amountPayable,
      method: paymentMethod,
      transactionId: trx,
    });
    setShowCollectModal(false);
    setTransactionId('');
    if (created) {
      setReceiptInvoice(created);
      showToast(`Recorded ৳${created.paidAmount} via ${paymentMethod} for ${created.studentName}.`);
    }
  };

  const handleBulkGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const count = generateBulkInvoices(bulkClass, bulkMonth, bulkAmount);
    setShowBulkModal(false);
    showToast(
      count > 0
        ? `Generated ${count} new monthly invoice(s) for ${bulkMonth}.`
        : `All active students in selection already have an invoice for ${bulkMonth}.`
    );
  };

  const handleSaveGateway = (e: React.FormEvent) => {
    e.preventDefault();
    updateMfsConfig(gatewayDraft);
    showToast('bKash, Nagad & Rocket API merchant settings saved. Live inside Student Portal.');
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
        <div>
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary-container font-semibold">
            Institutional Accounts &amp; Private Student Billing
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
            Student Fee Ledger &amp; bKash / Nagad / Rocket API
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Synced live with the private Student Portal checkout, bulk monthly invoicing, and MFS API merchant configuration.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/30">
            <button
              type="button"
              onClick={() => setSubTab('ledger')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                subTab === 'ledger' ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant'
              }`}
            >
              Account Ledger
            </button>
            <button
              type="button"
              onClick={() => setSubTab('gateway')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                subTab === 'gateway' ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant'
              }`}
            >
              bKash / Nagad / Rocket API
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowBulkModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>
            Bulk Generate Dues
          </button>

          <button
            type="button"
            onClick={() => setShowCollectModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-xs shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add_card</span>
            Collect Payment
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 no-print">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{feedback}</span>
        </div>
      )}

      {/* Live KPI Financial Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 no-print">
        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-on-surface-variant">Total Invoiced</span>
            <div className="text-2xl font-bold font-mono tabular-nums text-on-surface mt-1">
              ৳{totalInvoiced.toLocaleString()}.00
            </div>
            <span className="text-[11px] text-on-surface-variant">{invoices.length} invoices</span>
          </div>
          <span className="p-3 rounded-xl bg-surface-container text-primary-container material-symbols-outlined text-[24px]">
            receipt_long
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-on-surface-variant">Total Collected</span>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-800 mt-1">
              ৳{totalCollected.toLocaleString()}.00
            </div>
            <span className="text-[11px] text-emerald-800 font-semibold">Live Portal &amp; Counter Synced</span>
          </div>
          <span className="p-3 rounded-xl bg-emerald-50 text-emerald-800 material-symbols-outlined text-[24px]">
            payments
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-on-surface-variant">Outstanding Dues</span>
            <div className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
              ৳{totalOutstanding.toLocaleString()}.00
            </div>
            <span className="text-[11px] text-on-surface-variant">
              {invoices.filter((i) => i.status !== 'Paid').length} Unpaid Account(s)
            </span>
          </div>
          <span className="p-3 rounded-xl bg-red-50 text-red-700 material-symbols-outlined text-[24px]">
            warning
          </span>
        </div>
      </div>

      {subTab === 'ledger' && (
        <>
          {/* Filter and Search Bar */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-4 flex flex-col md:flex-row items-center justify-between gap-4 no-print">
            <div className="relative w-full md:w-80">
              <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-on-surface-variant text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search invoice #, roll, or student name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-on-surface-variant font-medium">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs text-on-surface"
              >
                <option value="all">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
                <option value="Unpaid">Unpaid / Due</option>
              </select>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 overflow-hidden no-print">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Invoice No</th>
                    <th className="py-3 px-4">Student &amp; Roll</th>
                    <th className="py-3 px-4">Month / Session</th>
                    <th className="py-3 px-4">Payable</th>
                    <th className="py-3 px-4">Paid</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">TrxID / Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 text-on-surface">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-surface-container-low/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-primary-container tabular-nums">
                        {inv.invoiceNo}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold block">{inv.studentName}</span>
                        <span className="text-[11px] text-on-surface-variant font-mono">
                          Roll #{inv.rollNumber} • {inv.className} ({inv.sectionName})
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium">{inv.month}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {inv.feeCategory && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                inv.feeCategory === 'Re-admission'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : inv.feeCategory === 'Admission'
                                  ? 'bg-sky-100 text-sky-900'
                                  : 'bg-surface-container text-on-surface-variant'
                              }`}
                            >
                              {inv.feeCategory}
                            </span>
                          )}
                          {inv.smsNotifiedAt && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-900 text-[10px] font-semibold">
                              SMS Logged
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums">৳{inv.totalPayable}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-800 tabular-nums">
                        ৳{inv.paidAmount}
                      </td>
                      <td className="py-3.5 px-4 font-semibold">{inv.paymentMethod || '—'}</td>
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        {inv.transactionId ? (
                          <div>
                            <span className="font-bold text-on-surface block">{inv.transactionId}</span>
                            <span className="text-on-surface-variant text-[10px]">{inv.paymentDate}</span>
                          </div>
                        ) : (
                          <span className="text-red-700 font-bold">Awaiting Payment</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-semibold">
                        <span className={inv.status === 'Paid' ? 'text-emerald-800' : 'text-red-700'}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setReceiptInvoice(inv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-semibold cursor-pointer"
                            title="Print Half-and-Half Dual-Copy A4 Receipt"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            Dual Receipt
                          </button>
                          {inv.status !== 'Paid' && (
                            <button
                              type="button"
                              onClick={() => {
                                const remaining = Math.max(0, inv.totalPayable - (inv.paidAmount || 0));
                                const settled = recordFeePayment({
                                  invoiceId: inv.id,
                                  studentId: inv.studentId,
                                  month: inv.month,
                                  amount: remaining > 0 ? remaining : inv.totalPayable,
                                  method: 'Cash',
                                  transactionId: `CASH-${Date.now().toString().slice(-6)}`,
                                });
                                if (settled) setReceiptInvoice(settled);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold cursor-pointer"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MFS GATEWAY CONFIGURATION PANEL */}
      {subTab === 'gateway' && (
        <form
          onSubmit={handleSaveGateway}
          className="rounded-2xl bg-surface-container-lowest border border-outline-variant/25 p-6 space-y-6 text-xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/20 pb-4">
            <div>
              <h2 className="text-base font-bold text-on-surface">
                Bangladesh MFS Gateway Integration (bKash · Nagad · Rocket)
              </h2>
              <p className="text-on-surface-variant mt-0.5">
                Configure merchant credentials used when authenticated students pay tuition inside their Student Portal.
              </p>
            </div>
            <div>
              <label className="block font-semibold text-on-surface-variant mb-1">Default Tuition Fee (৳)</label>
              <input
                type="number"
                value={gatewayDraft.defaultMonthlyFee}
                onChange={(e) =>
                  setGatewayDraft({
                    ...gatewayDraft,
                    defaultMonthlyFee: parseInt(e.target.value, 10) || 2400,
                  })
                }
                className="w-32 px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold"
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/25 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold text-on-surface">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Server MFS &amp; SMS Gateway Readiness:{' '}
                <strong>bKash</strong> ({mfsCaps?.bkashLive ? 'Live API Keys Loaded' : 'Manual TrxID Mode'}) &bull;{' '}
                <strong>Nagad</strong> ({mfsCaps?.nagadLive ? 'Live API Keys Loaded' : 'Manual TrxID Mode'}) &bull;{' '}
                <strong>Rocket</strong> ({mfsCaps?.rocketLive ? 'Live API Keys Loaded' : 'Manual TrxID Mode'}) &bull;{' '}
                <strong>SMS Dispatch</strong> ({mfsCaps?.smsLive ? 'API Active' : 'Audit Log Queue'})
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant">
              Add merchant secrets in server environment variables to switch from Manual TrxID to automated tokenized checkout.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* bKash */}
            <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant/25 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-pink-700">bKash Merchant API</h3>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gatewayDraft.bkash.enabled}
                    onChange={(e) =>
                      setGatewayDraft({
                        ...gatewayDraft,
                        bkash: { ...gatewayDraft.bkash, enabled: e.target.checked },
                      })
                    }
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <div>
                <label className="block font-semibold mb-1">Merchant Wallet</label>
                <input
                  type="text"
                  value={gatewayDraft.bkash.merchantNumber}
                  onChange={(e) =>
                    setGatewayDraft({
                      ...gatewayDraft,
                      bkash: { ...gatewayDraft.bkash, merchantNumber: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">App Key Identifier</label>
                <input
                  type="text"
                  value={gatewayDraft.bkash.appKey}
                  onChange={(e) =>
                    setGatewayDraft({
                      ...gatewayDraft,
                      bkash: { ...gatewayDraft.bkash, appKey: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono"
                />
              </div>
            </div>

            {/* Nagad */}
            <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant/25 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-orange-700">Nagad Merchant API</h3>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gatewayDraft.nagad.enabled}
                    onChange={(e) =>
                      setGatewayDraft({
                        ...gatewayDraft,
                        nagad: { ...gatewayDraft.nagad, enabled: e.target.checked },
                      })
                    }
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <div>
                <label className="block font-semibold mb-1">Merchant Wallet</label>
                <input
                  type="text"
                  value={gatewayDraft.nagad.merchantNumber}
                  onChange={(e) =>
                    setGatewayDraft({
                      ...gatewayDraft,
                      nagad: { ...gatewayDraft.nagad, merchantNumber: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Merchant ID</label>
                <input
                  type="text"
                  value={gatewayDraft.nagad.merchantId}
                  onChange={(e) =>
                    setGatewayDraft({
                      ...gatewayDraft,
                      nagad: { ...gatewayDraft.nagad, merchantId: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono"
                />
              </div>
            </div>

            {/* Rocket */}
            <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant/25 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-purple-800">DBBL Rocket Biller</h3>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gatewayDraft.rocket.enabled}
                    onChange={(e) =>
                      setGatewayDraft({
                        ...gatewayDraft,
                        rocket: { ...gatewayDraft.rocket, enabled: e.target.checked },
                      })
                    }
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <div>
                <label className="block font-semibold mb-1">Merchant Account</label>
                <input
                  type="text"
                  value={gatewayDraft.rocket.merchantNumber}
                  onChange={(e) =>
                    setGatewayDraft({
                      ...gatewayDraft,
                      rocket: { ...gatewayDraft.rocket, merchantNumber: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Biller ID</label>
                <input
                  type="text"
                  value={gatewayDraft.rocket.billerId}
                  onChange={(e) =>
                    setGatewayDraft({
                      ...gatewayDraft,
                      rocket: { ...gatewayDraft.rocket, billerId: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-outline-variant/30 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold cursor-pointer"
            >
              Save MFS Gateway Configuration
            </button>
          </div>
        </form>
      )}

      {/* Bulk Generate Monthly Invoices Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs no-print">
          <div className="bg-surface-container-lowest rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/15">
              <h3 className="text-base font-bold text-on-surface">Generate Monthly Tuition Invoices</h3>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="p-1.5 rounded-full hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <form onSubmit={handleBulkGenerate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-on-surface-variant mb-1">Target Class</label>
                <select
                  value={bulkClass}
                  onChange={(e) => setBulkClass(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-semibold"
                >
                  <option value="ALL">All Active Classes ({students.length} students)</option>
                  {academicClasses.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">Billing Month</label>
                  <input
                    type="text"
                    required
                    value={bulkMonth}
                    onChange={(e) => setBulkMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-on-surface-variant mb-1">Fee Amount (৳)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={bulkAmount}
                    onChange={(e) => setBulkAmount(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 font-mono font-bold"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowBulkModal(false)} className="px-4 py-2 rounded-xl cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-secondary text-on-secondary font-bold cursor-pointer">
                  Issue Invoices
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collect Payment Modal */}
      {showCollectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs no-print">
          <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/15">
              <h3 className="font-title-lg text-title-lg font-bold text-on-surface">
                Collect Student Fee &amp; Record MFS
              </h3>
              <button
                type="button"
                onClick={() => setShowCollectModal(false)}
                className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCollectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Select Student
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-semibold"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      Roll #{s.rollNumber} - {s.fullName} ({s.className})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Billing Month
                  </label>
                  <input
                    type="text"
                    value={feeMonth}
                    onChange={(e) => setFeeMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Payable Amount (৳)
                  </label>
                  <input
                    type="number"
                    value={amountPayable}
                    onChange={(e) => setAmountPayable(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-sm font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {(['bKash', 'Nagad', 'Rocket', 'Bank', 'Cash'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        paymentMethod === m
                          ? 'bg-primary-container text-on-primary border-primary-container shadow-xs'
                          : 'bg-surface-container-low border-outline-variant/30 text-on-surface'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  MFS / Bank Transaction ID (TrxID)
                </label>
                <input
                  type="text"
                  placeholder="Leave blank to auto-generate reference"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-outline-variant/15">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary-container text-on-primary text-xs font-bold shadow-md hover:bg-primary cursor-pointer"
                >
                  Record Payment &amp; Issue Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Single-Page A4 Dual-Copy Money Receipt Modal */}
      {receiptInvoice && (
        <DualCopyPaymentReceiptModal
          cmsConfig={cmsConfig}
          invoice={receiptInvoice}
          application={
            receiptInvoice.applicationId
              ? admissions.find((a) => a.id === receiptInvoice.applicationId) || null
              : null
          }
          onClose={() => setReceiptInvoice(null)}
        />
      )}
    </div>
  );
}
