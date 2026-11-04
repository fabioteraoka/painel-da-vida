"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LogOut, Mail, Plus, User, UserCheck, X } from "lucide-react";
import type { ConnectedAccountApi } from "../types";

interface SwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmail: string;
  connectedAccounts: ConnectedAccountApi[];
  onAccountSwitched: () => void;
}

export function SwitchAccountModal({
  isOpen,
  onClose,
  currentEmail,
  connectedAccounts,
  onAccountSwitched,
}: SwitchAccountModalProps) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSwitch = async (targetEmail: string, targetName?: string) => {
    if (!targetEmail.includes("@")) {
      setError("Por favor, digite um endereço de e-mail válido.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/switch-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, name: targetName }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao trocar login.");
      }

      onClose();
      onAccountSwitched();
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Não foi possível alternar para este e-mail.");
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/switch-user", { method: "DELETE" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  // Preset quick accounts
  const quickEmails = [
    { email: "fteraoka72@gmail.com", label: "Fábio Teraoka (Pessoal)", type: "PERSONAL" },
    { email: "fabio@empresa.com.br", label: "Fábio Teraoka (Trabalho)", type: "WORK" },
  ];

  // Include any other connected accounts
  for (const acc of connectedAccounts) {
    if (!quickEmails.some((q) => q.email.toLowerCase() === acc.email.toLowerCase())) {
      quickEmails.push({
        email: acc.email,
        label: acc.label || acc.email,
        type: acc.accountType,
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="switch-account-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#2e3f37]">
          <div className="flex items-center gap-2">
            <UserCheck size={18} className="text-[#00875f] dark:text-[#00b37e]" />
            <h3 id="switch-account-title" className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
              Trocar de Login / E-mail
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#1e2b26]"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-3.5 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Existing Accounts List */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-[#95a89f]">
            Alternar para conta existente:
          </p>

          <div className="mt-2 space-y-2">
            {quickEmails.map((item) => {
              const isActive = item.email.toLowerCase() === currentEmail.toLowerCase();

              return (
                <button
                  key={item.email}
                  type="button"
                  disabled={loading || isActive}
                  onClick={() => handleSwitch(item.email, item.label)}
                  className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
                    isActive
                      ? "border-[#00875f] bg-[#00875f]/10 dark:border-[#00b37e] dark:bg-[#00b37e]/10 cursor-default"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:hover:bg-[#263730]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 text-xs font-bold text-slate-700 dark:bg-[#263730] dark:text-[#e6ede9]">
                      <Mail size={14} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-900 dark:text-[#e6ede9]">
                          {item.label}
                        </p>
                        {isActive && (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-[#95a89f]">
                        {item.email}
                      </p>
                    </div>
                  </div>

                  {isActive ? (
                    <Check size={16} className="text-[#00875f] dark:text-[#00b37e]" />
                  ) : (
                    <ArrowRight size={14} className="text-slate-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Enter new email */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-[#2e3f37]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-[#95a89f]">
            Ou digite outro e-mail para logar:
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSwitch(newEmail, newName);
            }}
            className="mt-2.5 space-y-2.5"
          >
            <div>
              <input
                type="email"
                required
                placeholder="outro.email@exemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              />
            </div>

            <div>
              <input
                type="text"
                placeholder="Seu nome (opcional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !newEmail.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#00875f] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
            >
              <Plus size={14} />
              <span>{loading ? "Alternando..." : "Entrar com este E-mail"}</span>
            </button>
          </form>
        </div>

        {/* Logout action */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#2e3f37] flex items-center justify-between">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
          >
            <LogOut size={13} />
            <span>Desconectar e ir para tela inicial</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-[#95a89f]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
