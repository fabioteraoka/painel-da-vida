import { signIn } from "@/auth";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
          <span className="text-lg font-bold">FT</span>
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Painel da Vida
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Entre com sua conta Google para acessar seu painel pessoal.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <Link
            href="/"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700"
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
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Conectar com Google OAuth
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400">
          O acesso será vinculado à sua conta Google. Nenhuma senha do Google é
          armazenada pelo Painel da Vida.
        </p>
      </div>
    </main>
  );
}
