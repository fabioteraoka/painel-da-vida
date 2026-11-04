"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  DollarSign,
  Plus,
  Trash2,
} from "lucide-react";
import type { DashboardTask } from "./types";

interface TasksSectionProps {
  tasks: DashboardTask[];
  loading: boolean;
  onToggleComplete: (taskId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onOpenAddTask: () => void;
}

export function TasksSection({
  tasks,
  loading,
  onToggleComplete,
  onDeleteTask,
  onOpenAddTask,
}: TasksSectionProps) {
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("PENDING");

  const filteredTasks = tasks.filter((t) => {
    if (priorityFilter !== "all" && t.priority !== priorityFilter) {
      return false;
    }
    if (statusFilter === "PENDING" && t.completed) return false;
    if (statusFilter === "COMPLETED" && !t.completed) return false;
    return true;
  });

  const pendingCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  const getPriorityBadge = (p: DashboardTask["priority"]) => {
    switch (p) {
      case "Alta":
        return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300";
      case "Média":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
      case "Baixa":
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs transition-colors dark:border-[#2e3f37] dark:bg-[#17211d]">
      {/* Header & New Task Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-[#2e3f37]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[#00875f] dark:bg-[#17382d] dark:text-[#67d9ae]">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
              Tarefas do Dia
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#95a89f]">
              {pendingCount} pendente{pendingCount !== 1 ? "s" : ""} • {completedCount} concluída{completedCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAddTask}
          className="flex items-center gap-1.5 rounded-xl bg-[#00875f] px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
        >
          <Plus size={14} />
          <span>Nova Tarefa</span>
        </button>
      </div>

      {/* Filters */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-[#2e3f37]">
        {/* Status Filter */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter("PENDING")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              statusFilter === "PENDING"
                ? "bg-slate-900 text-white dark:bg-[#e6ede9] dark:text-[#121815]"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730]"
            }`}
          >
            Pendentes ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("COMPLETED")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              statusFilter === "COMPLETED"
                ? "bg-slate-900 text-white dark:bg-[#e6ede9] dark:text-[#121815]"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730]"
            }`}
          >
            Concluídas ({completedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              statusFilter === "ALL"
                ? "bg-slate-900 text-white dark:bg-[#e6ede9] dark:text-[#121815]"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1e2b26] dark:text-[#95a89f] dark:hover:bg-[#263730]"
            }`}
          >
            Todas ({tasks.length})
          </button>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPriorityFilter("all")}
            className={`rounded-lg px-2 py-0.8 text-[11px] font-semibold transition ${
              priorityFilter === "all"
                ? "bg-[#00875f] text-white dark:bg-[#00b37e] dark:text-[#00291d]"
                : "text-slate-500 hover:text-slate-900 dark:text-[#95a89f] dark:hover:text-[#e6ede9]"
            }`}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setPriorityFilter("Alta")}
            className={`rounded-lg px-2 py-0.8 text-[11px] font-semibold transition ${
              priorityFilter === "Alta"
                ? "bg-rose-600 text-white"
                : "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            }`}
          >
            Alta
          </button>
          <button
            type="button"
            onClick={() => setPriorityFilter("Média")}
            className={`rounded-lg px-2 py-0.8 text-[11px] font-semibold transition ${
              priorityFilter === "Média"
                ? "bg-amber-600 text-white"
                : "text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            }`}
          >
            Média
          </button>
          <button
            type="button"
            onClick={() => setPriorityFilter("Baixa")}
            className={`rounded-lg px-2 py-0.8 text-[11px] font-semibold transition ${
              priorityFilter === "Baixa"
                ? "bg-blue-600 text-white"
                : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
            }`}
          >
            Baixa
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="mt-3.5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#00875f] dark:border-[#2e3f37] dark:border-t-[#00b37e]" />
            <p className="mt-2 text-xs">Carregando tarefas...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 dark:text-[#95a89f]">
            <CheckCircle2 size={32} className="opacity-40" />
            <p className="mt-2 text-xs font-medium">Nenhuma tarefa encontrada neste filtro.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`group flex items-start justify-between gap-3 rounded-2xl border p-3 transition ${
                  task.completed
                    ? "border-slate-100 bg-slate-50/40 opacity-70 dark:border-[#22312b] dark:bg-[#17211d]/40"
                    : "border-slate-200 bg-slate-50/60 hover:bg-slate-50 hover:shadow-xs dark:border-[#2e3f37] dark:bg-[#1e2b26]/50 dark:hover:bg-[#1e2b26]"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => onToggleComplete(task.id)}
                    aria-label={task.completed ? "Marcar tarefa como pendente" : "Marcar tarefa como concluída"}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition ${
                      task.completed
                        ? "border-[#00875f] bg-[#00875f] text-white dark:border-[#00b37e] dark:bg-[#00b37e] dark:text-[#00291d]"
                        : "border-slate-300 bg-white hover:border-slate-400 dark:border-[#2e3f37] dark:bg-[#17211d]"
                    }`}
                  >
                    {task.completed && <Check size={12} strokeWidth={3} />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold transition ${
                        task.completed
                          ? "line-through text-slate-400 dark:text-[#95a89f]"
                          : "text-slate-900 dark:text-[#e6ede9]"
                      }`}
                    >
                      {task.title}
                    </p>

                    {task.description && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-[#95a89f] line-clamp-1">
                        {task.description}
                      </p>
                    )}

                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-0.2 text-[10px] font-semibold ${getPriorityBadge(task.priority)}`}>
                        {task.priority}
                      </span>

                      {task.due && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-[#95a89f]">
                          <Clock3 size={11} />
                          <span>{task.due}</span>
                        </span>
                      )}

                      {task.bill && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.2 text-[10px] font-medium text-emerald-800 dark:bg-[#17382d] dark:text-[#67d9ae]">
                          <DollarSign size={10} />
                          <span>Fatura vinculada</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  aria-label="Excluir tarefa"
                  className="rounded-lg p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 transition dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
