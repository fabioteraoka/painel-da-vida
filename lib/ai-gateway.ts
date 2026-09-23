import { gateway } from "ai";

const modelId = process.env.AI_MODEL || "openai/gpt-4o-mini";
export const aiModel = gateway(modelId);
// Other AI flows use this check to decide whether to run their configured fallback.
// Price monitoring calls the Gateway directly so Vercel OIDC can authenticate it.
export const isAiGatewayAvailable = () => Boolean(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
);
