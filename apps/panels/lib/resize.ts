/**
 * Browser-side photo preparation (product spec): max 2048 px, JPEG for
 * publishing (Instagram needs JPEG), a 400 px WebP thumbnail for the
 * dashboard. Drawing to a canvas also drops EXIF data such as location.
 */
async function draw(file: File, max: number) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return { canvas, w, h };
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare the photo."))), type, quality));

export async function preparePhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG, WebP or HEIC).");
  const full = await draw(file, 2048);
  const jpeg = await toBlob(full.canvas, "image/jpeg", 0.88);
  const small = await draw(file, 400);
  const thumb = await toBlob(small.canvas, "image/webp", 0.8);
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return {
    file: new File([jpeg], `${base}.jpg`, { type: "image/jpeg" }),
    thumb: new File([thumb], `${base}.webp`, { type: "image/webp" }),
    width: full.w,
    height: full.h,
  };
}

export async function photoForm(file: File, extra: Record<string, string> = {}) {
  const p = await preparePhoto(file);
  const fd = new FormData();
  fd.set("file", p.file);
  fd.set("thumb", p.thumb);
  fd.set("width", String(p.width));
  fd.set("height", String(p.height));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}
