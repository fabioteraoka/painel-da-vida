import type { Task } from "@/lib/mock-data";

export type ConnectedAccountApi = {
  id: string;
  userId: string;
  provider: "GOOGLE" | "MICROSOFT";
  externalUserId: string | null;
  email: string;
  name: string | null;
  label: string | null;
  accountType: "PERSONAL" | "WORK" | "OTHER";
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | "EXPIRED";
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GmailApiMessage = {
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

export type BillApi = {
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

export type PaymentAccountApi = {
  id: string;
  name: string;
  type: string;
};

export type CalendarApiEvent = {
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

export type MonitoredProductApi = {
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

export type ApiTask = {
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

export type DashboardTask = Omit<Task, "id" | "priority"> & {
  id: string;
  priority: Task["priority"];
  bill?: ApiTask["bill"];
};

export type ConflictResult = {
  conflictIds: Set<string>;
  crossAccountConflicts: Array<{
    titleA: string;
    accountA: string;
    titleB: string;
    accountB: string;
    time: string;
  }>;
};

export function formatDueDate(value: string | null): string {
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

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function detectCalendarConflicts(events: CalendarApiEvent[]): ConflictResult {
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
