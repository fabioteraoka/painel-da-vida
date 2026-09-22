"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
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
  ShoppingCart,
  Sparkles,
  Tag as TagIcon,
  Target,
  TrendingDown,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { initialTasks, type Task } from "@/lib/mock-data";

type GmailApiMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
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

function detectCalendarConflicts(events: CalendarApiEvent[]): Set<string> {
  const conflictIds = new Set<string>();
  for (let i = 0; i < events.length; i++) {
    const startA = events[i].start?.dateTime ? new Date(events[i].start!.dateTime!).getTime() : null;
    const endA = events[i].end?.dateTime ? new Date(events[i].end!.dateTime!).getTime() : null;
    if (!startA || !endA) continue;
    for (let j = i + 1; j < events.length; j++) {
      const startB = events[j].start?.dateTime ? new Date(events[j].start!.dateTime!).getTime() : null;
      const endB = events[j].end?.dateTime ? new Date(events[j].end!.dateTime!).getTime() : null;
      if (!startB || !endB) continue;
      if (startA < endB && startB < endA) {
        conflictIds.add(events[i].id);
        conflictIds.add(events[j].id);
      }
    }
  }
  return conflictIds;
}

const useDemoFixtures = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function Dashboard() {
  const [tasks, setTasks] = useState<DashboardTask[]>(
    useDemoFixtures ? initialTasks.map((task) => ({ ...task, id: String(task.id) })) : [],
  );
  const [today] = useState<Date>(() => new Date());
  const [mobile, setMobile] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [databaseError, setDatabaseError] = useState(false);
  const [realCalendarEvents, setRealCalendarEvents] = useState<CalendarApiEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState(false);
  const [gmailMessages, setGmailMessages] = useState<GmailApiMessage[]>([]);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailError, setGmailError] = useState(false);
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
  const [priceCheckMessage, setPriceCheckMessage] = useState<string | null>(null);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductTitle, setNewProductTitle] = useState("");
  const [newProductTarget, setNewProductTarget] = useState("");
  const [newProductSource, setNewProductSource] = useState("Amazon");
  const [newProductUrl, setNewProductUrl] = useState("");

  // Quick Task Creation
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"Alta" | "Média" | "Baixa">("Média");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

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
  const [newPersonOpen, setNewPersonOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonRelation, setNewPersonRelation] = useState("");

  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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

    void loadTasks();

    async function loadCalendar() {
      try {
        const response = await fetch("/api/calendar/events", { cache: "no-store" });
        if (response.status === 409 || response.status === 401) {
          throw new Error("Google Calendar não autorizado.");
        }
        if (!response.ok) throw new Error("Falha ao carregar agenda.");
        const data = (await response.json()) as { items?: CalendarApiEvent[] };
        if (!cancelled) {
          setRealCalendarEvents(data.items ?? []);
          setCalendarError(false);
        }
      } catch {
        if (!cancelled) setCalendarError(true);
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    }

    void loadCalendar();

    async function loadGmail() {
      try {
        const response = await fetch("/api/gmail/messages?includeNoise=true", { cache: "no-store" });
        if (response.status === 409 || response.status === 401) {
          throw new Error("Gmail não autorizado.");
        }
        if (!response.ok) throw new Error("Falha ao carregar Gmail.");
        const data = (await response.json()) as { messages?: GmailApiMessage[] };
        if (!cancelled) {
          setGmailMessages(data.messages ?? []);
          setGmailError(false);
        }
      } catch {
        if (!cancelled) setGmailError(true);
      } finally {
        if (!cancelled) setGmailLoading(false);
      }
    }

    void loadGmail();

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
  }, []);

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
    if (!newTaskTitle.trim()) return;

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

      if (response.ok) {
        const newTask = (await response.json()) as ApiTask;
        setTasks((prev) => [mapApiTask(newTask), ...prev]);
        setNewTaskTitle("");
        setNewTaskDueDate("");
        setNewTaskOpen(false);
      }
    } catch (err) {
      console.error("Erro ao criar tarefa:", err);
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

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProductTitle.trim() || !newProductTarget) return;

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProductTitle.trim(),
          targetPrice: parseFloat(newProductTarget),
          source: newProductSource,
          url: newProductUrl.trim() || null,
        }),
      });

      if (response.ok) {
        const created = (await response.json()) as MonitoredProductApi;
        setProducts((prev) => [created, ...prev]);
        setNewProductTitle("");
        setNewProductTarget("");
        setNewProductUrl("");
        setNewProductOpen(false);
      }
    } catch (err) {
      console.error("Erro ao cadastrar produto:", err);
    }
  }

  // Conflict detection
  const conflictIds = useMemo(() => detectCalendarConflicts(realCalendarEvents), [realCalendarEvents]);

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
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="flex min-h-screen">
        {/* Sidebar Desktop */}
        <aside className="hidden w-[260px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <Sidebar />
        </aside>

        {/* Mobile Backdrop */}
        {mobile && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
            onClick={() => setMobile(false)}
          />
        )}

        {/* Mobile Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 bg-white transition-transform lg:hidden ${
            mobile ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <Logo />
              <button onClick={() => setMobile(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <SidebarContent />
          </div>
        </aside>

        {/* Main Content Area */}
        <section className="min-w-0 flex-1">
          {/* Header Bar */}
          <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobile(true)}
                className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              >
                <Menu size={21} />
              </button>
              <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-400 sm:flex">
                <Search size={16} />
                <span>Buscar eventos, tarefas, boletos...</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Google Conectado
              </span>

              {/* Notifications Dropdown */}
              <div ref={notificationsRef} className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((open) => !open)}
                  aria-label="Notificações"
                  className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
                >
                  <Bell size={18} />
                  {notificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-xs">
                      {notificationCount}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-12 z-50 w-[340px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-800">Alertas do Dia</h3>
                      <span className="text-[11px] font-medium text-slate-400">{notificationCount} pendências</span>
                    </div>
                    <div className="mt-2 space-y-1.5 max-h-[380px] overflow-y-auto">
                      {notificationCount === 0 ? (
                        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Tudo em ordem no momento.</p>
                      ) : (
                        <>
                          {conflictIds.size > 0 && (
                            <NotificationItem
                              icon={<AlertTriangle className="text-amber-600" size={16} />}
                              title={`${conflictIds.size / 2} conflito(s) de horário na agenda!`}
                              badge="Urgente"
                            />
                          )}
                          {billsDue10Days.length > 0 && (
                            <NotificationItem
                              icon={<FileText className="text-red-600" size={16} />}
                              title={`${billsDue10Days.length} conta(s) vencendo nos próximos 10 dias`}
                              badge="Atenção"
                            />
                          )}
                          {productOpportunities.length > 0 && (
                            <NotificationItem
                              icon={<ShoppingCart className="text-emerald-600" size={16} />}
                              title={`${productOpportunities.length} produto atingiu o preço desejado!`}
                              badge="Oportunidade"
                            />
                          )}
                          {highPriorityPending > 0 && (
                            <NotificationItem
                              icon={<Target className="text-indigo-600" size={16} />}
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
                  title="Menu do perfil"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
                >
                  FT
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-12 z-50 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-800">Fábio Teraoka</p>
                      <p className="text-[11px] text-slate-400 truncate">Painel da Vida</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void signOut({ callbackUrl: "/login" })}
                      className="w-full mt-1 rounded-xl px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Sair da conta
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1520px] p-4 sm:p-6 lg:p-8 space-y-7">
            {/* Top Greeting & Date */}
            <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                  <CalendarDays size={14} />
                  {dateLabel}
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  ☀️ Bom dia, Fábio.
                </h1>
                <p className="mt-1.5 text-sm text-slate-500 sm:text-base">
                  Seu filtro inteligente: veja apenas o que realmente importa e precisa da sua ação.
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                <Stat value={todayEventCount} label="Agenda" color="text-blue-600" />
                <Stat value={pendingTasks.length} label="Tarefas" color="text-indigo-600" />
                <Stat value={actionableEmailsCount} label="E-mails" color="text-purple-600" />
                <Stat value={billsDue10Days.length} label="Boletos 10d" color="text-amber-600" />
              </div>
            </section>

            {/* SEU DIA EM 30 SEGUNDOS (Direct implementation of user's core vision) */}
            <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-white p-5 shadow-xs sm:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xs">
                  <Sparkles size={22} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-slate-900">Seu dia em 30 segundos</h2>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                      Síntese em tempo real
                    </span>
                  </div>

                  {/* The requested 4-point synthesis format */}
                  <div className="mt-3 space-y-1.5 text-sm text-slate-700 leading-relaxed font-medium">
                    <p>
                      📅 Você tem <strong className="text-slate-900">{todayEventCount} compromissos</strong>,{" "}
                      <strong className="text-slate-900">{pendingTasks.length} tarefas pendentes</strong> e{" "}
                      <strong className="text-slate-900">{actionableEmailsCount} e-mails</strong> que merecem atenção hoje.
                    </p>
                    <p className={billsDue10Days.length > 0 ? "text-amber-800" : "text-slate-600"}>
                      ⚠️ <strong className="font-semibold">{billsDue10Days.length} conta(s)</strong> vencem nos próximos 10 dias
                      {overdueBills.length > 0 && ` (sendo ${overdueBills.length} já vencida(s)!)`}.
                    </p>
                    {productOpportunities.length > 0 ? (
                      <p className="text-emerald-700 font-semibold">
                        🛒 <strong>{productOpportunities.length} produto monitorado</strong> atingiu o preço desejado que você definiu!
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs">
                        🛒 {products.length} produto(s) monitorado(s) ativamente (nenhum atingiu a meta hoje).
                      </p>
                    )}
                  </div>

                  {/* Highlights / Alert tags */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {conflictIds.size > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                        <AlertTriangle size={13} />
                        Conflito de agenda detectado
                      </span>
                    )}
                    {categorizedEmails.RESPOND_TODAY.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                        <Mail size={13} />
                        {categorizedEmails.RESPOND_TODAY.length} para responder hoje
                      </span>
                    )}
                    {overdueTasks.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 border border-red-200">
                        <Clock3 size={13} />
                        {overdueTasks.length} tarefa(s) atrasada(s)
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      Total de contas em aberto: R$ {billTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* SEÇÃO 1: CONTAS E BOLETOS */}
            <div id="contas">
              <Card
                title="Contas a pagar e Boletos"
                icon={<FileText size={19} className="text-indigo-600" />}
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
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
                        {openBills.length} em aberto
                      </span>
                      <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                        Total: R$ {billTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                      {overdueBills.length > 0 && (
                        <span className="rounded-xl bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700">
                          {overdueBills.length} vencida(s)
                        </span>
                      )}
                    </div>
                    {billMessage && <span className="text-xs font-medium text-slate-500">{billMessage}</span>}
                  </div>

                  {billLoading ? (
                    <p className="py-4 text-center text-sm text-slate-400">Carregando contas detectadas...</p>
                  ) : bills.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
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
                  <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-4">
                      {!newPersonOpen ? (
                        <button
                          type="button"
                          onClick={() => setNewPersonOpen(true)}
                          className="flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          <Plus size={14} /> Cadastrar pessoa (ex.: Carol)
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            value={newPersonName}
                            onChange={(e) => setNewPersonName(e.target.value)}
                            placeholder="Nome (ex.: Carol)"
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs outline-none focus:border-indigo-400"
                          />
                          <input
                            value={newPersonRelation}
                            onChange={(e) => setNewPersonRelation(e.target.value)}
                            placeholder="Relação (ex.: Esposa)"
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs outline-none focus:border-indigo-400"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!newPersonName.trim()) return;
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
                              }
                            }}
                            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                          >
                            Salvar
                          </button>
                        </div>
                      )}

                      {!newAccountOpen ? (
                        <button
                          type="button"
                          onClick={() => setNewAccountOpen(true)}
                          className="flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          <Plus size={14} /> Conta de saída (ex.: Itaú Débito)
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            value={newAccountName}
                            onChange={(e) => setNewAccountName(e.target.value)}
                            placeholder="Ex.: Itaú Débito"
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs outline-none focus:border-indigo-400"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!newAccountName.trim()) return;
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
                              }
                            }}
                            className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                          >
                            Salvar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* SEÇÃO 2 & 3: AGENDA (Google Calendar com conflitos) e TAREFAS */}
            <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
              {/* AGENDA */}
              <div className="space-y-6" id="agenda">
                <Card
                  title="Agenda do Dia"
                  icon={<CalendarDays size={19} className="text-blue-600" />}
                  action="Abrir Google Agenda"
                  actionHref="https://calendar.google.com/calendar/u/0/r/day"
                >
                  {conflictIds.size > 0 && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <span>
                        <strong>Atenção:</strong> Há sobreposição de horário em compromissos marcados abaixo.
                      </span>
                    </div>
                  )}

                  <div className="divide-y divide-slate-100">
                    {calendarLoading ? (
                      <p className="py-4 text-sm text-slate-400">Carregando compromissos...</p>
                    ) : realCalendarEvents.length === 0 ? (
                      <div className="py-6 text-center text-sm text-slate-500">
                        {calendarError
                          ? "Google Calendar não conectado ou permissão pendente."
                          : "Nenhum compromisso agendado para hoje."}
                      </div>
                    ) : (
                      realCalendarEvents.map((event) => {
                        const start = event.start?.dateTime ? new Date(event.start.dateTime) : null;
                        const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
                        const time = start
                          ? start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                          : "Dia todo";
                        const isConflict = conflictIds.has(event.id);

                        return (
                          <div key={event.id} className="flex gap-4 py-3.5 first:pt-1">
                            <div className="w-[60px] shrink-0 text-sm font-bold text-slate-600">{time}</div>
                            <div className={`flex-1 min-w-0 border-l-2 pl-3.5 ${isConflict ? "border-amber-400 bg-amber-50/30 rounded-r-xl py-1" : "border-slate-200"}`}>
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-slate-800 truncate">
                                  {event.summary ?? "Sem título"}
                                </h3>
                                {event.htmlLink && (
                                  <a
                                    href={event.htmlLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 shrink-0"
                                  >
                                    Abrir <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                              {isConflict && (
                                <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                  ⚠️ Conflito de horário
                                </span>
                              )}
                              {event.description && (
                                <p className="mt-1 text-xs text-slate-500 line-clamp-2">{event.description}</p>
                              )}
                              {event.location && (
                                <p className="mt-1 text-[11px] text-slate-400">{event.location}</p>
                              )}
                              {end && start && (
                                <p className="mt-0.5 text-[11px] text-slate-400">
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

                {/* MONITORAMENTO DE PREÇOS (Item 6 da visão de Fábio) */}
                <div id="compras">
                  <Card
                    title="Monitoramento de Preços"
                    icon={<ShoppingCart size={19} className="text-emerald-600" />}
                    action="+ Monitorar Produto"
                    onActionClick={() => setNewProductOpen((v) => !v)}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-slate-500">Verificação automática diária; consulte manualmente quando quiser.</p>
                        <button
                          type="button"
                          onClick={() => void handleCheckPrices()}
                          disabled={priceChecking || productsLoading || products.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw size={13} className={priceChecking ? "animate-spin" : ""} />
                          {priceChecking ? "Consultando..." : "Consultar preços agora"}
                        </button>
                      </div>
                      {priceCheckMessage && <p role="status" className="text-xs text-slate-600">{priceCheckMessage}</p>}
                      {newProductOpen && (
                        <form onSubmit={handleAddProduct} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                          <h4 className="text-xs font-bold text-slate-800">Novo Produto para Monitorar</h4>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              required
                              placeholder="Nome do produto (ex.: Panela de Pressão)"
                              value={newProductTitle}
                              onChange={(e) => setNewProductTitle(e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400"
                            />
                            <input
                              required
                              type="number"
                              step="0.01"
                              placeholder="Preço desejado (ex.: 250.00)"
                              value={newProductTarget}
                              onChange={(e) => setNewProductTarget(e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400"
                            />
                            <select
                              value={newProductSource}
                              onChange={(e) => setNewProductSource(e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
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
                            type="url"
                            placeholder="Link HTTPS do produto (obrigatório)"
                            value={newProductUrl}
                            onChange={(e) => setNewProductUrl(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setNewProductOpen(false)}
                              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                            >
                              Adicionar
                            </button>
                          </div>
                        </form>
                      )}

                      {productsLoading ? (
                        <p className="py-3 text-xs text-slate-400">Carregando monitoramento de preços...</p>
                      ) : products.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
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
                                    ? "border-emerald-300 bg-emerald-50/40 shadow-xs"
                                    : "border-slate-100 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-xs font-bold text-slate-800">{p.title}</h4>
                                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                        {p.source}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                      <span>Limite: <strong className="text-slate-800">R$ {p.targetPrice.toFixed(2)}</strong></span>
                                      {p.currentPrice !== null && p.currentPrice !== undefined && (
                                        <span>Atual: <strong className={isDeal ? "text-emerald-700 font-bold" : "text-slate-700"}>R$ {p.currentPrice.toFixed(2)}</strong></span>
                                      )}
                                      {p.lowestPrice !== null && p.lowestPrice !== undefined && (
                                        <span className="text-[11px] text-slate-400">Menor: R$ {p.lowestPrice.toFixed(2)}</span>
                                      )}
                                      {p.alerts?.map((alert) => (
                                        <span key={alert.id} className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                          Alerta: atingiu R$ {alert.targetPrice.toFixed(2)}
                                          <button type="button" onClick={() => void markPriceAlertRead(p.id, alert.id)} className="underline">Dispensar</button>
                                        </span>
                                      ))}
                                      {p.lastCheckError && (
                                        <span className="text-[10px] font-medium text-rose-700">Falha na coleta: {p.lastCheckError}</span>
                                      )}
                                      {p.lastChecked && (
                                        <span className="text-[10px] text-slate-400">Último preço válido: {new Date(p.lastChecked).toLocaleString("pt-BR")}</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {isDeal ? (
                                      <div className="flex items-center gap-2">
                                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                                          🎯 Abaixo do limite!
                                        </span>
                                        {p.url && (
                                          <a
                                            href={p.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 flex items-center gap-1"
                                          >
                                            Comprar <ArrowUpRight size={12} />
                                          </a>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-400">Aguardando preço</span>
                                    )}
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
              <div className="space-y-6" id="tarefas">
                <Card
                  title="Tarefas e Ações"
                  icon={<Target size={19} className="text-indigo-600" />}
                  action="+ Nova Tarefa"
                  onActionClick={() => setNewTaskOpen((v) => !v)}
                >
                  {/* Task Filter Tabs */}
                  <div className="mb-3 flex items-center gap-1 border-b border-slate-100 pb-2 overflow-x-auto text-xs font-semibold">
                    <button
                      onClick={() => setTaskTab("TODAS")}
                      className={`rounded-lg px-2.5 py-1 ${taskTab === "TODAS" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >
                      Todas ({tasks.length})
                    </button>
                    <button
                      onClick={() => setTaskTab("HOJE")}
                      className={`rounded-lg px-2.5 py-1 ${taskTab === "HOJE" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >
                      Hoje ({todayTasks.length})
                    </button>
                    <button
                      onClick={() => setTaskTab("ATRASADAS")}
                      className={`rounded-lg px-2.5 py-1 ${taskTab === "ATRASADAS" ? "bg-red-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >
                      Atrasadas ({overdueTasks.length})
                    </button>
                    <button
                      onClick={() => setTaskTab("CONTAS")}
                      className={`rounded-lg px-2.5 py-1 ${taskTab === "CONTAS" ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                    >
                      Contas ({billTasks.length})
                    </button>
                  </div>

                  {/* Inline Task Creator */}
                  {newTaskOpen && (
                    <form onSubmit={handleCreateTask} className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                      <input
                        required
                        placeholder="Nome da nova tarefa..."
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={newTaskPriority}
                          onChange={(e) => setNewTaskPriority(e.target.value as any)}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        >
                          <option value="Alta">Alta prioridade</option>
                          <option value="Média">Média prioridade</option>
                          <option value="Baixa">Baixa prioridade</option>
                        </select>
                        <input
                          type="date"
                          value={newTaskDueDate}
                          onChange={(e) => setNewTaskDueDate(e.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                        <button
                          type="submit"
                          className="ml-auto rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          Salvar
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Task list */}
                  <div className="space-y-1 divide-y divide-slate-50">
                    {loadingTasks ? (
                      <p className="py-4 text-center text-xs text-slate-400">Carregando lista de tarefas...</p>
                    ) : filteredTasks.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-400">Nenhuma tarefa nesta categoria.</p>
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

                {/* E-MAILS COM FILTRO INTELIGENTE (Item 3 da visão de Fábio) */}
                <div id="emails">
                  <Card
                    title="Gmail com Filtro Inteligente"
                    icon={<Mail size={19} className="text-purple-600" />}
                    action="Abrir Gmail"
                    actionHref="https://mail.google.com/mail/u/0/#inbox"
                  >
                    {/* Category tabs */}
                    <div className="mb-3 flex items-center gap-1 border-b border-slate-100 pb-2 overflow-x-auto text-xs font-semibold">
                      <button
                        onClick={() => setEmailTab("TODAS")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "TODAS" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                      >
                        Todas
                      </button>
                      <button
                        onClick={() => setEmailTab("RESPOND_TODAY")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "RESPOND_TODAY" ? "bg-red-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                      >
                        🔴 Responder hoje ({categorizedEmails.RESPOND_TODAY.length})
                      </button>
                      <button
                        onClick={() => setEmailTab("FOLLOW_UP")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "FOLLOW_UP" ? "bg-amber-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                      >
                        🟠 Acompanhar ({categorizedEmails.FOLLOW_UP.length})
                      </button>
                      <button
                        onClick={() => setEmailTab("INFORMATIVE")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "INFORMATIVE" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                      >
                        🔵 Informativo ({categorizedEmails.INFORMATIVE.length})
                      </button>
                      <button
                        onClick={() => setEmailTab("NOISE")}
                        className={`rounded-lg px-2.5 py-1 ${emailTab === "NOISE" ? "bg-slate-500 text-white" : "text-slate-400 hover:bg-slate-100"}`}
                      >
                        ⚪ Ruído ({categorizedEmails.NOISE.length})
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                      {gmailLoading ? (
                        <p className="py-4 text-center text-xs text-slate-400">Carregando e classificando mensagens...</p>
                      ) : displayedEmails.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-400">Nenhum e-mail nesta categoria.</p>
                      ) : (
                        displayedEmails.map((message) => {
                          const headers = message.payload?.headers ?? [];
                          const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(Sem assunto)";
                          const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "Remetente desconhecido";
                          const category = message.dashboardCategory ?? "INFORMATIVE";

                          return (
                            <div
                              key={message.id}
                              className="rounded-xl border border-slate-100 bg-white p-3 hover:bg-slate-50/70 transition"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-semibold text-slate-600 max-w-[200px]">
                                  {from}
                                </span>
                                {category === "RESPOND_TODAY" && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 shrink-0">
                                    Responder hoje
                                  </span>
                                )}
                                {category === "FOLLOW_UP" && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 shrink-0">
                                    Acompanhar
                                  </span>
                                )}
                                {category === "INFORMATIVE" && (
                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 shrink-0">
                                    Informativo
                                  </span>
                                )}
                                {category === "NOISE" && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 shrink-0">
                                    Ruído / Promo
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs font-semibold text-slate-800 line-clamp-1">{subject}</p>
                              {message.snippet && (
                                <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">{message.snippet}</p>
                              )}
                              {message.dashboardReason && (
                                <p className="mt-1.5 text-[10px] text-indigo-600 italic">
                                  Motivo: {message.dashboardReason}
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </Card>
                </div>

                {/* Card de Progresso */}
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800">Progresso do Dia</h2>
                      <p className="text-xs text-slate-400">
                        {done} de {tasks.length} tarefas concluídas
                      </p>
                    </div>
                    <span className="text-xl font-extrabold text-indigo-600">{completionRate}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </section>
              </div>
            </div>

            {/* Footer */}
            <footer className="mt-8 border-t border-slate-200 pt-5 text-center text-xs text-slate-400">
              Painel da Vida · Inteligência para Priorizar o seu Dia ·{" "}
              {databaseError ? "Modo demonstração com armazenamento local" : "Conectado ao PostgreSQL"}
            </footer>
          </div>
        </section>
      </div>

      {/* MODAL DE PAGAMENTO RÁPIDO (1-click PIX e Código de Barras) */}
      {activePaymentBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {activePaymentBill.merchant ?? activePaymentBill.subject}
                </h3>
                <p className="text-xs text-slate-500">
                  {activePaymentBill.dueDate
                    ? `Vence em ${new Date(activePaymentBill.dueDate).toLocaleDateString("pt-BR")}`
                    : "Vencimento não informado"}
                </p>
              </div>
              <button
                onClick={() => setActivePaymentBill(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {activePaymentBill.amount !== null && (
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <span className="text-xs font-medium text-slate-500">Valor a pagar</span>
                <p className="text-2xl font-black text-slate-900">
                  R$ {activePaymentBill.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {/* PIX Copia e Cola */}
            {activePaymentBill.pixCode ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">PIX Copia e Cola:</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={activePaymentBill.pixCode}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600 truncate"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activePaymentBill.pixCode!, "pix")}
                    className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shrink-0"
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
                <label className="text-xs font-semibold text-slate-700">Linha Digitável / Boleto:</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={activePaymentBill.barcode}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600 truncate"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activePaymentBill.barcode!, "barcode")}
                    className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 shrink-0"
                  >
                    {copiedKey === "barcode" ? <CheckCheck size={14} /> : <Copy size={14} />}
                    {copiedKey === "barcode" ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              {activePaymentBill.paymentUrl ? (
                <a
                  href={activePaymentBill.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 flex items-center gap-1"
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
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Marcar como Paga ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Sidebar() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-5">
        <Logo />
      </div>
      <SidebarContent />
    </div>
  );
}

function SidebarContent() {
  return (
    <div className="flex flex-1 flex-col p-4">
      <nav className="space-y-1">
        <Nav icon={<LayoutDashboard size={18} />} label="Visão Geral" active targetId="" />
        <Nav icon={<FileText size={18} />} label="Contas a Pagar" targetId="contas" />
        <Nav icon={<CalendarDays size={18} />} label="Agenda" targetId="agenda" />
        <Nav icon={<Target size={18} />} label="Tarefas" targetId="tarefas" />
        <Nav icon={<Mail size={18} />} label="E-mails Filtrados" targetId="emails" />
        <Nav icon={<ShoppingCart size={18} />} label="Preços & Compras" targetId="compras" />
      </nav>

      <div className="mt-8">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Integrações
        </p>
        <Connection label="Google Calendar" status="Sincronizado" color="bg-emerald-500" />
        <Connection label="Gmail API" status="Classificação Ativa" color="bg-emerald-500" />
        <Connection label="Monitor de Preços" status="Diário + consulta manual" color="bg-indigo-500" />
      </div>

      <div className="mt-auto pt-6">
        <div className="rounded-2xl bg-indigo-900 p-4 text-white">
          <Sparkles size={16} />
          <p className="mt-2 text-xs font-bold">Painel Inteligente</p>
          <p className="mt-1 text-[11px] leading-4 text-indigo-200">
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
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
        <Target size={19} />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-900">Painel da Vida</p>
        <p className="text-[11px] text-slate-400">Filtro inteligente digital</p>
      </div>
    </div>
  );
}

function Stat({ value, label, color = "text-slate-900" }: { value: number; label: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-2xs">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-slate-700">
          {icon}
          <h2 className="font-bold text-slate-900">{title}</h2>
        </div>
        {action &&
          (actionHref ? (
            <a
              href={actionHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {action}
              <ChevronRight size={14} />
            </a>
          ) : (
            <button
              type="button"
              onClick={onActionClick}
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
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
    <div className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-slate-50 transition">
      <button
        onClick={toggle}
        aria-label={task.completed ? "Reabrir tarefa" : "Concluir tarefa"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          task.completed ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white hover:border-indigo-400"
        }`}
      >
        {task.completed && <Check size={13} />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs sm:text-sm font-medium ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}>
          {task.title}
        </p>
        <p className="truncate text-[11px] text-slate-400">
          {task.bill ? `Conta a pagar · ${task.bill.merchant ?? "Boleto"}` : task.description}
        </p>
      </div>

      <span
        className={`hidden rounded-md px-2 py-0.5 text-[10px] font-bold sm:block ${
          task.priority === "Alta"
            ? "bg-red-50 text-red-600"
            : task.priority === "Média"
              ? "bg-amber-50 text-amber-700"
              : "bg-slate-100 text-slate-600"
        }`}
      >
        {task.priority}
      </span>

      {task.bill && (
        <button
          type="button"
          onClick={onPayClick}
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 shrink-0 flex items-center gap-1"
        >
          <CreditCard size={12} /> Pagar
        </button>
      )}

      <span className={`w-14 text-right text-xs font-medium shrink-0 ${task.due === "Hoje" ? "text-indigo-600 font-bold" : "text-slate-400"}`}>
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
        overdue ? "border-red-200 bg-red-50/40" : "border-slate-100 bg-white hover:bg-slate-50/50"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-900">{bill.merchant ?? bill.subject}</p>
            {overdue && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                Vencida
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-400">{bill.sender}</p>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={overdue ? "font-bold text-red-600" : "text-slate-600"}>
              {due ? `Vencimento: ${due.toLocaleDateString("pt-BR")}` : "Vencimento não identificado"}
            </span>
            {bill.amount !== null && (
              <span className="font-extrabold text-slate-900">
                R$ {bill.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            )}
            <span className="text-slate-500 font-medium">
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
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
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
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
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
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
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
          className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 flex items-center gap-1 shrink-0"
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
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  targetId?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (targetId) {
          document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${
        active ? "bg-indigo-50 text-indigo-700 font-bold" : "text-slate-600 hover:bg-slate-50"
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
        <span className="block text-xs font-medium text-slate-700">{label}</span>
        <span className="block text-[10px] text-slate-400">{status}</span>
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
    <div className="flex items-center gap-2.5 rounded-xl p-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
      {icon && <div className="shrink-0">{icon}</div>}
      <span className="flex-1">{title}</span>
      {badge && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
          {badge}
        </span>
      )}
    </div>
  );
}
