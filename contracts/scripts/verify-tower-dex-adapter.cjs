const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { verifyOnArcscan } = require("./lib/verifyOnArcscan.cjs");

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

async function main() {
  const saved = readJson(
    path.join(
      __dirname,
      "..",
      "deployments",
      `tower-dex-adapter-${hre.network.name}-deployment.json`,
    ),
  );

  const envAddress = process.env.TOWER_DEX_ADAPTER_ADDRESS;
  const address = envAddress || saved?.adapter;
  const router =
    hre.network.name === "arc-mainnet" &&
    sameAddress(process.env.TOWER_DEX_ROUTER_ADDRESS, TESTNET_TOWER_DEX_ROUTER)
      ? saved?.router
      : process.env.TOWER_DEX_ROUTER_ADDRESS || saved?.router;

  if (!address) {
    throw new Error(
      "Set TOWER_DEX_ADAPTER_ADDRESS or deploy first so the adapter deployment JSON exists.",
    );
  }

  const status = await verifyOnArcscan(hre, {
    address,
    constructorArguments: [router],
    contract: "contracts/adapters/TowerDexAdapter.sol:TowerDexAdapter",
    label: "TowerDexAdapter",
    license: "MIT",
  });

  if (saved) {
    fs.writeFileSync(
      path.join(
        __dirname,
        "..",
        "deployments",
        `tower-dex-adapter-${hre.network.name}-deployment.json`,
      ),
      JSON.stringify({ ...saved, verificationStatus: status }, null, 2),
    );
  }

  console.log("Verification status:", status);
  if (status !== "verified" && status !== "skipped") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
