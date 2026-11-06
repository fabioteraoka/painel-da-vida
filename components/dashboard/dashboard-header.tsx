"use client";

import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  Target,
  UserCheck,
} from "lucide-react";
import type { ConnectedAccountApi } from "./types";

interface DashboardHeaderProps {
  today: Date;
  darkMode: boolean;
  onToggleTheme: () => void;
  connectedAccounts: ConnectedAccountApi[];
  onOpenAccountsModal: () => void;
  onOpenSwitchAccountModal: () => void;
  onOpenGoogleConnectModal?: () => void;
  onRefreshAll: () => void;
  isRefreshing: boolean;
  profileOpen: boolean;
  setProfileOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  unreadCount?: number;
  activeUserEmail?: string;
  activeUserName?: string;
}

export function DashboardHeader({
  today,
  darkMode,
  onToggleTheme,
  connectedAccounts,
  onOpenAccountsModal,
  onOpenSwitchAccountModal,
  onOpenGoogleConnectModal,
  onRefreshAll,
  isRefreshing,
  profileOpen,
  setProfileOpen,
  notificationsOpen,
  setNotificationsOpen,
  unreadCount = 0,
  activeUserEmail = "fteraoka72@gmail.com",
  activeUserName = "Fábio Teraoka",
}: DashboardHeaderProps) {
  const router = useRouter();
  const activeCount = connectedAccounts.filter((a) => a.status === "CONNECTED").length;

  const formattedDate = today.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md transition-colors dark:border-[#2e3f37] dark:bg-[#17211d]/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand & Date */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#00875f] text-white shadow-xs dark:bg-[#00b37e] dark:text-[#00291d]">
            <Target size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
                Painel da Vida
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-[#17382d] dark:text-[#67d9ae]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {activeCount > 0 ? `${activeCount} conta${activeCount > 1 ? "s" : ""} ativa${activeCount > 1 ? "s" : ""}` : "Online"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#95a89f]">
              {capitalizedDate}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Conectar Conta Button */}
          {onOpenGoogleConnectModal && (
            <button
              type="button"
              onClick={onOpenGoogleConnectModal}
              title="Conectar e-mail e agenda diretamente sem credenciais de API"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs transition hover:bg-slate-50 hover:border-slate-300 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:hover:bg-[#263730]"
            >
              <Target size={14} className="text-[#00875f] dark:text-[#00b37e]" />
              <span className="hidden sm:inline">Conectar Conta</span>
              <span className="sm:hidden">Conectar</span>
            </button>
          )}

          {/* Quick Account Switcher Button */}
          <button
            type="button"
            onClick={onOpenSwitchAccountModal}
            title="Clique para alternar o e-mail de login"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:border-slate-300 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:hover:bg-[#263730]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="hidden md:inline font-medium truncate max-w-[170px]">
              {activeUserEmail}
            </span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
              Trocar
            </span>
          </button>

          {/* Refresh Data */}
          <button
            type="button"
            onClick={onRefreshAll}
            disabled={isRefreshing}
            title="Atualizar dados do painel"
            aria-label="Atualizar dados do painel"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730] dark:hover:text-[#e6ede9]"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin text-[#00875f] dark:text-[#00b37e]" : ""} />
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={darkMode ? "Mudar para modo claro" : "Mudar para modo escuro"}
            aria-label={darkMode ? "Mudar para modo claro" : "Mudar para modo escuro"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730] dark:hover:text-[#e6ede9]"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Notifications Dropdown Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((prev) => !prev);
                setProfileOpen(false);
              }}
              title="Notificações"
              aria-label="Notificações"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730] dark:hover:text-[#e6ede9]"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#00875f] text-[10px] font-bold text-white dark:bg-[#00b37e] dark:text-[#00291d]">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#2e3f37]">
                  <p className="text-xs font-bold text-slate-900 dark:text-[#e6ede9]">Notificações do Dia</p>
                  <span className="text-[10px] text-slate-400 dark:text-[#95a89f]">Sincronização em tempo real</span>
                </div>
                <div className="mt-2 space-y-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-[#1e2b26]">
                    <p className="font-semibold text-slate-800 dark:text-[#e6ede9]">E-mails e faturas monitorados</p>
                    <p className="text-[11px] text-slate-500 dark:text-[#95a89f] mt-0.5">
                      Contas ativas sincronizadas com verificação automática de compromissos.
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-[#1e2b26]">
                    <p className="font-semibold text-slate-800 dark:text-[#e6ede9]">Agenda sem sobreposição</p>
                    <p className="text-[11px] text-slate-500 dark:text-[#95a89f] mt-0.5">
                      Compromissos pessoais e de trabalho consolidados.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Profile Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((prev) => !prev);
                setNotificationsOpen(false);
              }}
              title="Perfil do Usuário"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pr-2.5 transition hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:hover:bg-[#263730]"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-[11px] font-bold text-white dark:bg-[#00b37e] dark:text-[#00291d]">
                {getInitials(activeUserName)}
              </div>
              <span className="hidden sm:inline text-xs font-semibold text-slate-700 dark:text-[#e6ede9] max-w-[120px] truncate">
                {activeUserName}
              </span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
                <div className="pb-3 border-b border-slate-100 dark:border-[#2e3f37]">
                  <p className="text-xs font-bold text-slate-900 dark:text-[#e6ede9] truncate">{activeUserName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-[#95a89f] truncate">{activeUserEmail}</p>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-[#67d9ae]">
                    <CheckCircle2 size={13} />
                    <span>Conectado ao Painel da Vida</span>
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenSwitchAccountModal();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-2.5 py-2 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition dark:bg-[#17382d] dark:text-[#67d9ae]"
                  >
                    <UserCheck size={14} className="text-[#00875f] dark:text-[#00b37e]" />
                    <span>Trocar de E-mail / Usuário</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenAccountsModal();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 transition dark:text-[#e6ede9] dark:hover:bg-[#1e2b26]"
                  >
                    <UserCheck size={14} className="text-slate-400" />
                    <span>Gerenciar Contas Conectadas</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 transition dark:text-rose-400 dark:hover:bg-rose-950/30"
                  >
                    <LogOut size={14} />
                    <span>Sair / Desconectar</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
