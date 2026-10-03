/** Public URLs (no trailing slash). */
export const adminUrl = () => (process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001").replace(/\/+$/, "");
export const webUrl = () => (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
