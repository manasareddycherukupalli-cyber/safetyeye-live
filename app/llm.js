// Low-level connection to the on-device model server (llama-server), served
// from the same origin as this app — no CORS, no network hop.
//   compileRules / narrateWarning / writeReport / askLog build on top of
//   chatCompletion() below (Manasa).

const MODEL_ENDPOINT = '/v1/chat/completions';

async function chatCompletion(messages, options = {}) {
  const response = await fetch(MODEL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: options.temperature ?? 0.1,
      response_format: options.responseFormat,
      max_tokens: options.maxTokens ?? 256,
    }),
  });

  if (!response.ok) {
    throw new Error(`model server responded ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

window.SafetyEyeLLM = { chatCompletion };
