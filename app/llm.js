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

// RULE_SCHEMA / compileRules: a first-pass implementation of the "rules from
// speech" piece so Task 7 can be tested end to end. This is Manasa's
// function per the file split (llm.js) — treat this as a placeholder for
// her to refine (prompt wording, model choice, error handling), not final.
const RULE_SCHEMA = {
  name: 'safety_rules',
  schema: {
    type: 'object',
    properties: {
      rules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['zone_intrusion', 'occupancy', 'obstruction', 'proximity'] },
            zone: { type: 'string' },
            limit: { type: 'integer' },
            severity: { type: 'string', enum: ['warn', 'critical'] },
            say: { type: 'string' },
          },
          required: ['type', 'zone', 'limit', 'severity', 'say'],
        },
      },
    },
    required: ['rules'],
  },
};

async function compileRules(spokenText) {
  const content = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'Convert the spoken safety instruction into one or more JSON rules. ' +
          'zone is a short lowercase name for the area mentioned (e.g. "press", "exit", "scaffold"). ' +
          'limit is a person count for occupancy/proximity rules, or 1 by default. ' +
          'say is a short spoken warning sentence to say to the person approaching.',
      },
      { role: 'user', content: spokenText },
    ],
    { temperature: 0.1, responseFormat: { type: 'json_schema', json_schema: RULE_SCHEMA } }
  );
  return JSON.parse(content).rules;
}

window.SafetyEyeLLM = { chatCompletion, compileRules, RULE_SCHEMA };
