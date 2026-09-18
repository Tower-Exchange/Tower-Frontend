const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { verifyOnArcscan } = require("./lib/verifyOnArcscan.cjs");

const DZAP_ROUTER = "0xb3926deF2e0989B0700a57034C9A211bfBcF858B";
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
      `dzap-adapter-${hre.network.name}-deployment.json`,
    ),
  );

  const address = process.env.DZAP_ADAPTER_ADDRESS || saved?.adapter;
  const dzapRouter =
    process.env.DZAP_ROUTER_ADDRESS || saved?.dzapRouter || DZAP_ROUTER;
  const permit2 =
    process.env.DZAP_PERMIT2_ADDRESS || saved?.permit2 || PERMIT2;

  if (!address) {
    throw new Error(
      "Set DZAP_ADAPTER_ADDRESS or deploy first so the adapter deployment JSON exists.",
    );
  }

  const status = await verifyOnArcscan(hre, {
    address,
    constructorArguments: [dzapRouter, permit2],
    contract: "contracts/adapters/DZapAdapter.sol:DZapAdapter",
    label: "DZapAdapter",
    license: "MIT",
  });

  if (saved) {
    fs.writeFileSync(
      path.join(
        __dirname,
        "..",
        "deployments",
        `dzap-adapter-${hre.network.name}-deployment.json`,
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
