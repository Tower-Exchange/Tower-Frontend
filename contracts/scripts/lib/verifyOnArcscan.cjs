const https = require("https");
const { URL } = require("url");

const USER_AGENT = "tower-finance/verify";

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isAlreadyVerified = (message) =>
  /already verified/i.test(String(message || ""));

function getArcscanApiUrl(networkName) {
  if (process.env.ARCSCAN_API_URL) {
    return process.env.ARCSCAN_API_URL.replace(/\/$/, "");
  }

  if (networkName === "arc-testnet") {
    return "https://api-testnet.arc-scan.org";
  }

  return "https://api.arc-scan.org";
}

function requestJson(method, urlString, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const payload = body == null ? null : JSON.stringify(body);
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = text;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            // Keep the raw body when Arcscan does not return JSON.
          }
          resolve({
            status: response.statusCode || 0,
            data,
            text,
          });
        });
      },
    );
    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

async function getVerifyOptions(networkName) {
  const apiUrl = getArcscanApiUrl(networkName);
  return requestJson("GET", `${apiUrl}/v1/verify/options`);
}

function sourcifyIsReady(options) {
  return Boolean(options?.data) && options.data.provider_supported !== false;
}

async function encodeConstructorArguments(hre, contractFQN, constructorArguments) {
  if (!constructorArguments || constructorArguments.length === 0) {
    return "";
  }

  const artifact = await hre.artifacts.readArtifact(contractFQN);
  const iface = new hre.ethers.Interface(artifact.abi);
  return iface.encodeDeploy(constructorArguments);
}

async function getBuildInfo(hre, contractFQN) {
  const buildInfo = await hre.artifacts.getBuildInfo(contractFQN);
  if (!buildInfo) {
    throw new Error(`No Hardhat build-info found for ${contractFQN}. Compile first.`);
  }
  return buildInfo;
}

async function verifyWithHardhat(hre, { address, constructorArguments, contract }) {
  await hre.run("verify:verify", {
    address,
    constructorArguments: constructorArguments || [],
    contract,
    force: process.env.VERIFY_FORCE === "true",
  });
}

function compilerVersion(buildInfo) {
  return String(buildInfo.solcLongVersion || buildInfo.solcVersion || "").replace(
    /^v/,
    "",
  );
}

async function submitStandardJson(apiUrl, address, buildInfo, constructorArgumentsHex, license) {
  const payload = {
    method: "std-json",
    compiler_version: compilerVersion(buildInfo),
    license: license || "MIT",
    evm_version: buildInfo.input?.settings?.evmVersion || "default",
    input: buildInfo.input,
    constructor_arguments: constructorArgumentsHex || "",
  };

  return requestJson("POST", `${apiUrl}/v1/verify/${address}`, payload);
}

async function pollJob(apiUrl, jobId, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await requestJson("GET", `${apiUrl}/v1/verify/jobs/${jobId}`);
    const status =
      result.data?.status ||
      result.data?.state ||
      result.data?.result ||
      result.data;
    console.log(`Arcscan verify job ${jobId} (${attempt}/${attempts}):`, status);

    const serialized = JSON.stringify(result.data || {});
    if (/verified|success|pass/i.test(serialized) && !/pending|queued/i.test(serialized)) {
      return result.data;
    }
    if (/fail|reject|unsupported|error/i.test(serialized) && !/pending/i.test(serialized)) {
      throw new Error(`Arcscan verification job failed: ${serialized}`);
    }
    await sleepMs(Math.min(15_000, 1500 * attempt));
  }
  throw new Error(`Arcscan verification job ${jobId} did not finish`);
}

async function readVerifiedSource(apiUrl, address) {
  return requestJson("GET", `${apiUrl}/v1/contracts/${address}/source`);
}

async function verifyOnArcscan(hre, {
  address,
  constructorArguments = [],
  contract,
  label = contract || address,
  license = "MIT",
}) {
  if (process.env.VERIFY_CONTRACTS === "false") {
    console.log(`Skipping verification for ${label} because VERIFY_CONTRACTS=false`);
    return "skipped";
  }

  const networkName = hre.network.name;
  const apiUrl = getArcscanApiUrl(networkName);
  console.log(`Verifying ${label} at ${address} on ${networkName} via ${apiUrl}`);

  try {
    await hre.run("compile");
  } catch (error) {
    console.warn(
      "Compile before verify failed:",
      error instanceof Error ? error.message : String(error),
    );
  }

  const existing = await readVerifiedSource(apiUrl, address).catch(() => ({ data: null }));
  if (existing.data?.verified) {
    console.log(`Already verified on Arcscan: ${address}`);
    return "verified";
  }

  const options = await getVerifyOptions(networkName).catch(() => ({ data: null }));
  if (!sourcifyIsReady(options) && process.env.VERIFY_FORCE !== "true") {
    console.warn(
      options.data?.message ||
        `Sourcify has not listed chain ${options.data?.chain_id || "5042"} yet, so Arcscan cannot verify ${label}. Re-run this script after Arc is added to Sourcify.`,
    );
    return "unavailable";
  }

  if (networkName !== "arc-mainnet") {
    try {
      await verifyWithHardhat(hre, {
        address,
        constructorArguments,
        contract,
      });
      console.log(`Verified ${label} via Hardhat explorer plugin`);
      return "verified";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAlreadyVerified(message)) {
        console.log(`Already verified: ${address}`);
        return "verified";
      }
      console.warn(`Hardhat verify:verify failed for ${label}: ${message}`);
    }
  }

  if (!contract) {
    throw new Error(`Set a fully qualified contract name to verify ${address} on Arcscan.`);
  }

  const buildInfo = await getBuildInfo(hre, contract);
  const encoded = await encodeConstructorArguments(
    hre,
    contract,
    constructorArguments,
  );
  const submitted = await submitStandardJson(
    apiUrl,
    address,
    buildInfo,
    encoded,
    license,
  );
  console.log(
    `Arcscan /v1/verify responded ${submitted.status}:`,
    typeof submitted.data === "string"
      ? submitted.text.slice(0, 500)
      : JSON.stringify(submitted.data),
  );

  if (submitted.status >= 400) {
    const detail =
      submitted.data?.error?.message ||
      submitted.data?.message ||
      submitted.text ||
      `HTTP ${submitted.status}`;
    throw new Error(
      `Arcscan rejected verification for ${address}: ${detail}`,
    );
  }

  const jobId =
    submitted.data?.job_id ||
    submitted.data?.id ||
    submitted.data?.jobId;
  if (jobId) {
    await pollJob(apiUrl, jobId);
  }

  const source = await readVerifiedSource(apiUrl, address);
  if (source.data?.verified) {
    console.log(`Verified ${label} on Arcscan`);
    return "verified";
  }

  throw new Error(
    `Arcscan accepted a verification payload for ${address} but the contract is still unverified.`,
  );
}

async function verifyContractWithRetry(hre, params, maxRetries = 3, delayMs = 5000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      console.log(`Verification attempt ${attempt}/${maxRetries}...`);
      const status = await verifyOnArcscan(hre, params);
      if (status === "unavailable") {
        return status;
      }
      return status;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (isAlreadyVerified(message)) {
        console.log(`Already verified: ${params.address}`);
        return "verified";
      }
      console.warn(`Verification attempt ${attempt} failed:`, message);
      if (attempt < maxRetries) {
        const waitMs = delayMs * attempt;
        console.log(`Waiting ${waitMs}ms before retry...`);
        await sleepMs(waitMs);
      }
    }
  }

  console.warn(
    `Verification failed after all retries for ${params.address}. Continue on-chain work; re-run the verify script later.`,
    lastError instanceof Error ? lastError.message : String(lastError || ""),
  );
  return "failed";
}

module.exports = {
  getArcscanApiUrl,
  getVerifyOptions,
  sourcifyIsReady,
  verifyContractWithRetry,
  verifyOnArcscan,
};
