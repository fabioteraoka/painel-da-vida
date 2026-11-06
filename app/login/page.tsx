import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AuthContainer } from "@/components/auth/auth-container";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();

  // Se já autenticado, vai para o painel principal
  if (session?.user?.email) {
    redirect("/");
  }

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
    console.warn("[Login] Falha ao consultar status de setup no banco:", err);
  }

  return (
    <AuthContainer
      initialSetupRequired={setupRequired}
      suggestedEmail={suggestedEmail}
      suggestedName={suggestedName}
    />
  );
}
