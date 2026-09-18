const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { verifyOnArcscan } = require("./lib/verifyOnArcscan.cjs");

const LIFI_DIAMOND = "0xA4072583658Fae592A3506A42431cb6316a8d40b";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

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
      `lifi-adapter-${hre.network.name}-deployment.json`,
    ),
  );

  const address = process.env.LIFI_ADAPTER_ADDRESS || saved?.adapter;
  const lifiDiamond =
    process.env.LIFI_DIAMOND_ADDRESS || saved?.lifiDiamond || LIFI_DIAMOND;
  const permit2 =
    process.env.LIFI_PERMIT2_ADDRESS || saved?.permit2 || PERMIT2;

  if (!address) {
    throw new Error(
      "Set LIFI_ADAPTER_ADDRESS or deploy first so the adapter deployment JSON exists.",
    );
  }

  const status = await verifyOnArcscan(hre, {
    address,
    constructorArguments: [lifiDiamond, permit2],
    contract: "contracts/adapters/LiFiAdapter.sol:LiFiAdapter",
    label: "LiFiAdapter",
    license: "MIT",
  });

  if (saved) {
    fs.writeFileSync(
      path.join(
        __dirname,
        "..",
        "deployments",
        `lifi-adapter-${hre.network.name}-deployment.json`,
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
