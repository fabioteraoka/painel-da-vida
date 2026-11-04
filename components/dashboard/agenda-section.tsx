"use client";

import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
  User,
} from "lucide-react";
import type { CalendarApiEvent, ConflictResult, ConnectedAccountApi } from "./types";

interface AgendaSectionProps {
  events: CalendarApiEvent[];
  loading: boolean;
  error: boolean;
  selectedAccount: string;
  onSelectAccount: (accountId: string) => void;
  accounts: ConnectedAccountApi[];
  conflicts: ConflictResult;
}

export function AgendaSection({
  events,
  loading,
  error,
  selectedAccount,
  onSelectAccount,
  accounts,
  conflicts,
}: AgendaSectionProps) {
  const filteredEvents = events.filter((ev) => {
    if (selectedAccount === "all") return true;
    return ev.connectedAccountId === selectedAccount;
  });

  const formatEventTime = (ev: CalendarApiEvent) => {
    if (ev.start?.date && !ev.start.dateTime) return "Dia inteiro";
    if (!ev.start?.dateTime) return "—";
    const start = new Date(ev.start.dateTime);
    const end = ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
    const startStr = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (!end) return startStr;
    const endStr = end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${startStr} – ${endStr}`;
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs transition-colors dark:border-[#2e3f37] dark:bg-[#17211d]">
      {/* Header & Account Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-[#2e3f37]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <CalendarDays size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
              Compromissos de Hoje
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#95a89f]">
              Agenda integrada com detecção inteligente de conflitos
            </p>
          </div>
        </div>

        {/* Filter Pills */}
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
            Todas ({events.length})
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

      {/* Cross-Account Conflict Warning Banner */}
      {conflicts.crossAccountConflicts.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Alerta de Conflito de Horário entre Contas:</span>
          </div>
          <div className="mt-1.5 space-y-1 pl-6">
            {conflicts.crossAccountConflicts.map((c, idx) => (
              <p key={idx} className="leading-relaxed">
                Às <strong>{c.time}</strong>: &ldquo;{c.titleA}&rdquo; ({c.accountA}) coincide com &ldquo;{c.titleB}&rdquo; ({c.accountB}).
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#00875f] dark:border-[#2e3f37] dark:border-t-[#00b37e]" />
            <p className="mt-2 text-xs">Carregando compromissos...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-50 p-4 text-center text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            Não foi possível carregar a agenda. Tente atualizar.
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 dark:text-[#95a89f]">
            <CalendarDays size={32} className="opacity-40" />
            <p className="mt-2 text-xs font-medium">Nenhum compromisso marcado para este filtro hoje.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredEvents.map((ev) => {
              const isConflicting = conflicts.conflictIds.has(ev.id);
              const isWork = ev.accountType === "WORK";

              return (
                <div
                  key={ev.id}
                  className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl border p-3.5 transition hover:shadow-xs ${
                    isConflicting
                      ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                      : "border-slate-200 bg-slate-50/60 hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#1e2b26]/50 dark:hover:bg-[#1e2b26]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs dark:bg-[#17211d] dark:text-[#e6ede9] shrink-0 mt-0.5 sm:mt-0">
                      <Clock3 size={13} className="text-slate-400" />
                      <span>{formatEventTime(ev)}</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-[#e6ede9]">
                          {ev.summary || "Sem título"}
                        </h3>
                        {isConflicting && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.2 text-[10px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                            Conflito
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.2 text-[10px] font-medium ${
                            isWork
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          }`}
                        >
                          {ev.accountLabel || (isWork ? "Profissional" : "Pessoal")}
                        </span>
                      </div>

                      {ev.description && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-[#95a89f] line-clamp-1">
                          {ev.description}
                        </p>
                      )}

                      {ev.location && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 dark:text-[#95a89f]/80">
                          <MapPin size={11} />
                          <span>{ev.location}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {ev.htmlLink && (
                    <a
                      href={ev.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-end sm:self-center flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition dark:text-[#95a89f] dark:hover:text-[#e6ede9]"
                    >
                      <span>Abrir</span>
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
