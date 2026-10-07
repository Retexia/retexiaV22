const prod = process.env.NODE_ENV === "production";
/** Absolute URLs; production falls back to the live domains if a variable is missing. */
export const adminUrl = () => (process.env.NEXT_PUBLIC_ADMIN_URL || (prod ? "https://admin.retexia.com" : "http://localhost:3001")).replace(/\/+$/, "");
export const webUrl = () => (process.env.NEXT_PUBLIC_WEB_URL || (prod ? "https://retexia.com" : "http://localhost:3000")).replace(/\/+$/, "");
