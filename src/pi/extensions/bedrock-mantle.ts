export const BEDROCK_MANTLE_PROVIDER = "amazon-bedrock-mantle";

const MODELS = [
  {
    id: "openai.gpt-5.4",
    name: "GPT-5.4 (Bedrock Mantle)",
    reasoning: true,
    thinkingLevelMap: { off: null, xhigh: "xhigh" },
    input: ["text", "image"] as ("text" | "image")[],
    cost: { input: 2.75, output: 16.5, cacheRead: 0.275, cacheWrite: 0 },
    contextWindow: 272_000,
    maxTokens: 128_000,
  },
  {
    id: "openai.gpt-5.5",
    name: "GPT-5.5 (Bedrock Mantle)",
    reasoning: true,
    thinkingLevelMap: { off: "none", minimal: null, xhigh: "xhigh" },
    input: ["text", "image"] as ("text" | "image")[],
    cost: { input: 5.5, output: 33, cacheRead: 0.55, cacheWrite: 0 },
    contextWindow: 272_000,
    maxTokens: 128_000,
  },
];

export function bedrockMantleProviderConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    name: "Amazon Bedrock (Mantle)",
    baseUrl: bedrockMantleBaseUrl(env),
    apiKey: "$AWS_BEARER_TOKEN_BEDROCK",
    api: "openai-responses",
    authHeader: true,
    models: MODELS,
  };
}

export function bedrockMantleBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const candidate = env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim();
  const region = candidate && /^[a-z0-9-]+$/.test(candidate) ? candidate : "us-east-1";
  return `https://bedrock-mantle.${region}.api.aws/v1`;
}
