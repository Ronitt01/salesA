import "server-only";
import { AiError } from "../errors";
import type { LlmProvider, LlmRequest, LlmResponse } from "../types";

export const MOCK_MODEL = "hunter-mock-1";

/**
 * Deterministic mock provider for development and tests.
 *
 * It returns the prompt's predefined fixture for the given input, serialised as JSON,
 * so mock output goes through exactly the same parsing, schema validation and guards
 * as real output. It never reads the web or searches anything, reports no token usage,
 * and every execution it serves is recorded as synthetic.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock" as const;
  readonly model = MOCK_MODEL;
  readonly synthetic = true;

  async generate(request: LlmRequest): Promise<LlmResponse> {
    if (!request.fixture) {
      throw new AiError("configuration", `The mock provider has no fixture for prompt ${request.promptId}.`);
    }
    return {
      text: JSON.stringify(request.fixture()),
      model: MOCK_MODEL,
      stopReason: "end_turn",
      usage: null,
      providerRequestId: null,
    };
  }
}
