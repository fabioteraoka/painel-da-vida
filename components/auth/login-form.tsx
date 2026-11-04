"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Mail, Target, User } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoginWithEmail = async (targetEmail: string, targetName?: string) => {
    if (!targetEmail.includes("@")) {
      setError("Por favor, digite um e-mail válido.");
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
        throw new Error(data.error || "Erro ao conectar conta.");
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Não foi possível realizar o login.");
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLoginWithEmail(email, name);
  };

  return (
    <div className="space-y-6">
      {/* Quick Select Accounts */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider dark:text-[#95a89f]">
          Acesso Rápido com E-mails Salvos
        </p>

        <div className="mt-2.5 space-y-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleLoginWithEmail("fteraoka72@gmail.com", "Fábio Teraoka")}
            className="flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-left transition hover:bg-emerald-100/70 disabled:opacity-50 dark:border-emerald-800 dark:bg-[#17382d]/40 dark:hover:bg-[#17382d]/70"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00875f] text-white font-bold text-xs dark:bg-[#00b37e] dark:text-[#00291d]">
                FT
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-[#e6ede9]">
                  Fábio Teraoka (Pessoal)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#95a89f]">
                  fteraoka72@gmail.com
                </p>
              </div>
            </div>
            <ArrowRight size={16} className="text-[#00875f] dark:text-[#00b37e]" />
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleLoginWithEmail("fabio@empresa.com.br", "Fábio Teraoka")}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-left transition hover:bg-slate-100 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:hover:bg-[#263730]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white font-bold text-xs">
                TR
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-[#e6ede9]">
                  Fábio Teraoka (Trabalho)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#95a89f]">
                  fabio@empresa.com.br
                </p>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
          </button>
        </div>
      </div>

      <div className="relative flex items-center justify-center">
        <div className="border-t border-slate-200 w-full dark:border-[#2e3f37]" />
        <span className="bg-white px-3 text-[11px] uppercase font-bold text-slate-400 dark:bg-[#17211d] dark:text-[#95a89f] absolute">
          Ou entrar com outro e-mail
        </span>
      </div>

      {/* Custom Email Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5 pt-2">
        {error && (
          <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
            Endereço de E-mail *
          </label>
          <div className="relative mt-1">
            <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              id="login-email"
              type="email"
              required
              placeholder="seu.email@empresa.com ou gmail..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-name" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
            Seu Nome (opcional)
          </label>
          <div className="relative mt-1">
            <User size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              id="login-name"
              type="text"
              placeholder="Ex: João Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00875f] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
        >
          <span>{loading ? "Entrando..." : "Entrar no Painel da Vida"}</span>
          <ArrowRight size={14} />
        </button>
      </form>
    </div>
  );
}
