import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Dashboard from "@/components/dashboard/dashboard";
import { AuthContainer } from "@/components/auth/auth-container";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();

  // Se já autenticado com sessão válida, exibe o Dashboard
  if (session?.user?.email) {
    return <Dashboard sessionUser={session.user} />;
  }

  // Se não autenticado, identifica no servidor se requer configuração inicial do dono
  let setupRequired = true;
  let suggestedEmail = "fteraoka72@gmail.com";
  let suggestedName = "Fábio Teraoka";

  try {
    const existingWithPassword = await prisma.user.findFirst({
      where: {
        passwordHash: { not: null },
      },
      select: { id: true, email: true },
    });
    setupRequired = !existingWithPassword;

    const ownerCandidate = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { email: true, name: true },
    });

    if (ownerCandidate?.email) suggestedEmail = ownerCandidate.email;
    if (ownerCandidate?.name) suggestedName = ownerCandidate.name;
  } catch (err) {
    console.warn("[Home] Falha ao consultar status de setup no banco:", err);
  }

  // Renderiza diretamente a interface de autenticação (sem redirects 307 que congelam em iframes)
  return (
    <AuthContainer
      initialSetupRequired={setupRequired}
      suggestedEmail={suggestedEmail}
      suggestedName={suggestedName}
    />
  );
}
