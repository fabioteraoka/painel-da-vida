import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Dashboard from "@/components/dashboard/dashboard";
import { isDemoMode } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user?.email && params?.demo !== "true" && !isDemoMode) {
    redirect("/login");
  }

  return <Dashboard />;
}
