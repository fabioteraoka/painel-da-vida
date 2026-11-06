"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  User,
} from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams?.get("email") || "";

  // View Mode: 'login' ou 'setup'
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [setupRequired, setSetupRequired] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  // Login Form States
  const [email, setEmail] = useState(initialEmail || "fteraoka72@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup Form States
  const [setupSecret, setSetupSecret] = useState("");
  const [setupEmail, setSetupEmail] = useState("fteraoka72@gmail.com");
  const [setupName, setSetupName] = useState("Fábio Teraoka");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Consulta se o proprietário já tem senha configurada
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/auth/setup-status");
        if (res.ok) {
          const data = await res.json();
          setSetupRequired(Boolean(data.setupRequired));
          if (data.suggestedEmail) {
            setSetupEmail(data.suggestedEmail);
            if (!initialEmail) {
              setEmail(data.suggestedEmail);
            }
          }
          if (data.suggestedName) {
            setSetupName(data.suggestedName);
          }
          if (data.setupRequired) {
            setMode("setup");
          }
        }
      } catch {
        // Fallback
      } finally {
        setCheckingSetup(false);
      }
    }
    checkStatus();
  }, [initialEmail]);

  // Handler de Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Por favor, informe um endereço de e-mail válido.");
      return;
    }
    if (!password) {
      setError("Por favor, informe sua senha de acesso.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível realizar o login.");
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "E-mail ou senha incorretos.");
      setLoading(false);
    }
  };

  // Handler de Setup Inicial do Proprietário
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupEmail.includes("@")) {
      setSetupError("Por favor, informe um e-mail válido.");
      return;
    }
    if (setupPassword.length < 8) {
      setSetupError("A senha deve possuir no mínimo 8 caracteres.");
      return;
    }
    if (setupPassword !== setupConfirm) {
      setSetupError("A confirmação de senha não confere.");
      return;
    }

    setSetupLoading(true);
    setSetupError(null);

    try {
      const res = await fetch("/api/auth/setup-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupSecret: setupSecret.trim(),
          email: setupEmail.trim().toLowerCase(),
          name: setupName.trim(),
          password: setupPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao configurar a conta do proprietário.");
      }

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setSetupError(err?.message || "Erro ao configurar conta.");
      setSetupLoading(false);
    }
  };

  if (checkingSetup) {
    return (
      <div className="py-8 text-center text-xs text-slate-400 dark:text-[#95a89f]">
        Carregando autenticação segura...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Abas Modo Login vs Configuração Inicial */}
      <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-[#1e2b26]">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
            mode === "login"
              ? "bg-white text-slate-900 shadow-2xs dark:bg-[#17211d] dark:text-[#e6ede9]"
              : "text-slate-500 hover:text-slate-800 dark:text-[#95a89f] dark:hover:text-[#e6ede9]"
          }`}
        >
          Entrar com Senha
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("setup");
            setSetupError(null);
          }}
          className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
            mode === "setup"
              ? "bg-white text-slate-900 shadow-2xs dark:bg-[#17211d] dark:text-[#e6ede9]"
              : "text-slate-500 hover:text-slate-800 dark:text-[#95a89f] dark:hover:text-[#e6ede9]"
          }`}
        >
          <KeyRound size={13} className={setupRequired ? "text-emerald-600 animate-pulse" : ""} />
          <span>Configuração do Dono</span>
          {setupRequired && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </button>
      </div>

      {/* Formulário de Login Tradicional */}
      {mode === "login" && (
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 flex items-start gap-2"
            >
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
            >
              E-mail do Proprietário
            </label>
            <div className="relative mt-1">
              <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
            >
              Senha de Acesso
            </label>
            <div className="relative mt-1">
              <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00875f] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
          >
            <span>{loading ? "Verificando..." : "Entrar no Painel da Vida"}</span>
            <ArrowRight size={14} />
          </button>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] text-slate-500 dark:border-[#2e3f37] dark:bg-[#1e2b26]/50 dark:text-[#95a89f]">
            <p className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-[#e6ede9] mb-0.5">
              <ShieldCheck size={13} className="text-[#00875f] dark:text-[#00b37e]" />
              Autenticação Local com Argon2id
            </p>
            <p>
              Não requer credenciais Google para login. Se for o primeiro acesso, utilize a aba{" "}
              <strong>Configuração do Dono</strong> com sua chave <code>APP_SETUP_SECRET</code>.
            </p>
          </div>
        </form>
      )}

      {/* Formulário de Configuração Inicial de Uso Único */}
      {mode === "setup" && (
        <form onSubmit={handleSetup} className="space-y-3.5">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-[#17382d]/50 dark:text-[#67d9ae]">
            <p className="font-bold flex items-center gap-1.5">
              <KeyRound size={14} /> Configuração Segura de Uso Único
            </p>
            <p className="mt-1 text-[11px] text-emerald-800/90 dark:text-[#95a89f]">
              Define a senha mestre do proprietário com hash Argon2id e vincula os dados existentes
              (tarefas, faturas e produtos) à sua conta sem cadastro aberto ao público.
            </p>
          </div>

          {setupError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
            >
              {setupError}
            </div>
          )}

          <div>
            <label
              htmlFor="setup-secret"
              className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
            >
              Chave de Configuração (APP_SETUP_SECRET) *
            </label>
            <div className="relative mt-1">
              <KeyRound size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                id="setup-secret"
                type="password"
                required
                placeholder="Insira a APP_SETUP_SECRET definida no ambiente"
                value={setupSecret}
                onChange={(e) => setSetupSecret(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400 dark:text-[#95a89f]">
              Em dev local sem variável, utilize <code>painel-setup-2026</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="setup-email"
                className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
              >
                E-mail do Proprietário *
              </label>
              <div className="relative mt-1">
                <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="setup-email"
                  type="email"
                  required
                  value={setupEmail}
                  onChange={(e) => setSetupEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="setup-name"
                className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
              >
                Nome
              </label>
              <div className="relative mt-1">
                <User size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="setup-name"
                  type="text"
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="setup-pass"
                className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
              >
                Nova Senha (mín. 8 caracteres) *
              </label>
              <div className="relative mt-1">
                <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="setup-pass"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Mínimo 8 dígitos"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="setup-confirm"
                className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
              >
                Confirmação de Senha *
              </label>
              <div className="relative mt-1">
                <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="setup-confirm"
                  type="password"
                  required
                  minLength={8}
                  placeholder="Repita a senha"
                  value={setupConfirm}
                  onChange={(e) => setSetupConfirm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={setupLoading || !setupSecret.trim() || !setupPassword || setupPassword.length < 8}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00875f] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
          >
            <span>{setupLoading ? "Configurando com Argon2id..." : "Definir Senha do Proprietário"}</span>
            <ShieldCheck size={15} />
          </button>
        </form>
      )}
    </div>
  );
}
