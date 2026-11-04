"use client";

import { useEffect, useState } from "react";
import {
  X,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  Check,
  Building2,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export type ConnectedAccountApi = {
  id: string;
  userId: string;
  provider: "GOOGLE" | "MICROSOFT";
  externalUserId: string | null;
  email: string;
  name: string | null;
  label: string | null;
  accountType: "PERSONAL" | "WORK" | "OTHER";
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | "EXPIRED";
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

interface ConnectedAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: ConnectedAccountApi[];
  onAccountsUpdated: () => void;
  isDemoMode?: boolean;
}

export function ConnectedAccountsModal({
  isOpen,
  onClose,
  accounts,
  onAccountsUpdated,
  isDemoMode = false,
}: ConnectedAccountsModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState<"PERSONAL" | "WORK" | "OTHER">("PERSONAL");
  const [savingEdit, setSavingEdit] = useState(false);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [addDemoOpen, setAddDemoOpen] = useState(false);
  const [demoProvider, setDemoProvider] = useState<"GOOGLE" | "MICROSOFT">("GOOGLE");
  const [demoEmail, setDemoEmail] = useState("fteraoka72@gmail.com");
  const [demoLabel, setDemoLabel] = useState("");
  const [demoType, setDemoType] = useState<"PERSONAL" | "WORK" | "OTHER">("PERSONAL");
  const [creatingDemo, setCreatingDemo] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleStartEdit(acc: ConnectedAccountApi) {
    setEditingId(acc.id);
    setEditLabel(acc.label ?? (acc.accountType === "WORK" ? "Google — profissional" : "Google — pessoal"));
    setEditType(acc.accountType);
  }

  async function handleSaveEdit(id: string) {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/integrations/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel, accountType: editType }),
      });
      if (!res.ok) throw new Error("Falha ao salvar identificação da conta.");
      setEditingId(null);
      onAccountsUpdated();
      setStatusMessage({ text: "Identificação atualizada com sucesso.", type: "success" });
    } catch (err: any) {
      setStatusMessage({ text: err?.message || "Erro ao salvar.", type: "error" });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      const res = await fetch(`/api/integrations/accounts/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na sincronização.");
      onAccountsUpdated();
      setStatusMessage({ text: data.message || "Conta sincronizada com sucesso.", type: "success" });
    } catch (err: any) {
      setStatusMessage({ text: err?.message || "Falha na sincronização.", type: "error" });
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDisconnect(acc: ConnectedAccountApi) {
    const confirmed = window.confirm(
      `Deseja realmente desconectar a conta ${acc.email}?\n\nSua sessão no Painel da Vida continuará ativa e outras contas conectadas não serão afetadas.`,
    );
    if (!confirmed) return;

    setDisconnectingId(acc.id);
    try {
      const res = await fetch(`/api/integrations/accounts/${acc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao desconectar conta.");
      onAccountsUpdated();
      setStatusMessage({ text: `Conta ${acc.email} desconectada com sucesso.`, type: "success" });
    } catch (err: any) {
      setStatusMessage({ text: err?.message || "Erro ao desconectar.", type: "error" });
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleCreateDemoAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreatingDemo(true);
    try {
      const res = await fetch("/api/integrations/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: demoProvider,
          email: demoEmail.trim(),
          label: demoLabel.trim() || undefined,
          accountType: demoType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao conectar conta.");
      }
      setAddDemoOpen(false);
      onAccountsUpdated();
      setStatusMessage({ text: data.message || `Conta ${demoEmail} conectada com sucesso!`, type: "success" });
    } catch (err: any) {
      setStatusMessage({ text: err?.message || "Erro ao conectar conta de e-mail.", type: "error" });
    } finally {
      setCreatingDemo(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connected-accounts-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 my-8 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-[#2e3f37]">
          <div>
            <div className="flex items-center gap-2">
              <h3 id="connected-accounts-title" className="text-lg font-bold text-slate-900 dark:text-[#e6ede9]">
                Contas Conectadas
              </h3>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                Multi-contas Google
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 dark:text-[#95a89f]">
              Conecte sua conta pessoal e sua conta profissional (Google Workspace) para consolidar e-mails e agenda.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal de contas conectadas"
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition dark:text-slate-400 dark:hover:bg-[#1e2b26] dark:hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            role="status"
            className={`rounded-xl p-3 text-xs flex items-center justify-between ${
              statusMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-[#17382d] dark:text-[#67d9ae] dark:border-[#264f40]"
                : "bg-red-50 text-red-800 border border-red-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50"
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === "success" ? (
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-[#00b37e]" />
              ) : (
                <AlertCircle size={16} className="text-red-600 dark:text-rose-400" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-xs font-bold underline ml-2"
            >
              OK
            </button>
          </div>
        )}

        {/* Accounts List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-[#95a89f]">
              Contas Ativas ({accounts.length})
            </h4>
            <span className="text-[11px] text-slate-400 dark:text-[#95a89f]">Google Calendar &amp; Gmail</span>
          </div>

          {accounts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 space-y-2 dark:border-[#2e3f37] dark:text-[#95a89f]">
              <p>Nenhuma conta externa conectada no momento.</p>
              <p className="text-[11px] text-slate-400 dark:text-[#95a89f]/80">
                Clique abaixo para conectar sua primeira conta Google pessoal ou profissional.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {accounts.map((acc) => {
                const isEditing = editingId === acc.id;
                const isWork = acc.accountType === "WORK";

                return (
                  <div
                    key={acc.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 transition hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#1e2b26]/60 dark:hover:bg-[#1e2b26]"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1 dark:text-slate-300">
                              Etiqueta da Conta:
                            </label>
                            <input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              placeholder="Ex.: Google — Pessoal"
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1 dark:text-slate-300">
                              Tipo da Conta:
                            </label>
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as any)}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                            >
                              <option value="PERSONAL">Pessoal</option>
                              <option value="WORK">Profissional / Empresa</option>
                              <option value="OTHER">Outro</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-slate-300 dark:hover:bg-[#263730]"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => void handleSaveEdit(acc.id)}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#00875f] px-3.5 py-1 text-xs font-semibold text-white hover:bg-[#015f43] dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d] disabled:opacity-50"
                          >
                            <Check size={14} /> {savingEdit ? "Salvando..." : "Salvar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-700 shadow-2xs dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-slate-200">
                            {isWork ? <Building2 size={20} className="text-purple-600 dark:text-purple-400" /> : <User size={20} className="text-blue-600 dark:text-blue-400" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-bold text-slate-900 dark:text-[#e6ede9]">
                                {acc.label || (isWork ? "Google — profissional" : "Google — pessoal")}
                              </h5>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                  isWork
                                    ? "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 dark:border dark:border-purple-800/40"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-800/40"
                                }`}
                              >
                                {isWork ? "Profissional" : "Pessoal"}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 font-mono mt-0.5 dark:text-[#95a89f]">{acc.email}</p>

                            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400 dark:text-[#95a89f]">
                              <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                                <strong className="text-emerald-700 font-medium dark:text-[#67d9ae]">Conectada</strong>
                              </span>
                              {acc.lastSyncAt && (
                                <span>
                                  Última sincronização:{" "}
                                  {new Date(acc.lastSyncAt).toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center">
                          <button
                            type="button"
                            title="Editar identificação"
                            aria-label={`Editar identificação de ${acc.email}`}
                            onClick={() => void handleStartEdit(acc)}
                            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-slate-300 dark:hover:bg-[#263730] dark:hover:text-white"
                          >
                            <Edit2 size={14} />
                          </button>

                          <button
                            type="button"
                            title="Sincronizar e renovar agora"
                            aria-label={`Sincronizar conta ${acc.email}`}
                            disabled={syncingId === acc.id}
                            onClick={() => void handleSync(acc.id)}
                            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-slate-300 dark:hover:bg-[#263730] dark:hover:text-white"
                          >
                            <RefreshCw size={14} className={syncingId === acc.id ? "animate-spin" : ""} />
                          </button>

                          <button
                            type="button"
                            title="Desconectar esta conta"
                            aria-label={`Desconectar conta ${acc.email}`}
                            disabled={disconnectingId === acc.id}
                            onClick={() => void handleDisconnect(acc)}
                            className="rounded-lg border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50 transition disabled:opacity-50 dark:border-rose-900/50 dark:bg-[#17211d] dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Account Actions */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3 dark:border-[#2e3f37] dark:bg-[#1e2b26]/70">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-[#e6ede9]">+ Conectar conta de e-mail</h4>
              <p className="text-[11px] text-slate-500 dark:text-[#95a89f]">
                Conecte contas Google (Gmail/Agenda), Microsoft 365 / Outlook ou qualquer outro e-mail.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href="/api/integrations/google/connect?type=PERSONAL"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50 transition dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:hover:bg-[#263730]"
              >
                <Plus size={14} /> Google Pessoal
              </a>

              <a
                href="/api/integrations/google/connect?type=WORK"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#00875f] px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#015f43] transition dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
              >
                <Plus size={14} /> Google Profissional
              </a>

              <button
                type="button"
                onClick={() => setAddDemoOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 transition dark:border-blue-900/60 dark:bg-[#17211d] dark:text-blue-300 dark:hover:bg-blue-950/40"
              >
                <Plus size={14} /> {addDemoOpen ? "Fechar" : "Outro E-mail / Microsoft"}
              </button>
            </div>
          </div>

          {/* Account connection form for Google, Microsoft, and custom email */}
          {addDemoOpen && (
            <form onSubmit={handleCreateDemoAccount} className="border-t border-emerald-200/60 pt-3 space-y-3 dark:border-[#2e3f37]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-800 dark:text-[#e6ede9]">
                  Conectar conta de e-mail (Google, Microsoft 365 / Outlook ou Corporativo):
                </p>
                <span className="text-[10px] text-slate-400 dark:text-[#95a89f]">Conexão direta segura</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 dark:text-[#95a89f]">Provedor:</label>
                  <select
                    value={demoProvider}
                    onChange={(e) => setDemoProvider(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                  >
                    <option value="GOOGLE">Google (Gmail)</option>
                    <option value="MICROSOFT">Microsoft 365 / Outlook</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 dark:text-[#95a89f]">Endereço de e-mail:</label>
                  <input
                    required
                    type="email"
                    value={demoEmail}
                    onChange={(e) => setDemoEmail(e.target.value)}
                    placeholder="ex.: fteraoka1@gmail.com"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 dark:text-[#95a89f]">Tipo de ambiente:</label>
                  <select
                    value={demoType}
                    onChange={(e) => setDemoType(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                  >
                    <option value="PERSONAL">Pessoal</option>
                    <option value="WORK">Profissional / Empresa</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 dark:text-[#95a89f]">Etiqueta / Nome:</label>
                  <input
                    value={demoLabel}
                    onChange={(e) => setDemoLabel(e.target.value)}
                    placeholder="ex.: E-mail Pessoal"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAddDemoOpen(false)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-[#2e3f37] dark:text-slate-300 dark:hover:bg-[#263730]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingDemo}
                  className="rounded-xl bg-[#00875f] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#015f43] dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d] disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  {creatingDemo ? "Conectando..." : "Conectar E-mail"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Integration Architecture Info */}
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 flex items-center justify-between text-xs text-slate-500 dark:border-[#2e3f37] dark:bg-[#1e2b26]/50 dark:text-[#95a89f]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Ambientes Pessoal (Google) &amp; Profissional (Microsoft 365 / Google Workspace)</span>
          </div>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-[#263730] dark:text-slate-300">
            Multi-contas Ativo
          </span>
        </div>

        {/* Security / Privacy Footer */}
        <div className="border-t border-slate-100 pt-3 flex items-center gap-2 text-[11px] text-slate-400 dark:border-[#2e3f37] dark:text-[#95a89f]">
          <ShieldCheck size={16} className="text-emerald-600 dark:text-[#00b37e] shrink-0" />
          <span>
            Tokens OAuth protegidos com criptografia. Nenhuma senha externa é armazenada. O login do Painel da Vida é independente de cada conta externa conectada.
          </span>
        </div>
      </div>
    </div>
  );
}
