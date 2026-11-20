// Voice note / image → a tiny Gemini request that returns very short text. Done once: later
// calls only ever see that text, never the media again.
const cfg = $('Config').first().json;
const m = $('Message').first().json;
let b64 = '';
try { b64 = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('base64'); } catch (e) { b64 = ''; }
const mime = String(m.media.mime || (m.media.kind === 'audio' ? 'audio/ogg' : 'image/jpeg')).split(';')[0].trim();
const models = (m.settings || {}).ai_models || {};

const prompt = m.media.kind === 'audio'
  ? 'Customer voice note to a Sri Lankan shop. Write what they say as short text in the same language (Sinhala script, Singlish or English). Keep names, numbers and addresses exact. Max 40 words. Output only the text.'
  : 'Customer sent this image to a Sri Lankan shop. In max 15 English words say what it shows. If it has an address, phone number, payment slip or order details, copy them exactly. Output only that.';

return [{ json: {
  ok: !!b64,
  stage: 'media',
  model: models.media || cfg.MODEL_FAST,
  req: b64 ? {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: b64 } }] }],
    generationConfig: { maxOutputTokens: 512 },
  } : { contents: [] },
} }];
