# Autopublish + Auto comment: going live

Both tools use the same door to Facebook: the n8n workflow **"Retexia — Feeder Autopublish (gateway)"**. It holds the Meta System User token; the panel never sees it. Auto comment (migration 0046) uses the Page's own token, which n8n gets from the System User.

## 1. Meta (business.facebook.com, your Retexia business)

1. **Business settings → Users → System users**: open (or add) the system user Retexia uses.
2. **Assign assets** to it:
   - the **ad account**: Manage campaigns;
   - the **Page**: Create ads, Leads, **Moderate** (reply and hide comments), **Messages** (private replies).
   If the ad account or Page belongs to another business, that business shares it with Retexia as a partner first.
3. **Generate a new token** for the system user (app: your Retexia Meta app, expiry: never) with these permissions:
   `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `pages_manage_metadata`, `leads_retrieval`, and for Auto comment `pages_read_user_content`, `pages_manage_engagement`, `pages_messaging`.
4. While the Meta app is in **Development** mode it works for your own business's ad accounts and Pages. Comments by people who aren't on the app may be limited until the app passes App Review (Advanced access); test with your own Facebook account (an app admin).

## 2. n8n

1. Open **Retexia — Feeder Autopublish (gateway)**.
2. Credential **"Meta System User (Autopublish)"** (Header Auth): Name `Authorization`, Value `Bearer <the new token>`.
3. Credential **"Retexia key (Autopublish)"** on the Webhook: Name `X-Retexia-Key`, Value = a long random text (the same as `FEEDER_ADS_N8N_KEY` on Vercel).
4. **Config** node: replace its code with the code at the end of this file (adds the comment calls to the allowed list). Save.
5. **Activate** the workflow. Copy the Webhook node's **Production URL**.

## 3. Vercel (apps/panels)

```
FEEDER_ADS_N8N_URL=<the Production URL of the webhook>
FEEDER_ADS_N8N_KEY=<the same value as the n8n Retexia key>
RETEXIA_META_BUSINESS_ID=<your business ID>
```
Redeploy **panels**.

## 4. Supabase

SQL editor: run `supabase/migrations/0046_feeder_auto_comment.sql` (adds the free **Auto comment** package, its tables and the every-minute clock). Safe to run again.

## 5. Check (in this order)

1. feeder.retexia.com → **Autopublish → Accounts**: ad account ID, Page ID → **Save**, then **Check**. Every line should be green.
2. admin.retexia.com → Products → Feeder → **Autopublish** tab: confirm the account (status **connected**).
3. **Autopublish → Launch**: a product, 1 video or image, a template → **Launch**. Everything is created **paused**; watch the launch's timeline until the review finishes, then switch it on in Ads Manager or the launch page.
4. feeder.retexia.com → **Auto comment**: switch it on. Comment on your ad from your own Facebook account (e.g. "price kiyada?"). Within a minute (or press **Check now**) the Page replies, sends you a private message, and a comment with a phone number is hidden.
5. "Try a comment" on the Auto comment page shows what it would do without touching Facebook (handy in a presentation).

## Config node code

```js
// Retexia — Feeder Autopublish (gateway). The panel (feeder.retexia.com) decides everything;
// this workflow only makes one allowed Meta / TikTok / WhatsApp call per request and answers
// with the platform's status and body. Nothing waits here, nothing is stored here.
//
// EDIT only the values marked EDIT. Tokens live in n8n credentials (Header Auth), never here:
//   "Retexia key (Autopublish)"      on the Webhook   Name: X-Retexia-Key  Value: = FEEDER_ADS_N8N_KEY (Vercel, panels)
//   "Meta System User (Autopublish)" Meta nodes       Name: Authorization  Value: Bearer <System User token>
//   "TikTok Business (Autopublish)"  TikTok nodes     Name: Access-Token   Value: <long-term access token>
//   "Evolution (Autopublish)"        WA · Send        Name: apikey         Value: <Evolution API key>
// Docs: developers.facebook.com/docs/marketing-api · business-api.tiktok.com/portal/docs (v1.3)
const CONFIG = {
  graphVersion: 'v26.0', // Meta Graph / Marketing API version (latest stable)
  tiktokBase: 'https://business-api.tiktok.com/open_api/v1.3',
  evolutionUrl: 'EDIT: https://your-evolution-server',
  evolutionInstance: 'EDIT: the instance name, e.g. retexia-ads',
  // Images n8n downloads for Meta (adimages) must come from Retexia's Supabase Storage (signed links).
  storageLink: /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/sign\/autopublish\//,
};

const body = $input.first().json.body || {};
const graph = 'https://graph.facebook.com/' + CONFIG.graphVersion;
const path = String(body.path ?? '').replace(/^\/+/, '');
const refuse = (why) => [{ json: { kind: 'refused', refused: String(why).slice(0, 200) } }];
const enc = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
const flat = (p) => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, enc(v)]));
const form = (p) => Object.entries(flat(p)).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');

// Allowed calls only (anything else is refused).
const META_GET = [/^$/, /^search$/, /^act_\d+$/, /^act_\d+\/(campaigns|adsets|ads|adcreatives|advideos|adimages|insights)$/, /^\d+$/, /^\d+\/(thumbnails|ads|insights)$/];
const META_POST = [/^act_\d+\/(campaigns|adsets|adcreatives|ads|advideos)$/, /^\d+$/];
const TT_GET = ['advertiser/info/', 'identity/get/', 'file/video/ad/info/', 'campaign/get/', 'adgroup/get/', 'ad/get/', 'ad/review_info/', 'page/get/', 'tool/region/', 'report/integrated/get/'];
const TT_POST = ['campaign/create/', 'adgroup/create/', 'ad/create/', 'ad/update/', 'campaign/status/update/', 'adgroup/status/update/', 'ad/status/update/', 'file/video/ad/upload/', 'file/image/ad/upload/'];

switch (body.action) {
  case 'meta': {
    const m = body.method === 'POST' ? 'POST' : 'GET';
    if (!(m === 'GET' ? META_GET : META_POST).some((re) => re.test(path))) return refuse('Meta ' + m + ' ' + path + ' is not allowed');
    if (m === 'GET' && path === '' && !(body.params && body.params.ids)) return refuse('Meta: ids needed');
    // On an existing object (ad, ad set, campaign, video) only these changes are allowed.
    if (m === 'POST' && /^\d+$/.test(path) && !Object.keys(body.params || {}).every((k) => ['status', 'creative'].includes(k))) return refuse('Meta: only status / creative changes on an object');
    return [{ json: { kind: m === 'GET' ? 'meta_get' : 'meta_post', platform: 'meta', url: graph + '/' + path, qs: m === 'GET' ? flat(body.params) : {}, form: m === 'POST' ? form(body.params) : '' } }];
  }
  case 'meta_page': {
    // Calls made with the Page's own token: Instant Forms (Autopublish) and comments (Auto comment).
    const pid = String(body.page_id || '');
    const m = body.method === 'POST' ? 'POST' : 'GET';
    const p = body.params || {};
    if (!/^\d{5,25}$/.test(pid)) return refuse('Page call not allowed');
    const isObj = /^\d+_\d+$/.test(path); // a post or a comment: {id}_{id}
    const allowed =
      path === pid + '/leadgen_forms' ||
      // read the newest posts and ads with their comments
      (m === 'GET' && (path === pid + '/posts' || path === pid + '/ads_posts' || path === pid || /^\d+_\d+\/comments$/.test(path))) ||
      // reply under a post or a comment (the Page's first comment, or a reply)
      (m === 'POST' && /^\d+_\d+\/comments$/.test(path) && Object.keys(p).every((k) => k === 'message')) ||
      // hide / unhide a comment, nothing else
      (m === 'POST' && isObj && Object.keys(p).length === 1 && 'is_hidden' in p) ||
      // a private reply to a comment (never a message to anyone else)
      (m === 'POST' && path === pid + '/messages' && p.recipient && typeof p.recipient === 'object' && Object.keys(p.recipient).join() === 'comment_id' &&
        Object.keys(p).every((k) => ['recipient', 'message'].includes(k)));
    if (!allowed) return refuse('Page ' + m + ' ' + path + ' is not allowed');
    return [{ json: { kind: 'page', platform: 'meta', method: m, url: graph + '/' + path, tokenUrl: graph + '/' + pid, params: flat(p) } }];
  }
  case 'meta_image': {
    const account = String(body.account || '');
    if (!/^act_\d{5,25}$/.test(account) || !CONFIG.storageLink.test(String(body.image_url || ''))) return refuse('image upload not allowed');
    return [{ json: { kind: 'image', platform: 'meta', url: graph + '/' + account + '/adimages', image_url: String(body.image_url) } }];
  }
  case 'tiktok': {
    const m = body.method === 'POST' ? 'POST' : 'GET';
    if (!(m === 'GET' ? TT_GET : TT_POST).includes(path)) return refuse('TikTok ' + m + ' ' + path + ' is not allowed');
    return [{ json: { kind: m === 'GET' ? 'tiktok_get' : 'tiktok_post', platform: 'tiktok', url: CONFIG.tiktokBase + '/' + path, qs: m === 'GET' ? flat(body.params) : {}, json: m === 'POST' ? body.params || {} : {} } }];
  }
  case 'whatsapp': {
    const to = String(body.to || '').replace(/\D/g, '');
    if (!/^\d{9,15}$/.test(to) || !body.text) return refuse('WhatsApp: number and text needed');
    if (String(CONFIG.evolutionUrl).startsWith('EDIT')) return refuse('WhatsApp is not set up (Config → evolutionUrl)');
    return [{ json: { kind: 'whatsapp', platform: 'whatsapp', url: CONFIG.evolutionUrl.replace(/\/+$/, '') + '/message/sendText/' + CONFIG.evolutionInstance, json: { number: to, text: String(body.text).slice(0, 1500), delay: 1200, linkPreview: false } } }];
  }
  default:
    return refuse('unknown action');
}
```
