const splitForwarded = (value: string | null) =>
  (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Client IP for rate limits and request logs.
 *
 * Prefer platform-set headers over the first X-Forwarded-For hop, which
 * callers can spoof. X-Forwarded-For is only used as a last resort, and
 * then only the right-most hop added by the reverse proxy.
 */
export const getTrustedClientIp = (
  headers: Headers,
  fallback = "unknown",
): string => {
  const cloudflare = splitForwarded(headers.get("cf-connecting-ip"))[0];
  if (cloudflare) {
    return cloudflare;
  }

  const vercel = splitForwarded(headers.get("x-vercel-forwarded-for"))[0];
  if (vercel) {
    return vercel;
  }

  const realIp = splitForwarded(headers.get("x-real-ip"))[0];
  if (realIp) {
    return realIp;
  }

  const forwarded = splitForwarded(headers.get("x-forwarded-for"));
  if (forwarded.length > 0) {
    return forwarded[forwarded.length - 1];
  }

  return fallback;
};
