/** Public origins — flow lives only on its subdomain, not at /flow. */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://shhheth.com";

export const FLOW_URL =
  process.env.NEXT_PUBLIC_FLOW_URL ?? "https://flow.shhheth.com";
