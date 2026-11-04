"use client";

import { useState } from "react";
import { ArrowRight, Check, CheckCircle2, Mail, Plus, X } from "lucide-react";
import type { ConnectedAccountApi } from "../types";

interface GoogleConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
  connectedAccounts: ConnectedAccountApi[];
}

export function GoogleConnectModal({
  isOpen,
  onClose,
  onConnected,
  connectedAccounts,
}: GoogleConnectModalProps) {
  const [customEmail, setCustomEmail] = useState("");
  const [accountType, setAccountType] = useState<"PERSONAL" | "WORK">("PERSONAL");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnectGoogle = async (email: string, type: "PERSONAL" | "WORK" = "PERSONAL", label?: string) => {
    if (!email || !email.includes("@")) {
      setErrorMessage("Por favor, informe um e-mail válido.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/integrations/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "GOOGLE",
          email: email.trim().toLowerCase(),
          accountType: type,
          label: label || (type === "WORK" ? "Google — profissional" : "Google — pessoal"),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao conectar conta Google.");
      }

      // Also set active session cookie so the dashboard immediately switches to this user
      await fetch("/api/auth/switch-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      setSuccessMessage(`Conta ${email} conectada com sucesso! E-mails e agenda sincronizados.`);
      onConnected();

      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || "Não foi possível conectar com o Google.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-connect-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        {/* Header with Google Logo */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-[#2e3f37]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-xs dark:bg-[#1e2b26] dark:border-[#2e3f37]">
              {/* Google colored G svg */}
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 10.02 0 12s.45 3.84 1.25 5.42l4.03-3.15Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                />
              </svg>
            </div>
            <div>
              <h3 id="google-connect-title" className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
                Conectar com o Google
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#95a89f]">
                Sincronize seus e-mails do Gmail e sua agenda
              </p>
            </div>
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

        {/* Feedback Message */}
        {successMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-2xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        {/* Primary One-Click Options */}
        <div className="mt-4 space-y-2.5">
          <p className="text-xs font-semibold text-slate-600 dark:text-[#95a89f]">
            Escolha uma conta para conectar:
          </p>

          {/* Fábio Teraoka Pessoal */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleConnectGoogle("fteraoka72@gmail.com", "PERSONAL", "Google — pessoal")}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#00875f] hover:bg-emerald-50/40 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:hover:bg-[#263730]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                FT
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-slate-900 dark:text-[#e6ede9]">
                    Fábio Teraoka
                  </p>
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                    Gmail Pessoal
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#95a89f]">
                  fteraoka72@gmail.com
                </p>
              </div>
            </div>
            <ArrowRight size={16} className="text-[#00875f] dark:text-[#00b37e]" />
          </button>

          {/* Fábio Teraoka Trabalho */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleConnectGoogle("fabio@empresa.com.br", "WORK", "Google Workspace — trabalho")}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-purple-500 hover:bg-purple-50/40 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:hover:bg-[#263730]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-xs font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                TR
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-slate-900 dark:text-[#e6ede9]">
                    Fábio Teraoka (Trabalho)
                  </p>
                  <span className="rounded-full bg-purple-100 px-1.5 py-0.2 text-[9px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    Workspace
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#95a89f]">
                  fabio@empresa.com.br
                </p>
              </div>
            </div>
            <ArrowRight size={16} className="text-purple-600 dark:text-purple-400" />
          </button>
        </div>

        {/* Custom Google Email Form */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-[#2e3f37]">
          <p className="text-xs font-semibold text-slate-600 dark:text-[#95a89f]">
            Ou conectar outro e-mail Google:
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleConnectGoogle(customEmail, accountType);
            }}
            className="mt-2.5 space-y-2.5"
          >
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="email"
                required
                placeholder="exemplo@gmail.com ou corporativo..."
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as "PERSONAL" | "WORK")}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              >
                <option value="PERSONAL">Conta Pessoal</option>
                <option value="WORK">Conta de Trabalho</option>
              </select>

              <button
                type="submit"
                disabled={loading || !customEmail.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#00875f] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
              >
                <Plus size={14} />
                <span>{loading ? "Conectando..." : "Conectar Conta"}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#2e3f37] text-center">
          <p className="text-[11px] text-slate-400 dark:text-[#95a89f]/80">
            A conexão sincroniza mensagens, boletos e agenda no Painel da Vida.
          </p>
        </div>
      </div>
    </div>
  );
}
