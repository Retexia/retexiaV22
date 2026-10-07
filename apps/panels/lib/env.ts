/** retexia.com (sign-in, account). Falls back to localhost only in development. */
export const webUrl = () =>
  (process.env.NEXT_PUBLIC_WEB_URL || (process.env.NODE_ENV === "production" ? "https://retexia.com" : "http://localhost:3000")).replace(/\/+$/, "");
