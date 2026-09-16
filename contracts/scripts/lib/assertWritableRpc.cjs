function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rpcHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "unknown");
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function retryDelayMs(message, attempt) {
  const match = /retry_after_seconds["']?\s*[:=]\s*(\d+)/i.exec(message);
  const retryAfterSeconds = match ? Number(match[1]) : 2;
  return Math.max(1000, retryAfterSeconds * 1000) * attempt;
}

function mainnetHint(host) {
  if (
    !/arc-scan\.org$/i.test(host) &&
    host !== "rpc.arc-scan.org" &&
    !/mainnet\.arc\.io$/i.test(host)
  ) {
    return "";
  }

  return [
    "Official Arc mainnet RPC is https://rpc.mainnet.arc.io (Blockdaemon/dRPC/QuickNode fallbacks at *.mainnet.arc.io).",
    "If eth_sendRawTransaction fails on the public endpoint, set ARC_MAINNET_RPC_URL to a keyed Alchemy/QuickNode/dRPC/Blockdaemon URL.",
    "Do not point that variable at the testnet Alchemy URL (arc-testnet.g.alchemy.com).",
  ].join("\n");
}

async function assertWritableRpc({ ethers, network, expectedChainId }) {
  const url = network.config.url;
  const host = rpcHost(url);
  const maxAttempts = 2;

  console.log("RPC:", host);

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const networkInfo = await ethers.provider.getNetwork();
      const chainId = Number(networkInfo.chainId);
      if (expectedChainId && chainId !== expectedChainId) {
        throw new Error(
          `RPC chainId ${chainId} does not match expected ${expectedChainId}`,
        );
      }

      const blockNumber = await ethers.provider.getBlockNumber();
      console.log("RPC chainId:", chainId);
      console.log("RPC block:", blockNumber);
      return;
    } catch (error) {
      lastError = error;
      const message = errorMessage(error);
      console.warn(
        `RPC preflight attempt ${attempt}/${maxAttempts} failed: ${message}`,
      );
      if (attempt < maxAttempts) {
        const waitMs = retryDelayMs(message, attempt);
        console.log(`Retrying in ${waitMs}ms...`);
        await sleepMs(waitMs);
      }
    }
  }

  const hint = expectedChainId === 5042 ? mainnetHint(host) : "";
  throw new Error(
    [`RPC at ${host} is not answering.`, hint, `Last error: ${errorMessage(lastError)}`]
      .filter(Boolean)
      .join("\n"),
  );
}

module.exports = {
  assertWritableRpc,
  rpcHost,
};
