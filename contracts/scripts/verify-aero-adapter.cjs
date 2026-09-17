const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { verifyOnArcscan } = require("./lib/verifyOnArcscan.cjs");

const AERO_MAINNET_SWAP_ROUTER = "0xb4702E1375F712da2e0d5F534c30c0c1513EdB2B";

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
      `aero-adapter-${hre.network.name}-deployment.json`,
    ),
  );

  const address = process.env.AERO_ADAPTER_ADDRESS || saved?.adapter;
  const swapRouter =
    process.env.AERO_SWAP_ROUTER_ADDRESS ||
    saved?.swapRouter ||
    (hre.network.name === "arc-mainnet" ? AERO_MAINNET_SWAP_ROUTER : "");

  if (!address) {
    throw new Error(
      "Set AERO_ADAPTER_ADDRESS or deploy first so the adapter deployment JSON exists.",
    );
  }

  const status = await verifyOnArcscan(hre, {
    address,
    constructorArguments: [swapRouter],
    contract: "contracts/adapters/AeroAdapter.sol:AeroAdapter",
    label: "AeroAdapter",
    license: "MIT",
  });

  if (saved) {
    fs.writeFileSync(
      path.join(
        __dirname,
        "..",
        "deployments",
        `aero-adapter-${hre.network.name}-deployment.json`,
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
