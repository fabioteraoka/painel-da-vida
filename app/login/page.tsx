import { signIn } from "@/auth";
import Link from "next/link";
import { Target } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6 transition-colors">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-[#2e3f37] dark:bg-[#17211d] dark:text-[#e6ede9]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00875f] text-white shadow-xs dark:bg-[#00b37e] dark:text-[#00291d]">
          <Target size={24} />
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-[#e6ede9]">
            Painel da Vida
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-[#95a89f]">
            Entre com sua conta Google para acessar seu painel pessoal.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <Link
            href="/?demo=true"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00875f] px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[#015f43] dark:bg-[#00b37e] dark:hover:bg-[#00c98e] dark:text-[#00291d]"
          >
            Entrar como Fábio Teraoka (Acesso Rápido)
          </Link>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-[#2e3f37] dark:bg-[#1e2b26] dark:text-[#e6ede9] dark:hover:bg-[#263730]"
            >
              Conectar com Google OAuth
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400 dark:text-[#95a89f]/80">
          O acesso será vinculado à sua conta Google. Nenhuma senha do Google é
          armazenada pelo Painel da Vida.
        </p>
      </div>
    </main>
  );
}
