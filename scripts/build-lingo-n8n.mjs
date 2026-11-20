// Builds the Feeder → Lingo n8n workflows from n8n/lingo/src/*.js (one file per Code node):
//   n8n/feeder-lingo.json            WhatsApp webhook → understand → reply → save (+ the panel's Test bot,
//                                    Test connection and Inbox replies)
//   n8n/feeder-lingo-followups.json  follow-ups every 15 minutes + number health every 6 hours
// Checks the node graph, expressions, $('Node') references and that every Code node parses.
//
//   node scripts/build-lingo-n8n.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ROOT = new URL("../", import.meta.url);
const src = (f) => readFileSync(new URL(`n8n/lingo/src/${f}`, ROOT), "utf8");
const id = () => randomUUID();

const CFG = "$('Config').first().json";
const MSG = "$('Message').first().json";
const CREDS = {
  supabase: { httpHeaderAuth: { id: "SET_ME_supabase", name: "Supabase service key (Lingo)" } },
  gemini: { httpHeaderAuth: { id: "SET_ME_gemini", name: "Gemini API key" } },
  panel: { httpHeaderAuth: { id: "SET_ME_panel", name: "Retexia key (Lingo)" } },
};
const NEVER_ERROR = { response: { response: { neverError: true } }, timeout: 60000 };

const note = (n, text) => (text ? Object.assign(n, { notes: text, notesInFlow: true }) : n);
const code = (name, file, pos, text) =>
  note({ parameters: { jsCode: src(file) }, id: id(), name, type: "n8n-nodes-base.code", typeVersion: 2, position: pos }, text);

function http(name, pos, { method = "POST", url, body, cred, headers, query, options = NEVER_ERROR, retry = false, cont = true, batch, file, text }) {
  const p = { method, url, options: { ...options } };
  if (cred) Object.assign(p, { authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth" });
  if (headers) Object.assign(p, { sendHeaders: true, headerParameters: { parameters: headers.map(([n, v]) => ({ name: n, value: v })) } });
  if (query) Object.assign(p, { sendQuery: true, specifyQuery: "json", jsonQuery: query });
  if (body) Object.assign(p, { sendBody: true, specifyBody: "json", jsonBody: body });
  if (batch) p.options.batching = { batch: { batchSize: 1, batchInterval: batch } };
  if (file) p.options.response = { response: { responseFormat: "file", outputPropertyName: "data" } };
  const n = { parameters: p, id: id(), name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: pos };
  if (cred) n.credentials = CREDS[cred];
  if (retry) Object.assign(n, { retryOnFail: true, maxTries: 3, waitBetweenTries: 1500 });
  if (cont) n.onError = "continueRegularOutput";
  return note(n, text);
}
const rpc = (name, fn, body, pos, text) =>
  http(name, pos, {
    url: `={{ ${CFG}.SUPABASE_URL }}/rest/v1/rpc/${fn}`,
    body,
    cred: "supabase",
    headers: [["Content-Profile", "lingo"]],
    options: { timeout: 30000 },
    retry: true,
    cont: false,
    text,
  });
const gemini = (name, pos, ref, text) =>
  http(name, pos, {
    url: `=https://generativelanguage.googleapis.com/v1beta/models/{{ ${ref}.model }}:generateContent`,
    body: `={{ JSON.stringify(${ref}.req) }}`,
    cred: "gemini",
    retry: true,
    text,
  });
const graph = (path) => `=https://graph.facebook.com/{{ ${CFG}.GRAPH_VERSION }}/${path}`;
const bearer = (expr) => [["Authorization", `=Bearer {{ ${expr} }}`]];

function iff(name, expr, pos) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
        conditions: [{ id: id(), leftValue: expr, rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } }],
        combinator: "and",
      },
      options: {},
    },
    id: id(), name, type: "n8n-nodes-base.if", typeVersion: 2.2, position: pos,
  };
}
function config(pos, fields) {
  const assignments = fields.map(([k, v]) => ({ id: id(), name: k, value: v, type: typeof v === "number" ? "number" : "string" }));
  return note(
    { parameters: { mode: "manual", duplicateItem: false, assignments: { assignments }, includeOtherFields: true, options: {} },
      id: id(), name: "Config", type: "n8n-nodes-base.set", typeVersion: 3.4, position: pos },
    "Edit SUPABASE_URL once",
  );
}
const webhook = (name, pos, parameters, text) =>
  note({ parameters: { options: {}, ...parameters }, id: id(), name, type: "n8n-nodes-base.webhook", typeVersion: 2, position: pos, webhookId: id() }, text);
const respond = (name, pos, parameters) => ({ parameters: { options: {}, ...parameters }, id: id(), name, type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: pos });
const sticky = (content, pos, width, height, color = 7) => ({
  parameters: { content, height, width, color }, id: id(), name: `Note ${id().slice(0, 6)}`, type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: pos,
});
function connect(pairs) {
  const out = {};
  for (const [from, to, index = 0] of pairs) {
    const main = (out[from] ??= { main: [] }).main;
    while (main.length <= index) main.push([]);
    main[index].push({ node: to, type: "main", index: 0 });
  }
  return out;
}

const X = (i) => 240 * i;
const A = 0, B = 520, C = 1040, D = 1560;

// =====================================================================
// MAIN WORKFLOW
// =====================================================================
const mainNodes = [
  webhook("WhatsApp Webhook", [X(0), A], { httpMethod: "POST", path: "feeder-lingo", options: { rawBody: true } }, "Meta → here (answers 200 at once)"),
  code("Read Webhook", "read_webhook.js", [X(1), A]),
  webhook("Meta Verify (GET)", [X(0), A - 260], { path: "feeder-lingo", responseMode: "responseNode" }, "Meta's webhook check"),
  webhook("Panel: Lingo", [X(0), A + 260], { httpMethod: "POST", path: "feeder-lingo-panel", authentication: "headerAuth", responseMode: "responseNode" },
    "Credential: Header Auth “Retexia key (Lingo)” (X-Retexia-Key)"),
  config([X(2), A], [
    ["SUPABASE_URL", "EDIT: https://YOUR-PROJECT.supabase.co"],
    ["GRAPH_VERSION", "v25.0"],
    ["MODEL_FAST", "gemini-3.5-flash-lite"],
    ["MODEL_REPLY", "gemini-3.5-flash-lite"],
    ["REPLY_THINKING", ""],
    ["TAP_WAIT_SECONDS", 2],
    ["HISTORY_LIMIT", 5],
    ["KEEP_LAST", 2],
    ["RETEXIA_APP_SECRET", "EDIT: only for Embedded Signup (later)"],
  ]),
  iff("From WhatsApp?", "={{ $('Read Webhook').isExecuted }}", [X(3), A]),
  iff("Meta Check?", "={{ $('Meta Verify (GET)').isExecuted }}", [X(4), A - 260]),
  rpc("Check Verify Token", "bot_verify_token", "={{ JSON.stringify({ p: { token: String(($('Meta Verify (GET)').first().json.query || {})['hub.verify_token'] || '') } }) }}", [X(5), A - 380]),
  respond("Answer Meta Check", [X(6), A - 380], {
    respondWith: "text",
    responseBody: "={{ $json.ok ? String(($('Meta Verify (GET)').first().json.query || {})['hub.challenge'] || '') : 'wrong verify token' }}",
  }),

  // ---- panel: Test bot / Test connection / Inbox reply ----
  code("Panel Action", "panel_action.js", [X(5), A - 140]),
  rpc("Seller", "bot_number", "={{ JSON.stringify({ p: { lingo_user_id: $json.lingo_user_id } }) }}", [X(6), A - 140], "Seller + token (Vault)"),
  iff("Test Bot?", "={{ $('Panel Action').first().json.action === 'test_bot' && $json.ok === true }}", [X(7), A - 140]),
  iff("Check?", "={{ $('Panel Action').first().json.action === 'check' && $json.ok === true && !!$json.token && !!$json.phone_number_id }}", [X(8), A - 260]),
  http("WA: Number Info", [X(9), A - 380], {
    method: "GET",
    url: graph("{{ $('Seller').first().json.phone_number_id }}"),
    headers: bearer("$('Seller').first().json.token"),
    query: "={{ JSON.stringify({ fields: 'display_phone_number,verified_name,quality_rating,code_verification_status,name_status,platform_type' }) }}",
  }),
  iff("Has WABA?", "={{ !!$('Seller').first().json.waba_id }}", [X(10), A - 380]),
  http("WA: Subscribed Apps", [X(11), A - 460], {
    method: "GET",
    url: graph("{{ $('Seller').first().json.waba_id }}/subscribed_apps"),
    headers: bearer("$('Seller').first().json.token"),
  }),
  iff("Inbox Send?", "={{ $('Panel Action').first().json.action === 'send' && $('Seller').first().json.ok === true && !!$('Seller').first().json.token }}", [X(9), A - 220]),
  http("WA: Send Reply", [X(10), A - 220], {
    url: graph("{{ $('Seller').first().json.phone_number_id }}/messages"),
    headers: bearer("$('Seller').first().json.token"),
    body: "={{ JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: $('Panel Action').first().json.to, type: 'text', text: { body: $('Panel Action').first().json.text, preview_url: false } }) }}",
  }),
  code("Panel Reply", "panel_reply.js", [X(12), A - 300]),
  respond("Respond: Panel", [X(13), A - 300], { respondWith: "json", responseBody: "={{ JSON.stringify($json.reply) }}" }),

  // ---- WhatsApp: number → signature → statuses / echoes / message ----
  rpc("Number", "bot_number", "={{ JSON.stringify({ p: { phone_number_id: $('Read Webhook').first().json.phone_number_id } }) }}", [X(4), A + 140], "Seller + token + app secret (Vault)"),
  iff("Known Number?", "={{ $json.ok === true }}", [X(5), A + 140]),
  code("Verify & Split", "verify_split.js", [X(6), A + 140], "Signature check (needs crypto)"),
  iff("Statuses?", "={{ ($json.statuses || []).length > 0 }}", [X(7), A + 20]),
  rpc("Save Statuses", "bot_statuses", "={{ JSON.stringify({ p: { lingo_user_id: $('Number').first().json.lingo_user_id, statuses: $('Verify & Split').first().json.statuses } }) }}", [X(8), A + 20]),
  iff("Echoes?", "={{ ($json.echoes || []).length > 0 }}", [X(7), A + 160]),
  rpc("Save Echoes", "bot_echo", "={{ JSON.stringify({ p: { lingo_user_id: $('Number').first().json.lingo_user_id, items: $('Verify & Split').first().json.echoes } }) }}", [X(8), A + 160], "Seller replied in the app → bot pauses"),
  iff("Has Message?", "={{ !!$json.message }}", [X(7), A + 300]),

  // ---- one turn ----
  code("Message", "message.js", [X(9), A + 300]),
  rpc("Gate", "bot_gate",
    `={{ JSON.stringify({ p: { lingo_user_id: ${MSG}.lingo_user_id, phone: ${MSG}.phone, wa_id: ${MSG}.waId, name: ${MSG}.name, referral: ${MSG}.referral, test: ${MSG}.test, start_product: ${MSG}.start_product, text: ${MSG}.media ? ('[' + (${MSG}.media.kind === 'audio' ? 'voice note' : 'image') + '] ' + (${MSG}.text || '')) : ${MSG}.text } }) }}`,
    [X(10), A + 300], "Duplicates · not from an ad · paused · ad → product"),
  iff("Gate OK?", "={{ $json.status === 'ok' }}", [X(11), A + 300]),
  iff("New Ad?", "={{ $json.need_ad_match === true }}", [X(12), A + 300]),
  code("Build Ad Match", "build_ad_match.js", [X(13), A + 180]),
  gemini("Gemini: Ad Match", [X(14), A + 180], "$json", "Once per new ad"),
  code("Read Ad Match", "read_ad_match.js", [X(15), A + 180]),
  rpc("Save Ad Product", "bot_set_ad", "={{ JSON.stringify({ p: $json.p }) }}", [X(16), A + 180]),
  iff("Is Media?", `={{ !!${MSG}.media }}`, [X(17), A + 300]),
  http("Get Media URL", [X(18), A + 420], { method: "GET", url: graph(`{{ ${MSG}.media.id }}`), headers: bearer(`${MSG}.token`) }),
  http("Download Media", [X(19), A + 420], { method: "GET", url: "={{ $json.url }}", headers: bearer(`${MSG}.token`), options: { timeout: 60000 }, file: true }),
  code("Build Media Request", "build_media_request.js", [X(20), A + 420]),
  gemini("Gemini: Media", [X(21), A + 420], "$json", "Voice / photo → ≤40 words, once"),
  code("Media to Text", "media_to_text.js", [X(22), A + 420]),

  code("Build Buffer Row", "build_buffer_row.js", [X(0), B]),
  rpc("Buffer Add", "bot_buffer_add", "={{ JSON.stringify({ p: $json.p }) }}", [X(1), B]),
  iff("Wait?", `={{ !${MSG}.test }}`, [X(2), B]),
  note({
    parameters: { resume: "timeInterval", amount: `={{ ${MSG}.tap ? Number(${CFG}.TAP_WAIT_SECONDS) : Number((${MSG}.settings || {}).batch_seconds || 12) }}`, unit: "seconds" },
    id: id(), name: "Wait", type: "n8n-nodes-base.wait", typeVersion: 1.1, position: [X(3), B - 100], webhookId: id(),
  }, "12 s (2 s for taps): one turn for close messages"),
  rpc("Claim Batch", "bot_claim", `={{ JSON.stringify({ p: { lingo_user_id: ${MSG}.lingo_user_id, phone: ${MSG}.phone, buffer_id: $('Buffer Add').first().json.id } }) }}`, [X(4), B], "Batch + this product only"),
  iff("Latest Message?", "={{ $json.ok === true }}", [X(5), B]),
  iff("Real Chat?", `={{ !${MSG}.test }}`, [X(6), B]),
  http("Mark Read + Typing", [X(7), B - 100], {
    url: graph(`{{ ${MSG}.phone_number_id }}/messages`),
    headers: bearer(`${MSG}.token`),
    body: "={{ JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: $('Claim Batch').first().json.msgs[$('Claim Batch').first().json.msgs.length - 1].wa_id, typing_indicator: { type: 'text' } }) }}",
    text: "Blue ticks + typing…",
  }),
  iff("Summarize?", `={{ ($('Claim Batch').first().json.history || []).length > Number(${CFG}.HISTORY_LIMIT) }}`, [X(8), B]),
  code("Build Summary Request", "build_summary_request.js", [X(9), B - 120]),
  gemini("Gemini: Summary", [X(10), B - 120], "$json"),
  rpc("Save Summary", "bot_compact",
    `={{ JSON.stringify({ p: { lingo_user_id: ${MSG}.lingo_user_id, phone: ${MSG}.phone, upto: $('Build Summary Request').first().json.upto, summary: (((($json.candidates || [])[0] || {}).content || {}).parts || []).filter(x => !x.thought).map(x => x.text || '').join(' ').trim() } }) }}`,
    [X(11), B - 120], "Old msgs → 1 summary"),
  code("Understand", "understand.js", [X(12), B], "Taps · quick rules · middle AI request"),
  iff("Needs Middle AI?", "={{ $json.skip !== true }}", [X(13), B]),
  gemini("Gemini: Classify", [X(14), B - 120], "$json", "Middle AI (mid-3)"),
  code("Plan Reply", "plan_reply.js", [X(15), B], "State machine → reply blocks"),
  iff("Needs AI Answer?", "={{ $json.route === 'ai' }}", [X(16), B]),
  rpc("Cache Get", "bot_cache_get", "={{ JSON.stringify({ p: $json.cache }) }}", [X(17), B - 120]),
  iff("Cache Hit?", "={{ $json.hit === true }}", [X(18), B - 120]),
  iff("Reply AI Allowed?", "={{ $('Plan Reply').first().json.degrade !== true }}", [X(19), B - 40]),
  gemini("Gemini: Reply", [X(20), B - 40], "$('Plan Reply').first().json", "Only real product questions"),
  code("Compose Reply", "compose_reply.js", [X(21), B - 120], "Output guard"),
  code("Split Outgoing", "split_outgoing.js", [X(0), C]),
  iff("Real Send?", `={{ !${MSG}.test }}`, [X(1), C]),
  http("Send WhatsApp", [X(2), C - 100], {
    url: "={{ $json.url }}", headers: bearer(`${MSG}.token`), body: "={{ JSON.stringify($json.body) }}", batch: 400, text: "One by one, in order",
  }),
  code("Build Save Turn", "build_save_turn.js", [X(3), C]),
  rpc("Save Turn", "bot_save_turn", "={{ JSON.stringify({ p: $json.p }) }}", [X(4), C], "Messages · order (prices in SQL) · usage"),
  iff("Test Done?", `={{ ${MSG}.test === true }}`, [X(5), C]),
  iff("Test Stopped?", `={{ ${MSG}.test === true }}`, [X(5), C + 160]),
  code("Test Result", "test_result.js", [X(6), C + 80]),
];

const mainNotes = [
  sticky("## Retexia — Feeder Lingo (WhatsApp bot)\n**Setup** (once):\n1. Credentials (Header Auth): **Supabase service key (Lingo)** → name `apikey`, value = Supabase service_role / secret key. **Gemini API key** → `x-goog-api-key`. **Retexia key (Lingo)** → `X-Retexia-Key`, value = `FEEDER_LINGO_N8N_KEY` on Vercel.\n2. **Config** → SUPABASE_URL.\n3. n8n server env: `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (signature check).\n4. Activate. Sellers paste the **Production URL** of *WhatsApp Webhook* (feeder.retexia.com shows it to them) in their Meta app.\nWhatsApp tokens are per seller, in Supabase Vault — never in n8n.",
    [X(0) - 40, A - 900], 760, 420, 6),
  sticky("## Cost ladder\n0 · code: taps, quick rules, fixed texts, missing fields, summary, confirm/cancel\n1 · middle AI (one small JSON)\n2 · FAQ / answer cache\n3 · reply AI (only that topic's product fields)\n4 · hand to the seller\nEvery Gemini call's usage is saved in lingo.ai_usage with its cost.",
    [X(8) - 40, B - 420], 560, 260, 4),
];

const mainConns = connect([
  ["WhatsApp Webhook", "Read Webhook"], ["Read Webhook", "Config"], ["Meta Verify (GET)", "Config"], ["Panel: Lingo", "Config"],
  ["Config", "From WhatsApp?"],
  ["From WhatsApp?", "Number", 0], ["From WhatsApp?", "Meta Check?", 1],
  ["Meta Check?", "Check Verify Token", 0], ["Meta Check?", "Panel Action", 1],
  ["Check Verify Token", "Answer Meta Check"],
  ["Panel Action", "Seller"], ["Seller", "Test Bot?"],
  ["Test Bot?", "Message", 0], ["Test Bot?", "Check?", 1],
  ["Check?", "WA: Number Info", 0], ["Check?", "Inbox Send?", 1],
  ["WA: Number Info", "Has WABA?"], ["Has WABA?", "WA: Subscribed Apps", 0], ["Has WABA?", "Panel Reply", 1], ["WA: Subscribed Apps", "Panel Reply"],
  ["Inbox Send?", "WA: Send Reply", 0], ["Inbox Send?", "Panel Reply", 1], ["WA: Send Reply", "Panel Reply"],
  ["Panel Reply", "Respond: Panel"],
  ["Number", "Known Number?"], ["Known Number?", "Verify & Split", 0],
  ["Verify & Split", "Statuses?"], ["Verify & Split", "Echoes?"], ["Verify & Split", "Has Message?"],
  ["Statuses?", "Save Statuses", 0], ["Echoes?", "Save Echoes", 0], ["Has Message?", "Message", 0],
  ["Message", "Gate"], ["Gate", "Gate OK?"],
  ["Gate OK?", "New Ad?", 0], ["Gate OK?", "Test Stopped?", 1],
  ["New Ad?", "Build Ad Match", 0], ["New Ad?", "Is Media?", 1],
  ["Build Ad Match", "Gemini: Ad Match"], ["Gemini: Ad Match", "Read Ad Match"], ["Read Ad Match", "Save Ad Product"], ["Save Ad Product", "Is Media?"],
  ["Is Media?", "Get Media URL", 0], ["Is Media?", "Build Buffer Row", 1],
  ["Get Media URL", "Download Media"], ["Download Media", "Build Media Request"], ["Build Media Request", "Gemini: Media"],
  ["Gemini: Media", "Media to Text"], ["Media to Text", "Build Buffer Row"],
  ["Build Buffer Row", "Buffer Add"], ["Buffer Add", "Wait?"], ["Wait?", "Wait", 0], ["Wait?", "Claim Batch", 1], ["Wait", "Claim Batch"],
  ["Claim Batch", "Latest Message?"], ["Latest Message?", "Real Chat?", 0], ["Latest Message?", "Test Stopped?", 1],
  ["Real Chat?", "Mark Read + Typing", 0], ["Real Chat?", "Summarize?", 1], ["Mark Read + Typing", "Summarize?"],
  ["Summarize?", "Build Summary Request", 0], ["Summarize?", "Understand", 1],
  ["Build Summary Request", "Gemini: Summary"], ["Gemini: Summary", "Save Summary"], ["Save Summary", "Understand"],
  ["Understand", "Needs Middle AI?"], ["Needs Middle AI?", "Gemini: Classify", 0], ["Needs Middle AI?", "Plan Reply", 1], ["Gemini: Classify", "Plan Reply"],
  ["Plan Reply", "Needs AI Answer?"], ["Needs AI Answer?", "Cache Get", 0], ["Needs AI Answer?", "Split Outgoing", 1],
  ["Cache Get", "Cache Hit?"], ["Cache Hit?", "Compose Reply", 0], ["Cache Hit?", "Reply AI Allowed?", 1],
  ["Reply AI Allowed?", "Gemini: Reply", 0], ["Reply AI Allowed?", "Compose Reply", 1], ["Gemini: Reply", "Compose Reply"],
  ["Compose Reply", "Split Outgoing"],
  ["Split Outgoing", "Real Send?"], ["Real Send?", "Send WhatsApp", 0], ["Real Send?", "Build Save Turn", 1], ["Send WhatsApp", "Build Save Turn"],
  ["Build Save Turn", "Save Turn"], ["Save Turn", "Test Done?"], ["Test Done?", "Test Result", 0],
  ["Test Stopped?", "Test Result", 0], ["Test Result", "Respond: Panel"],
]);

const SETTINGS = { executionOrder: "v1", saveDataSuccessExecution: "none", saveDataErrorExecution: "all", saveManualExecutions: true };
const main = { name: "Retexia — Feeder Lingo (WhatsApp bot)", nodes: [...mainNodes, ...mainNotes], connections: mainConns, pinData: {}, active: false, settings: SETTINGS, tags: [] };

// =====================================================================
// FOLLOW-UPS + NUMBER HEALTH
// =====================================================================
const fuNodes = [
  { parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 15 }] } }, id: id(), name: "Every 15 Minutes", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 200] },
  { parameters: { rule: { interval: [{ field: "hours", hoursInterval: 6 }] } }, id: id(), name: "Every 6 Hours", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 480] },
  config([240, 340], [["SUPABASE_URL", "EDIT: https://YOUR-PROJECT.supabase.co"], ["GRAPH_VERSION", "v25.0"]]),
  iff("Follow-ups?", "={{ $('Every 15 Minutes').isExecuted }}", [480, 340]),
  rpc("Due Follow-ups", "bot_due_followups", "={{ JSON.stringify({ p: { limit: 100 } }) }}", [720, 200], "Quiet N h · inside 24 h · sending hours"),
  code("Build Follow-ups", "build_followups.js", [960, 200]),
  http("Send Follow-up", [1200, 200], { url: "={{ $json.url }}", headers: [["Authorization", "={{ $json.auth }}"]], body: "={{ JSON.stringify($json.body) }}", batch: 300 }),
  code("Collect Ids", "collect_ids.js", [1440, 200]),
  rpc("Save Ids", "bot_set_wa_ids", "={{ JSON.stringify({ p: $json.p }) }}", [1680, 200]),
  rpc("Numbers To Check", "bot_numbers_to_check", "={{ JSON.stringify({ p: {} }) }}", [720, 480]),
  code("Split Numbers", "split_numbers.js", [960, 480]),
  http("WA: Number Info", [1200, 480], { method: "GET", url: "={{ $json.url }}", headers: [["Authorization", "={{ $json.auth }}"]], query: "={{ JSON.stringify($json.qs) }}", batch: 200 }),
  code("Health Result", "health_result.js", [1440, 480]),
  rpc("Save Check", "bot_save_check", "={{ JSON.stringify({ p: $json.p }) }}", [1680, 480], "Problems → banner in Lingo"),
  sticky("## Lingo follow-ups + number health\nEvery 15 min: chats quiet for the seller's hours (default 5), once each, inside WhatsApp's 24 h window and the seller's sending hours (default 08:00–21:00): confirmed → delivery reminder · cancelled → ask why · no order → \"want to order?\" + 🛒.\nEvery 6 h: each number's token, status and quality rating.\nSame credentials and SUPABASE_URL as the main Lingo workflow.",
    [-40, -160], 1000, 300, 6),
];
const fuConns = connect([
  ["Every 15 Minutes", "Config"], ["Every 6 Hours", "Config"], ["Config", "Follow-ups?"],
  ["Follow-ups?", "Due Follow-ups", 0], ["Follow-ups?", "Numbers To Check", 1],
  ["Due Follow-ups", "Build Follow-ups"], ["Build Follow-ups", "Send Follow-up"], ["Send Follow-up", "Collect Ids"], ["Collect Ids", "Save Ids"],
  ["Numbers To Check", "Split Numbers"], ["Split Numbers", "WA: Number Info"], ["WA: Number Info", "Health Result"], ["Health Result", "Save Check"],
]);
const followups = { name: "Retexia — Feeder Lingo (follow-ups + health)", nodes: fuNodes, connections: fuConns, pinData: {}, active: false, settings: SETTINGS, tags: [] };

// =====================================================================
// CHECKS
// =====================================================================
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function check(wf) {
  const names = wf.nodes.map((n) => n.name);
  const fail = (m) => { throw new Error(`${wf.name}: ${m}`); };
  if (new Set(names).size !== names.length) fail("duplicate node names");
  const targets = new Set();
  for (const [from, v] of Object.entries(wf.connections)) {
    if (!names.includes(from)) fail(`unknown source ${from}`);
    for (const outs of v.main) for (const c of outs) { if (!names.includes(c.node)) fail(`unknown target ${c.node}`); targets.add(c.node); }
  }
  for (const n of wf.nodes) {
    if (/stickyNote|webhook|scheduleTrigger/.test(n.type)) continue;
    if (!targets.has(n.name)) fail(`orphan node ${n.name}`);
  }
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
    else if (typeof o === "string" && o.startsWith("=")) {
      if ((o.match(/\{\{/g) || []).length !== (o.match(/\}\}/g) || []).length) fail(`unbalanced expression: ${o.slice(0, 90)}`);
      for (const [, expr] of o.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
        try { new Function(`return (${expr});`); } catch (e) { fail(`expression doesn't parse (${e.message}): ${expr.slice(0, 120)}`); }
      }
    }
  };
  for (const n of wf.nodes) {
    if (n.type === "n8n-nodes-base.code") {
      try { new AsyncFunction("$input", "$", "require", n.parameters.jsCode); } catch (e) { fail(`Code node ${n.name} doesn't parse: ${e.message}`); }
    } else walk(n.parameters);
  }
  for (const [, ref] of JSON.stringify(wf).matchAll(/\$\('([^']+)'\)/g)) if (!names.includes(ref)) fail(`reference to missing node: ${ref}`);
  return wf.nodes.filter((n) => !/stickyNote/.test(n.type)).length;
}

for (const [wf, file] of [[main, "feeder-lingo.json"], [followups, "feeder-lingo-followups.json"]]) {
  const count = check(wf);
  writeFileSync(new URL(`n8n/${file}`, ROOT), JSON.stringify(wf, null, 2) + "\n");
  console.log(`n8n/${file}: ${count} nodes OK`);
}
