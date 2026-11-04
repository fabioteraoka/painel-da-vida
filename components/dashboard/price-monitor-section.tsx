"use client";

import {
  AlertCircle,
  ExternalLink,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatCurrency, type MonitoredProductApi } from "./types";

interface PriceMonitorSectionProps {
  products: MonitoredProductApi[];
  loading: boolean;
  onCheckPrices: () => void;
  checking: boolean;
  onDeleteProduct: (productId: string) => Promise<void>;
  deletingId: string | null;
  onOpenAddProduct: () => void;
  statusMessage: string | null;
}

export function PriceMonitorSection({
  products,
  loading,
  onCheckPrices,
  checking,
  onDeleteProduct,
  deletingId,
  onOpenAddProduct,
  statusMessage,
}: PriceMonitorSectionProps) {
  const opportunities = products.filter((p) => p.isOpportunity);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs transition-colors dark:border-[#2e3f37] dark:bg-[#17211d]">
      {/* Header & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-[#2e3f37]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
            <ShoppingCart size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
              Monitor de Preços
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#95a89f]">
              Acompanhamento inteligente de produtos e alertas de oportunidade
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCheckPrices}
            disabled={checking}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:hover:bg-[#263730]"
          >
            <RefreshCw size={13} className={checking ? "animate-spin text-purple-600" : ""} />
            <span>{checking ? "Verificando lojas..." : "Verificar Preços"}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddProduct}
            className="flex items-center gap-1.5 rounded-xl bg-[#00875f] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
          >
            <Plus size={14} />
            <span>Novo Produto</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="mt-3.5 rounded-2xl bg-purple-50 p-3 text-xs font-medium text-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
          {statusMessage}
        </div>
      )}

      {/* Opportunities Summary Alert */}
      {opportunities.length > 0 && (
        <div className="mt-3.5 flex items-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900 dark:border-emerald-700/60 dark:bg-[#17382d] dark:text-[#67d9ae]">
          <TrendingDown size={16} className="text-emerald-600 dark:text-[#67d9ae] shrink-0" />
          <span>
            {opportunities.length === 1
              ? "1 produto atingiu ou está abaixo da sua meta de preço!"
              : `${opportunities.length} produtos atingiram ou estão abaixo da sua meta de preço!`}
          </span>
        </div>
      )}

      {/* Products Grid */}
      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-purple-600" />
            <p className="mt-2 text-xs">Carregando monitor de produtos...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 dark:text-[#95a89f]">
            <ShoppingCart size={32} className="opacity-40" />
            <p className="mt-2 text-xs font-medium">Nenhum produto cadastrado para monitoramento de preço.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {products.map((prod) => {
              const hasPrice = prod.currentPrice !== null;
              const isUnderTarget = hasPrice && prod.currentPrice! <= prod.targetPrice;
              const isDeleting = deletingId === prod.id;

              return (
                <div
                  key={prod.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                    isUnderTarget
                      ? "border-emerald-400 bg-emerald-50/40 dark:border-emerald-700 dark:bg-[#17382d]/30"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#1e2b26]/50 dark:hover:bg-[#1e2b26]"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-[#e6ede9] line-clamp-2">
                        {prod.title}
                      </h3>
                      {isUnderTarget && (
                        <span className="shrink-0 flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                          <TrendingDown size={11} />
                          Oportunidade
                        </span>
                      )}
                    </div>

                    {prod.source && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-[#95a89f]">
                        {prod.source}
                      </p>
                    )}

                    {/* Price Comparison */}
                    <div className="mt-3 flex items-baseline justify-between rounded-xl bg-white p-3 shadow-2xs dark:bg-[#17211d]">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#95a89f]">
                          Preço Atual
                        </span>
                        <p className="text-lg font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
                          {hasPrice ? formatCurrency(prod.currentPrice!) : "Verificando..."}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#95a89f]">
                          Meta de Compra
                        </span>
                        <p className="text-sm font-semibold text-slate-600 dark:text-[#95a89f]">
                          {formatCurrency(prod.targetPrice)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-[#2e3f37]">
                    {prod.url ? (
                      <a
                        href={prod.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-semibold text-purple-600 hover:text-purple-800 transition dark:text-purple-400 dark:hover:text-purple-300"
                      >
                        <span>Ver na loja</span>
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Sem link direto</span>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteProduct(prod.id)}
                      disabled={isDeleting}
                      title="Excluir produto monitorado"
                      aria-label="Excluir produto monitorado"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
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
