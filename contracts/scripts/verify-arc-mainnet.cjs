const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { verifyOnArcscan } = require("./lib/verifyOnArcscan.cjs");

const TESTNET_TOWER_SWAP_EXECUTOR =
  "0x2De8906a641d65d490bC60A4179d961d59742bCb";
const TESTNET_TOWER_DEX_ROUTER = "0xDf115b4f2F22B9255B2E63348423B6C5B379Bce2";

function sameAddress(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function pickAddress(envValue, savedValue, testnetValue) {
  if (envValue && !sameAddress(envValue, testnetValue)) {
    return envValue;
  }
  return savedValue;
}

async function main() {
  if (hre.network.name !== "arc-mainnet") {
    throw new Error("Run this with --network arc-mainnet.");
  }

  const executorFile = path.join(
    __dirname,
    "..",
    "deployments",
    "tower-swap-executor-arc-mainnet-deployment.json",
  );
  const adapterFile = path.join(
    __dirname,
    "..",
    "deployments",
    "tower-dex-adapter-arc-mainnet-deployment.json",
  );
  const executorSaved = readJson(executorFile);
  const adapterSaved = readJson(adapterFile);

  const executorAddress = pickAddress(
    process.env.TOWER_SWAP_EXECUTOR_ADDRESS,
    executorSaved?.executor,
    TESTNET_TOWER_SWAP_EXECUTOR,
  );
  const adapterAddress = pickAddress(
    process.env.TOWER_DEX_ADAPTER_ADDRESS,
    adapterSaved?.adapter,
    "",
  );
  const adapterRouter = pickAddress(
    process.env.TOWER_DEX_ROUTER_ADDRESS,
    adapterSaved?.router,
    TESTNET_TOWER_DEX_ROUTER,
  );

  if (!hre.ethers.isAddress(executorAddress || "")) {
    throw new Error(
      "Missing mainnet TowerSwapExecutor. Deploy first or set TOWER_SWAP_EXECUTOR_ADDRESS.",
    );
  }
  if (!hre.ethers.isAddress(adapterAddress || "")) {
    throw new Error(
      "Missing mainnet TowerDexAdapter. Deploy first or set TOWER_DEX_ADAPTER_ADDRESS.",
    );
  }

  const constructorTreasury =
    executorSaved?.constructorTreasury || executorSaved?.deployer;
  const owner = executorSaved?.constructorOwner || executorSaved?.owner;
  const feeBps = Number(executorSaved?.feeBps || "25");

  const results = {};
  results.executor = await verifyOnArcscan(hre, {
    address: executorAddress,
    constructorArguments: [constructorTreasury, owner, feeBps],
    contract: "contracts/TowerSwapExecutor.sol:TowerSwapExecutor",
    label: "TowerSwapExecutor",
    license: "MIT",
  });
  results.adapter = await verifyOnArcscan(hre, {
    address: adapterAddress,
    constructorArguments: [adapterRouter],
    contract: "contracts/adapters/TowerDexAdapter.sol:TowerDexAdapter",
    label: "TowerDexAdapter",
    license: "MIT",
  });

  if (executorSaved) {
    writeJson(executorFile, {
      ...executorSaved,
      verificationStatus: results.executor,
    });
  }
  if (adapterSaved) {
    writeJson(adapterFile, {
      ...adapterSaved,
      verificationStatus: results.adapter,
    });
  }

  console.log("\nContracts-package verification status:", results);
  console.log(
    "Also verify Tower AMM factory/router from Tower-AMM:\n  npm run verify:arc-mainnet --prefix Tower-AMM",
  );

  const unfinished = Object.values(results).filter(
    (status) => status !== "verified" && status !== "skipped",
  );
  if (unfinished.includes("unavailable")) {
    console.log(
      "Sourcify has not listed Arc mainnet (5042) yet. Re-run this command after it is listed.",
    );
  }
  if (unfinished.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
