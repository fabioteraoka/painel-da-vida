"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatDueDate, type BillApi } from "./types";

interface BillsSectionProps {
  bills: BillApi[];
  loading: boolean;
  onScanBills: () => void;
  scanning: boolean;
  onOpenAddBill: () => void;
  onUpdateStatus: (billId: string, status: BillApi["status"]) => Promise<void>;
  statusMessage: string | null;
}

export function BillsSection({
  bills,
  loading,
  onScanBills,
  scanning,
  onOpenAddBill,
  onUpdateStatus,
  statusMessage,
}: BillsSectionProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Fallback
    }
  };

  // Bills due in 3 days or less
  const now = new Date();
  const threeDaysAhead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const urgentBills = bills.filter((b) => {
    if (b.status === "PAID" || b.status === "IGNORED" || !b.dueDate) return false;
    const d = new Date(b.dueDate);
    return d <= threeDaysAhead;
  });

  const getStatusBadge = (status: BillApi["status"]) => {
    switch (status) {
      case "PAID":
        return { label: "Pago", class: "bg-emerald-100 text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]" };
      case "CONFIRMED":
        return { label: "Confirmado", class: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" };
      case "SCHEDULED":
        return { label: "Agendado", class: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300" };
      case "IGNORED":
        return { label: "Ignorado", class: "bg-slate-100 text-slate-600 dark:bg-[#1e2b26] dark:text-[#95a89f]" };
      case "NEEDS_REVIEW":
      default:
        return { label: "Revisar", class: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" };
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs transition-colors dark:border-[#2e3f37] dark:bg-[#17211d]">
      {/* Header & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-[#2e3f37]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <DollarSign size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
              Contas e Faturas a Pagar
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#95a89f]">
              Boletos e faturas identificados nos e-mails com PIX e código de barras
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onScanBills}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:hover:bg-[#263730]"
          >
            <RefreshCw size={13} className={scanning ? "animate-spin text-[#00875f] dark:text-[#00b37e]" : ""} />
            <span>{scanning ? "Escaneando e-mails..." : "Escanear Faturas"}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddBill}
            className="flex items-center gap-1.5 rounded-xl bg-[#00875f] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
          >
            <Plus size={14} />
            <span>Nova Conta</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="mt-3.5 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
          <CheckCircle2 size={15} />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Urgent Warning Banner */}
      {urgentBills.length > 0 && (
        <div className="mt-3.5 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Atenção aos vencimentos próximos nos próximos 3 dias:</span>
          </div>
          <div className="mt-1 space-y-1 pl-6">
            {urgentBills.map((b) => (
              <p key={b.id}>
                <strong>{b.merchant || b.subject}</strong> — {b.amount ? formatCurrency(b.amount) : "Valor não informado"} (Vence {formatDueDate(b.dueDate)})
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Bills List */}
      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#00875f] dark:border-[#2e3f37] dark:border-t-[#00b37e]" />
            <p className="mt-2 text-xs">Carregando contas e faturas...</p>
          </div>
        ) : bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 dark:text-[#95a89f]">
            <CreditCard size={32} className="opacity-40" />
            <p className="mt-2 text-xs font-medium">Nenhuma conta cadastrada ou detectada nos e-mails.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bills.map((bill) => {
              const statusBadge = getStatusBadge(bill.status);
              const isUrgent = urgentBills.some((ub) => ub.id === bill.id);

              return (
                <div
                  key={bill.id}
                  className={`rounded-2xl border p-4 transition ${
                    isUrgent
                      ? "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#1e2b26]/50 dark:hover:bg-[#1e2b26]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-[#e6ede9]">
                          {bill.merchant || bill.subject}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusBadge.class}`}>
                          {statusBadge.label}
                        </span>
                        {bill.responsibleName && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-[#263730] dark:text-[#e6ede9]">
                            {bill.responsibleName}
                          </span>
                        )}
                        {bill.paymentAccount && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-[#1e2b26] dark:text-[#95a89f]">
                            {bill.paymentAccount.name}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
                          {bill.amount !== null ? formatCurrency(bill.amount) : "R$ —"}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-[#95a89f]">
                          Vencimento: {formatDueDate(bill.dueDate)}
                        </span>
                      </div>

                      {bill.subject && bill.merchant && bill.subject !== bill.merchant && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-[#95a89f] line-clamp-1">
                          {bill.subject}
                        </p>
                      )}
                    </div>

                    {/* Status Changer */}
                    <div className="shrink-0">
                      <select
                        value={bill.status}
                        onChange={(e) => onUpdateStatus(bill.id, e.target.value as BillApi["status"])}
                        className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                      >
                        <option value="NEEDS_REVIEW">Precisa de Revisão</option>
                        <option value="CONFIRMED">Confirmado</option>
                        <option value="SCHEDULED">Agendado</option>
                        <option value="PAID">Pago</option>
                        <option value="IGNORED">Ignorado</option>
                      </select>
                    </div>
                  </div>

                  {/* Payment Quick Actions (PIX & Barcode) */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200/60 dark:border-[#2e3f37]">
                    {bill.pixCode && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bill.pixCode!, `pix-${bill.id}`)}
                        className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]"
                      >
                        {copiedId === `pix-${bill.id}` ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedId === `pix-${bill.id}` ? "PIX Copiado!" : "Copiar PIX Copia e Cola"}</span>
                      </button>
                    )}

                    {bill.barcode && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(bill.barcode!, `bar-${bill.id}`)}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                      >
                        {copiedId === `bar-${bill.id}` ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedId === `bar-${bill.id}` ? "Código Copiado!" : "Copiar Linha Digitável"}</span>
                      </button>
                    )}

                    {bill.paymentUrl && (
                      <a
                        href={bill.paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <span>Abrir 2ª via / Pagamento</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
