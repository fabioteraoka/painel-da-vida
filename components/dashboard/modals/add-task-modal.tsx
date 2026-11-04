"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTask: (data: {
    title: string;
    description?: string;
    priority: "Alta" | "Média" | "Baixa";
    due: string;
  }) => Promise<void>;
}

export function AddTaskModal({ isOpen, onClose, onAddTask }: AddTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"Alta" | "Média" | "Baixa">("Alta");
  const [due, setDue] = useState("Hoje");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      await onAddTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        due,
      });
      setTitle("");
      setDescription("");
      setPriority("Alta");
      setDue("Hoje");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-task-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#2e3f37]">
          <h3 id="add-task-title" className="text-base font-bold text-slate-900 dark:text-[#e6ede9]">
            Nova Tarefa
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-[#1e2b26]"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="task-title" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
              Título da Tarefa *
            </label>
            <input
              id="task-title"
              type="text"
              required
              placeholder="Ex: Pagar conta de energia, Enviar contrato..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
            />
          </div>

          <div>
            <label htmlFor="task-description" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
              Descrição (opcional)
            </label>
            <textarea
              id="task-description"
              rows={2}
              placeholder="Detalhes ou anotações complementares..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-[#00875f] dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-priority" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Prioridade
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as "Alta" | "Média" | "Baixa")}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              >
                <option value="Alta">Alta</option>
                <option value="Média">Média</option>
                <option value="Baixa">Baixa</option>
              </select>
            </div>

            <div>
              <label htmlFor="task-due" className="block text-xs font-semibold text-slate-700 dark:text-[#95a89f]">
                Vencimento
              </label>
              <select
                id="task-due"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9]"
              >
                <option value="Hoje">Hoje</option>
                <option value="Amanhã">Amanhã</option>
                <option value="Sexta">Sexta-feira</option>
                <option value="Próxima semana">Próxima semana</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#2e3f37]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-[#2e3f37] dark:text-[#95a89f] dark:hover:bg-[#1e2b26]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-[#00875f] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#015f43] disabled:opacity-50 dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
            >
              <Plus size={14} />
              <span>{loading ? "Salvando..." : "Criar Tarefa"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
