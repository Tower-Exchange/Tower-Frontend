const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { verifyOnArcscan } = require("./lib/verifyOnArcscan.cjs");

const KYBER_META_AGGREGATION_ROUTER_V2 =
  "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const KYBER_AGGREGATION_EXECUTOR_PROXY =
  "0x8F10B468b06c6FD214B65F87778827F7D113f996";
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
      `kyberswap-adapter-${hre.network.name}-deployment.json`,
    ),
  );

  const address = process.env.KYBERSWAP_ADAPTER_ADDRESS || saved?.adapter;
  const kyberRouter =
    process.env.KYBERSWAP_ROUTER_ADDRESS ||
    saved?.kyberRouter ||
    KYBER_META_AGGREGATION_ROUTER_V2;
  const aggregationExecutor =
    process.env.KYBERSWAP_EXECUTOR_PROXY_ADDRESS ||
    saved?.aggregationExecutor ||
    KYBER_AGGREGATION_EXECUTOR_PROXY;
  const permit2 =
    process.env.KYBERSWAP_PERMIT2_ADDRESS || saved?.permit2 || PERMIT2;

  if (!address) {
    throw new Error(
      "Set KYBERSWAP_ADAPTER_ADDRESS or deploy first so the adapter deployment JSON exists.",
    );
  }

  const status = await verifyOnArcscan(hre, {
    address,
    constructorArguments: [kyberRouter, aggregationExecutor, permit2],
    contract: "contracts/adapters/KyberSwapAdapter.sol:KyberSwapAdapter",
    label: "KyberSwapAdapter",
    license: "MIT",
  });

  if (saved) {
    fs.writeFileSync(
      path.join(
        __dirname,
        "..",
        "deployments",
        `kyberswap-adapter-${hre.network.name}-deployment.json`,
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
