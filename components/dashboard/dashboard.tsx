"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  Filter,
  LayoutDashboard,
  Mail,
  Menu,
  Plus,
  Search,
  Settings,
  RefreshCw,
  Moon,
  Sun,
  ShoppingCart,
  Sparkles,
  Tag as TagIcon,
  Target,
  TrendingDown,
  Trash2,
  X,
  Building2,
  UserCheck,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { initialTasks, type Task } from "@/lib/mock-data";
import {
  ConnectedAccountsModal,
  type ConnectedAccountApi,
} from "./connected-accounts-modal";

type GmailApiMessage = {
  id: string;
  connectedAccountId?: string;
  accountEmail?: string;
  accountLabel?: string;
  accountType?: "PERSONAL" | "WORK" | "OTHER";
  taskId?: string | null;
  threadId?: string;
  sender?: string;
  senderName?: string;
  subject?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  dashboardCategory?: "RESPOND_TODAY" | "FOLLOW_UP" | "INFORMATIVE" | "NOISE";
  dashboardReason?: string;
  payload?: {
    headers?: { name: string; value: string }[];
  };
};

type BillApi = {
  id: string;
  sender: string;
  subject: string;
  merchant: string | null;
  amount: number | null;
  dueDate: string | null;
  category: string;
  status: "NEEDS_REVIEW" | "CONFIRMED" | "SCHEDULED" | "PAID" | "IGNORED";
  confidence: number | null;
  sourceUrl: string | null;
  paymentAccount: { id: string; name: string; type: string } | null;
  paymentUrl: string | null;
  pixCode: string | null;
  barcode: string | null;
  responsibleName: string | null;
  responsibleType: "ME" | "OTHER" | "UNKNOWN";
  responsiblePerson: { id: string; name: string; relation: string | null } | null;
};

type PaymentAccountApi = {
  id: string;
  name: string;
  type: string;
};

type CalendarApiEvent = {
  id: string;
  connectedAccountId?: string;
  accountEmail?: string;
  accountLabel?: string;
  accountType?: "PERSONAL" | "WORK" | "OTHER";
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

type MonitoredProductApi = {
  id: string;
  title: string;
  url: string | null;
  targetPrice: number;
  currentPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  averagePrice: number | null;
  source: string | null;
  active: boolean;
  lastChecked: string | null;
  lastAttemptedAt?: string | null;
  lastCheckError?: string | null;
  isOpportunity: boolean;
  alerts?: { id: string; price: number; targetPrice: number; createdAt: string }[];
  priceHistory?: { price: number; currency: string; source: string | null; observedAt: string }[];
};

type ApiTask = {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueAt: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  completedAt: string | null;
  bill?: {
    id: string;
    merchant: string | null;
    amount: number | null;
    dueDate: string | null;
    status: "NEEDS_REVIEW" | "CONFIRMED" | "SCHEDULED" | "PAID" | "IGNORED";
    sourceUrl: string | null;
    paymentUrl: string | null;
    pixCode: string | null;
    barcode: string | null;
  } | null;
};

type DashboardTask = Omit<Task, "id" | "priority"> & {
  id: string;
  priority: Task["priority"];
  bill?: ApiTask["bill"];
};

function mapApiTask(task: ApiTask): DashboardTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    priority:
      task.priority === "HIGH"
        ? "Alta"
        : task.priority === "LOW"
          ? "Baixa"
          : "Média",
    due: formatDueDate(task.dueAt),
    completed: task.status === "COMPLETED",
    bill: task.bill,
  };
}

function formatDueDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (date.toDateString() === now.toDateString()) return "Hoje";
  if (date.toDateString() === tomorrow.toDateString()) return "Amanhã";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatPriceCheckError(message: string) {
  if (message.includes("AI_GATEWAY_API_KEY") || message.includes("AI Gateway")) {
    return "A loja não mostrou o preço e a busca inteligente ainda não está conectada ao servidor.";
  }
  return message;
}

type ConflictResult = {
  conflictIds: Set<string>;
  crossAccountConflicts: Array<{
    titleA: string;
    accountA: string;
    titleB: string;
    accountB: string;
    time: string;
  }>;
};

function detectCalendarConflicts(events: CalendarApiEvent[]): ConflictResult {
  const conflictIds = new Set<string>();
  const crossAccountConflicts: ConflictResult["crossAccountConflicts"] = [];

  for (let i = 0; i < events.length; i++) {
    const eventA = events[i];
    if (!eventA) continue;
    const startA = eventA.start?.dateTime ? new Date(eventA.start.dateTime).getTime() : null;
    const endA = eventA.end?.dateTime ? new Date(eventA.end.dateTime).getTime() : null;
    if (!startA || !endA) continue;
    for (let j = i + 1; j < events.length; j++) {
      const eventB = events[j];
      if (!eventB) continue;
      const startB = eventB.start?.dateTime ? new Date(eventB.start.dateTime).getTime() : null;
      const endB = eventB.end?.dateTime ? new Date(eventB.end.dateTime).getTime() : null;
      if (!startB || !endB) continue;
      if (startA < endB && startB < endA) {
        conflictIds.add(eventA.id);
        conflictIds.add(eventB.id);

        const emailA = eventA.accountEmail;
        const emailB = eventB.accountEmail;
        if (
          emailA &&
          emailB &&
          emailA.toLowerCase() !== emailB.toLowerCase()
        ) {
          const startDate = new Date(Math.max(startA, startB));
          crossAccountConflicts.push({
            titleA: eventA.summary ?? "Compromisso",
            accountA: eventA.accountLabel || (eventA.accountType === "WORK" ? "Profissional" : "Pessoal"),
            titleB: eventB.summary ?? "Compromisso",
            accountB: eventB.accountLabel || (eventB.accountType === "WORK" ? "Profissional" : "Pessoal"),
            time: startDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          });
        }
      }
    }
  }
  return { conflictIds, crossAccountConflicts };
}

const useDemoFixtures = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function Dashboard() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const savedTheme = window.localStorage.getItem("painel-da-vida-theme");
      if (savedTheme) return savedTheme === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });
  const [tasks, setTasks] = useState<DashboardTask[]>(
    useDemoFixtures ? initialTasks.map((task) => ({ ...task, id: String(task.id) })) : [],
  );
  const [today] = useState<Date>(() => new Date());
  const [mobile, setMobile] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [databaseError, setDatabaseError] = useState(false);

  // Connected Accounts State
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccountApi[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [selectedCalendarAccount, setSelectedCalendarAccount] = useState<string>("all");
  const [selectedGmailAccount, setSelectedGmailAccount] = useState<string>("all");
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountLabel, setEditingAccountLabel] = useState("");
  const [editingAccountType, setEditingAccountType] = useState<"PERSONAL" | "WORK" | "OTHER">("PERSONAL");
  const [accountActionMessage, setAccountActionMessage] = useState<string | null>(null);
  const [integrationBanner, setIntegrationBanner] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const integration = params.get("integration");
    if (!integration) return null;

    const connected = params.get("connected");
    const accountParam = params.get("account");
    const errorParam = params.get("error");

    if (connected === "1" || connected === "simulated") {
      const accName = accountParam || "Google";
      return {
        type: "success",
        message: `Conta ${accName} conectada com sucesso ao Painel da Vida! E-mails e agenda sincronizados.`,
      };
    }

    if (errorParam) {
      const errorDescriptions: Record<string, string> = {
        missing_google_credentials: "As credenciais do Google OAuth não estão configuradas no servidor.",
        missing_credentials: "Credenciais de autenticação não configuradas no ambiente.",
        oauth_csrf_validation_failed: "A validação de segurança OAuth expirou ou foi cancelada. Tente novamente.",
        token_exchange_failed: "Não foi possível validar o código de autorização com o Google.",
        access_denied: "Autorização cancelada pelo usuário no Google.",
        userinfo_failed: "Não foi possível obter os dados da conta Google.",
        persistence_failed: "Falha ao gravar os dados da conta conectada no banco.",
      };
      const desc = errorDescriptions[errorParam] || `Falha na autenticação (${errorParam}).`;
      return {
        type: "error",
        message: `Erro na conexão: ${desc}`,
      };
    }

    return null;
  });

  const [realCalendarEvents, setRealCalendarEvents] = useState<CalendarApiEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState(false);
  const [gmailMessages, setGmailMessages] = useState<GmailApiMessage[]>([]);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailError, setGmailError] = useState(false);
  const [creatingEmailTaskId, setCreatingEmailTaskId] = useState<string | null>(null);
  const [emailTaskError, setEmailTaskError] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bills, setBills] = useState<BillApi[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountApi[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string; relation: string | null }[]>([]);
  const [billLoading, setBillLoading] = useState(true);
  const [billScanning, setBillScanning] = useState(false);
  const [billMessage, setBillMessage] = useState<string | null>(null);

  // Price monitoring state
  const [products, setProducts] = useState<MonitoredProductApi[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [priceChecking, setPriceChecking] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [priceCheckMessage, setPriceCheckMessage] = useState<string | null>(null);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductTitle, setNewProductTitle] = useState("");
  const [newProductTarget, setNewProductTarget] = useState("");
  const [newProductSource, setNewProductSource] = useState("Amazon");
  const [newProductUrl, setNewProductUrl] = useState("");
  const [addProductLoading, setAddProductLoading] = useState(false);
  const [addProductError, setAddProductError] = useState<string | null>(null);

  // Quick Task Creation
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"Alta" | "Média" | "Baixa">("Média");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [taskCreateLoading, setTaskCreateLoading] = useState(false);
  const [taskCreateError, setTaskCreateError] = useState<string | null>(null);

  // Task Filter tab
  const [taskTab, setTaskTab] = useState<"TODAS" | "HOJE" | "ATRASADAS" | "CONTAS">("TODAS");

  // Email Category tab
  const [emailTab, setEmailTab] = useState<"TODAS" | "RESPOND_TODAY" | "FOLLOW_UP" | "INFORMATIVE" | "NOISE">("TODAS");
  const [showNoise, setShowNoise] = useState(false);

  // Quick Payment Modal
  const [activePaymentBill, setActivePaymentBill] = useState<BillApi | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Accounts and people modal/form
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<PaymentAccountApi["type"]>("BANK_ACCOUNT");
  const [newAccountLoading, setNewAccountLoading] = useState(false);
  const [newAccountError, setNewAccountError] = useState<string | null>(null);

  const [newPersonOpen, setNewPersonOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRelation, setNewPersonRelation] = useState("");
  const [newPersonLoading, setNewPersonLoading] = useState(false);
  const [newPersonError, setNewPersonError] = useState<string | null>(null);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Clean up OAuth return query params from address bar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("integration")) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobile]);

  // Escape key listener for mobile drawer, dropdowns, and modals
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mobile) setMobile(false);
        if (notificationsOpen) setNotificationsOpen(false);
        if (profileOpen) setProfileOpen(false);
        if (newProductOpen) setNewProductOpen(false);
        if (newTaskOpen) setNewTaskOpen(false);
        if (activePaymentBill) setActivePaymentBill(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobile, notificationsOpen, profileOpen, newProductOpen, newTaskOpen, activePaymentBill]);

  function toggleTheme() {
    const nextTheme = darkMode ? "light" : "dark";
    const isDark = nextTheme === "dark";
    setDarkMode(isDark);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem("painel-da-vida-theme", nextTheme);
  }

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res = await fetch("/api/integrations/accounts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setConnectedAccounts(data.accounts ?? []);
      }
    } catch (e) {
      console.error("Error loading connected accounts:", e);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadCalendar = useCallback(async (accId?: string) => {
    setCalendarLoading(true);
    try {
      const targetId = accId !== undefined ? accId : "all";
      const query = targetId && targetId !== "all" ? `?accountId=${encodeURIComponent(targetId)}` : "";
      const response = await fetch(`/api/calendar/events${query}`, { cache: "no-store" });
      if (response.status === 409 || response.status === 401) {
        throw new Error("Google Calendar não autorizado.");
      }
      if (!response.ok) throw new Error("Falha ao carregar agenda.");
      const data = (await response.json()) as { items?: CalendarApiEvent[] };
      setRealCalendarEvents(data.items ?? []);
      setCalendarError(false);
    } catch {
      setCalendarError(true);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const loadGmail = useCallback(async (accId?: string) => {
    setGmailLoading(true);
    try {
      const targetId = accId !== undefined ? accId : "all";
      const params = new URLSearchParams({ includeNoise: "true" });
      if (targetId && targetId !== "all") params.set("accountId", targetId);
      const response = await fetch(`/api/gmail/messages?${params.toString()}`, { cache: "no-store" });
      if (response.status === 409 || response.status === 401) {
        throw new Error("Gmail não autorizado.");
      }
      if (!response.ok) throw new Error("Falha ao carregar Gmail.");
      const data = (await response.json()) as { messages?: GmailApiMessage[] };
      setGmailMessages(data.messages ?? []);
      setGmailError(false);
    } catch {
      setGmailError(true);
    } finally {
      setGmailLoading(false);
    }
  }, []);

  async function handleSyncAccount(accountId: string) {
    setSyncingAccountId(accountId);
    setAccountActionMessage(null);
    try {
      const res = await fetch(`/api/integrations/accounts/${accountId}/sync`, { method: "POST" });
      if (res.ok) {
        setAccountActionMessage("Conta sincronizada com sucesso!");
        await loadAccounts();
        await loadCalendar();
        await loadGmail();
      } else {
        const err = await res.json();
        setAccountActionMessage(err.error || "Falha ao sincronizar conta.");
      }
    } catch {
      setAccountActionMessage("Erro ao tentar sincronizar.");
    } finally {
      setSyncingAccountId(null);
    }
  }

  async function handleDisconnectAccount(accountId: string) {
    if (!window.confirm("Deseja realmente desconectar esta conta? As outras contas conectadas continuarão ativas e seu login no Painel da Vida permanecerá seguro.")) {
      return;
    }
    setDisconnectingAccountId(accountId);
    setAccountActionMessage(null);
    try {
      const res = await fetch(`/api/integrations/accounts/${accountId}`, { method: "DELETE" });
      if (res.ok) {
        setAccountActionMessage("Conta desconectada com sucesso.");
        await loadAccounts();
        await loadCalendar();
        await loadGmail();
      }
    } catch (e) {
      console.error("Error disconnecting account:", e);
    } finally {
      setDisconnectingAccountId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      try {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        if (!response.ok) throw new Error("Falha ao carregar tarefas.");
        const data = (await response.json()) as ApiTask[];
        if (!cancelled) {
          setTasks(data.map(mapApiTask));
          setDatabaseError(false);
        }
      } catch {
        if (!cancelled) setDatabaseError(true);
      } finally {
        if (!cancelled) setLoadingTasks(false);
      }
    }

    void (async () => {
      await Promise.allSettled([
        loadTasks(),
        loadAccounts(),
        loadCalendar("all"),
        loadGmail("all"),
      ]);
    })();

    async function loadBills() {
      try {
        const [billResponse, accountResponse, peopleResponse] = await Promise.all([
          fetch("/api/bills", { cache: "no-store" }),
          fetch("/api/payment-accounts", { cache: "no-store" }),
          fetch("/api/people", { cache: "no-store" }),
        ]);
        if (!billResponse.ok || !accountResponse.ok) throw new Error("Falha ao carregar contas.");
        const billData = (await billResponse.json()) as BillApi[];
        const accountData = (await accountResponse.json()) as PaymentAccountApi[];
        const peopleData = peopleResponse.ok ? ((await peopleResponse.json()) as { id: string; name: string; relation: string | null }[]) : [];
        if (!cancelled) {
          setBills(billData);
          setPaymentAccounts(accountData);
          setPeople(peopleData);
        }

        const lastScan = Number(window.localStorage.getItem("painel-da-vida:last-bill-scan") ?? "0");
        if (Date.now() - lastScan >= 30 * 60 * 1000) {
          window.localStorage.setItem("painel-da-vida:last-bill-scan", String(Date.now()));
          void (async () => {
            try {
              const scanResponse = await fetch("/api/bills/scan", { method: "POST", cache: "no-store" });
              if (!scanResponse.ok) return;
              const refreshedBills = await fetch("/api/bills", { cache: "no-store" });
              if (!refreshedBills.ok || cancelled) return;
              setBills((await refreshedBills.json()) as BillApi[]);
            } catch {
              // fallback silent
            }
          })();
        }
      } catch {
        if (!cancelled) setBillMessage("Não foi possível carregar as contas.");
      } finally {
        if (!cancelled) setBillLoading(false);
      }
    }

    void loadBills();

    async function loadProducts() {
      try {
        const response = await fetch("/api/products", { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as MonitoredProductApi[];
          if (!cancelled) setProducts(data);
        }
      } catch {
        // fallback
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, [loadAccounts, loadCalendar, loadGmail]);

  const copyToClipboard = (text: string, key: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  const done = useMemo(() => tasks.filter((task) => task.completed).length, [tasks]);

  const dateLabel = today.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  async function toggle(id: string) {
    const current = tasks.find((task) => task.id === id);
    if (!current) return;

    const completed = !current.completed;

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === id ? { ...task, completed } : task,
      ),
    );

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });

      if (!response.ok) throw new Error("Falha ao atualizar tarefa.");
      const billsResponse = await fetch("/api/bills", { cache: "no-store" });
      if (billsResponse.ok) setBills((await billsResponse.json()) as BillApi[]);
    } catch {
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === id ? { ...task, completed: current.completed } : task,
        ),
      );
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) {
      setTaskCreateError("Informe o título da tarefa.");
      return;
    }

    setTaskCreateLoading(true);
    setTaskCreateError(null);

    try {
      const priorityMap: Record<string, "LOW" | "MEDIUM" | "HIGH"> = {
        Alta: "HIGH",
        Média: "MEDIUM",
        Baixa: "LOW",
      };

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          priority: priorityMap[newTaskPriority] ?? "MEDIUM",
          dueAt: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data) {
        setTasks((prev) => [mapApiTask(data as ApiTask), ...prev]);
        setNewTaskTitle("");
        setNewTaskDueDate("");
        setNewTaskOpen(false);
      } else {
        const errorMsg = data?.error || `Falha ao salvar tarefa (código ${response.status}).`;
        setTaskCreateError(errorMsg);
      }
    } catch {
      setTaskCreateError("Erro de conexão ao criar tarefa. Verifique sua rede.");
    } finally {
      setTaskCreateLoading(false);
    }
  }

  async function handleCreateTaskFromEmail(message: GmailApiMessage) {
    const headers = message.payload?.headers ?? [];
    const header = (name: string) => headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
    const subject = header("subject") || message.subject || "Ação de e-mail";
    const sender = header("from") || message.sender || message.senderName || "Remetente desconhecido";
    const dateHeader = header("date");
    const receivedDate = message.internalDate
      ? new Date(Number(message.internalDate))
      : dateHeader ? new Date(dateHeader) : new Date();
    const receivedAt = Number.isNaN(receivedDate.getTime()) ? new Date().toISOString() : receivedDate.toISOString();

    setCreatingEmailTaskId(message.id);
    setEmailTaskError(null);
    try {
      const response = await fetch("/api/gmail/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalId: message.id,
          threadId: message.threadId,
          connectedAccountId: message.connectedAccountId,
          sender,
          subject,
          snippet: message.snippet ?? "",
          category: message.dashboardCategory,
          receivedAt,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível criar a tarefa.");

      const task = result.task as ApiTask;
      setTasks((current) => current.some((item) => item.id === task.id)
        ? current
        : [mapApiTask(task), ...current]);
      setGmailMessages((current) => current.map((item) => item.id === message.id
        ? { ...item, taskId: task.id }
        : item));
    } catch (error) {
      setEmailTaskError(error instanceof Error ? error.message : "Não foi possível criar a tarefa.");
    } finally {
      setCreatingEmailTaskId(null);
    }
  }

  async function handleCheckPrices() {
    setPriceChecking(true);
    setPriceCheckMessage(null);
    try {
      const response = await fetch("/api/products/check", { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(result.error ?? "Não foi possível consultar os preços.");
      }
      const refreshed = await fetch("/api/products", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Consulta concluída, mas não foi possível atualizar o painel.");
      setProducts((await refreshed.json()) as MonitoredProductApi[]);
      setPriceCheckMessage(result.failed
        ? `Consulta concluída: ${result.updated} atualizados, ${result.failed} com falha.`
        : `Consulta concluída: ${result.updated} produto(s) atualizado(s).`);
    } catch (error) {
      setPriceCheckMessage(error instanceof Error ? error.message : "Falha ao consultar preços.");
    } finally {
      setPriceChecking(false);
    }
  }

  async function markPriceAlertRead(productId: string, alertId: string) {
    try {
      const response = await fetch(`/api/price-alerts/${alertId}`, { method: "PATCH" });
      if (!response.ok) return;
      setProducts((current) => current.map((product) =>
        product.id === productId
          ? { ...product, alerts: product.alerts?.filter((alert) => alert.id !== alertId) }
          : product,
      ));
    } catch (error) {
      console.error("Não foi possível dispensar o alerta de preço:", error);
    }
  }

  async function handleDeleteProduct(product: MonitoredProductApi) {
    if (!window.confirm('Apagar "' + product.title + '" do monitoramento?')) return;

    setDeletingProductId(product.id);
    setPriceCheckMessage(null);
    try {
      const response = await fetch("/api/products/" + product.id, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Não foi possível apagar o produto.");

      setProducts((current) => current.filter((item) => item.id !== product.id));
      setPriceCheckMessage('"' + product.title + '" foi removido do monitoramento.');
    } catch (error) {
      setPriceCheckMessage(error instanceof Error ? error.message : "Não foi possível apagar o produto.");
    } finally {
      setDeletingProductId(null);
    }
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    const title = newProductTitle.trim();
    const targetPrice = parseFloat(newProductTarget);

    if (!title || Number.isNaN(targetPrice) || targetPrice <= 0) {
      setAddProductError("Informe o nome do produto e um preço alvo válido maior que zero.");
      return;
    }
    if (!newProductUrl.trim()) {
      setAddProductError("Informe o link HTTPS do produto para iniciar o monitoramento.");
      return;
    }

    setAddProductLoading(true);
    setAddProductError(null);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          targetPrice,
          source: newProductSource,
          url: newProductUrl.trim() || null,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data) {
        setProducts((prev) => [data as MonitoredProductApi, ...prev]);
        setNewProductTitle("");
        setNewProductTarget("");
        setNewProductUrl("");
        setNewProductOpen(false);
        setPriceCheckMessage(`"${title}" cadastrado com sucesso.`);
      } else {
        const errorMsg = (data && typeof data.error === "string" && data.error)
          ? data.error
          : response.status === 401
            ? "Você precisa estar autenticado para cadastrar produtos."
            : response.status === 503
              ? "Serviço de banco de dados temporariamente indisponível."
              : `Não foi possível cadastrar o produto (erro ${response.status}).`;
        setAddProductError(errorMsg);
      }
    } catch {
      setAddProductError("Erro de conexão com o servidor. Verifique sua rede e tente novamente.");
    } finally {
      setAddProductLoading(false);
    }
  }

  // Conflict detection
  const conflictInfo = useMemo(() => detectCalendarConflicts(realCalendarEvents), [realCalendarEvents]);
  const conflictIds = conflictInfo.conflictIds;

  // Calculations for Summary Header ("Seu dia em 30 segundos")
  const openBills = useMemo(() => bills.filter((bill) => bill.status !== "PAID"), [bills]);
  const overdueBills = useMemo(() => openBills.filter((bill) => bill.dueDate && new Date(bill.dueDate) < today), [openBills, today]);

  const billsDue10Days = useMemo(() => {
    const todayTime = today.getTime();
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    return openBills.filter((bill) => {
      if (!bill.dueDate) return false;
      const dueTime = new Date(bill.dueDate).getTime();
      return dueTime - todayTime <= tenDays;
    });
  }, [openBills, today]);

  const billTotal = openBills.reduce((sum, bill) => sum + (bill.amount ?? 0), 0);
  const pendingTasks = tasks.filter((task) => !task.completed);
  const overdueTasks = tasks.filter((task) => !task.completed && task.due === "Atrasada");
  const todayTasks = tasks.filter((task) => task.due === "Hoje");
  const billTasks = tasks.filter((task) => !!task.bill);

  // Email filtering and counts
  const categorizedEmails = useMemo(() => {
    const map = {
      RESPOND_TODAY: [] as GmailApiMessage[],
      FOLLOW_UP: [] as GmailApiMessage[],
      INFORMATIVE: [] as GmailApiMessage[],
      NOISE: [] as GmailApiMessage[],
    };

    gmailMessages.forEach((msg) => {
      const cat = msg.dashboardCategory || "INFORMATIVE";
      if (map[cat]) map[cat].push(msg);
      else map.INFORMATIVE.push(msg);
    });

    return map;
  }, [gmailMessages]);

  const actionableEmailsCount = categorizedEmails.RESPOND_TODAY.length + categorizedEmails.FOLLOW_UP.length;

  const productOpportunities = useMemo(() => {
    return products.filter((p) => p.currentPrice !== null && p.currentPrice <= p.targetPrice);
  }, [products]);

  // Tasks display filter
  const filteredTasks = useMemo(() => {
    if (taskTab === "HOJE") return tasks.filter((t) => t.due === "Hoje");
    if (taskTab === "ATRASADAS") return tasks.filter((t) => !t.completed && t.due === "Atrasada");
    if (taskTab === "CONTAS") return tasks.filter((t) => !!t.bill);
    return tasks;
  }, [tasks, taskTab]);

  // Gmail display filter
  const displayedEmails = useMemo(() => {
    if (emailTab === "RESPOND_TODAY") return categorizedEmails.RESPOND_TODAY;
    if (emailTab === "FOLLOW_UP") return categorizedEmails.FOLLOW_UP;
    if (emailTab === "INFORMATIVE") return categorizedEmails.INFORMATIVE;
    if (emailTab === "NOISE") return categorizedEmails.NOISE;
    // TODAS: hide noise unless explicitly requested
    return showNoise
      ? gmailMessages
      : gmailMessages.filter((m) => m.dashboardCategory !== "NOISE");
  }, [emailTab, categorizedEmails, gmailMessages, showNoise]);

  const completionRate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const todayEventCount = realCalendarEvents.length;
  const highPriorityPending = pendingTasks.filter((task) => task.priority === "Alta").length;
  const notificationCount =
    (highPriorityPending > 0 ? 1 : 0) +
    (actionableEmailsCount > 0 ? 1 : 0) +
    (todayEventCount > 0 ? 1 : 0) +
    (billsDue10Days.length > 0 ? 1 : 0) +
    (productOpportunities.length > 0 ? 1 : 0);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-150">
      <div className="flex min-h-screen">
        {/* Sidebar Desktop */}
        <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col dark:border-[#2e3f37] dark:bg-[#17211d]">
          <Sidebar
            connectedAccounts={connectedAccounts}
            onOpenAccountsModal={() => setAccountsModalOpen(true)}
          />
        </aside>

        {/* Mobile Backdrop */}
        {mobile && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
            onClick={() => setMobile(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile Sidebar */}
        <aside
          id="mobile-sidebar"
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal de navegação"
          className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:hidden dark:border-[#2e3f37] dark:bg-[#17211d] ${
            mobile ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-[#2e3f37]">
              <Logo />
              <button
                type="button"
                onClick={() => setMobile(false)}
                aria-label="Fechar menu de navegação"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#1e2b26] transition"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <SidebarContent
              connectedAccounts={connectedAccounts}
              onOpenAccountsModal={() => {
                setAccountsModalOpen(true);
                setMobile(false);
              }}
              onNavigate={() => setMobile(false)}
            />
          </div>
        </aside>

        {/* Main Content Area */}
        <section className="min-w-0 flex-1">
          {/* Header Bar */}
          <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8 dark:border-[#2e3f37] dark:bg-[#17211d]/95">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobile(true)}
                aria-label="Abrir menu de navegação"
                aria-expanded={mobile}
                aria-controls="mobile-sidebar"
                className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-[#1e2b26] transition"
              >
                <Menu size={21} aria-hidden="true" />
              </button>
              <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-400 sm:flex dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#95a89f]">
                <Search size={16} />
                <span>Buscar eventos, tarefas, boletos...</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
                title={darkMode ? "Modo claro" : "Modo escuro"}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-slate-200 dark:hover:bg-[#263730]"
              >
                {darkMode ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                type="button"
                onClick={() => setAccountsModalOpen(true)}
                title="Clique para gerenciar suas contas Google conectadas"
                className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 sm:inline-flex hover:bg-emerald-100 transition cursor-pointer dark:border-[#264f40] dark:bg-[#17382d] dark:text-[#67d9ae] dark:hover:bg-[#1f4a3c]"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                {connectedAccounts.length > 1
                  ? `${connectedAccounts.length} Contas Conectadas`
                  : "Google Conectado"}
              </button>

              {/* Notifications Dropdown */}
              <div ref={notificationsRef} className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((open) => !open)}
                  aria-label="Notificações e alertas do dia"
                  className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-slate-200 dark:hover:bg-[#263730] transition"
                >
                  <Bell size={18} />
                  {notificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-xs">
                      {notificationCount}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-12 z-50 w-[340px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#2e3f37]">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-[#e6ede9]">Alertas do Dia</h3>
                      <span className="text-[11px] font-medium text-slate-400 dark:text-[#95a89f]">{notificationCount} pendências</span>
                    </div>
                    <div className="mt-2 space-y-1.5 max-h-[380px] overflow-y-auto">
                      {notificationCount === 0 ? (
                        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-[#1e2b26] dark:text-[#95a89f]">Tudo em ordem no momento.</p>
                      ) : (
                        <>
                          {conflictIds.size > 0 && (
                            <NotificationItem
                              icon={<AlertTriangle className="text-amber-600 dark:text-amber-400" size={16} />}
                              title={`${conflictIds.size / 2} conflito(s) de horário na agenda!`}
                              badge="Urgente"
                            />
                          )}
                          {billsDue10Days.length > 0 && (
                            <NotificationItem
                              icon={<FileText className="text-red-600 dark:text-rose-400" size={16} />}
                              title={`${billsDue10Days.length} conta(s) vencendo nos próximos 10 dias`}
                              badge="Atenção"
                            />
                          )}
                          {productOpportunities.length > 0 && (
                            <NotificationItem
                              icon={<ShoppingCart className="text-emerald-600 dark:text-[#00b37e]" size={16} />}
                              title={`${productOpportunities.length} produto atingiu o preço desejado!`}
                              badge="Oportunidade"
                            />
                          )}
                          {highPriorityPending > 0 && (
                            <NotificationItem
                              icon={<Target className="text-[#00875f] dark:text-[#00b37e]" size={16} />}
                              title={`${highPriorityPending} tarefa(s) de alta prioridade`}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Profile Dropdown */}
              <div ref={profileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-label="Menu do usuário"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00875f] text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] dark:bg-[#00b37e] dark:text-[#00291d]"
                >
                  FT
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-12 z-50 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-[#2e3f37]">
                      <p className="text-xs font-semibold text-slate-800 dark:text-[#e6ede9]">Fábio Teraoka</p>
                      <p className="text-[11px] text-slate-400 truncate dark:text-[#95a89f]">Painel da Vida</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountsModalOpen(true);
                        setProfileOpen(false);
                      }}
                      className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#00875f] hover:bg-emerald-50 transition dark:text-[#00b37e] dark:hover:bg-[#1e2b26]"
                    >
                      <span>Contas Conectadas</span>
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800 font-bold dark:bg-[#17382d] dark:text-[#67d9ae]">
                        {connectedAccounts.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void signOut({ callbackUrl: "/login" })}
                      className="w-full mt-1 rounded-xl px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                      Sair da conta
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1520px] p-4 sm:p-6 lg:p-8 space-y-7">
            {/* Feedback Banner for OAuth & Account Integrations */}
            {integrationBanner && (
              <div
                role="status"
                className={`rounded-2xl p-4 flex items-center justify-between shadow-xs border ${
                  integrationBanner.type === "success"
                    ? "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-[#17382d] dark:text-[#67d9ae] dark:border-[#264f40]"
                    : "bg-red-50 text-red-900 border-red-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  {integrationBanner.type === "success" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-[#00b37e] shrink-0" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-rose-400 shrink-0" />
                  )}
                  <p className="text-sm font-medium">{integrationBanner.message}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {integrationBanner.type === "error" && (
                    <button
                      type="button"
                      onClick={() => setAccountsModalOpen(true)}
                      className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-800 border border-slate-200 hover:bg-slate-50 dark:bg-[#17211d] dark:text-[#e6ede9] dark:border-[#2e3f37] cursor-pointer"
                    >
                      Gerenciar Contas
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIntegrationBanner(null)}
                    className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    aria-label="Dispensar aviso"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Top Greeting & Date */}
            <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#00875f] uppercase tracking-wider dark:text-[#00b37e]">
                  <CalendarDays size={14} />
                  {dateLabel}
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-[#e6ede9]">
                  ☀️ Bom dia, Fábio.
                </h1>
                <p className="mt-1.5 text-sm text-slate-500 sm:text-base dark:text-[#95a89f]">
                  Seu filtro inteligente: veja apenas o que realmente importa e precisa da sua ação.
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                <Stat value={todayEventCount} label="Agenda" color="text-blue-600 dark:text-blue-400" />
                <Stat value={pendingTasks.length} label="Tarefas" color="text-[#00875f] dark:text-[#00b37e]" />
                <Stat value={actionableEmailsCount} label="E-mails" color="text-purple-600 dark:text-purple-400" />
                <Stat value={billsDue10Days.length} label="Boletos 10d" color="text-amber-600 dark:text-amber-400" />
              </div>
            </section>

            {/* SEU DIA EM 30 SEGUNDOS */}
            <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white p-5 shadow-xs sm:p-6 dark:border-[#2e3f37] dark:bg-gradient-to-br dark:from-[#17382d]/80 dark:via-[#17211d] dark:to-[#17211d]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#00875f] text-white shadow-xs dark:bg-[#00b37e] dark:text-[#00291d]">
                  <Sparkles size={22} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">Seu dia em 30 segundos</h2>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-[#1e2b26] dark:text-[#67d9ae]">
                      Síntese em tempo real
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-sm text-slate-700 leading-relaxed font-medium dark:text-[#c7d5cd]">
                    <p>
                      📅 Você tem <strong className="text-slate-900 dark:text-white">{todayEventCount} compromissos</strong>,{" "}
                      <strong className="text-slate-900 dark:text-white">{pendingTasks.length} tarefas pendentes</strong> e{" "}
                      <strong className="text-slate-900 dark:text-white">{actionableEmailsCount} e-mails</strong> que merecem atenção hoje.
                    </p>
                    <p className={billsDue10Days.length > 0 ? "text-amber-800 dark:text-amber-300" : "text-slate-600 dark:text-[#95a89f]"}>
                      ⚠️ <strong className="font-semibold">{billsDue10Days.length} conta(s)</strong> vencem nos próximos 10 dias
                      {overdueBills.length > 0 && ` (sendo ${overdueBills.length} já vencida(s)!)`}.
                    </p>
                    {productOpportunities.length > 0 ? (
                      <p className="text-emerald-700 font-semibold dark:text-[#67d9ae]">
                        🛒 <strong>{productOpportunities.length} produto monitorado</strong> atingiu o preço desejado que você definiu!
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs dark:text-[#95a89f]">
                        🛒 {products.length} produto(s) monitorado(s) ativamente (nenhum atingiu a meta hoje).
                      </p>
                    )}
                  </div>

                  {/* Highlights / Alert tags */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {conflictIds.size > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-800/40">
                        <AlertTriangle size={13} />
                        Conflito de agenda detectado
                      </span>
                    )}
                    {categorizedEmails.RESPOND_TODAY.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800/40">
                        <Mail size={13} />
                        {categorizedEmails.RESPOND_TODAY.length} para responder hoje
                      </span>
                    )}
                    {overdueTasks.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 border border-red-200 dark:bg-rose-950/40 dark:border-rose-900/50 dark:text-rose-300">
                        <Clock3 size={13} />
                        {overdueTasks.length} tarefa(s) atrasada(s)
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-[#1e2b26] dark:text-[#95a89f]">
                      Total de contas em aberto: R$ {billTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* SEÇÃO 1: CONTAS E BOLETOS */}
            <div id="contas" tabIndex={-1}>
              <Card
                title="Contas a pagar e Boletos"
                icon={<FileText size={19} className="text-[#00875f] dark:text-[#00b37e]" />}
                action={billScanning ? "Analisando..." : "Sincronizar Gmail agora"}
                onActionClick={async () => {
                  setBillScanning(true);
                  setBillMessage(null);
                  try {
                    const response = await fetch("/api/bills/scan", { method: "POST" });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error ?? "Não foi possível verificar o Gmail.");
                    const billsResponse = await fetch("/api/bills", { cache: "no-store" });
                    if (billsResponse.ok) setBills((await billsResponse.json()) as BillApi[]);
                    const tasksResponse = await fetch("/api/tasks", { cache: "no-store" });
                    if (tasksResponse.ok) setTasks(((await tasksResponse.json()) as ApiTask[]).map(mapApiTask));
                    setBillMessage(data.detected > 0 ? `${data.detected} conta(s) encontrada(s) no Gmail.` : "Nenhuma conta nova encontrada.");
                  } catch (error) {
                    setBillMessage(error instanceof Error ? error.message : "Falha ao verificar o Gmail.");
                  } finally {
                    setBillScanning(false);
                  }
                }}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-[#2e3f37]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                        {openBills.length} em aberto
                      </span>
                      <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-[#1e2b26] dark:text-[#e6ede9]">
                        Total: R$ {billTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                      {overdueBills.length > 0 && (
                        <span className="rounded-xl bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {overdueBills.length} vencida(s)
                        </span>
                      )}
                    </div>
                    {billMessage && <span className="text-xs font-medium text-slate-500 dark:text-[#95a89f]">{billMessage}</span>}
                  </div>

                  {billLoading ? (
                    <p className="py-4 text-center text-sm text-slate-400 dark:text-[#95a89f]">Carregando contas detectadas...</p>
                  ) : bills.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-[#2e3f37] dark:text-[#95a89f]">
                      Nenhuma conta identificada ainda. Clique em &quot;Sincronizar Gmail agora&quot; para analisar boletos de energia, condomínio, internet e cartões.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {bills
                        .filter((bill) => bill.status !== "PAID")
                        .slice(0, 8)
                        .map((bill) => (
                          <BillRow
                            key={bill.id}
                            bill={bill}
                            accounts={paymentAccounts}
                            people={people}
                            onPayClick={() => setActivePaymentBill(bill)}
                            onUpdated={(updated) =>
                              setBills((items) =>
                                items.map((item) =>
                                  item.id === updated.id
                                    ? {
                                        ...item,
                                        paymentAccount: updated.paymentAccount,
                                        status: updated.status,
                                        responsibleType: updated.responsibleType,
                                        responsiblePerson: updated.responsiblePerson,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        ))}
                    </div>
                  )}

                  {/* Gerenciamento de Pessoas e Contas de Pagamento */}
                  <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs dark:border-[#2e3f37]">
                    <div className="flex flex-wrap items-center gap-4">
                      {!newPersonOpen ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNewPersonOpen(true);
                            setNewPersonError(null);
                          }}
                          className="flex items-center gap-1 font-semibold text-[#00875f] hover:underline dark:text-[#00b37e]"
                        >
                          <Plus size={14} /> Cadastrar pessoa (ex.: Carol)
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={newPersonName}
                            onChange={(e) => setNewPersonName(e.target.value)}
                            placeholder="Nome (ex.: Carol)"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                          />
                          <input
                            value={newPersonRelation}
                            onChange={(e) => setNewPersonRelation(e.target.value)}
                            placeholder="Relação (ex.: Esposa)"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                          />
                          <button
                            type="button"
                            disabled={newPersonLoading}
                            onClick={async () => {
                              if (!newPersonName.trim()) {
                                setNewPersonError("Informe o nome.");
                                return;
                              }
                              setNewPersonLoading(true);
                              setNewPersonError(null);
                              try {
                                const response = await fetch("/api/people", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: newPersonName, relation: newPersonRelation }),
                                });
                                if (response.ok) {
                                  const person = await response.json();
                                  setPeople((items) => [...items, person]);
                                  setNewPersonName("");
                                  setNewPersonRelation("");
                                  setNewPersonOpen(false);
                                } else {
                                  setNewPersonError("Falha ao salvar pessoa.");
                                }
                              } catch {
                                setNewPersonError("Erro de conexão ao salvar.");
                              } finally {
                                setNewPersonLoading(false);
                              }
                            }}
                            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-[#00875f] dark:text-white"
                          >
                            {newPersonLoading ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewPersonOpen(false)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            Cancelar
                          </button>
                          {newPersonError && <span className="text-red-600 text-[11px]">{newPersonError}</span>}
                        </div>
                      )}

                      {!newAccountOpen ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNewAccountOpen(true);
                            setNewAccountError(null);
                          }}
                          className="flex items-center gap-1 font-semibold text-[#00875f] hover:underline dark:text-[#00b37e]"
                        >
                          <Plus size={14} /> Conta de saída (ex.: Itaú Débito)
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                            placeholder="Ex.: Itaú Débito"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
                          />
                          <button
                            type="button"
                            disabled={newAccountLoading}
                            onClick={async () => {
                              if (!newAccountName.trim()) {
                                setNewAccountError("Informe o nome da conta.");
                                return;
                              }
                              setNewAccountLoading(true);
                              setNewAccountError(null);
                              try {
                                const response = await fetch("/api/payment-accounts", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: newAccountName, type: newAccountType }),
                                });
                                if (response.ok) {
                                  const account = await response.json();
                                  setPaymentAccounts((items) => [...items, account]);
                                  setNewAccountName("");
                                  setNewAccountOpen(false);
                                } else {
                                  setNewAccountError("Falha ao salvar conta.");
                                }
                              } catch {
                                setNewAccountError("Erro de conexão ao salvar.");
                              } finally {
                                setNewAccountLoading(false);
                              }
                            }}
                            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-[#00875f] dark:text-white"
                          >
                            {newAccountLoading ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewAccountOpen(false)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            Cancelar
                          </button>
                          {newAccountError && <span className="text-red-600 text-[11px]">{newAccountError}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* SEÇÃO 2 & 3: AGENDA E TAREFAS */}
            <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
              {/* AGENDA */}
              <div className="space-y-6" id="agenda" tabIndex={-1}>
                <Card
                  title="Agenda Consolidada do Dia"
                  icon={<CalendarDays size={19} className="text-blue-600 dark:text-blue-400" />}
                  action="Abrir Google Agenda"
                  actionHref="https://calendar.google.com/calendar/u/0/r/day"
                >
                  {/* Account Selector Filter */}
                  <div className="mb-3 flex items-center justify-between gap-2 flex-wrap border-b border-slate-100 pb-2.5 dark:border-[#2e3f37]">
                    <div className="flex items-center gap-1 overflow-x-auto text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCalendarAccount("all");
                          void loadCalendar("all");
                        }}
                        className={`rounded-lg px-2.5 py-1 transition ${
                          selectedCalendarAccount === "all"
                            ? "bg-blue-600 text-white"
                            : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"
                        }`}
                      >
                        Todas as contas (Consolidada)
                      </button>
                      {connectedAccounts.map((acc) => {
                        const isWork = acc.accountType === "WORK";
                        const active = selectedCalendarAccount === acc.id;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              setSelectedCalendarAccount(acc.id);
                              void loadCalendar(acc.id);
                            }}
                            className={`rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 transition ${
                              active
                                ? isWork ? "bg-purple-600 text-white" : "bg-blue-600 text-white"
                                : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isWork ? "bg-purple-300" : "bg-blue-300"
                              }`}
                            />
                            {acc.label || (isWork ? "Google — profissional" : "Google — pessoal")}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setAccountsModalOpen(true)}
                      className="text-[11px] font-semibold text-[#00875f] hover:underline inline-flex items-center gap-1 shrink-0 dark:text-[#00b37e]"
                    >
                      <Plus size={13} /> Gerenciar contas
                    </button>
                  </div>

                  {/* Cross-calendar conflict alert */}
                  {conflictInfo.crossAccountConflicts.length > 0 && (
                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-900 space-y-1.5 shadow-2xs dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                      <div className="flex items-center gap-2 font-bold text-red-800 dark:text-rose-200">
                        <AlertTriangle size={16} className="text-red-600 shrink-0 dark:text-rose-400" />
                        <span>⚠️ Conflito entre calendários detectado: compromisso pessoal e profissional sobrepostos!</span>
                      </div>
                      {conflictInfo.crossAccountConflicts.map((c, i) => (
                        <p key={i} className="text-[11px] text-red-700 pl-6 leading-relaxed dark:text-rose-300">
                          • Às {c.time}: <strong>[{c.accountA}] &ldquo;{c.titleA}&rdquo;</strong> coincide com{" "}
                          <strong>[{c.accountB}] &ldquo;{c.titleB}&rdquo;</strong>
                        </p>
                      ))}
                    </div>
                  )}

                  {conflictIds.size > 0 && conflictInfo.crossAccountConflicts.length === 0 && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 flex items-center gap-2 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0 dark:text-amber-400" />
                      <span>
                        <strong>Atenção:</strong> Há sobreposição de horário em compromissos marcados abaixo.
                      </span>
                    </div>
                  )}

                  <div className="divide-y divide-slate-100 dark:divide-[#2e3f37]">
                    {calendarLoading ? (
                      <p className="py-4 text-sm text-slate-400 dark:text-[#95a89f]">Carregando compromissos...</p>
                    ) : realCalendarEvents.length === 0 ? (
                      <div className="py-6 text-center text-sm text-slate-500 dark:text-[#95a89f]">
                        {calendarError
                          ? "Google Calendar não conectado ou permissão pendente."
                          : "Nenhum compromisso agendado para hoje nesta visualização."}
                      </div>
                    ) : (
                      realCalendarEvents.map((event) => {
                        const start = event.start?.dateTime ? new Date(event.start.dateTime) : null;
                        const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
                        const time = start
                          ? start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                          : "Dia todo";
                        const isConflict = conflictIds.has(event.id);
                        const isWork = event.accountType === "WORK";

                        return (
                          <div key={event.id} className="flex gap-4 py-3.5 first:pt-1">
                            <div className="w-[60px] shrink-0 text-sm font-bold text-slate-600 dark:text-slate-300">{time}</div>
                            <div className={`flex-1 min-w-0 border-l-2 pl-3.5 ${isConflict ? "border-amber-400 bg-amber-50/30 rounded-r-xl py-1 dark:bg-amber-950/20" : "border-slate-200 dark:border-[#2e3f37]"}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <h3 className="text-sm font-semibold text-slate-800 truncate dark:text-[#e6ede9]">
                                    {event.summary ?? "Sem título"}
                                  </h3>
                                  {event.accountLabel && (
                                    <span
                                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${
                                        isWork
                                          ? "bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/40"
                                          : "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/40"
                                      }`}
                                      title={event.accountEmail}
                                    >
                                      {isWork ? "💼 Profissional" : "👤 Pessoal"}
                                    </span>
                                  )}
                                </div>
                                {event.htmlLink && (
                                  <a
                                    href={event.htmlLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-[#00875f] hover:underline inline-flex items-center gap-1 shrink-0 dark:text-[#00b37e]"
                                  >
                                    Abrir <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                              {isConflict && (
                                <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                  ⚠️ Conflito de horário
                                </span>
                              )}
                              {event.description && (
                                <p className="mt-1 text-xs text-slate-500 line-clamp-2 dark:text-[#95a89f]">{event.description}</p>
                              )}
                              {event.location && (
                                <p className="mt-1 text-[11px] text-slate-400 dark:text-[#95a89f]/80">{event.location}</p>
                              )}
                              {end && start && (
                                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-[#95a89f]/80">
                                  Término: {end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>

                {/* MONITORAMENTO DE PREÇOS */}
                <div id="compras" tabIndex={-1}>
                  <Card
                    title="Monitoramento de Preços"
                    icon={<ShoppingCart size={19} className="text-[#00875f] dark:text-[#00b37e]" />}
                    action="+ Monitorar Produto"
                    onActionClick={() => {
                      setNewProductOpen((v) => !v);
                      setAddProductError(null);
                    }}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-500 dark:text-[#95a89f]">Verificação automática diária; consulte manualmente quando quiser.</p>
                        <button
                          type="button"
                          onClick={() => void handleCheckPrices()}
                          disabled={priceChecking || productsLoading || products.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#67d9ae] dark:hover:bg-[#263730]"
                        >
                          <RefreshCw size={13} className={priceChecking ? "animate-spin" : ""} />
                          {priceChecking ? "Consultando..." : "Consultar preços agora"}
                        </button>
                      </div>
                      {priceCheckMessage && (
                        <p role="status" className="rounded-xl bg-slate-100 p-2 text-xs text-slate-700 dark:bg-[#1e2b26] dark:text-[#e6ede9]">
                          {priceCheckMessage}
                        </p>
                      )}

                      {/* Modal/Form de Cadastro de Produto */}
                      {newProductOpen && (
                        <form onSubmit={handleAddProduct} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3 dark:border-[#2e3f37] dark:bg-[#1e2b26]/70">
                          <h4 className="text-xs font-bold text-slate-800 dark:text-[#e6ede9]">Novo Produto para Monitorar</h4>

                          {addProductError && (
                            <div
                              role="alert"
                              className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 flex items-center gap-2"
                            >
                              <AlertCircle size={15} className="shrink-0 text-rose-600 dark:text-rose-400" />
                              <span>{addProductError}</span>
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              required
                              disabled={addProductLoading}
                              placeholder="Nome do produto (ex.: Panela de Pressão)"
                              value={newProductTitle}
                              onChange={(e) => {
                                setNewProductTitle(e.target.value);
                                if (addProductError) setAddProductError(null);
                              }}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00875f] disabled:opacity-60 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                            />
                            <input
                              required
                              disabled={addProductLoading}
                              type="number"
                              step="0.01"
                              placeholder="Preço desejado (ex.: 250.00)"
                              value={newProductTarget}
                              onChange={(e) => {
                                setNewProductTarget(e.target.value);
                                if (addProductError) setAddProductError(null);
                              }}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00875f] disabled:opacity-60 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                            />
                            <select
                              disabled={addProductLoading}
                              value={newProductSource}
                              onChange={(e) => setNewProductSource(e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs disabled:opacity-60 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                            >
                              <option value="Amazon">Amazon</option>
                              <option value="Buscapé">Buscapé</option>
                              <option value="Zoom">Zoom</option>
                              <option value="Mercado Livre">Mercado Livre</option>
                              <option value="Outro">Outro</option>
                            </select>
                          </div>
                          <input
                            required
                            disabled={addProductLoading}
                            type="url"
                            placeholder="Link HTTPS do produto (obrigatório)"
                            value={newProductUrl}
                            onChange={(e) => {
                              setNewProductUrl(e.target.value);
                              if (addProductError) setAddProductError(null);
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00875f] disabled:opacity-60 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={addProductLoading}
                              onClick={() => {
                                setNewProductOpen(false);
                                setAddProductError(null);
                              }}
                              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-[#2e3f37] dark:text-slate-300 dark:hover:bg-[#263730]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={addProductLoading}
                              className="rounded-xl bg-[#00875f] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
                            >
                              {addProductLoading ? "Cadastrando..." : "Adicionar"}
                            </button>
                          </div>
                        </form>
                      )}

                      {productsLoading ? (
                        <p className="py-3 text-xs text-slate-400 dark:text-[#95a89f]">Carregando monitoramento de preços...</p>
                      ) : products.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-[#2e3f37] dark:text-[#95a89f]">
                          Nenhum produto cadastrado. Adicione itens (como eletrônicos, utensílios) para o Painel avisar quando atingirem seu valor limite!
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {products.map((p) => {
                            const isDeal = p.currentPrice !== null && p.currentPrice <= p.targetPrice;
                            return (
                              <div
                                key={p.id}
                                className={`rounded-xl border p-3 transition ${
                                  isDeal
                                    ? "border-emerald-300 bg-emerald-50/40 shadow-xs dark:border-[#264f40] dark:bg-[#17382d]/40"
                                    : "border-slate-100 bg-white hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#17211d] dark:hover:bg-[#1e2b26]"
                                }`}
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-xs font-bold text-slate-800 dark:text-[#e6ede9]">{p.title}</h4>
                                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-[#263730] dark:text-slate-300">
                                        {p.source}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-[#95a89f]">
                                      <span>Limite: <strong className="text-slate-800 dark:text-[#e6ede9]">{formatCurrency(p.targetPrice)}</strong></span>
                                      {p.currentPrice !== null && p.currentPrice !== undefined && (
                                        <span>Atual: <strong className={isDeal ? "text-emerald-700 font-bold dark:text-[#67d9ae]" : "text-slate-700 dark:text-slate-300"}>{formatCurrency(p.currentPrice)}</strong></span>
                                      )}
                                      {p.lowestPrice !== null && p.lowestPrice !== undefined && (
                                        <span className="text-[11px] text-slate-400 dark:text-[#95a89f]/80">Menor: {formatCurrency(p.lowestPrice)}</span>
                                      )}
                                      {p.alerts?.map((alert) => (
                                        <span key={alert.id} className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                                          Alerta: atingiu {formatCurrency(alert.targetPrice)}
                                          <button type="button" onClick={() => void markPriceAlertRead(p.id, alert.id)} className="underline">Dispensar</button>
                                        </span>
                                      ))}
                                      {p.lastCheckError && (
                                        <span className="basis-full rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-medium leading-relaxed text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" role="status">
                                          <strong>Consulta não concluída{p.lastAttemptedAt ? ` · ${new Date(p.lastAttemptedAt).toLocaleString("pt-BR")}` : ""}:</strong>{" "}
                                          {formatPriceCheckError(p.lastCheckError)}
                                        </span>
                                      )}
                                      {p.lastChecked && (
                                        <span className="text-[10px] text-slate-400 dark:text-[#95a89f]/80">Último preço válido: {new Date(p.lastChecked).toLocaleString("pt-BR")}</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {isDeal && !p.lastCheckError ? (
                                      <div className="flex items-center gap-2">
                                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800 flex items-center gap-1 dark:bg-[#17382d] dark:text-[#67d9ae]">
                                          🎯 Abaixo do limite!
                                        </span>
                                        {p.url && (
                                          <a
                                            href={p.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded-lg bg-[#00875f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#015f43] flex items-center gap-1 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
                                          >
                                            Comprar <ArrowUpRight size={12} />
                                          </a>
                                        )}
                                      </div>
                                    ) : (
                                      <span className={`text-[11px] font-medium ${p.lastCheckError ? "text-rose-700 dark:text-rose-400" : "text-slate-400 dark:text-[#95a89f]"}`}>
                                        {p.lastCheckError ? "Falha na consulta" : "Aguardando preço"}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      aria-label={"Excluir " + p.title}
                                      onClick={() => void handleDeleteProduct(p)}
                                      disabled={deletingProductId === p.id}
                                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                    >
                                      <Trash2 size={13} />
                                      {deletingProductId === p.id ? "Excluindo..." : "Excluir"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              </div>

              {/* TAREFAS */}
              <div className="space-y-6" id="tarefas" tabIndex={-1}>
                <Card
                  title="Tarefas e Ações"
                  icon={<Target size={19} className="text-[#00875f] dark:text-[#00b37e]" />}
                  action="+ Nova Tarefa"
                  onActionClick={() => {
                    setNewTaskOpen((v) => !v);
                    setTaskCreateError(null);
                  }}
                >
                  {/* Task Filter Tabs */}
                  <div className="mb-3 flex items-center gap-1 border-b border-slate-100 pb-2 overflow-x-auto text-xs font-semibold dark:border-[#2e3f37]">
                    <button
                      onClick={() => setTaskTab("TODAS")}
                      className={`rounded-lg px-2.5 py-1 ${taskTab === "TODAS" ? "bg-[#00875f] text-white dark:bg-[#00b37e] dark:text-[#00291d]" : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                    >
                      Todas ({tasks.length})
                    </button>
                    <button
                      onClick={() => setTaskTab("HOJE")}
                      className={`rounded-lg px-2.5 py-1 ${taskTab === "HOJE" ? "bg-[#00875f] text-white dark:bg-[#00b37e] dark:text-[#00291d]" : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                    >
                      Hoje ({todayTasks.length})
                    </button>
                    <button
                      onClick={() => setTaskTab("ATRASADAS")}
                      className={`rounded-lg px-2.5 py-1 ${taskTab === "ATRASADAS" ? "bg-red-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                    >
                      Atrasadas ({overdueTasks.length})
                    </button>
                    <button
                      onClick={() => setTaskTab("CONTAS")}
                      className={`rounded-lg px-2.5 py-1 ${taskTab === "CONTAS" ? "bg-[#00875f] text-white dark:bg-[#00b37e] dark:text-[#00291d]" : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                    >
                      Contas ({billTasks.length})
                    </button>
                  </div>

                  {/* Inline Task Creator */}
                  {newTaskOpen && (
                    <form onSubmit={handleCreateTask} className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2 dark:border-[#2e3f37] dark:bg-[#1e2b26]/70">
                      {taskCreateError && (
                        <div role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                          {taskCreateError}
                        </div>
                      )}
                      <input
                        required
                        disabled={taskCreateLoading}
                        placeholder="Nome da nova tarefa..."
                        value={newTaskTitle}
                        onChange={(e) => {
                          setNewTaskTitle(e.target.value);
                          if (taskCreateError) setTaskCreateError(null);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9] dark:focus:border-[#00b37e]"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          disabled={taskCreateLoading}
                          value={newTaskPriority}
                          onChange={(e) => setNewTaskPriority(e.target.value as any)}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                        >
                          <option value="Alta">Alta prioridade</option>
                          <option value="Média">Média prioridade</option>
                          <option value="Baixa">Baixa prioridade</option>
                        </select>
                        <input
                          type="date"
                          disabled={taskCreateLoading}
                          value={newTaskDueDate}
                          onChange={(e) => setNewTaskDueDate(e.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]"
                        />
                        <button
                          type="submit"
                          disabled={taskCreateLoading}
                          className="ml-auto rounded-xl bg-[#00875f] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
                        >
                          {taskCreateLoading ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Task list */}
                  <div className="space-y-1 divide-y divide-slate-50 dark:divide-[#2e3f37]">
                    {loadingTasks ? (
                      <p className="py-4 text-center text-xs text-slate-400 dark:text-[#95a89f]">Carregando lista de tarefas...</p>
                    ) : filteredTasks.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-400 dark:text-[#95a89f]">Nenhuma tarefa nesta categoria.</p>
                    ) : (
                      filteredTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          toggle={() => void toggle(task.id)}
                          onPayClick={() => {
                            if (task.bill) {
                              const b = bills.find((x) => x.id === task.bill?.id);
                              if (b) setActivePaymentBill(b);
                            }
                          }}
                        />
                      ))
                    )}
                  </div>
                </Card>

                {/* E-MAILS COM FILTRO INTELIGENTE */}
                <div id="emails" tabIndex={-1}>
                  <Card
                    title="Gmail com Filtro Inteligente"
                    icon={<Mail size={19} className="text-purple-600 dark:text-purple-400" />}
                    action="Abrir Gmail"
                    actionHref="https://mail.google.com/mail/u/0/#inbox"
                  >
                    {/* Account filter tabs for Gmail */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-[#2e3f37]">
                      <div className="flex flex-wrap items-center gap-1 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGmailAccount("all");
                            void loadGmail("all");
                          }}
                          className={`rounded-lg px-2.5 py-1 transition ${
                            selectedGmailAccount === "all"
                              ? "bg-purple-600 text-white"
                              : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"
                          }`}
                        >
                          Todas as contas (Consolidado)
                        </button>
                        {connectedAccounts.map((acc) => {
                          const isWork = acc.accountType === "WORK";
                          const active = selectedGmailAccount === acc.id;
                          return (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => {
                                setSelectedGmailAccount(acc.id);
                                void loadGmail(acc.id);
                              }}
                              className={`rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 transition ${
                                active
                                  ? isWork
                                    ? "bg-purple-700 text-white"
                                    : "bg-blue-600 text-white"
                                  : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isWork ? "bg-purple-300" : "bg-blue-300"
                                }`}
                              />
                              {acc.label || (isWork ? "Google — profissional" : "Google — pessoal")}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setAccountsModalOpen(true)}
                        className="text-[11px] font-semibold text-purple-600 hover:underline inline-flex items-center gap-1 shrink-0 dark:text-purple-400"
                      >
                        <Plus size={13} /> Gerenciar contas
                      </button>
                    </div>

                    {/* Category tabs */}
                    <div className="mb-3 flex items-center gap-1 border-b border-slate-100 pb-2 overflow-x-auto text-xs font-semibold dark:border-[#2e3f37]">
                      <button
                        onClick={() => setEmailTab("TODAS")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "TODAS" ? "bg-slate-900 text-white dark:bg-[#00875f] dark:text-white" : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                      >
                        Todas
                      </button>
                      <button
                        onClick={() => setEmailTab("RESPOND_TODAY")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "RESPOND_TODAY" ? "bg-red-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                      >
                        🔴 Responder hoje ({categorizedEmails.RESPOND_TODAY.length})
                      </button>
                      <button
                        onClick={() => setEmailTab("FOLLOW_UP")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "FOLLOW_UP" ? "bg-amber-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                      >
                        🟠 Acompanhar ({categorizedEmails.FOLLOW_UP.length})
                      </button>
                      <button
                        onClick={() => setEmailTab("INFORMATIVE")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "INFORMATIVE" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                      >
                        🔵 Informativo ({categorizedEmails.INFORMATIVE.length})
                      </button>
                      <button
                        onClick={() => setEmailTab("NOISE")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "NOISE" ? "bg-slate-500 text-white" : "text-slate-400 hover:bg-slate-100 dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"}`}
                      >
                        ⚪ Ruído ({categorizedEmails.NOISE.length})
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                      {gmailLoading ? (
                        <p className="py-4 text-center text-xs text-slate-400 dark:text-[#95a89f]">Carregando e classificando mensagens...</p>
                      ) : gmailError ? (
                        <div className="py-6 text-center text-xs text-slate-500 dark:text-[#95a89f] space-y-1">
                          <p>Conta Gmail não conectada ou autorização pendente.</p>
                          <button
                            type="button"
                            onClick={() => setAccountsModalOpen(true)}
                            className="text-xs font-semibold text-[#00875f] hover:underline dark:text-[#00b37e]"
                          >
                            Conectar ou autorizar conta Google
                          </button>
                        </div>
                      ) : displayedEmails.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-400 dark:text-[#95a89f]">Nenhum e-mail nesta categoria.</p>
                      ) : (
                        displayedEmails.map((message) => {
                          const headers = message.payload?.headers ?? [];
                          const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(Sem assunto)";
                          const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "Remetente desconhecido";
                          const category = message.dashboardCategory ?? "INFORMATIVE";
                          const isWork = message.accountType === "WORK";

                          return (
                            <div
                              key={message.id}
                              className="rounded-xl border border-slate-100 bg-white p-3 hover:bg-slate-50/70 transition dark:border-[#2e3f37] dark:bg-[#17211d] dark:hover:bg-[#1e2b26]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate text-xs font-semibold text-slate-600 max-w-[150px] sm:max-w-[200px] dark:text-slate-300">
                                    {from}
                                  </span>
                                  {message.accountLabel && (
                                    <span
                                      className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${
                                        isWork
                                          ? "bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/40"
                                          : "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/40"
                                      }`}
                                      title={message.accountEmail}
                                    >
                                      {isWork ? "💼 Profissional" : "👤 Pessoal"}
                                    </span>
                                  )}
                                </div>
                                {category === "RESPOND_TODAY" && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 shrink-0 dark:bg-rose-950/60 dark:text-rose-300">
                                    Responder hoje
                                  </span>
                                )}
                                {category === "FOLLOW_UP" && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 shrink-0 dark:bg-amber-950/60 dark:text-amber-300">
                                    Acompanhar
                                  </span>
                                )}
                                {category === "INFORMATIVE" && (
                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 shrink-0 dark:bg-blue-950/60 dark:text-blue-300">
                                    Informativo
                                  </span>
                                )}
                                {category === "NOISE" && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 shrink-0 dark:bg-[#1e2b26] dark:text-[#95a89f]">
                                    Ruído / Promo
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs font-semibold text-slate-800 line-clamp-1 dark:text-[#e6ede9]">{subject}</p>
                              {message.snippet && (
                                <p className="mt-1 text-[11px] text-slate-400 line-clamp-2 dark:text-[#95a89f]">{message.snippet}</p>
                              )}
                              {message.dashboardReason && (
                                <p className="mt-1.5 text-[10px] text-[#00875f] italic dark:text-[#00b37e]">
                                  Motivo: {message.dashboardReason}
                                </p>
                              )}
                              {(category === "RESPOND_TODAY" || category === "FOLLOW_UP") && (
                                <div className="mt-2 flex items-center gap-2">
                                  {message.taskId ? (
                                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                                      <Check size={12} /> Tarefa criada e salva
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={creatingEmailTaskId === message.id}
                                      onClick={() => void handleCreateTaskFromEmail(message)}
                                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#67d9ae] dark:hover:bg-[#263730]"
                                    >
                                      {creatingEmailTaskId === message.id ? "Salvando…" : "Criar tarefa"}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    {emailTaskError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-rose-400">{emailTaskError}</p>}
                  </Card>
                </div>

                {/* Card de Progresso */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#2e3f37] dark:bg-[#17211d]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 dark:text-[#e6ede9]">Progresso do Dia</h2>
                      <p className="text-xs text-slate-400 dark:text-[#95a89f]">
                        {done} de {tasks.length} tarefas concluídas
                      </p>
                    </div>
                    <span className="text-xl font-extrabold text-[#00875f] dark:text-[#00b37e]">{completionRate}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-[#1e2b26]">
                    <div
                      className="h-full rounded-full bg-[#00875f] transition-all duration-500 dark:bg-[#00b37e]"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </section>
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-8 border-t border-slate-200 pt-5 text-center text-xs text-slate-400 dark:border-[#2e3f37] dark:text-[#95a89f]">
              Painel da Vida · Inteligência para Priorizar o seu Dia ·{" "}
              {databaseError ? "Modo demonstração com armazenamento local" : "Conectado ao PostgreSQL"}
            </footer>
          </div>
        </section>
      </div>

      {/* MODAL DE PAGAMENTO RÁPIDO */}
      {activePaymentBill && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#2e3f37]">
              <div>
                <h3 id="payment-modal-title" className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
                  {activePaymentBill.merchant ?? activePaymentBill.subject}
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#95a89f]">
                  {activePaymentBill.dueDate
                    ? `Vence em ${new Date(activePaymentBill.dueDate).toLocaleDateString("pt-BR")}`
                    : "Vencimento não informado"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePaymentBill(null)}
                aria-label="Fechar modal de pagamento"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#1e2b26] dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            {activePaymentBill.amount !== null && (
              <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-[#1e2b26]">
                <span className="text-xs font-medium text-slate-500 dark:text-[#95a89f]">Valor a pagar</span>
                <p className="text-2xl font-black text-slate-900 dark:text-white">
                  R$ {activePaymentBill.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {/* PIX Copia e Cola */}
            {activePaymentBill.pixCode ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">PIX Copia e Cola:</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={activePaymentBill.pixCode}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600 truncate dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activePaymentBill.pixCode!, "pix")}
                    className="flex items-center gap-1 rounded-xl bg-[#00875f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#015f43] shrink-0 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
                  >
                    {copiedKey === "pix" ? <CheckCheck size={14} /> : <Copy size={14} />}
                    {copiedKey === "pix" ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Código de barras / Linha Digitável */}
            {activePaymentBill.barcode ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Linha Digitável / Boleto:</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={activePaymentBill.barcode}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600 truncate dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activePaymentBill.barcode!, "barcode")}
                    className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 shrink-0 dark:bg-[#00875f] dark:hover:bg-[#015f43]"
                  >
                    {copiedKey === "barcode" ? <CheckCheck size={14} /> : <Copy size={14} />}
                    {copiedKey === "barcode" ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-[#2e3f37]">
              {activePaymentBill.paymentUrl ? (
                <a
                  href={activePaymentBill.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-[#00875f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#015f43] flex items-center gap-1 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
                >
                  Abrir link de pagamento <ExternalLink size={13} />
                </a>
              ) : <div />}

              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/bills", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: activePaymentBill.id, status: "PAID" }),
                  });
                  setBills((prev) =>
                    prev.map((b) => (b.id === activePaymentBill.id ? { ...b, status: "PAID" } : b)),
                  );
                  setActivePaymentBill(null);
                }}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-[#264f40] dark:bg-[#17382d] dark:text-[#67d9ae]"
              >
                Marcar como Paga ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONTAS CONECTADAS */}
      <ConnectedAccountsModal
        isOpen={accountsModalOpen}
        onClose={() => setAccountsModalOpen(false)}
        accounts={connectedAccounts}
        onAccountsUpdated={() => {
          void loadAccounts();
          void loadCalendar();
          void loadGmail();
        }}
        isDemoMode={useDemoFixtures}
      />
    </main>
  );
}

function Sidebar({
  connectedAccounts = [],
  onOpenAccountsModal,
}: {
  connectedAccounts?: ConnectedAccountApi[];
  onOpenAccountsModal?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-5 dark:border-[#2e3f37]">
        <Logo />
      </div>
      <SidebarContent
        connectedAccounts={connectedAccounts}
        onOpenAccountsModal={onOpenAccountsModal}
      />
    </div>
  );
}

function SidebarContent({
  connectedAccounts = [],
  onOpenAccountsModal,
  onNavigate,
}: {
  connectedAccounts?: ConnectedAccountApi[];
  onOpenAccountsModal?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col p-4">
      <nav className="space-y-1" aria-label="Navegação das seções">
        <Nav icon={<LayoutDashboard size={18} />} label="Visão Geral" active targetId="" onNavigate={onNavigate} />
        <Nav icon={<FileText size={18} />} label="Contas a Pagar" targetId="contas" onNavigate={onNavigate} />
        <Nav icon={<CalendarDays size={18} />} label="Agenda" targetId="agenda" onNavigate={onNavigate} />
        <Nav icon={<Target size={18} />} label="Tarefas" targetId="tarefas" onNavigate={onNavigate} />
        <Nav icon={<Mail size={18} />} label="E-mails Filtrados" targetId="emails" onNavigate={onNavigate} />
        <Nav icon={<ShoppingCart size={18} />} label="Preços & Compras" targetId="compras" onNavigate={onNavigate} />
      </nav>

      <div className="mt-6">
        <div className="flex items-center justify-between px-3 mb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#95a89f]">
            Contas Conectadas
          </p>
          {onOpenAccountsModal && (
            <button
              type="button"
              onClick={onOpenAccountsModal}
              className="text-[10px] font-bold text-[#00875f] hover:underline cursor-pointer dark:text-[#00b37e]"
            >
              Gerenciar
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {connectedAccounts.length === 0 ? (
            <Connection label="Google" status="Pendente" color="bg-amber-400" />
          ) : (
            connectedAccounts.map((acc) => {
              const isWork = acc.accountType === "WORK";
              return (
                <div
                  key={acc.id}
                  onClick={onOpenAccountsModal}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-slate-50 cursor-pointer transition dark:hover:bg-[#1e2b26]"
                  title={`${acc.label ?? acc.email} (${acc.email})`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      acc.status === "CONNECTED" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-700 truncate dark:text-[#e6ede9]">
                      {acc.label || (isWork ? "Google — profissional" : "Google — pessoal")}
                    </span>
                    <span className="block text-[10px] text-slate-400 truncate dark:text-[#95a89f]">
                      {acc.email}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-auto pt-6">
        <div className="rounded-2xl bg-[#004d36] p-4 text-white border border-[#006648] dark:bg-[#17382d] dark:border-[#264f40]">
          <Sparkles size={16} />
          <p className="mt-2 text-xs font-bold">Painel Inteligente</p>
          <p className="mt-1 text-[11px] leading-4 text-emerald-100/90 dark:text-emerald-200/80">
            Filtrando ruídos e mantendo o que realmente importa diante de você.
          </p>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#00875f] text-white shadow-xs dark:bg-[#00b37e] dark:text-[#00291d]">
        <Target size={19} />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-900 dark:text-[#e6ede9]">Painel da Vida</p>
        <p className="text-[11px] text-slate-400 dark:text-[#95a89f]">Filtro inteligente digital</p>
      </div>
    </div>
  );
}

function Stat({ value, label, color = "text-slate-900" }: { value: number; label: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-2xs dark:border-[#2e3f37] dark:bg-[#17211d]">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-[#95a89f]">{label}</p>
    </div>
  );
}

function Card({
  title,
  icon,
  action,
  actionHref,
  onActionClick,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: string;
  actionHref?: string;
  onActionClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 transition-colors dark:border-[#2e3f37] dark:bg-[#17211d]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-slate-700 dark:text-[#c7d5cd]">
          {icon}
          <h2 className="font-bold text-slate-900 dark:text-[#e6ede9]">{title}</h2>
        </div>
        {action &&
          (actionHref ? (
            <a
              href={actionHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-[#00875f] hover:underline dark:text-[#00b37e]"
            >
              {action}
              <ChevronRight size={14} />
            </a>
          ) : (
            <button
              type="button"
              onClick={onActionClick}
              className="flex items-center gap-1 text-xs font-semibold text-[#00875f] hover:underline dark:text-[#00b37e]"
            >
              {action}
              <ChevronRight size={14} />
            </button>
          ))}
      </div>
      {children}
    </section>
  );
}

function TaskRow({
  task,
  toggle,
  onPayClick,
}: {
  task: DashboardTask;
  toggle: () => void;
  onPayClick?: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-slate-50 transition dark:hover:bg-[#1e2b26]/70">
      <button
        type="button"
        onClick={toggle}
        aria-label={task.completed ? "Reabrir tarefa: " + task.title : "Concluir tarefa: " + task.title}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          task.completed
            ? "border-[#00875f] bg-[#00875f] text-white dark:border-[#00b37e] dark:bg-[#00b37e] dark:text-[#00291d]"
            : "border-slate-300 bg-white hover:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:hover:border-[#00b37e]"
        }`}
      >
        {task.completed && <Check size={13} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs sm:text-sm font-medium ${task.completed ? "text-slate-400 line-through dark:text-[#5e6f66]" : "text-slate-800 dark:text-[#e6ede9]"}`}>
          {task.title}
        </p>
        <p className="truncate text-[11px] text-slate-400 dark:text-[#95a89f]">
          {task.bill ? `Conta a pagar · ${task.bill.merchant ?? "Boleto"}` : task.description}
        </p>
      </div>

      <span
        className={`hidden rounded-md px-2 py-0.5 text-[10px] font-bold sm:block ${
          task.priority === "Alta"
            ? "bg-red-50 text-red-600 dark:bg-rose-950/60 dark:text-rose-300"
            : task.priority === "Média"
              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
              : "bg-slate-100 text-slate-600 dark:bg-[#263730] dark:text-slate-300"
        }`}
      >
        {task.priority}
      </span>

      {task.bill && (
        <button
          type="button"
          onClick={onPayClick}
          className="rounded-lg bg-[#00875f] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#015f43] shrink-0 flex items-center gap-1 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
        >
          <CreditCard size={12} /> Pagar
        </button>
      )}

      <span className={`w-14 text-right text-xs font-medium shrink-0 ${task.due === "Hoje" ? "text-[#00875f] dark:text-[#00b37e] font-bold" : "text-slate-400 dark:text-[#95a89f]"}`}>
        {task.due}
      </span>
    </div>
  );
}

function BillRow({
  bill,
  accounts,
  people,
  onPayClick,
  onUpdated,
}: {
  bill: BillApi;
  accounts: PaymentAccountApi[];
  people: { id: string; name: string; relation: string | null }[];
  onPayClick: () => void;
  onUpdated: (updated: {
    id: string;
    paymentAccount: BillApi["paymentAccount"];
    status: BillApi["status"];
    responsibleType: BillApi["responsibleType"];
    responsiblePerson: BillApi["responsiblePerson"];
  }) => void;
}) {
  const due = bill.dueDate ? new Date(bill.dueDate) : null;
  const overdue = !!due && due < new Date() && bill.status !== "PAID";

  async function update(payload: {
    paymentAccountId?: string | null;
    responsiblePersonId?: string | null;
    responsibleType?: BillApi["responsibleType"];
    status?: BillApi["status"];
  }) {
    const response = await fetch("/api/bills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bill.id, ...payload }),
    });
    if (!response.ok) return;
    const data = await response.json();
    onUpdated(data);
  }

  return (
    <div
      className={`rounded-xl border p-3 transition ${
        overdue
          ? "border-red-200 bg-red-50/40 dark:border-rose-900/40 dark:bg-rose-950/25"
          : "border-slate-100 bg-white hover:bg-slate-50/50 dark:border-[#2e3f37] dark:bg-[#17211d] dark:hover:bg-[#1e2b26]/60"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-[#e6ede9]">{bill.merchant ?? bill.subject}</p>
            {overdue && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-rose-950/60 dark:text-rose-300">
                Vencida
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-400 dark:text-[#95a89f]">{bill.sender}</p>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={overdue ? "font-bold text-red-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300"}>
              {due ? `Vencimento: ${due.toLocaleDateString("pt-BR")}` : "Vencimento não identificado"}
            </span>
            {bill.amount !== null && (
              <span className="font-extrabold text-slate-900 dark:text-white">
                R$ {bill.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            )}
            <span className="text-slate-500 font-medium dark:text-[#95a89f]">
              {bill.responsibleType === "ME"
                ? "Em seu nome"
                : bill.responsiblePerson
                  ? `De: ${bill.responsiblePerson.name}`
                  : bill.responsibleType === "OTHER" && bill.responsibleName
                    ? `Outra pessoa: ${bill.responsibleName}`
                    : "Responsável indefinido"}
            </span>
          </div>
        </div>

        {/* Responsible Selector */}
        <select
          value={bill.responsibleType === "ME" ? "__me__" : bill.responsiblePerson?.id ?? ""}
          onChange={(e) =>
            void update({
              responsiblePersonId: e.target.value === "__me__" ? null : e.target.value || null,
              responsibleType: e.target.value === "__me__" ? "ME" : e.target.value ? "OTHER" : "UNKNOWN",
            })
          }
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
        >
          <option value="">Quem paga?</option>
          <option value="__me__">Eu (Fábio)</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.relation ? ` (${person.relation})` : ""}
            </option>
          ))}
        </select>

        {/* Payment Account Selector */}
        <select
          value={bill.paymentAccount?.id ?? ""}
          onChange={(e) => void update({ paymentAccountId: e.target.value || null })}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
        >
          <option value="">Conta de saída</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        {/* Status Selector */}
        <select
          value={bill.status}
          onChange={(e) => void update({ status: e.target.value as BillApi["status"] })}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
        >
          <option value="NEEDS_REVIEW">Revisar</option>
          <option value="CONFIRMED">Confirmada</option>
          <option value="SCHEDULED">Programada</option>
          <option value="PAID">Paga</option>
        </select>

        {/* Pagar button */}
        <button
          type="button"
          onClick={onPayClick}
          className="rounded-xl bg-[#00875f] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#015f43] flex items-center gap-1 shrink-0 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
        >
          <CreditCard size={13} /> Pagar
        </button>
      </div>
    </div>
  );
}

function Nav({
  icon,
  label,
  active = false,
  targetId,
  onNavigate,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  targetId?: string;
  onNavigate?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (targetId) {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            el.focus?.();
          }
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        onNavigate?.();
      }}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${
        active
          ? "bg-emerald-50 text-emerald-800 font-bold dark:bg-[#17382d] dark:text-[#67d9ae]"
          : "text-slate-600 hover:bg-slate-50 dark:text-[#95a89f] dark:hover:bg-[#1e2b26] dark:hover:text-[#e6ede9]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Connection({
  color,
  label,
  status,
}: {
  color: string;
  label: string;
  status: string;
}) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <div>
        <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className="block text-[10px] text-slate-400 dark:text-[#95a89f]">{status}</span>
      </div>
    </div>
  );
}

function NotificationItem({
  icon,
  title,
  badge,
}: {
  icon?: React.ReactNode;
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-[#c7d5cd] dark:hover:bg-[#1e2b26]">
      {icon && <div className="shrink-0">{icon}</div>}
      <span className="flex-1">{title}</span>
      {badge && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 dark:bg-rose-950/60 dark:text-rose-300">
          {badge}
        </span>
      )}
    </div>
  );
}
