import { startGoogleIntegration } from "@/lib/google-integration-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return startGoogleIntegration(request, "gmail");
}
