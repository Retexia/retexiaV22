// Reply blocks → WhatsApp Cloud API messages, in order. Texts next to each other become one message
// unless a block must stand alone (the photo text, the thank-you, how to use). Limits: reply buttons ≤3
// (titles ≤20), list rows ≤10 (titles ≤24, descriptions ≤72), body / caption ≤1024, text ≤4096.
// No blocks (spam, a plain "ok" while we wait for details) → one "skip" item, so the turn is still saved.
const m = $('Message').first().json;
const src = $input.first().json;
const to = String(m.phone);
const clip = (s, n) => Array.from(String(s || '')).slice(0, n).join('');
const len = s => Array.from(String(s || '')).length;
const url = `https://graph.facebook.com/${$('Config').first().json.GRAPH_VERSION}/${m.phone_number_id}/messages`;
const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };

const out = [];
let pend = '', pendPid = null;
const push = (pid, body, text, kind, meta) => out.push({ json: { pid, text, kind, meta: meta || null, body, url } });
const flush = () => {
  if (!pend) return;
  push(pendPid, { ...base, type: 'text', text: { body: clip(pend, 4096), preview_url: false } }, clip(pend, 4096), 'text');
  pend = ''; pendPid = null;
};
const join = (a, b) => (a ? a + '\n\n' + b : b);

for (const b of src.blocks || []) {
  if (b.kind === 'text') {
    if (!b.text) continue;
    if (b.sep) { flush(); pend = b.text; pendPid = b.pid || null; flush(); continue; }
    if (len(join(pend, b.text)) > 4096) flush();
    pend = join(pend, b.text);
    if (b.pid) pendPid = b.pid;
  } else if (b.kind === 'reaction') {
    flush();
    push(null, { ...base, type: 'reaction', reaction: { message_id: b.to, emoji: b.emoji } }, b.emoji, 'reaction', { reaction: b.emoji });
  } else if (b.kind === 'image') {
    flush();
    push(b.pid, { ...base, type: 'image', image: { link: b.image, caption: clip(b.caption, 1024) } }, clip(b.caption, 1024), 'image', { image: b.image });
  } else if (b.kind === 'buttons' || b.kind === 'list') {
    let text = join(pend, b.text);
    if (len(text) > 1024) { flush(); text = b.text; }
    const pid = pendPid; pend = ''; pendPid = null;
    const action = b.kind === 'buttons'
      ? { buttons: b.buttons.slice(0, 3).map(x => ({ type: 'reply', reply: { id: x.id, title: clip(x.title, 20) } })) }
      : { button: clip(b.button, 20), sections: [{ title: clip(b.section || 'Choose', 24), rows: b.rows.slice(0, 10).map(r => ({
          id: r.id, title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })) }] };
    const labels = b.kind === 'buttons' ? action.buttons.map(x => x.reply.title) : action.sections[0].rows.map(x => x.title);
    push(pid, { ...base, type: 'interactive', interactive: { type: b.kind === 'buttons' ? 'button' : 'list', body: { text: clip(text, 1024) }, action } },
      clip(text, 1024), b.kind, b.kind === 'buttons' ? { buttons: labels } : { list: clip(b.button, 20), rows: labels });
  }
}
flush();
// The first message quotes the customer's message (WhatsApp "reply"), like a person answering it.
const first = out.find(o => o.json.kind !== 'reaction');
if (first && src.quote && !/^test\./.test(src.quote)) first.json.body = { ...first.json.body, context: { message_id: src.quote } };
if (first && src.quote) first.json.meta = { ...(first.json.meta || {}), quote: true };
return out.length ? out : [{ json: { skip: true } }];
