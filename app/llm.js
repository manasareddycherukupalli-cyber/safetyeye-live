// llm.js — every call to the on-device model goes through here.
//
// The model is served by llama-server from the same origin as this page, so these
// are plain same-origin fetches: no CORS, no keys, no network.
//
// Timing rule that shapes this whole file: generation runs at ~15 tok/s on the 3B.
// That is fine for understanding and far too slow for reacting. Nothing here is
// ever called from the detection loop. Warning sentences are written once, at rule
// compile time, and stored on the rule as `say`.

const LLM = (() => {
  const ENDPOINT = '/v1/chat/completions';

  const RULE_SCHEMA = {
    type: 'object',
    properties: {
      rules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['zone_intrusion', 'occupancy', 'obstruction', 'proximity'] },
            zone: { type: 'string' },
            limit: { type: 'integer', minimum: 0, maximum: 99 },
            severity: { type: 'string', enum: ['warn', 'critical'] },
            say:  { type: 'string', maxLength: 60 }
          },
          required: ['type', 'zone', 'limit', 'severity', 'say'],
          additionalProperties: false
        }
      }
    },
    required: ['rules'],
    additionalProperties: false
  };

  async function chat(messages, opts = {}) {
    const body = {
      messages,
      temperature: opts.temperature ?? 0.1,
      n_predict: opts.maxTokens ?? 256,
      stream: false
    };
    if (opts.schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'response', strict: true, schema: opts.schema }
      };
    }

    const started = performance.now();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal
    });
    if (!res.ok) throw new Error(`model returned ${res.status}: ${await res.text()}`);

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('model returned no content');

    return { text, ms: Math.round(performance.now() - started), usage: json.usage };
  }

  // Plain speech in, enforced rules out. Constrained decoding means malformed
  // output is unrepresentable rather than merely unlikely — the sampler is only
  // ever offered tokens the schema permits.
  async function compileRules(spoken, zones = [], opts = {}) {
    const known = zones.length ? zones.join(', ') : 'none drawn yet';
    const { text, ms, usage } = await chat([
      {
        role: 'system',
        content:
          'You turn a site supervisor\'s spoken instruction into safety rules.\n' +
          `Zones already drawn on camera: ${known}.\n` +
          'Use one of those zone names when the instruction refers to a place. ' +
          'Invent a short lowercase name only if none fits.\n' +
          'type: zone_intrusion (anyone entering), occupancy (too many people), ' +
          'obstruction (something blocking a zone), proximity (person near person or object).\n' +
          'limit is the count that trips the rule; use 1 unless a number is stated.\n' +
          'severity is critical when injury is plausible, otherwise warn.\n' +
          'say is the sentence spoken aloud to the worker BEFORE they cross: ' +
          'under eight words, an instruction not a description, e.g. "Step back from the press".'
      },
      { role: 'user', content: spoken }
    ], { schema: RULE_SCHEMA, maxTokens: 320, ...opts });

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`model emitted non-JSON despite schema: ${text.slice(0, 200)}`);
    }
    return { rules: parsed.rules ?? [], ms, usage };
  }

  // Shift report. ~300 tokens at 15 tok/s is roughly 20 seconds — always show
  // progress, never let this be dead air in the demo.
  async function writeReport(stats, opts = {}) {
    const { text, ms } = await chat([
      {
        role: 'system',
        content:
          'You write the end-of-shift safety report for a site supervisor. ' +
          'Four short paragraphs, plain English, no headings, no bullet points. ' +
          'Lead with how many incidents were PREVENTED — a warning that worked. ' +
          'A breach means the warning was ignored. Name the worst zone. ' +
          'End with one concrete suggestion. Never invent numbers not given to you.'
      },
      { role: 'user', content: JSON.stringify(stats) }
    ], { temperature: 0.3, maxTokens: 400, ...opts });
    return { text: text.trim(), ms };
  }

  // Ask-the-log. Events are passed in full; the model may only answer from them.
  async function askLog(question, events, opts = {}) {
    const { text, ms } = await chat([
      {
        role: 'system',
        content:
          'Answer only from the event log given below. If the log does not contain ' +
          'the answer, say so plainly. Two sentences at most. Quote timestamps when useful.\n\n' +
          JSON.stringify(events)
      },
      { role: 'user', content: question }
    ], { temperature: 0.2, maxTokens: 160, ...opts });
    return { text: text.trim(), ms };
  }

  // Is the model up? Used on boot so the UI can say so instead of hanging.
  async function health() {
    try {
      const res = await fetch('/health', { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { chat, compileRules, writeReport, askLog, health, RULE_SCHEMA };
})();

if (typeof window !== 'undefined') window.LLM = LLM;
