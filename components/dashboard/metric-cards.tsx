"use client";

import {
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Mail,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import { formatCurrency } from "./types";

interface MetricCardsProps {
  eventsCount: number;
  pendingTasksCount: number;
  highPriorityTasksCount: number;
  billsCount: number;
  billsTotalAmount: number;
  productsCount: number;
  opportunitiesCount: number;
  accountsCount: number;
  onSelectTab?: (tab: string) => void;
}

export function MetricCards({
  eventsCount,
  pendingTasksCount,
  highPriorityTasksCount,
  billsCount,
  billsTotalAmount,
  productsCount,
  opportunitiesCount,
  accountsCount,
}: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {/* Compromissos */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-sm dark:border-[#2e3f37] dark:bg-[#17211d]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-[#95a89f]">Agenda Hoje</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <CalendarDays size={16} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
          {eventsCount}
        </p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-[#95a89f]">
          {eventsCount === 1 ? "1 compromisso" : `${eventsCount} compromissos`}
        </p>
      </div>

      {/* Tarefas Pendentes */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-sm dark:border-[#2e3f37] dark:bg-[#17211d]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-[#95a89f]">Tarefas</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-[#00875f] dark:bg-[#17382d] dark:text-[#67d9ae]">
            <CheckCircle2 size={16} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
          {pendingTasksCount}
        </p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-[#95a89f]">
          {highPriorityTasksCount > 0 ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {highPriorityTasksCount} de alta prioridade
            </span>
          ) : (
            "Todas em dia"
          )}
        </p>
      </div>

      {/* Contas a Pagar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-sm dark:border-[#2e3f37] dark:bg-[#17211d]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-[#95a89f]">Contas do Mês</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <DollarSign size={16} />
          </div>
        </div>
        <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9] truncate">
          {formatCurrency(billsTotalAmount)}
        </p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-[#95a89f]">
          {billsCount === 1 ? "1 fatura ativa" : `${billsCount} faturas ativas`}
        </p>
      </div>

      {/* Monitor de Preços */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-sm dark:border-[#2e3f37] dark:bg-[#17211d]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-[#95a89f]">Monitor Preços</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
            <ShoppingCart size={16} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
          {productsCount}
        </p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-[#95a89f]">
          {opportunitiesCount > 0 ? (
            <span className="text-emerald-600 dark:text-[#67d9ae] font-semibold flex items-center gap-1">
              <TrendingDown size={11} />
              {opportunitiesCount} oportunidade{opportunitiesCount > 1 ? "s" : ""}
            </span>
          ) : (
            "Monitorando mercado"
          )}
        </p>
      </div>

      {/* Contas Conectadas */}
      <div className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-sm dark:border-[#2e3f37] dark:bg-[#17211d]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 dark:text-[#95a89f]">Contas E-mail</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-[#17382d] dark:text-[#67d9ae]">
            <Mail size={16} />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
          {accountsCount}
        </p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-[#95a89f]">
          Pessoal e Trabalho
        </p>
      </div>
    </div>
  );
}
