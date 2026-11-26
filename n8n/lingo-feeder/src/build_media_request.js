// Voice note / photo → text with Gemini, once (later steps only see the text, never the media again).
// Voice notes: Gemini 3.5 Flash (settings.ai.media_audio) hears Sinhala far better than Flash-Lite; it gets the
// product the customer is talking about as a hint, writes English words in English letters ("diabetes",
// "order") and never invents. Photos: Flash-Lite (settings.ai.media).
const m = $('Message').first().json;
const ai = (m.seller || {}).ai || {};
const gate = $('Gate').isExecuted ? ($('Gate').first().json || {}) : {};
let b64 = '';
try { b64 = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('base64'); } catch (e) { b64 = ''; }
const audio = m.media.kind === 'audio';
const mime = String(m.media.mime || (audio ? 'audio/ogg' : 'image/jpeg')).split(';')[0].trim();
const hint = gate.product_name ? `\nThe chat is about this product: ${gate.product_name}.` : '';
const prompt = audio
  ? `Transcribe this WhatsApp voice note from a Sri Lankan customer to an online shop that sells Ayurvedic and home products, word for word.
- Sinhala speech → Sinhala script, as it was said (spoken Sinhala, not formal).
- English words the speaker uses (diabetes, sugar, cholesterol, pressure, gastric, order, delivery, address, cash on delivery, product names) → write them in English letters. Never spell an English word with Sinhala letters, and never mix Sinhala and English letters in one word.
- If they speak Singlish or English, write it in English letters.
- Phone numbers as digits. Keep names, places and addresses exactly.
- Don't translate, summarise, answer or add anything. If a part can't be heard, write (unclear).${hint}
Output only the transcript.`
  : `A customer sent this photo to a Sri Lankan online shop. In max 25 English words say what it shows. If a product, brand or product name is visible, write the name exactly as printed. If it shows an address, phone number, payment slip, order details or a problem (damaged parcel, skin, hair…), copy or describe it.${hint}
Output only that.`;
const model = audio ? (ai.media_audio || 'gemini-3.5-flash') : (ai.media || 'gemini-3.5-flash-lite');
const req = b64 ? {
  systemInstruction: { parts: [{ text: prompt }] },
  contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: b64 } }] }],
  generationConfig: { temperature: 0, maxOutputTokens: 600, thinkingConfig: { thinkingLevel: ai.gemini_thinking || 'minimal' } },
} : { contents: [] };
return [{ json: { ok: !!b64, task: 'media', provider: 'gemini', model, req, started: Date.now() } }];
