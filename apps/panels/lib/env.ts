/** retexia.com (sign-in, account). Falls back to localhost only in development. */
export const webUrl = () =>
  (process.env.NEXT_PUBLIC_WEB_URL || (process.env.NODE_ENV === "production" ? "https://retexia.com" : "http://localhost:3000")).replace(/\/+$/, "");

/** admin.retexia.com (where support mode is started and ends). */
export const adminUrl = () =>
  (process.env.ADMIN_URL || process.env.NEXT_PUBLIC_ADMIN_URL || (process.env.NODE_ENV === "production" ? "https://admin.retexia.com" : "http://localhost:3001")).replace(/\/+$/, "");
