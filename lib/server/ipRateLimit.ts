type RateBucket = {
  windowStart: number;
  count: number;
};

export const createIpRateLimiter = (options: {
  windowMs: number;
  maxRequests: number;
  maxBuckets?: number;
}) => {
  const buckets = new Map<string, RateBucket>();
  const maxBuckets = options.maxBuckets ?? 20_000;

  const consume = (ip: string) => {
    const now = Date.now();
    const existing = buckets.get(ip);
    const bucket =
      !existing || now - existing.windowStart >= options.windowMs
        ? { windowStart: now, count: 0 }
        : existing;

    bucket.count += 1;
    buckets.set(ip, bucket);

    if (buckets.size > maxBuckets) {
      for (const [key, value] of buckets) {
        if (now - value.windowStart >= options.windowMs) {
          buckets.delete(key);
        }
      }
    }

    if (bucket.count > options.maxRequests) {
      return {
        limited: true as const,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.windowStart + options.windowMs - now) / 1000),
        ),
      };
    }

    return { limited: false as const };
  };

  return { consume };
};
