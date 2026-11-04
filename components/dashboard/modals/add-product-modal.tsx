"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (data: {
    title: string;
    targetPrice: number;
    url?: string;
    source?: string;
  }) => Promise<void>;
}

export function AddProductModal({
  isOpen,
  onClose,
  onAddProduct,
}: AddProductModalProps) {
  const [title, setTitle] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetPrice) return;

    setLoading(true);
    try {
      const numTarget = parseFloat(targetPrice.replace(",", "."));
      await onAddProduct({
        title: title.trim(),
        targetPrice: isNaN(numTarget) ? 0 : numTarget,
        url: url.trim() || undefined,
        source: source.trim() || undefined,
      });
      setTitle("");
      setTargetPrice("");
      setUrl("");
      setSource("");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-product-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#2e3f37]">
          <h3 id="add-product-title" className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
            Monitorar Novo Produto
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
          <div>
            <label htmlFor="product-title" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
              Nome do Produto *
            </label>
            <input
              id="product-title"
              type="text"
              required
              placeholder="Ex: Fone de Ouvido Sony WH-1000XM5, Monitor 4K..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="product-target-price" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Preço Meta (R$) *
              </label>
              <input
                id="product-target-price"
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              />
            </div>

            <div>
              <label htmlFor="product-source" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Loja / Fonte
              </label>
              <input
                id="product-source"
                type="text"
                placeholder="Amazon, Mercado Livre..."
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="product-url" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
              Link do Produto (URL HTTPS)
            </label>
            <input
              id="product-url"
              type="url"
              placeholder="https://www.amazon.com.br/dp/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
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
              disabled={loading || !title.trim() || !targetPrice}
              className="flex items-center gap-1.5 rounded-xl bg-[#00875f] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
            >
              <Plus size={14} />
              <span>{loading ? "Salvando..." : "Adicionar Monitor"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
