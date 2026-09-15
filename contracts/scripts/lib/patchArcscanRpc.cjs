const MAX_ATTEMPTS = 12;
const MAX_WAIT_MS = 15_000;

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const asRecord = (value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;

const isUnreachableRpcError = (error) => {
  const data = asRecord(error?.data);
  if (data?.reason === "unreachable" || data?.reason === "edge_rate_limited") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error || "");
  return (
    /could not complete this request/i.test(message) ||
    /no answer was obtained/i.test(message) ||
    /too many requests/i.test(message)
  );
};

const retryDelayMs = (error, attempt) => {
  const data = asRecord(error?.data);
  const retryAfterSeconds = Number(data?.retry_after_seconds);
  const baseMs = Number.isFinite(retryAfterSeconds)
    ? retryAfterSeconds * 1000
    : 2000;
  return Math.min(MAX_WAIT_MS, Math.max(1000, baseMs) * attempt);
};

const withUnreachableRetry = async (label, send) => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      lastError = error;
      if (!isUnreachableRpcError(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      const waitMs = retryDelayMs(error, attempt);
      console.warn(
        `[arc-rpc] ${label} failed (${attempt}/${MAX_ATTEMPTS}): ${
          error instanceof Error ? error.message : String(error)
        }. Retrying in ${waitMs}ms...`,
      );
      await sleepMs(waitMs);
    }
  }

  throw lastError;
};

const resolveHttpProvider = (HttpProviderOverride) => {
  if (HttpProviderOverride) {
    return HttpProviderOverride;
  }

  return require("hardhat/internal/core/providers/http").HttpProvider;
};

const patchArcscanRpcProvider = (HttpProviderOverride) => {
  const HttpProvider = resolveHttpProvider(HttpProviderOverride);

  if (HttpProvider.prototype.__towerArcscanPatched) {
    return;
  }

  HttpProvider.prototype.__towerArcscanPatched = true;
  const originalRequest = HttpProvider.prototype.request;
  const originalSendBatch = HttpProvider.prototype.sendBatch;

  HttpProvider.prototype.request = async function patchedArcscanRequest(args) {
    const method = String(args?.method || "rpc");
    if (method.toLowerCase() === "eth_accounts") {
      try {
        return await originalRequest.call(this, args);
      } catch (error) {
        if (isUnreachableRpcError(error)) {
          return [];
        }
        throw error;
      }
    }

    return withUnreachableRetry(method, () => originalRequest.call(this, args));
  };

  HttpProvider.prototype.sendBatch = async function patchedArcscanSendBatch(
    batch,
  ) {
    return withUnreachableRetry("batch", () =>
      originalSendBatch.call(this, batch),
    );
  };
};

module.exports = {
  isUnreachableRpcError,
  patchArcscanRpcProvider,
};
