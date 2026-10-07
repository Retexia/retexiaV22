export const webUrl = () => (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000").replace(/\/+$/, "");
