import { Suspense } from "react";
import { Target } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00875f] text-white shadow-xs dark:bg-[#00b37e] dark:text-[#00291d]">
          <Target size={24} />
        </div>

        <div className="mt-5 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
            Painel da Vida
          </h1>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-[#95a89f]">
            Acesso seguro próprio com e-mail e senha protegidos por Argon2id.
          </p>
        </div>

        <div className="mt-6">
          <Suspense
            fallback={
              <div className="py-8 text-center text-xs text-slate-400">
                Carregando login seguro...
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400 dark:text-[#95a89f]/80">
          Suas tarefas, contas manuais e monitor de preços funcionam independentemente do Google.
        </p>
      </div>
    </main>
  );
}
