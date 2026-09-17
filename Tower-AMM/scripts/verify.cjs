const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { verifyOnArcscan } = require("../../contracts/scripts/lib/verifyOnArcscan.cjs");

const TESTNET_FACTORY = "0x9DE50a654531CD72533098a9c2De4239c121821D";
const TESTNET_ROUTER = "0xDf115b4f2F22B9255B2E63348423B6C5B379Bce2";

function sameAddress(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function pickAddress(envValue, savedValue, testnetValue) {
  if (envValue && !sameAddress(envValue, testnetValue)) {
    return envValue;
  }
  return savedValue;
}

function readSavedDeployment() {
  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const saved = readSavedDeployment();
  const factory = pickAddress(
    process.env.TOWER_FACTORY_ADDRESS,
    saved?.factory,
    TESTNET_FACTORY,
  );
  const router = pickAddress(
    process.env.TOWER_ROUTER_ADDRESS,
    saved?.router,
    TESTNET_ROUTER,
  );
  const feeToSetter = saved?.deployer || saved?.feeToSetter;

  if (!hre.ethers.isAddress(factory || "") || !hre.ethers.isAddress(router || "")) {
    throw new Error(
      "Missing factory/router. Reuse Tower-AMM/deployments/arc-mainnet.json or set TOWER_FACTORY_ADDRESS and TOWER_ROUTER_ADDRESS.",
    );
  }

  const results = {};
  results.factory = await verifyOnArcscan(hre, {
    address: factory,
    constructorArguments: [feeToSetter],
    contract: "contracts/core/TowerFactory.sol:TowerFactory",
    label: "TowerFactory",
    license: "GPL-3.0",
  });
  results.router = await verifyOnArcscan(hre, {
    address: router,
    constructorArguments: [factory],
    contract: "contracts/periphery/TowerRouter.sol:TowerRouter",
    label: "TowerRouter",
    license: "GPL-3.0",
  });

  if (saved) {
    const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify({ ...saved, verificationStatus: results }, null, 2),
    );
  }

  console.log("Verification status:", results);
  if (Object.values(results).some((status) => status === "unavailable")) {
    console.log(
      "Arc Explorer could not verify yet. Re-run this command, or submit Standard JSON at https://explorer.arc.io",
    );
  }
  if (Object.values(results).some((status) => status !== "verified" && status !== "skipped")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
