"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Target,
  User,
} from "lucide-react";

interface AuthContainerProps {
  initialSetupRequired?: boolean;
  suggestedEmail?: string;
  suggestedName?: string;
  initialEmailParam?: string;
}

export function AuthContainer({
  initialSetupRequired = true,
  suggestedEmail = "fteraoka72@gmail.com",
  suggestedName = "Fábio Teraoka",
  initialEmailParam = "",
}: AuthContainerProps) {
  const router = useRouter();

  // Mode: se precisa de setup inicial, abre em 'setup'; se já configurado, em 'login'
  const [mode, setMode] = useState<"login" | "setup">(
    initialSetupRequired ? "setup" : "login",
  );

  // Login state
  const [loginEmail, setLoginEmail] = useState(
    initialEmailParam || suggestedEmail || "fteraoka72@gmail.com",
  );
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Setup state
  const [setupSecret, setSetupSecret] = useState("painel-setup-2026");
  const [setupEmail, setSetupEmail] = useState(suggestedEmail || "fteraoka72@gmail.com");
  const [setupName, setSetupName] = useState(suggestedName || "Fábio Teraoka");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handler de Login com timeout seguro
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.includes("@")) {
      setLoginError("Por favor, informe um endereço de e-mail válido.");
      return;
    }
    if (!loginPassword) {
      setLoginError("Por favor, digite sua senha.");
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "E-mail ou senha incorretos.");
      }

      setSuccessMessage("Autenticado com sucesso! Carregando seu painel...");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 500);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === "AbortError") {
        setLoginError("A requisição demorou muito para responder. Tente novamente.");
      } else {
        setLoginError(err?.message || "Não foi possível realizar o login.");
      }
      setLoginLoading(false);
    }
  };

  // Handler de Configuração Inicial do Proprietário com timeout seguro
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupSecret.trim()) {
      setSetupError("Informe a chave de configuração (APP_SETUP_SECRET).");
      return;
    }
    if (!setupEmail.includes("@")) {
      setSetupError("Informe um e-mail válido para o proprietário.");
      return;
    }
    if (setupPassword.length < 8) {
      setSetupError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (setupPassword !== setupConfirm) {
      setSetupError("A confirmação de senha não confere.");
      return;
    }

    setSetupLoading(true);
    setSetupError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Falha ao configurar a conta do proprietário.");
      }

      setSuccessMessage("Conta do proprietário configurada com sucesso! Abrindo painel...");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 500);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === "AbortError") {
        setSetupError("A requisição demorou muito para responder. Tente novamente.");
      } else {
        setSetupError(err?.message || "Erro ao configurar a conta do proprietário.");
      }
      setSetupLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        {/* Header com Ícone */}
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00875f] text-white shadow-xs dark:bg-[#00b37e] dark:text-[#00291d]">
          <Target size={24} />
        </div>

        <div className="mt-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
            Painel da Vida
          </h1>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-[#95a89f]">
            {mode === "setup"
              ? "Configuração de acesso inicial do proprietário."
              : "Acesso seguro com e-mail e senha protegidos por Argon2id."}
          </p>
        </div>

        {/* Mensagem de Sucesso */}
        {successMessage && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae] flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Seletor de Abas Sempre Visível e Interativo */}
        <div className="mt-5 flex rounded-xl bg-slate-100 p-1 dark:bg-[#1e2b26]">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setLoginError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
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
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
              mode === "setup"
                ? "bg-white text-slate-900 shadow-2xs dark:bg-[#17211d] dark:text-[#e6ede9]"
                : "text-slate-500 hover:text-slate-800 dark:text-[#95a89f] dark:hover:text-[#e6ede9]"
            }`}
          >
            <KeyRound size={13} className={initialSetupRequired ? "text-emerald-600" : ""} />
            <span>Configuração do Dono</span>
            {initialSetupRequired && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* FORMULÁRIO 1: LOGIN (Quando já houver senha ou o usuário alternar) */}
        {mode === "login" && (
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            {loginError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginError(null);
                      setMode("setup");
                    }}
                    className="text-[11px] font-bold text-rose-800 underline hover:no-underline dark:text-rose-200"
                  >
                    Ainda não tem senha? Configurar como dono →
                  </button>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="login-email-input"
                className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
              >
                E-mail do Proprietário
              </label>
              <div className="relative mt-1">
                <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="login-email-input"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="ex.: fteraoka72@gmail.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password-input"
                className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
              >
                Senha de Acesso
              </label>
              <div className="relative mt-1">
                <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="login-password-input"
                  type={showLoginPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label={showLoginPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showLoginPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading || !loginEmail.trim() || !loginPassword}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00875f] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
            >
              {loginLoading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Validando com Argon2id...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Painel da Vida</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] text-slate-500 dark:border-[#2e3f37] dark:bg-[#1e2b26]/50 dark:text-[#95a89f]">
              <p className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-[#e6ede9] mb-0.5">
                <ShieldCheck size={13} className="text-[#00875f] dark:text-[#00b37e]" />
                Autenticação Própria e Segura
              </p>
              <p>
                O login funciona sem dependência do Google. Se este for seu primeiro acesso, clique
                na aba <strong>Configuração do Dono</strong> para definir sua senha inicial.
              </p>
            </div>
          </form>
        )}

        {/* FORMULÁRIO 2: CONFIGURAÇÃO INICIAL DO DONO (Quando não houver senha ainda) */}
        {mode === "setup" && (
          <form onSubmit={handleSetup} className="mt-5 space-y-3.5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-[#17382d]/50 dark:text-[#67d9ae]">
              <p className="font-bold flex items-center gap-1.5">
                <KeyRound size={14} /> Configuração Inicial do Proprietário
              </p>
              <p className="mt-1 text-[11px] text-emerald-800/90 dark:text-[#95a89f]">
                Defina a sua senha mestre para assumir a conta proprietária. Seus dados existentes
                (faturas, tarefas e monitor de preços) serão mantidos vinculados ao seu e-mail.
              </p>
            </div>

            {setupError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 flex items-start gap-2"
              >
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{setupError}</p>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="setup-secret-input"
                className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
              >
                Chave de Configuração (APP_SETUP_SECRET) *
              </label>
              <div className="relative mt-1">
                <KeyRound size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="setup-secret-input"
                  type="text"
                  required
                  value={setupSecret}
                  onChange={(e) => setSetupSecret(e.target.value)}
                  placeholder="painel-setup-2026"
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400 dark:text-[#95a89f]">
                No preview do AI Studio, utilize <code>painel-setup-2026</code>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="setup-email-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
                >
                  E-mail do Proprietário *
                </label>
                <div className="relative mt-1">
                  <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    id="setup-email-input"
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
                  htmlFor="setup-name-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
                >
                  Nome
                </label>
                <div className="relative mt-1">
                  <User size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    id="setup-name-input"
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
                  htmlFor="setup-password-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
                >
                  Nova Senha (mín. 8 dígitos) *
                </label>
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    id="setup-password-input"
                    type={showSetupPassword ? "text" : "password"}
                    required
                    minLength={8}
                    placeholder="Mínimo 8 dígitos"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPassword((v) => !v)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={showSetupPassword ? "Ocultar senha" : "Exibir senha"}
                  >
                    {showSetupPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="setup-confirm-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]"
                >
                  Confirmar Senha *
                </label>
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    id="setup-confirm-input"
                    type={showSetupPassword ? "text" : "password"}
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
              disabled={
                setupLoading ||
                !setupSecret.trim() ||
                !setupPassword ||
                setupPassword.length < 8 ||
                setupPassword !== setupConfirm
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00875f] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
            >
              {setupLoading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Configurando com Argon2id...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={15} />
                  <span>Definir Senha e Acessar o Painel</span>
                </>
              )}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-slate-400 dark:text-[#95a89f]/80">
          Suas tarefas, contas manuais e monitor de preços funcionam independentemente do Google.
        </p>
      </div>
    </main>
  );
}
