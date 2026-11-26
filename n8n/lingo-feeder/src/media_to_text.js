// Voice note words / photo description (+ caption) → one line of text for the turn.
const m = $('Message').first().json;
const g = $input.first().json || {};
const said = ((((g.candidates || [])[0] || {}).content || {}).parts || [])
  .filter(x => !x.thought).map(x => x.text || '').join(' ').replace(/\s+/g, ' ').trim().split(" ").slice(0, 150).join(" ");
const text = m.media.kind === 'audio'
  ? (said ? `[voice] ${said}` : '[voice note - could not understand]') + (m.text ? ' ' + m.text : '')
  : (said ? `[photo: ${said}]` : '[photo]') + (m.text ? ' ' + m.text : '');
return [{ json: { text } }];
