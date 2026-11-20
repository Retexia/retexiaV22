// Media description + caption → one text line (max ~40 words).
const m = $('Message').first().json;
const g = $input.first().json || {};
const said = ((((g.candidates || [])[0] || {}).content || {}).parts || [])
  .filter(x => !x.thought).map(x => x.text || '').join(' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 45).join(' ');

const text = m.media.kind === 'audio'
  ? (m.text ? m.text + ' ' : '') + (said ? `[voice] ${said}` : '[voice note - could not understand]')
  : (said ? `[image: ${said}]` : '[image]') + (m.text ? ' ' + m.text : '');
return [{ json: { text } }];
