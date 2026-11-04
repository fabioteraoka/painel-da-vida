"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { PaymentAccountApi } from "../types";

interface AddBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentAccounts: PaymentAccountApi[];
  people: { id: string; name: string }[];
  onAddBill: (data: {
    merchant: string;
    amount: number;
    dueDate: string;
    category: string;
    pixCode?: string;
    barcode?: string;
    paymentAccountId?: string;
    responsibleType: "ME" | "OTHER";
    responsibleName?: string;
  }) => Promise<void>;
}

export function AddBillModal({
  isOpen,
  onClose,
  paymentAccounts,
  people,
  onAddBill,
}: AddBillModalProps) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().split("T")[0];
  });
  const [category, setCategory] = useState("UTILITIES");
  const [pixCode, setPixCode] = useState("");
  const [barcode, setBarcode] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState(paymentAccounts[0]?.id || "");
  const [responsibleType, setResponsibleType] = useState<"ME" | "OTHER">("ME");
  const [responsibleName, setResponsibleName] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant.trim() || !amount) return;

    setLoading(true);
    try {
      const numAmount = parseFloat(amount.replace(",", "."));
      await onAddBill({
        merchant: merchant.trim(),
        amount: isNaN(numAmount) ? 0 : numAmount,
        dueDate,
        category,
        pixCode: pixCode.trim() || undefined,
        barcode: barcode.trim() || undefined,
        paymentAccountId: paymentAccountId || undefined,
        responsibleType,
        responsibleName: responsibleType === "OTHER" ? (responsibleName.trim() || "Outro") : "Fábio Teraoka",
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-bill-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl my-8 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#2e3f37]">
          <h3 id="add-bill-title" className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
            Cadastrar Nova Conta a Pagar
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#1e2b26]"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bill-merchant" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Concessionária / Beneficiário *
              </label>
              <input
                id="bill-merchant"
                type="text"
                required
                placeholder="Ex: Enel, Sabesp, Cartão XP..."
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              />
            </div>

            <div>
              <label htmlFor="bill-amount" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Valor (R$) *
              </label>
              <input
                id="bill-amount"
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bill-duedate" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Data de Vencimento *
              </label>
              <input
                id="bill-duedate"
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              />
            </div>

            <div>
              <label htmlFor="bill-category" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Categoria
              </label>
              <select
                id="bill-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              >
                <option value="UTILITIES">Consumo (Energia, Água, Gás)</option>
                <option value="CREDIT_CARD">Cartão de Crédito</option>
                <option value="HOUSING">Habitação / Condomínio / Aluguel</option>
                <option value="SERVICES">Internet / Telefonia / Assinaturas</option>
                <option value="TAX">Tributos e Impostos</option>
                <option value="OTHER">Outros</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bill-responsible" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Titular / Responsável
              </label>
              <select
                id="bill-responsible"
                value={responsibleType}
                onChange={(e) => setResponsibleType(e.target.value as "ME" | "OTHER")}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              >
                <option value="ME">Eu (Fábio Teraoka)</option>
                <option value="OTHER">Outra pessoa (Carol, etc.)</option>
              </select>
            </div>

            {responsibleType === "OTHER" && (
              <div>
                <label htmlFor="bill-person-name" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                  Nome do Titular
                </label>
                <input
                  id="bill-person-name"
                  type="text"
                  placeholder="Ex: Carol"
                  value={responsibleName}
                  onChange={(e) => setResponsibleName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="bill-pix" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
              Código PIX Copia e Cola (opcional)
            </label>
            <input
              id="bill-pix"
              type="text"
              placeholder="000201..."
              value={pixCode}
              onChange={(e) => setPixCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
            />
          </div>

          <div>
            <label htmlFor="bill-barcode" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
              Linha Digitável / Código de Barras (opcional)
            </label>
            <input
              id="bill-barcode"
              type="text"
              placeholder="34191.79001..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#2e3f37]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-[#2e3f37] dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !merchant.trim() || !amount}
              className="flex items-center gap-1.5 rounded-xl bg-[#00875f] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
            >
              <Plus size={14} />
              <span>{loading ? "Salvando..." : "Salvar Conta"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
