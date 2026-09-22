const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { verifyOnArcscan } = require("./lib/verifyOnArcscan.cjs");

const UNISWAP_UNIVERSAL_ROUTER_V4 =
  "0x8702463e73f74d0b6765aBceb314Ef07aCb92650";
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
      `uniswap-adapter-${hre.network.name}-deployment.json`,
    ),
  );

  const address = process.env.UNISWAP_ADAPTER_ADDRESS || saved?.adapter;
  const universalRouter =
    process.env.UNISWAP_UNIVERSAL_ROUTER_ADDRESS ||
    saved?.universalRouter ||
    UNISWAP_UNIVERSAL_ROUTER_V4;
  const permit2 =
    process.env.UNISWAP_PERMIT2_ADDRESS || saved?.permit2 || PERMIT2;

  if (!address) {
    throw new Error(
      "Set UNISWAP_ADAPTER_ADDRESS or deploy first so the adapter deployment JSON exists.",
    );
  }

  const status = await verifyOnArcscan(hre, {
    address,
    constructorArguments: [universalRouter, permit2],
    contract: "contracts/adapters/UniswapV4Adapter.sol:UniswapV4Adapter",
    label: "UniswapV4Adapter",
    license: "MIT",
  });

  if (saved) {
    fs.writeFileSync(
      path.join(
        __dirname,
        "..",
        "deployments",
        `uniswap-adapter-${hre.network.name}-deployment.json`,
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
