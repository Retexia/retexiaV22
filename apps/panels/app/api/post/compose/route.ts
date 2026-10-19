import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { workerAuth } from "@/lib/cron";
import { makeCutout, pasteProduct, productCanvas, zoneText, type Format } from "@/lib/post/product-cutout";
import { postDb } from "@/lib/post/post-db";

/**
 * The exact product on a design, for the n8n Post worker (X-Retexia-Key = N8N_POST_KEY):
 *   prepare: cuts the product out of the owner's photo (cached in media/{business}/cutouts/)
 *            and returns a signed canvas (product in its spot, the rest transparent) that the
 *            image model designs around, also used as its mask;
 *   paste:   puts the real product pixels back on the finished design (same spot), so the
 *            product is exactly the photo, then removes the canvas.
 * Answers {ok: false, reason} when there is nothing to do (no usable photo); the worker
 * then designs as before.
 */
export const maxDuration = 60;

const path = z.string().min(3).max(300).regex(/^[0-9a-f-]{36}\/[\w./-]+$/).refine((p) => !p.includes(".."));
const body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("prepare"), business_id: z.uuid(), product_id: z.uuid().or(z.literal("")).optional(), photos: z.array(path).max(4).default([]), format: z.enum(["post", "story"]), size: z.string().regex(/^\d{3,4}x\d{3,4}$/) }),
  z.object({ step: z.literal("paste"), business_id: z.uuid(), design_path: path, cutout_path: path.or(z.literal("")), canvas_path: path.or(z.literal("")).optional(), format: z.enum(["post", "story"]) }),
]);

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: NextRequest) {
  const auth = workerAuth(request);
  if (!auth.ok) return json({ ok: false, reason: `Unauthorized: ${auth.reason}` }, 401);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, reason: "Bad request" }, 400);
  const d = parsed.data;
  const own = (p: string) => p.startsWith(`${d.business_id}/`);
  const storage = postDb().storage.from("media");
  const read = async (p: string) => {
    const { data } = await storage.download(p);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };

  try {
    if (d.step === "prepare") {
      const [w, h] = d.size.split("x").map(Number) as [number, number];
      // The product's own photos, read here (oldest first = the one shown in the product dialog first).
      const { data: rows } = d.product_id
        ? await postDb()
            .from("media")
            .select("storage_path")
            .eq("business_id", d.business_id)
            .eq("product_id", d.product_id)
            .eq("kind", "photo")
            .neq("source", "ai")
            .order("created_at")
            .limit(3)
        : { data: [] };
      const photos = [...new Set([...(rows ?? []).map((r) => r.storage_path as string), ...d.photos])];
      for (const photo of photos.filter(own)) {
        const cutoutPath = `${d.business_id}/cutouts/${photo.split("/").pop()!.replace(/\.[^.]+$/, "")}.png`;
        let cutout: Buffer | null = await read(cutoutPath);
        if (!cutout) {
          const original = await read(photo);
          cutout = original ? await makeCutout(original) : null;
          if (!cutout) continue; // background not plain: try the next photo
          await storage.upload(cutoutPath, cutout, { contentType: "image/png", upsert: true });
        }
        const canvasPath = `${d.business_id}/tmp/canvas-${crypto.randomUUID()}.png`;
        const { error } = await storage.upload(canvasPath, await productCanvas(cutout, w, h, d.format as Format), { contentType: "image/png" });
        if (error) return json({ ok: false, reason: `Canvas upload failed: ${error.message}` });
        const { data: signed } = await storage.createSignedUrl(canvasPath, 900);
        if (!signed?.signedUrl) return json({ ok: false, reason: "Couldn't sign the canvas." });
        return json({ ok: true, canvas_url: signed.signedUrl, canvas_path: canvasPath, cutout_path: cutoutPath, photo, zone: zoneText(d.format as Format) });
      }
      return json({ ok: false, reason: photos.length ? "No photo with a plain background to cut out." : d.product_id ? "This product has no photos." : "Not a post about one product." });
    }

    // paste
    const cleanup = async () => {
      if (d.canvas_path && own(d.canvas_path)) await storage.remove([d.canvas_path]);
    };
    if (!d.cutout_path) return json({ ok: false, reason: "Nothing to paste." });
    if (!own(d.design_path) || !own(d.cutout_path)) return json({ ok: false, reason: "Wrong business." }, 403);
    const [design, cutout] = await Promise.all([read(d.design_path), read(d.cutout_path)]);
    if (!design || !cutout) {
      await cleanup();
      return json({ ok: false, reason: "Design or cut-out not found." });
    }
    const out = await pasteProduct(design, cutout, d.format as Format);
    const { error } = await storage.upload(d.design_path, out, { contentType: "image/jpeg", upsert: true });
    await cleanup();
    return error ? json({ ok: false, reason: error.message }) : json({ ok: true, bytes: out.length });
  } catch (e) {
    console.error("[compose]", e);
    return json({ ok: false, reason: e instanceof Error ? e.message.slice(0, 200) : "failed" });
  }
}
