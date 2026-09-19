"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  LayoutDashboard,
  Mail,
  Menu,
  Search,
  Settings,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { alerts, calendarEvents, emails, initialTasks, type Task } from "@/lib/mock-data";

type GmailApiMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
  };
};

type CalendarApiEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

type ApiTask = {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueAt: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  completedAt: string | null;
};

type DashboardTask = Omit<Task, "id" | "priority"> & {
  id: string;
  priority: Task["priority"];
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

export default function Dashboard() {
  const [tasks, setTasks] = useState<DashboardTask[]>(
    initialTasks.map((task) => ({ ...task, id: String(task.id) })),
  );
  const [today, setToday] = useState<Date | null>(null);
  const [mobile, setMobile] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [databaseError, setDatabaseError] = useState(false);
  const [realCalendarEvents, setRealCalendarEvents] = useState<CalendarApiEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState(false);
  const [gmailMessages, setGmailMessages] = useState<GmailApiMessage[]>([]);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [gmailError, setGmailError] = useState(false);

  useEffect(() => {
    setToday(new Date());

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
        const response = await fetch("/api/gmail/messages", { cache: "no-store" });
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

    return () => {
      cancelled = true;
    };
  }, []);

  const done = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks],
  );

  const dateLabel =
    today?.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }) ?? "Carregando...";

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
    } catch {
      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === id ? { ...task, completed: current.completed } : task,
        ),
      );
    }
  }

  const completionRate = tasks.length
    ? Math.round((done / tasks.length) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[250px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <Sidebar />
        </aside>

        {mobile && (
          <div
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setMobile(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[270px] border-r border-slate-200 bg-white transition-transform lg:hidden ${mobile ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b p-5">
              <Logo />
              <button onClick={() => setMobile(false)}>
                <X size={20} />
              </button>
            </div>
            <SidebarContent />
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobile(true)}
                className="rounded-xl p-2 lg:hidden"
              >
                <Menu size={21} />
              </button>
              <div className="hidden items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-400 sm:flex">
                <Search size={16} />
                Buscar...
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:block">
                Google conectado
              </span>
              <button className="relative rounded-xl p-2.5 text-slate-500">
                <Bell size={19} />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
              </button>
              <button className="hidden rounded-xl p-2.5 sm:block">
                <Settings size={19} />
              </button>
              <button type="button" onClick={() => void signOut({ callbackUrl: "/login" })}
                  title="Sair"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-700"
                >
                  FT
                </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
            <section className="mb-7">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
                <CalendarDays size={16} />
                {dateLabel}
              </div>

              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Bom dia, Fábio.
                  </h1>
                  <p className="mt-2 text-sm text-slate-500 sm:text-base">
                    Aqui está o que merece sua atenção hoje.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Stat value={realCalendarEvents.length} label="agenda" />
                  <Stat value={tasks.length - done} label="tarefas" />
                  <Stat
                    value={emails.filter((email) => email.unread).length}
                    label="não lidos"
                  />
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-5 shadow-sm sm:p-6">
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
                  <Sparkles size={19} />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">Seu dia em 30 segundos</h2>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      IA
                    </span>
                  </div>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                    Sua manhã está relativamente organizada, mas existem duas
                    respostas importantes aguardando sua atenção. À tarde você
                    tem compromissos às 15h30 e 18h. Uma tarefa de alta
                    prioridade vence hoje.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Tag text="2 respostas importantes" />
                    <Tag text="1 prazo hoje" />
                    <Tag text="4 compromissos" />
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
              <div className="space-y-6" id="agenda">
                <Card
                  title="Agenda de hoje"
                  icon={<CalendarDays size={18} />}
                  action="Ver agenda"
                  actionHref="https://calendar.google.com/calendar/u/0/r/day"
                >
                  <div className="divide-y divide-slate-100">
                    {calendarLoading ? (
                      <p className="py-4 text-sm text-slate-400">Carregando agenda...</p>
                    ) : realCalendarEvents.length === 0 ? (
                      <p className="py-4 text-sm text-slate-400">
                        {calendarError
                          ? "Não foi possível carregar o Google Calendar."
                          : "Nenhum compromisso para hoje."}
                      </p>
                    ) : (
                      realCalendarEvents.map((event) => {
                        const start = event.start?.dateTime ? new Date(event.start.dateTime) : null;
                        const end = event.end?.dateTime ? new Date(event.end.dateTime) : null;
                        const time = start ? start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Dia todo";
                        return (
                          <div key={event.id} className="flex gap-4 py-4 first:pt-1">
                            <div className="w-[58px] shrink-0 text-sm font-semibold text-slate-500">{time}</div>
                            <div className="border-l border-slate-200 pl-4">
                              <h3 className="text-sm font-semibold">{event.summary ?? "Sem título"}</h3>
                              {event.description && <p className="mt-1 text-sm text-slate-500">{event.description}</p>}
                              {event.location && <p className="mt-1 text-xs text-slate-400">{event.location}</p>}
                              {end && start && <p className="mt-1 text-xs text-slate-400">Até {end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>

                <div id="tarefas">
                  <Card
                    title="Tarefas"
                    icon={<Target size={18} />}
                    action={
                      loadingTasks
                        ? "Carregando..."
                        : `${done}/${tasks.length} concluídas`
                    }
                  >
                    <div>
                      {tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          toggle={() => void toggle(task.id)}
                        />
                      ))}
                    </div>
                  </Card>
                </div>
              </div>

              <div className="space-y-6">
                <div id="emails">
                  <Card
                    title="E-mails importantes"
                    icon={<Mail size={18} />}
                    action="Abrir Gmail"
                    actionHref="https://mail.google.com/mail/u/0/#inbox"
                  >
                    <div className="space-y-2">
                      {gmailLoading ? (
                        <p className="py-3 text-sm text-slate-400">Carregando Gmail...</p>
                      ) : gmailMessages.length === 0 ? (
                        <p className="py-3 text-sm text-slate-400">
                        {gmailError
                          ? "Não foi possível carregar o Gmail."
                          : "Nenhum e-mail recente encontrado."}
                      </p>
                      ) : (
                        gmailMessages.slice(0, 8).map((message) => {
                          const headers = message.payload?.headers ?? [];
                          const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(Sem assunto)";
                          const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "Remetente desconhecido";
                          return (
                            <div key={message.id} className="rounded-xl border border-slate-100 p-3">
                              <p className="text-xs font-semibold text-slate-500">{from}</p>
                              <p className="mt-1 text-sm font-semibold">{subject}</p>
                              {message.snippet && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{message.snippet}</p>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </Card>
                </div>

                <div id="alertas">
                  <Card
                    title="Alertas"
                    icon={<CircleAlert size={18} />}
                    action="Ver todos"
                  >
                    <div className="space-y-3">
                      {alerts.map((alert) => (
                        <AlertRow key={alert.id} alert={alert} />
                      ))}
                    </div>
                  </Card>
                </div>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">Progresso do dia</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {done} de {tasks.length} tarefas concluídas
                      </p>
                    </div>
                    <span className="text-xl font-bold text-indigo-600">
                      {completionRate}%
                    </span>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                </section>
              </div>
            </div>

            <footer className="mt-8 border-t border-slate-200 pt-5 text-center text-xs text-slate-400">
              Painel da Vida · V1 ·{" "}
              {databaseError
                ? "Modo demonstração — banco indisponível"
                : "Dados sincronizados com PostgreSQL"}
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-5">
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
        <Nav icon={<LayoutDashboard size={18} />} label="Visão geral" active />
        <Nav icon={<CalendarDays size={18} />} label="Agenda" />
        <Nav icon={<Target size={18} />} label="Tarefas" />
        <Nav icon={<Mail size={18} />} label="E-mails" />
        <Nav icon={<CircleAlert size={18} />} label="Alertas" />
      </nav>

      <div className="mt-8">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Conexões
        </p>
        <Connection
          label="Google Calendar"
          status="Conectado no login"
          color="bg-emerald-500"
        />
        <Connection
          label="Gmail"
          status="Conectado no login"
          color="bg-emerald-500"
        />
        <Connection
          label="Tarefas"
          status="PostgreSQL"
          color="bg-indigo-500"
        />
      </div>

      <div className="mt-auto pt-6">
        <div className="rounded-2xl bg-slate-950 p-4 text-white">
          <Sparkles size={16} />
          <p className="mt-3 text-sm font-semibold">Assistente pessoal</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Em breve, vou ajudar a priorizar seu dia automaticamente.
          </p>
        </div>

        <button className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600">
          <Settings size={17} />
          Configurações
        </button>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
        <Target size={19} />
      </div>
      <div>
        <p className="text-sm font-bold">Painel da Vida</p>
        <p className="text-[11px] text-slate-400">Seu dia, em um só lugar</p>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-lg font-bold">{value}</div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}

function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  action?: string;
  actionHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-slate-500">
          {icon}
          <h2 className="font-semibold text-slate-900">{title}</h2>
        </div>
        {action && (
          actionHref ? (
            <a
              href={actionHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              {action}
              <ChevronRight size={14} />
            </a>
          ) : (
            <button className="flex items-center gap-1 text-xs font-medium text-indigo-600">
              {action}
              <ChevronRight size={14} />
            </button>
          )
        )}
      </div>
      {children}
    </section>
  );
}

function TaskRow({
  task,
  toggle,
}: {
  task: DashboardTask;
  toggle: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-slate-50">
      <button
        onClick={toggle}
        aria-label={task.completed ? "Reabrir tarefa" : "Concluir tarefa"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${task.completed ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"}`}
      >
        {task.completed && <Check size={13} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${task.completed ? "text-slate-400 line-through" : "text-slate-800"}`}
        >
          {task.title}
        </p>
        <p className="truncate text-xs text-slate-400">{task.description}</p>
      </div>

      <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 sm:block">
        {task.priority}
      </span>
      <span className="hidden w-14 text-right text-xs text-slate-400 sm:block">
        {task.due}
      </span>
    </div>
  );
}

function EmailRow({ email }: { email: (typeof emails)[number] }) {
  return (
    <button
      type="button"
      className="w-full rounded-xl p-3 text-left hover:bg-slate-50"
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
          {email.sender
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2">
            <p className={email.unread ? "font-semibold" : "font-medium"}>
              {email.sender}
            </p>
            <span className="text-[11px] text-slate-400">{email.time}</span>
          </div>
          <p className="truncate text-sm font-medium text-slate-700">
            {email.subject}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">
            {email.preview}
          </p>
          <span className="mt-2 inline-flex rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600">
            {email.category}
          </span>
        </div>
      </div>
    </button>
  );
}

function AlertRow({ alert }: { alert: (typeof alerts)[number] }) {
  const Icon =
    alert.type === "warning"
      ? Clock3
      : alert.type === "danger"
        ? AlertCircle
        : FileText;

  const bg =
    alert.type === "warning"
      ? "bg-amber-50 border-amber-100"
      : alert.type === "danger"
        ? "bg-red-50 border-red-100"
        : "bg-blue-50 border-blue-100";

  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className="flex gap-3">
        <Icon size={17} />
        <div>
          <p className="text-sm font-semibold">{alert.title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {alert.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function Nav({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  const target =
    label === "Agenda"
      ? "agenda"
      : label === "Tarefas"
        ? "tarefas"
        : label === "E-mails"
          ? "emails"
          : label === "Alertas"
            ? "alertas"
            : null;

  return (
    <button
      type="button"
      onClick={() =>
        target &&
        document
          .getElementById(target)
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
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
    <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        <span className="block text-[10px] text-slate-400">{status}</span>
      </span>
    </button>
  );
}

function Tag({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700">
      {text}
    </span>
  );
}
