"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "./dashboard-header";
import { MetricCards } from "./metric-cards";
import { AgendaSection } from "./agenda-section";
import { EmailsSection } from "./emails-section";
import { BillsSection } from "./bills-section";
import { TasksSection } from "./tasks-section";
import { PriceMonitorSection } from "./price-monitor-section";
import { ConnectedAccountsModal } from "./connected-accounts-modal";
import { AddTaskModal } from "./modals/add-task-modal";
import { AddBillModal } from "./modals/add-bill-modal";
import { AddProductModal } from "./modals/add-product-modal";
import { SwitchAccountModal } from "./modals/switch-account-modal";
import {
  detectCalendarConflicts,
  formatDueDate,
  type BillApi,
  type CalendarApiEvent,
  type ConnectedAccountApi,
  type DashboardTask,
  type GmailApiMessage,
  type MonitoredProductApi,
  type PaymentAccountApi,
} from "./types";

export default function Dashboard() {
  // Theme state
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const savedTheme = window.localStorage.getItem("painel-da-vida-theme");
      if (savedTheme) return savedTheme === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  const [today] = useState(() => new Date());

  // Connected accounts
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccountApi[]>([]);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);

  // Calendar
  const [calendarEvents, setCalendarEvents] = useState<CalendarApiEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState(false);
  const [selectedCalendarAccount, setSelectedCalendarAccount] = useState<string>("all");

  // Gmail / Messages
  const [gmailMessages, setGmailMessages] = useState<GmailApiMessage[]>([]);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailError, setGmailError] = useState(false);
  const [selectedGmailAccount, setSelectedGmailAccount] = useState<string>("all");
  const [creatingEmailTaskId, setCreatingEmailTaskId] = useState<string | null>(null);
  const [emailTaskError, setEmailTaskError] = useState<string | null>(null);

  // Bills
  const [bills, setBills] = useState<BillApi[]>([]);
  const [billLoading, setBillLoading] = useState(true);
  const [billScanning, setBillScanning] = useState(false);
  const [billMessage, setBillMessage] = useState<string | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountApi[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);

  // Tasks
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Monitored products
  const [products, setProducts] = useState<MonitoredProductApi[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [priceChecking, setPriceChecking] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [priceCheckMessage, setPriceCheckMessage] = useState<string | null>(null);

  // Modals
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [addBillModalOpen, setAddBillModalOpen] = useState(false);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [switchAccountModalOpen, setSwitchAccountModalOpen] = useState(false);

  // Active User session info
  const [activeUser, setActiveUser] = useState<{ email: string; name: string }>({
    email: "fteraoka72@gmail.com",
    name: "Fábio Teraoka",
  });

  // Menus
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("painel-da-vida-theme", next ? "dark" : "light");
        if (next) {
          document.documentElement.dataset.theme = "dark";
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.dataset.theme = "light";
          document.documentElement.classList.remove("dark");
        }
      }
      return next;
    });
  }, []);

  // Fetch Connected Accounts
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/accounts");
      if (res.ok) {
        const data = await res.json();
        setConnectedAccounts(data.accounts || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  // Fetch Calendar Events
  const fetchCalendar = useCallback(async (accountId = selectedCalendarAccount) => {
    setCalendarLoading(true);
    setCalendarError(false);
    try {
      const url =
        accountId && accountId !== "all"
          ? `/api/calendar/events?accountId=${encodeURIComponent(accountId)}`
          : "/api/calendar/events";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao carregar agenda.");
      const data = await res.json();
      setCalendarEvents(data.items || []);
    } catch {
      setCalendarError(true);
    } finally {
      setCalendarLoading(false);
    }
  }, [selectedCalendarAccount]);

  // Fetch Gmail Messages
  const fetchGmail = useCallback(async (accountId = selectedGmailAccount) => {
    setGmailLoading(true);
    setGmailError(false);
    try {
      const url =
        accountId && accountId !== "all"
          ? `/api/gmail/messages?accountId=${encodeURIComponent(accountId)}&includeNoise=true`
          : "/api/gmail/messages?includeNoise=true";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Erro ao carregar e-mails.");
      const data = await res.json();
      setGmailMessages(data.messages || []);
    } catch {
      setGmailError(true);
    } finally {
      setGmailLoading(false);
    }
  }, [selectedGmailAccount]);

  // Fetch Bills
  const fetchBills = useCallback(async () => {
    setBillLoading(true);
    try {
      const res = await fetch("/api/bills");
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills || []);
        if (data.accounts) setPaymentAccounts(data.accounts);
      }
    } catch {
      // Ignore
    } finally {
      setBillLoading(false);
    }
  }, []);

  // Fetch Tasks
  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        const mapped: DashboardTask[] = (data || []).map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description || undefined,
          priority:
            t.priority === "HIGH"
              ? "Alta"
              : t.priority === "LOW"
                ? "Baixa"
                : "Média",
          due: formatDueDate(t.dueAt),
          completed: t.status === "COMPLETED",
          bill: t.bill,
        }));
        setTasks(mapped);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  // Fetch Monitored Products
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch {
      // Ignore
    } finally {
      setProductsLoading(false);
    }
  }, []);

  // Fetch People
  const fetchPeople = useCallback(async () => {
    try {
      const res = await fetch("/api/people");
      if (res.ok) {
        const data = await res.json();
        setPeople(data || []);
      }
    } catch {
      // Ignore
    }
  }, []);

  // Fetch active user
  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data?.user?.email) {
          setActiveUser({
            email: data.user.email,
            name: data.user.name || "Fábio Teraoka",
          });
        }
      }
    } catch {
      // Fallback
    }
  }, []);

  // Refresh All Data
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.allSettled([
      fetchUser(),
      fetchAccounts(),
      fetchCalendar(),
      fetchGmail(),
      fetchBills(),
      fetchTasks(),
      fetchProducts(),
      fetchPeople(),
    ]);
    setIsRefreshing(false);
  }, [fetchUser, fetchAccounts, fetchCalendar, fetchGmail, fetchBills, fetchTasks, fetchProducts, fetchPeople]);

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUser();
      fetchAccounts();
      fetchCalendar();
      fetchGmail();
      fetchBills();
      fetchTasks();
      fetchProducts();
      fetchPeople();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchUser, fetchAccounts, fetchCalendar, fetchGmail, fetchBills, fetchTasks, fetchProducts, fetchPeople]);

  // Detect calendar conflicts
  const conflicts = useMemo(() => detectCalendarConflicts(calendarEvents), [calendarEvents]);

  // Handle task from email
  const handleCreateTaskFromEmail = async (message: GmailApiMessage) => {
    setCreatingEmailTaskId(message.id);
    setEmailTaskError(null);
    try {
      const res = await fetch("/app/api/gmail/tasks" in window ? "/app/api/gmail/tasks" : "/api/gmail/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalEmailId: message.id,
          threadId: message.threadId,
          subject: message.subject,
          snippet: message.snippet,
          sender: message.sender,
          senderName: message.senderName,
          connectedAccountId: message.connectedAccountId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao criar tarefa a partir do e-mail.");
      }

      await fetchGmail();
      await fetchTasks();
    } catch (err: any) {
      setEmailTaskError(err?.message || "Não foi possível criar a tarefa.");
    } finally {
      setCreatingEmailTaskId(null);
    }
  };

  // Handle Task Completion Toggle
  const handleToggleTaskComplete = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const nextCompleted = !task.completed;

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: nextCompleted } : t)),
    );

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextCompleted ? "COMPLETED" : "PENDING",
        }),
      });
    } catch {
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !nextCompleted } : t)),
      );
    }
  };

  // Handle Delete Task
  const handleDeleteTask = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    } catch {
      fetchTasks();
    }
  };

  // Handle Add Task
  const handleAddTask = async (data: {
    title: string;
    description?: string;
    priority: "Alta" | "Média" | "Baixa";
    due: string;
  }) => {
    const priorityMap = { Alta: "HIGH", Média: "MEDIUM", Baixa: "LOW" };
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        priority: priorityMap[data.priority],
        due: data.due,
      }),
    });
    if (res.ok) {
      fetchTasks();
    }
  };

  // Handle Add Bill
  const handleAddBill = async (data: any) => {
    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      fetchBills();
      setBillMessage("Conta adicionada com sucesso!");
      setTimeout(() => setBillMessage(null), 3500);
    }
  };

  // Handle Update Bill Status
  const handleUpdateBillStatus = async (billId: string, status: BillApi["status"]) => {
    setBills((prev) => prev.map((b) => (b.id === billId ? { ...b, status } : b)));
    try {
      await fetch(`/api/bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      fetchBills();
    }
  };

  // Handle Scan Bills
  const handleScanBills = async () => {
    setBillScanning(true);
    setBillMessage(null);
    try {
      const res = await fetch("/api/bills/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await fetchBills();
        await fetchTasks();
        setBillMessage(
          `Varredura concluída: ${data.scanned} e-mails analisados, ${data.detected} faturas identificadas e ${data.tasksCreated} tarefas criadas.`,
        );
      } else {
        setBillMessage(data.error || "Falha ao escanear faturas.");
      }
    } catch {
      setBillMessage("Não foi possível conectar para escanear faturas.");
    } finally {
      setBillScanning(false);
      setTimeout(() => setBillMessage(null), 5000);
    }
  };

  // Handle Check Prices
  const handleCheckPrices = async () => {
    setPriceChecking(true);
    setPriceCheckMessage(null);
    try {
      const res = await fetch("/api/products/check", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await fetchProducts();
        setPriceCheckMessage(`Verificação concluída: ${data.checked} produtos verificados nas lojas.`);
      }
    } catch {
      setPriceCheckMessage("Erro ao consultar lojas.");
    } finally {
      setPriceChecking(false);
      setTimeout(() => setPriceCheckMessage(null), 4000);
    }
  };

  // Handle Add Product
  const handleAddProduct = async (data: any) => {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      fetchProducts();
      setPriceCheckMessage("Produto adicionado com sucesso!");
      setTimeout(() => setPriceCheckMessage(null), 3000);
    }
  };

  // Handle Delete Product
  const handleDeleteProduct = async (productId: string) => {
    setDeletingProductId(productId);
    try {
      await fetch(`/api/products/${productId}`, { method: "DELETE" });
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } finally {
      setDeletingProductId(null);
    }
  };

  // Metrics
  const billsTotalAmount = useMemo(() => {
    return bills
      .filter((b) => b.status !== "PAID" && b.status !== "IGNORED" && b.amount !== null)
      .reduce((sum, b) => sum + (b.amount || 0), 0);
  }, [bills]);

  const pendingTasksCount = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks]);
  const highPriorityTasksCount = useMemo(
    () => tasks.filter((t) => !t.completed && t.priority === "Alta").length,
    [tasks],
  );
  const opportunitiesCount = useMemo(() => products.filter((p) => p.isOpportunity).length, [products]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors">
      {/* Header */}
      <DashboardHeader
        today={today}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
        connectedAccounts={connectedAccounts}
        onOpenAccountsModal={() => setAccountsModalOpen(true)}
        onOpenSwitchAccountModal={() => setSwitchAccountModalOpen(true)}
        onRefreshAll={refreshAll}
        isRefreshing={isRefreshing}
        profileOpen={profileOpen}
        setProfileOpen={setProfileOpen}
        notificationsOpen={notificationsOpen}
        setNotificationsOpen={setNotificationsOpen}
        unreadCount={gmailMessages.filter((m) => m.dashboardCategory === "RESPOND_TODAY").length}
        activeUserEmail={activeUser.email}
        activeUserName={activeUser.name}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* KPI Metric Cards */}
        <MetricCards
          eventsCount={calendarEvents.length}
          pendingTasksCount={pendingTasksCount}
          highPriorityTasksCount={highPriorityTasksCount}
          billsCount={bills.filter((b) => b.status !== "PAID" && b.status !== "IGNORED").length}
          billsTotalAmount={billsTotalAmount}
          productsCount={products.length}
          opportunitiesCount={opportunitiesCount}
          accountsCount={connectedAccounts.filter((a) => a.status === "CONNECTED").length}
        />

        {/* Dashboard 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Left Column: Agenda, Emails & Tasks */}
          <div className="lg:col-span-7 space-y-6">
            {/* Agenda */}
            <AgendaSection
              events={calendarEvents}
              loading={calendarLoading}
              error={calendarError}
              selectedAccount={selectedCalendarAccount}
              onSelectAccount={(accId) => {
                setSelectedCalendarAccount(accId);
                fetchCalendar(accId);
              }}
              accounts={connectedAccounts.filter((a) => a.status === "CONNECTED")}
              conflicts={conflicts}
            />

            {/* Emails do Dia */}
            <EmailsSection
              messages={gmailMessages}
              loading={gmailLoading}
              error={gmailError}
              selectedAccount={selectedGmailAccount}
              onSelectAccount={(accId) => {
                setSelectedGmailAccount(accId);
                fetchGmail(accId);
              }}
              accounts={connectedAccounts.filter((a) => a.status === "CONNECTED")}
              onCreateTaskFromEmail={handleCreateTaskFromEmail}
              creatingTaskId={creatingEmailTaskId}
              taskError={emailTaskError}
            />

            {/* Tasks */}
            <TasksSection
              tasks={tasks}
              loading={loadingTasks}
              onToggleComplete={handleToggleTaskComplete}
              onDeleteTask={handleDeleteTask}
              onOpenAddTask={() => setAddTaskModalOpen(true)}
            />
          </div>

          {/* Side Right Column: Bills & Price Monitor */}
          <div className="lg:col-span-5 space-y-6">
            {/* Contas a Pagar */}
            <BillsSection
              bills={bills}
              loading={billLoading}
              onScanBills={handleScanBills}
              scanning={billScanning}
              onOpenAddBill={() => setAddBillModalOpen(true)}
              onUpdateStatus={handleUpdateBillStatus}
              statusMessage={billMessage}
            />

            {/* Monitor de Preços */}
            <PriceMonitorSection
              products={products}
              loading={productsLoading}
              onCheckPrices={handleCheckPrices}
              checking={priceChecking}
              onDeleteProduct={handleDeleteProduct}
              deletingId={deletingProductId}
              onOpenAddProduct={() => setAddProductModalOpen(true)}
              statusMessage={priceCheckMessage}
            />
          </div>
        </div>
      </main>

      {/* Modals */}
      <ConnectedAccountsModal
        isOpen={accountsModalOpen}
        onClose={() => setAccountsModalOpen(false)}
        accounts={connectedAccounts}
        onAccountsUpdated={refreshAll}
      />

      <AddTaskModal
        isOpen={addTaskModalOpen}
        onClose={() => setAddTaskModalOpen(false)}
        onAddTask={handleAddTask}
      />

      <AddBillModal
        isOpen={addBillModalOpen}
        onClose={() => setAddBillModalOpen(false)}
        paymentAccounts={paymentAccounts}
        people={people}
        onAddBill={handleAddBill}
      />

      <AddProductModal
        isOpen={addProductModalOpen}
        onClose={() => setAddProductModalOpen(false)}
        onAddProduct={handleAddProduct}
      />

      <SwitchAccountModal
        isOpen={switchAccountModalOpen}
        onClose={() => setSwitchAccountModalOpen(false)}
        currentEmail={activeUser.email}
        connectedAccounts={connectedAccounts}
        onAccountSwitched={refreshAll}
      />
    </div>
  );
}
