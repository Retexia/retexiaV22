// Voice note / photo → short text with Gemini (good with Sinhala voice, cheap for audio and images).
// Done once: later steps only ever see the text, never the media again.
const m = $('Message').first().json;
const ai = (m.seller || {}).ai || {};
let b64 = '';
try { b64 = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('base64'); } catch (e) { b64 = ''; }
const mime = String(m.media.mime || (m.media.kind === 'audio' ? 'audio/ogg' : 'image/jpeg')).split(';')[0].trim();
const prompt = m.media.kind === 'audio'
  ? 'A Sri Lankan customer\'s voice note to an online shop. Write exactly what they say, in the same language: Sinhala in Sinhala script, Singlish (Sinhala in English letters) or English. Keep names, numbers, phone numbers and addresses exact. Max 60 words. Output only their words.'
  : 'A customer sent this photo to a Sri Lankan online shop. In max 25 English words say what it shows. If a product, brand or product name is visible, write the name exactly as printed. If it shows an address, phone number, payment slip, order details or a problem (damaged parcel, skin, hair…), copy or describe it. Output only that.';
const model = ai.media || 'gemini-3.5-flash-lite';
const req = b64 ? {
  systemInstruction: { parts: [{ text: prompt }] },
  contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: b64 } }] }],
  generationConfig: { maxOutputTokens: 400, thinkingConfig: { thinkingLevel: ai.gemini_thinking || 'minimal' } },
} : { contents: [] };
return [{ json: { ok: !!b64, task: 'media', provider: 'gemini', model, req, started: Date.now() } }];
