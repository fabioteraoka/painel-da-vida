import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  return <Dashboard sessionUser={session.user} />;
}
