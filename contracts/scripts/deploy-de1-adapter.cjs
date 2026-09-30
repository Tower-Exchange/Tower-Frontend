const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers, network } = hre;
const { assertWritableRpc } = require("./lib/assertWritableRpc.cjs");
const { verifyContractWithRetry } = require("./lib/verifyOnArcscan.cjs");

const DE1_EXCHANGE = "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64";
const TESTNET_TOWER_SWAP_EXECUTOR =
  "0x2De8906a641d65d490bC60A4179d961d59742bCb";
const DE1_ADAPTER_CONTRACT = "contracts/adapters/De1Adapter.sol:De1Adapter";

const sameAddress = (left, right) =>
  Boolean(left) &&
  Boolean(right) &&
  ethers.isAddress(left) &&
  ethers.isAddress(right) &&
  left.toLowerCase() === right.toLowerCase();

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const savedMainnetExecutor = () =>
  readJson(
    path.join(
      __dirname,
      "..",
      "deployments",
      "tower-swap-executor-arc-mainnet-deployment.json",
    ),
  )?.executor;

const pickAddress = (candidates, skipAddress) => {
  for (const candidate of candidates) {
    if (ethers.isAddress(candidate) && !sameAddress(candidate, skipAddress)) {
      return candidate;
    }
  }
  return "";
};

async function verifyContract(address, constructorArguments) {
  if (process.env.DE1_ADAPTER_VERIFY === "false") {
    console.log("Skipping verification because DE1_ADAPTER_VERIFY=false");
    return "skipped";
  }

  return verifyContractWithRetry(hre, {
    address,
    constructorArguments,
    contract: DE1_ADAPTER_CONTRACT,
    label: "De1Adapter",
    license: "MIT",
  });
}

async function maybeAllowlistAdapter(executorAddress, adapterAddress) {
  if (!executorAddress || !ethers.isAddress(executorAddress)) {
    return;
  }

  const executor = await ethers.getContractAt(
    "TowerSwapExecutor",
    executorAddress,
  );

  console.log("Allowlisting De1Adapter in TowerSwapExecutor:", executorAddress);

  const alreadyRoute = await executor.routeTargets(adapterAddress);
  if (!alreadyRoute) {
    const routeTargetTx = await executor.setRouteTarget(adapterAddress, true);
    await routeTargetTx.wait();
    console.log("  Route target allowed.");
  } else {
    console.log("  Route target already allowed.");
  }

  const alreadySpender = await executor.approvalSpenders(adapterAddress);
  if (!alreadySpender) {
    const spenderTx = await executor.setApprovalSpender(adapterAddress, true);
    await spenderTx.wait();
    console.log("  Approval spender allowed.");
  } else {
    console.log("  Approval spender already allowed.");
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const de1ExchangeAddress = pickAddress(
    [process.env.DE1_EXCHANGE_ADDRESS, DE1_EXCHANGE],
    "",
  );
  const executorAddress =
    network.name === "arc-mainnet"
      ? pickAddress(
          [
            process.env.TOWER_SWAP_EXECUTOR_ADDRESS,
            savedMainnetExecutor(),
            process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_MAINNET_ADDRESS,
          ],
          TESTNET_TOWER_SWAP_EXECUTOR,
        )
      : process.env.TOWER_SWAP_EXECUTOR_ADDRESS ||
        process.env.NEXT_PUBLIC_TOWER_SWAP_EXECUTOR_ADDRESS ||
        "";

  if (!ethers.isAddress(de1ExchangeAddress)) {
    throw new Error("DE1_EXCHANGE_ADDRESS must be a valid address.");
  }

  const de1ExchangeCode = await ethers.provider.getCode(de1ExchangeAddress);
  if (!de1ExchangeCode || de1ExchangeCode === "0x") {
    throw new Error(
      `De1 exchange has no contract code at ${de1ExchangeAddress}.`,
    );
  }

  console.log("Deploying De1Adapter");
  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("De1 exchange:", de1ExchangeAddress);
  if (executorAddress) {
    console.log("Executor for allowlisting:", executorAddress);
  }

  await assertWritableRpc({
    ethers,
    network,
    expectedChainId: network.config.chainId,
  });

  const De1Adapter = await ethers.getContractFactory(DE1_ADAPTER_CONTRACT);
  const adapter = await De1Adapter.deploy(de1ExchangeAddress);
  await adapter.waitForDeployment();

  const adapterAddress = await adapter.getAddress();
  console.log("De1Adapter deployed:", adapterAddress);

  await maybeAllowlistAdapter(executorAddress, adapterAddress);

  const deployment = {
    contract: "De1Adapter",
    network: network.name,
    chainId: network.config.chainId,
    adapter: adapterAddress,
    de1Exchange: de1ExchangeAddress,
    executor: executorAddress || null,
    owner: deployer.address,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    blockExplorerUrl:
      network.name === "arc-mainnet"
        ? `https://explorer.arc.io/address/${adapterAddress}`
        : network.name === "arc-testnet"
          ? `https://testnet.arcscan.app/address/${adapterAddress}`
          : null,
  };
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const deploymentFile = path.join(
    deploymentsDir,
    `de1-adapter-${network.name}-deployment.json`,
  );
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log("Deployment info saved to:", deploymentFile);

  if (process.env.DE1_ADAPTER_VERIFY !== "false") {
    console.log("Waiting briefly before verification...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const verificationStatus = await verifyContract(adapterAddress, [
      de1ExchangeAddress,
    ]);
    fs.writeFileSync(
      deploymentFile,
      JSON.stringify({ ...deployment, verificationStatus }, null, 2),
    );
  }

  console.log("\nSet this in the frontend environment:");
  if (network.name === "arc-mainnet") {
    console.log(`NEXT_PUBLIC_DE1_ADAPTER_MAINNET_ADDRESS=${adapterAddress}`);
  } else {
    console.log(`NEXT_PUBLIC_DE1_ADAPTER_ADDRESS=${adapterAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
