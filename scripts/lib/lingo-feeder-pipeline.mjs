// Runs the Lingo Feeder n8n Code nodes in the same order as the workflow (n8n/lingo-feeder.json),
// against a database (rpc) and fake AI / WhatsApp. Used by scripts/test-lingo-feeder.mjs and by the
// local stand-in engine for browser checks. Not used in production (n8n runs the real workflow).
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { nodeSource } from "./lingo-feeder-src.mjs";

const require = createRequire(import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const cache = new Map();
const src = (f) => cache.get(f) ?? cache.set(f, nodeSource(f)).get(f);

export const node = (items, executed = true) => {
  const arr = (Array.isArray(items) ? items : [items]).map((j) => ({ json: j }));
  return { first: () => arr[0], all: () => arr, isExecuted: executed };
};
export async function run(file, input, nodes, helpers = {}) {
  const $input = node(input);
  const $ = (name) => nodes[name] ?? { isExecuted: false, first: () => { throw new Error(`node not executed: ${name}`); }, all: () => [] };
  const out = await new AsyncFunction("$input", "$", "require", src(file)).call({ helpers }, $input, $, require);
  return out.map((i) => i.json);
}

/**
 * rpc(fn, p) → the function's jsonb result. ai = { openai(req) → chat.completions JSON, gemini(model, req) → generateContent JSON }.
 * wa(body) → the Graph API answer for one sent message (real chats only). media(id) → Buffer of a voice note / photo.
 */
export function createPipeline({ rpc, ai, wa = () => ({ messages: [{ id: "wamid.OUT" + Math.random().toString(36).slice(2, 10) }] }), media = () => Buffer.from("fake-media") }) {
  const Config = node({ SUPABASE_URL: "x", GRAPH_VERSION: "v25.0", RETEXIA_APP_SECRET: "EDIT" });

  /** A WhatsApp webhook POST (Meta's JSON + its signature) → everything the workflow would do. */
  async function webhook(body, signature) {
    const raw = JSON.stringify(body);
    const nodes = { Config };
    const [rw] = await run("read_webhook.js", { headers: { "x-hub-signature-256": signature }, body }, nodes);
    if (!rw) return { stopped: "not whatsapp" };
    nodes["Read Webhook"] = node({ ...rw, raw });
    const num = await rpc("bot_number", { phone_number_id: rw.phone_number_id });
    nodes.Number = node(num);
    if (!num.ok) return { stopped: num.why };
    nodes["Sign Body"] = node({ hmac: createHmac("sha256", num.app_secret || "missing").update(raw).digest("hex") });
    const split = await run("verify_split.js", {}, nodes);
    if (!split.length) return { stopped: "bad signature" };
    nodes["Verify & Split"] = node(split[0]);
    const r = {};
    if (split[0].statuses.length) r.statuses = await rpc("bot_statuses", { user_id: num.user_id, statuses: split[0].statuses });
    if (split[0].echoes.length) r.echoes = await rpc("bot_echo", { user_id: num.user_id, items: split[0].echoes });
    if (!split[0].message) return { ...r, stopped: r.statuses || r.echoes ? "no message" : "nothing" };
    return { ...r, ...(await turn(nodes)) };
  }

  /** The panel's Try Lingo (test_bot): body = { user_id, text | tap, session, start_product, ad }. */
  async function panel(body) {
    const nodes = { Config, "Panel: Lingo Feeder": node({ body }) };
    const [pa] = await run("panel_action.js", {}, nodes);
    nodes["Panel Action"] = node(pa);
    const seller = await rpc("bot_number", { user_id: pa.user_id });
    nodes.Seller = node(seller);
    if (pa.action !== "test_bot" || !seller.ok) return { stopped: seller.why || pa.action };
    return turn(nodes);
  }

  async function turn(nodes) {
    const calls = { openai: 0, gemini: 0, ad: 0, media: 0 };
    const [msg] = await run("message.js", {}, nodes);
    nodes.Message = node(msg);
    const m = msg;
    const gate = await rpc("bot_gate", { user_id: m.user_id, phone: m.phone, wa_id: m.waId, name: m.name, referral: m.referral, test: m.test, start_product: m.start_product, kind: m.kind,
      text: m.media ? `[${m.media.kind === "audio" ? "voice note" : "photo"}] ${m.text || ""}` : m.text });
    nodes.Gate = node(gate);
    const finish = async () => (m.test ? (await run("test_result.js", {}, nodes))[0].reply : null);
    if (gate.status !== "ok") return { stopped: gate.status, gate, calls, test: await finish() };
    if (gate.need_ad_match) {
      calls.ad++; calls.openai++;
      const [am] = await run("build_ad_match.js", gate, nodes);
      nodes["Build Ad Match"] = node(am);
      nodes["AI: Ad Match"] = node(await ai.openai(am.req, "ad_match"));
      const [rd] = await run("read_ad_match.js", nodes["AI: Ad Match"].first().json, nodes);
      await rpc("bot_set_ad", rd.p);
    }
    if (m.media) {
      calls.media++; calls.gemini++;
      const [mr] = await run("build_media_request.js", {}, nodes, { getBinaryDataBuffer: async () => media(m.media.id) });
      nodes["Build Media Request"] = node(mr);
      nodes["Gemini: Media"] = node(await ai.gemini(mr.model, mr.req, "media"));
      const [mt] = await run("media_to_text.js", nodes["Gemini: Media"].first().json, nodes);
      nodes["Media to Text"] = node(mt);
    }
    const [row] = await run("build_buffer_row.js", {}, nodes);
    const buf = await rpc("bot_buffer_add", row.p);
    nodes["Buffer Add"] = node(buf);
    const claim = await rpc("bot_claim", { user_id: m.user_id, phone: m.phone, buffer_id: buf.id });
    nodes["Claim Batch"] = node(claim);
    if (!claim.ok) return { stopped: claim.why, calls, test: await finish() };
    const [und] = await run("understand.js", {}, nodes);
    nodes.Understand = node(und);
    if (und.need_ai) {
      let ok = false;
      if (und.brain.primary === "openai") {
        calls.openai++;
        const r = await ai.openai(und.brain.openai_req, "brain");
        nodes["OpenAI: Brain"] = node(r);
        ok = !r.error && !!(((r.choices || [])[0] || {}).message || {}).content;
      }
      if (!ok) {
        calls.gemini++;
        nodes["Gemini: Brain"] = node(await ai.gemini(und.brain.gemini_model, und.brain.gemini_req, "brain"));
      }
    }
    const [plan] = await run("plan_reply.js", {}, nodes);
    nodes["Plan Reply"] = node(plan);
    const outs = await run("split_outgoing.js", plan, nodes);
    nodes["Split Outgoing"] = node(outs);
    const real = !m.test && !outs[0].skip;
    const sent = real ? await Promise.all(outs.map((o) => wa(o.body))) : outs;
    const [st] = await run("build_save_turn.js", sent, nodes);
    nodes["Build Save Turn"] = node(st);
    const saved = await rpc("bot_save_turn", st.p);
    nodes["Save Turn"] = node(saved);
    return { gate, claim, und, plan, outs: outs.filter((o) => !o.skip), saved, save: st.p, calls, test: await finish() };
  }

  return { webhook, panel };
}
