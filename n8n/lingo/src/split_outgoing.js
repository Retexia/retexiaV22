// Reply blocks → WhatsApp Cloud API messages. Neighbouring texts are merged into one message
// (fewer messages = cheaper outside free windows). Limits: buttons ≤3 (titles ≤20), list rows ≤10
// (titles ≤24, descriptions ≤72), body / caption ≤1024, text ≤4096.
const m = $('Message').first().json;
const src = $input.first().json;
const to = String(m.phone);
const clip = (s, n) => Array.from(String(s || '')).slice(0, n).join('');
const len = s => Array.from(String(s || '')).length;
const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };

const out = [];
let pend = '', pendPid = null;
const push = (pid, body, text) => out.push({ json: { pid, text, body, url: `https://graph.facebook.com/${$('Config').first().json.GRAPH_VERSION}/${m.phone_number_id}/messages` } });
const flush = () => {
  if (!pend) return;
  push(pendPid, { ...base, type: 'text', text: { body: clip(pend, 4096), preview_url: false } }, clip(pend, 4096));
  pend = ''; pendPid = null;
};
const join = (a, b) => (a ? a + '\n\n' + b : b);

for (const b of src.blocks || []) {
  if (b.kind === 'text') {
    if (!b.text) continue;
    if (len(join(pend, b.text)) > 4096) flush();
    pend = join(pend, b.text);
    if (b.pid) pendPid = b.pid;
  } else if (b.kind === 'image') {
    flush();
    if (len(b.caption) <= 1024) {
      push(b.pid, { ...base, type: 'image', image: { link: b.image, caption: b.caption || '' } }, '[photo] ' + (b.caption || ''));
    } else {
      push(b.pid, { ...base, type: 'image', image: { link: b.image } }, '[photo]');
      pend = b.caption; pendPid = b.pid;
    }
  } else if (b.kind === 'buttons' || b.kind === 'list') {
    let text = join(pend, b.text);
    if (len(text) > 1024) { flush(); text = b.text; }
    const pid = pendPid; pend = ''; pendPid = null;
    const action = b.kind === 'buttons'
      ? { buttons: b.buttons.slice(0, 3).map(x => ({ type: 'reply', reply: { id: x.id, title: clip(x.title, 20) } })) }
      : { button: clip(b.button, 20), sections: [{ title: 'Products', rows: b.rows.slice(0, 10).map(r => ({
          id: r.id, title: clip(r.title, 24), description: clip(r.description, 72) })) }] };
    const labels = b.kind === 'buttons' ? action.buttons.map(x => x.reply.title) : action.sections[0].rows.map(x => x.title);
    push(pid, { ...base, type: 'interactive', interactive: { type: b.kind === 'buttons' ? 'button' : 'list', body: { text: clip(text, 1024) }, action } },
      clip(text, 1024) + '\n[' + labels.join(' | ') + ']');
  }
}
flush();
return out;
