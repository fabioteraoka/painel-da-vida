import { gateway } from "ai";

const modelId = process.env.AI_MODEL || "openai/gpt-4o-mini";
export const aiModel = gateway(modelId);
// Vercel injects VERCEL_OIDC_TOKEN for AI Gateway authentication at runtime.
// Local development can use an explicit AI_GATEWAY_API_KEY instead.
export const isAiGatewayAvailable = () => Boolean(
  process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN,
);
