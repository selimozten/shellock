import assert from "node:assert/strict";
import test from "node:test";
import bedrockMantleExtension, {
  BEDROCK_MANTLE_PROVIDER,
  bedrockMantleBaseUrl,
} from "../dist/pi/extensions/bedrock-mantle.js";

test("Bedrock Mantle provider uses AWS's OpenAI-compatible endpoint", () => {
  const registrations = [];
  bedrockMantleExtension({
    registerProvider(name, config) {
      registrations.push({ name, config });
    },
  });

  assert.equal(registrations.length, 1);
  const [{ name, config }] = registrations;
  assert.equal(name, BEDROCK_MANTLE_PROVIDER);
  assert.equal(config.name, "Amazon Bedrock (Mantle)");
  assert.equal(config.api, "openai-responses");
  assert.equal(config.apiKey, "$AWS_BEARER_TOKEN_BEDROCK");
  assert.equal(config.authHeader, true);
  assert.equal(config.baseUrl, bedrockMantleBaseUrl());
  assert.deepEqual(config.models.map((model) => model.id), ["openai.gpt-5.4", "openai.gpt-5.5"]);
  assert.ok(config.models.every((model) => model.reasoning && model.input.includes("image")));
});

test("Bedrock Mantle endpoint follows the configured AWS region", () => {
  assert.equal(
    bedrockMantleBaseUrl({ AWS_REGION: "eu-west-1" }),
    "https://bedrock-mantle.eu-west-1.api.aws/v1",
  );
  assert.equal(
    bedrockMantleBaseUrl({ AWS_DEFAULT_REGION: "us-west-2" }),
    "https://bedrock-mantle.us-west-2.api.aws/v1",
  );
  assert.equal(
    bedrockMantleBaseUrl({ AWS_REGION: "invalid.region" }),
    "https://bedrock-mantle.us-east-1.api.aws/v1",
  );
});
