import { gateway } from "ai";

const modelId = process.env.AI_MODEL || "openai/gpt-4o-mini";
export const aiModel = gateway(modelId);
