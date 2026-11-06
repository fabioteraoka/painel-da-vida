"use client";

import { useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCheck,
  CheckCircle2,
  Mail,
  Plus,
  Sparkles,
  User,
} from "lucide-react";
import type { ConnectedAccountApi, GmailApiMessage } from "./types";

interface EmailsSectionProps {
  messages: GmailApiMessage[];
  loading: boolean;
  error: boolean;
  selectedAccount: string;
  onSelectAccount: (accountId: string) => void;
  accounts: ConnectedAccountApi[];
  onCreateTaskFromEmail: (message: GmailApiMessage) => Promise<void>;
  creatingTaskId: string | null;
  taskError: string | null;
  onOpenGoogleConnectModal?: () => void;
}

export function EmailsSection({
  messages,
  loading,
  error,
  selectedAccount,
  onSelectAccount,
  accounts,
  onCreateTaskFromEmail,
  creatingTaskId,
  taskError,
  onOpenGoogleConnectModal,
}: EmailsSectionProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredMessages = messages.filter((msg) => {
    if (selectedAccount !== "all" && msg.connectedAccountId !== selectedAccount) {
      return false;
    }
    if (categoryFilter !== "all" && msg.dashboardCategory !== categoryFilter) {
      return false;
    }
    return true;
  });

  const categoryCounts = {
    all: messages.length,
    RESPOND_TODAY: messages.filter((m) => m.dashboardCategory === "RESPOND_TODAY").length,
    FOLLOW_UP: messages.filter((m) => m.dashboardCategory === "FOLLOW_UP").length,
    INFORMATIVE: messages.filter((m) => m.dashboardCategory === "INFORMATIVE").length,
  };

  const getCategoryBadge = (cat?: string) => {
    switch (cat) {
      case "RESPOND_TODAY":
        return {
          label: "Responder hoje",
          className: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
        };
      case "FOLLOW_UP":
        return {
          label: "Acompanhar",
          className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
        };
      case "INFORMATIVE":
        return {
          label: "Informativo",
          className: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
        };
      default:
        return {
          label: "Geral",
          className: "bg-slate-100 text-slate-700 dark:bg-[#1e2b26] dark:text-[#95a89f]",
        };
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs transition-colors dark:border-[#2e3f37] dark:bg-[#17211d]">
      {/* Header & Account Selection */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-[#2e3f37]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[#00875f] dark:bg-[#17382d] dark:text-[#67d9ae]">
            <Mail size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
              E-mails do Dia
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#95a89f]">
              Classificação inteligente por prioridade de ação
            </p>
          </div>
        </div>

        {/* Account Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectAccount("all")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              selectedAccount === "all"
                ? "bg-slate-900 text-white dark:bg-[#e6ede9] dark:text-[#121815]"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730]"
            }`}
          >
            Todas as contas ({messages.length})
          </button>
          {accounts.map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => onSelectAccount(acc.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                selectedAccount === acc.id
                  ? "bg-slate-900 text-white dark:bg-[#e6ede9] dark:text-[#121815]"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730]"
              }`}
            >
              {acc.accountType === "WORK" ? <Building2 size={12} /> : <User size={12} />}
              <span>{acc.label || acc.email}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Category Pills */}
      <div className="mt-3.5 flex flex-wrap gap-1.5 border-b border-slate-100 pb-3 dark:border-[#2e3f37]">
        <button
          type="button"
          onClick={() => setCategoryFilter("all")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            categoryFilter === "all"
              ? "bg-[#00875f] text-white dark:bg-[#00b37e] dark:text-[#00291d]"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730]"
          }`}
        >
          Todos ({categoryCounts.all})
        </button>
        <button
          type="button"
          onClick={() => setCategoryFilter("RESPOND_TODAY")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            categoryFilter === "RESPOND_TODAY"
              ? "bg-rose-600 text-white"
              : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
          }`}
        >
          Responder hoje ({categoryCounts.RESPOND_TODAY})
        </button>
        <button
          type="button"
          onClick={() => setCategoryFilter("FOLLOW_UP")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            categoryFilter === "FOLLOW_UP"
              ? "bg-amber-600 text-white"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60"
          }`}
        >
          Acompanhar ({categoryCounts.FOLLOW_UP})
        </button>
        <button
          type="button"
          onClick={() => setCategoryFilter("INFORMATIVE")}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            categoryFilter === "INFORMATIVE"
              ? "bg-blue-600 text-white"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
          }`}
        >
          Informativos ({categoryCounts.INFORMATIVE})
        </button>
      </div>

      {taskError && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle size={14} className="shrink-0" />
          <span>{taskError}</span>
        </div>
      )}

      {/* Messages List */}
      <div className="mt-3.5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#00875f] dark:border-[#2e3f37] dark:border-t-[#00b37e]" />
            <p className="mt-2 text-xs">Carregando e-mails...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-50 p-4 text-center text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            Não foi possível carregar os e-mails. Verifique as contas conectadas.
          </div>
        ) : filteredMessages.length === 0 ? (
          accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs dark:border-[#2e3f37] dark:bg-[#1e2b26]/30">
              <Mail size={28} className="mx-auto text-slate-400 opacity-60 mb-2" />
              <p className="font-semibold text-slate-700 dark:text-[#e6ede9]">
                Integração Google não configurada
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-[#95a89f] max-w-sm mx-auto">
                A sincronização de e-mails do Gmail é opcional. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente para ativar a leitura de mensagens, ou continue utilizando tarefas, faturas e monitor de preços normalmente.
              </p>
              {onOpenGoogleConnectModal && (
                <button
                  type="button"
                  onClick={onOpenGoogleConnectModal}
                  className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                >
                  <span>Gerenciar Contas Conectadas</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 dark:text-[#95a89f]">
              <Mail size={32} className="opacity-40" />
              <p className="mt-2 text-xs font-medium">Nenhum e-mail para este filtro no momento.</p>
            </div>
          )
        ) : (
          <div className="space-y-2.5">
            {filteredMessages.map((msg) => {
              const badge = getCategoryBadge(msg.dashboardCategory);
              const isWork = msg.accountType === "WORK";
              const isCreating = creatingTaskId === msg.id;

              return (
                <div
                  key={msg.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 transition hover:bg-slate-50 hover:shadow-xs dark:border-[#2e3f37] dark:bg-[#1e2b26]/50 dark:hover:bg-[#1e2b26]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-[#e6ede9]">
                          {msg.senderName || msg.sender}
                        </span>
                        <span className={`rounded-full px-2 py-0.2 text-[10px] font-semibold ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.2 text-[10px] font-medium ${
                            isWork
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          }`}
                        >
                          {msg.accountLabel || (isWork ? "Profissional" : "Pessoal")}
                        </span>
                      </div>

                      <h3 className="mt-1 text-sm font-semibold text-slate-800 dark:text-[#e6ede9]">
                        {msg.subject || "(Sem assunto)"}
                      </h3>

                      {msg.snippet && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-[#95a89f] line-clamp-2">
                          {msg.snippet}
                        </p>
                      )}

                      {msg.dashboardReason && (
                        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-[#95a89f]/80 flex items-center gap-1 italic">
                          <Sparkles size={11} className="text-[#00875f] dark:text-[#00b37e]" />
                          <span>{msg.dashboardReason}</span>
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="self-end sm:self-center shrink-0">
                      {msg.taskId ? (
                        <div className="flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                          <CheckCheck size={13} />
                          <span>Tarefa criada</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onCreateTaskFromEmail(msg)}
                          disabled={isCreating}
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:hover:bg-[#1e2b26]"
                        >
                          <Plus size={13} />
                          <span>{isCreating ? "Criando..." : "Criar Tarefa"}</span>
                        </button>
                      )}
                    </div>
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
