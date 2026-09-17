const { isUnreachableRpcError } = require("./patchArcscanRpc.cjs");

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientRpcError = (error) => {
  if (isUnreachableRpcError(error)) {
    return true;
  }

  const message = String(error?.message || error || "");
  const code = String(error?.code || "").toUpperCase();
  return (
    code.includes("TIMEOUT") ||
    code.includes("NETWORK") ||
    code.includes("SERVER_ERROR") ||
    code.includes("ECONNRESET") ||
    code.includes("ETIMEDOUT") ||
    /timeout/i.test(message) ||
    /econnreset/i.test(message) ||
    /etimedout/i.test(message) ||
    /socket hang up/i.test(message) ||
    /und_err_socket/i.test(message) ||
    /other side closed/i.test(message)
  );
};

async function waitForReceipt(provider, txHash, label, attempts = 16) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        if (Number(receipt.status) !== 1) {
          throw new Error(`${label} reverted in block ${receipt.blockNumber}`);
        }
        console.log(`${label} confirmed in block ${receipt.blockNumber}`);
        return receipt;
      }
    } catch (error) {
      lastError = error;
      if (!isTransientRpcError(error) && !/reverted/i.test(String(error))) {
        throw error;
      }
      if (!isTransientRpcError(error) || attempt === attempts) {
        throw error;
      }
      console.warn(
        `${label} receipt check failed (${attempt}/${attempts}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await sleepMs(Math.min(15_000, 1500 * attempt));
  }

  throw lastError || new Error(`${label} receipt not found for ${txHash}`);
}

async function sendAndWait(txPromise, label, provider) {
  const tx = await txPromise;
  console.log(`${label} submitted: ${tx.hash}`);

  try {
    const receipt = await tx.wait();
    if (receipt && Number(receipt.status) === 1) {
      console.log(`${label} confirmed in block ${receipt.blockNumber}`);
      return receipt;
    }
  } catch (error) {
    if (!isTransientRpcError(error)) {
      throw error;
    }

    console.warn(
      `${label} wait interrupted by RPC error; polling receipt ${tx.hash}...`,
    );
  }

  return waitForReceipt(provider || tx.provider, tx.hash, label);
}

module.exports = {
  isTransientRpcError,
  sendAndWait,
  waitForReceipt,
};
