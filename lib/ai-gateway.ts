import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const gatewayToken =
  process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;

if (!gatewayToken) {
  throw new Error(
    "Vercel AI Gateway não autenticado: nem AI_GATEWAY_API_KEY nem VERCEL_OIDC_TOKEN estão disponíveis."
  );
}

export const aiGateway = createOpenAICompatible({
  name: "vercel-ai-gateway",
  baseURL: "https://ai-gateway.vercel.sh/v1",
  apiKey: gatewayToken,
});

export const aiModel = aiGateway.chatModel("openai/gpt-5.4");
