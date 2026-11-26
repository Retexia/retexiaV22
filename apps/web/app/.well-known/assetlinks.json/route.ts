/**
 * Android App Links: lets https://retexia.com/… links (magic-link sign-in, links in emails) open the
 * Retexia app directly. ANDROID_CERT_SHA256 is the SHA-256 fingerprint of the app signing key
 * (Play Console → Test and release → App integrity → App signing; add the upload key's too while
 * testing builds outside Play), comma-separated. Until it's set this answers [] and links open in
 * the browser.
 */
export function GET() {
  const pkg = process.env.ANDROID_APP_ID?.trim() || "com.retexia.app";
  const prints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const body = prints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }]
    : [];
  return Response.json(body, { headers: { "cache-control": "public, max-age=3600" } });
}
