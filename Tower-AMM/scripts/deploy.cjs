const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers, network } = hre;
const { assertWritableRpc } = require("../../contracts/scripts/lib/assertWritableRpc.cjs");
const { sendAndWait } = require("../../contracts/scripts/lib/waitForTx.cjs");
const { verifyContractWithRetry } = require("../../contracts/scripts/lib/verifyOnArcscan.cjs");
const { MAINNET_TREASURY } = require("../../contracts/scripts/lib/mainnetAddresses.cjs");

const ARC_USDC = "0x3600000000000000000000000000000000000000";

const TESTNET_TOKENS = {
  USDC: ARC_USDC,
  EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  USDT: "0x175CdB1D338945f0D851A741ccF787D343E57952",
  CIRBTC: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
  CNGN: "0x9a9c18A371d98200FE910f62c45875f1abb68d20",
  QCAD: "0x23d7CFFd0876f3ABb6B074287ba2aeefBc83825d",
};

const TESTNET_ONLY_TOKEN_ADDRESSES = new Set(
  ["EURC", "USDT", "CIRBTC", "CNGN", "QCAD"].map((symbol) =>
    TESTNET_TOKENS[symbol].toLowerCase(),
  ),
);

const TESTNET_FACTORY = "0x9DE50a654531CD72533098a9c2De4239c121821D";
const TESTNET_ROUTER = "0xDf115b4f2F22B9255B2E63348423B6C5B379Bce2";

const TOKEN_ENV_KEYS = {
  USDC: "USDC_ADDRESS",
  EURC: "EURC_ADDRESS",
  USDT: "USDT_ADDRESS",
  CIRBTC: "CIRBTC_ADDRESS",
  CNGN: "CNGN_ADDRESS",
  QCAD: "QCAD_ADDRESS",
};

function parseBoolean(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

function defaultPairs() {
  if (network.name === "arc-mainnet") {
    return [];
  }

  return [
    ["USDC", "EURC"],
    ["USDC", "CIRBTC"],
    ["EURC", "CIRBTC"],
    ["USDC", "USDT"],
    ["EURC", "USDT"],
    ["USDT", "CIRBTC"],
    ["USDC", "CNGN"],
    ["USDT", "CNGN"],
    ["EURC", "CNGN"],
    ["CIRBTC", "CNGN"],
    ["USDC", "QCAD"],
    ["USDT", "QCAD"],
    ["EURC", "QCAD"],
    ["CIRBTC", "QCAD"],
    ["CNGN", "QCAD"],
  ];
}

function parseAllowedPairs(rawPairs) {
  if (!rawPairs) {
    return defaultPairs();
  }

  return rawPairs
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [base, quote] = entry.split("/").map((symbol) => symbol.trim().toUpperCase());
      if (!base || !quote) {
        throw new Error(`Invalid pair definition: ${entry}`);
      }
      return [base, quote];
    });
}

function isUsableTokenAddress(address) {
  return Boolean(address) && address !== ethers.ZeroAddress && ethers.isAddress(address);
}

function resolveTokenAddress(symbol) {
  const envName = TOKEN_ENV_KEYS[symbol];
  const fromEnv = process.env[envName];

  if (fromEnv) {
    if (!ethers.isAddress(fromEnv)) {
      throw new Error(`${envName} must be a valid address. Received: ${fromEnv}`);
    }
    if (
      network.name === "arc-mainnet" &&
      TESTNET_ONLY_TOKEN_ADDRESSES.has(fromEnv.toLowerCase())
    ) {
      console.warn(
        `Ignoring ${envName}=${fromEnv} on arc-mainnet. That is the testnet ${symbol} token.`,
      );
      return "";
    }
    return fromEnv;
  }

  if (network.name === "arc-mainnet") {
    return symbol === "USDC" ? ARC_USDC : "";
  }

  return TESTNET_TOKENS[symbol] || "";
}

function buildTokenMap() {
  const tokenMap = {};
  for (const symbol of Object.keys(TOKEN_ENV_KEYS)) {
    const address = resolveTokenAddress(symbol);
    if (isUsableTokenAddress(address)) {
      tokenMap[symbol] = address;
    }
  }
  return tokenMap;
}

function sameAddress(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function deploymentFilePath() {
  return path.join(__dirname, "..", "deployments", `${network.name}.json`);
}

function readSavedDeployment() {
  const file = deploymentFilePath();
  if (!fs.existsSync(file)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.warn(
      `Could not read ${file}:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

function saveDeployment(deployment) {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = deploymentFilePath();
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  return deploymentFile;
}

async function requireContract(address, label) {
  if (!ethers.isAddress(address)) {
    throw new Error(`${label} is not a valid address: ${address}`);
  }

  const code = await ethers.provider.getCode(address);
  if (!code || code === "0x") {
    throw new Error(`${label} ${address} has no contract code on ${network.name}.`);
  }

  return ethers.getAddress(address);
}

function refuseTestnetAddress(label, address) {
  if (
    network.name === "arc-mainnet" &&
    (sameAddress(address, TESTNET_FACTORY) || sameAddress(address, TESTNET_ROUTER))
  ) {
    throw new Error(
      `${label} ${address} is the Arc testnet Tower AMM contract. Pass the mainnet factory/router or reuse deployments/arc-mainnet.json.`,
    );
  }
}

function resolveTreasuryAddress(deployerAddress) {
  const fromEnv = process.env.TOWER_TREASURY_ADDRESS;
  if (network.name !== "arc-mainnet") {
    return fromEnv || "";
  }

  if (
    fromEnv &&
    ethers.isAddress(fromEnv) &&
    fromEnv !== ethers.ZeroAddress &&
    !sameAddress(fromEnv, deployerAddress) &&
    !sameAddress(fromEnv, "0x6396DfE7949c785Ab8b3e4634d0c9aB97d700a4B")
  ) {
    return fromEnv;
  }

  return MAINNET_TREASURY;
}

async function revokeTestnetTokensOnMainnet(factory) {
  if (network.name !== "arc-mainnet") {
    return;
  }

  const misplaced = ["EURC", "USDT", "CIRBTC", "CNGN", "QCAD"].map((symbol) => ({
    symbol,
    address: TESTNET_TOKENS[symbol],
  }));

  const stillSupported = [];
  for (const token of misplaced) {
    if (await factory.supportedToken(token.address)) {
      stillSupported.push(token);
    }
  }

  if (stillSupported.length > 0) {
    console.log(
      "Removing testnet token addresses from the mainnet factory:",
      stillSupported.map((token) => token.symbol).join(", "),
    );
    await sendAndWait(
      factory.batchSetSupportedTokens(
        stillSupported.map((token) => token.address),
        false,
      ),
      "revoke testnet supported tokens",
      ethers.provider,
    );
  }

  const tokenAs = [];
  const tokenBs = [];
  const usdcAndMisplaced = [{ symbol: "USDC", address: ARC_USDC }, ...misplaced];
  for (let i = 0; i < usdcAndMisplaced.length; i += 1) {
    for (let j = i + 1; j < usdcAndMisplaced.length; j += 1) {
      const tokenA = usdcAndMisplaced[i];
      const tokenB = usdcAndMisplaced[j];
      if (await factory.pairAllowed(tokenA.address, tokenB.address)) {
        tokenAs.push(tokenA.address);
        tokenBs.push(tokenB.address);
        console.log(`Disallowing testnet pair ${tokenA.symbol}/${tokenB.symbol}`);
      }
    }
  }

  if (tokenAs.length > 0) {
    await sendAndWait(
      factory.batchSetPairAllowed(tokenAs, tokenBs, false),
      "revoke testnet pair allowlist",
      ethers.provider,
    );
  }

  for (const token of misplaced) {
    const strayPair = await factory.getPair(ARC_USDC, token.address);
    if (strayPair && strayPair !== ethers.ZeroAddress) {
      console.warn(
        `Pair ${strayPair} still exists for USDC/${token.symbol} (testnet token). It is disallowed; Uniswap-style pairs cannot be destroyed.`,
      );
    }
  }
}

async function verifyAmmContract(address, constructorArguments, contract, label) {
  return verifyContractWithRetry(hre, {
    address,
    constructorArguments,
    contract,
    label,
    license: "GPL-3.0",
  });
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Tower AMM from:", deployer.address);
  await assertWritableRpc({
    ethers,
    network,
    expectedChainId: network.config.chainId,
  });

  const skipTokenSetup = parseBoolean(process.env.SKIP_TOKEN_SETUP, false);
  const forceRedeploy = parseBoolean(process.env.FORCE_REDEPLOY, false);
  const saved = readSavedDeployment();
  const createdPairs = Array.isArray(saved?.pairs) ? [...saved.pairs] : [];
  const treasury = resolveTreasuryAddress(deployer.address);

  if (
    network.name === "arc-mainnet" &&
    saved?.factory &&
    process.env.TOWER_FACTORY_ADDRESS &&
    !sameAddress(saved.factory, process.env.TOWER_FACTORY_ADDRESS)
  ) {
    console.warn(
      `Ignoring TOWER_FACTORY_ADDRESS=${process.env.TOWER_FACTORY_ADDRESS}; using saved ${saved.factory}`,
    );
  }

  const requestedFactory =
    (!forceRedeploy && saved?.factory) || process.env.TOWER_FACTORY_ADDRESS || "";
  const requestedRouter =
    (!forceRedeploy && saved?.router) || process.env.TOWER_ROUTER_ADDRESS || "";

  let factory;
  let factoryAddress;
  let reusedFactory = false;

  if (requestedFactory && !forceRedeploy) {
    refuseTestnetAddress("TOWER_FACTORY_ADDRESS", requestedFactory);
    factoryAddress = await requireContract(requestedFactory, "Factory");
    factory = await ethers.getContractAt("TowerFactory", factoryAddress);
    reusedFactory = true;
    console.log("Reusing factory:", factoryAddress);
  } else {
    if (network.name === "arc-mainnet" && saved?.factory && !forceRedeploy) {
      throw new Error(
        `Refusing to deploy a second mainnet factory. Reuse ${saved.factory} or set FORCE_REDEPLOY=true.`,
      );
    }

    const TowerFactory = await ethers.getContractFactory("TowerFactory");
    factory = await TowerFactory.deploy(deployer.address);
    await factory.waitForDeployment();
    factoryAddress = await factory.getAddress();
    console.log("Factory:", factoryAddress);
  }

  let router;
  let routerAddress;
  let reusedRouter = false;

  if (requestedRouter && !forceRedeploy) {
    refuseTestnetAddress("TOWER_ROUTER_ADDRESS", requestedRouter);
    routerAddress = await requireContract(requestedRouter, "Router");
    router = await ethers.getContractAt("TowerRouter", routerAddress);
    reusedRouter = true;
    console.log("Reusing router:", routerAddress);
  } else {
    const TowerRouter = await ethers.getContractFactory("TowerRouter");
    router = await TowerRouter.deploy(factoryAddress);
    await router.waitForDeployment();
    routerAddress = await router.getAddress();
    console.log("Router:", routerAddress);
  }

  const tokenMap = buildTokenMap();
  const allowedPairs = skipTokenSetup
    ? []
    : parseAllowedPairs(process.env.TOWER_ALLOWED_PAIRS).filter(
        ([baseSymbol, quoteSymbol]) => tokenMap[baseSymbol] && tokenMap[quoteSymbol],
      );

  const snapshot = () => ({
    network: network.name,
    chainId: network.config.chainId,
    factory: factoryAddress,
    router: routerAddress,
    reusedFactory,
    reusedRouter,
    feeTo: treasury || saved?.feeTo || ethers.ZeroAddress,
    feeToSetter: process.env.TOWER_FINAL_FEE_TO_SETTER || saved?.feeToSetter || deployer.address,
    skipTokenSetup,
    tokens: skipTokenSetup ? {} : tokenMap,
    pairs: createdPairs,
    incomplete: true,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  });

  saveDeployment(snapshot());
  console.log("Saved factory/router before pair setup:", deploymentFilePath());

  const shouldVerify = parseBoolean(process.env.VERIFY_CONTRACTS, network.name !== "hardhat");
  if (shouldVerify && network.name !== "hardhat") {
    console.log("\nVerifying factory and router on explorer...");
    await verifyAmmContract(
      factoryAddress,
      [deployer.address],
      "contracts/core/TowerFactory.sol:TowerFactory",
      "TowerFactory",
    );
    await verifyAmmContract(
      routerAddress,
      [factoryAddress],
      "contracts/periphery/TowerRouter.sol:TowerRouter",
      "TowerRouter",
    );
  }

  await revokeTestnetTokensOnMainnet(factory);

  if (skipTokenSetup) {
    console.log("Skipping token/pair registration (SKIP_TOKEN_SETUP=true)");
  } else {
    const supportedSymbols = Object.keys(tokenMap).filter(
      (symbol) => tokenMap[symbol] && tokenMap[symbol] !== ethers.ZeroAddress,
    );
    const missingTokens = [];

    for (const symbol of supportedSymbols) {
      const alreadySupported = await factory.supportedToken(tokenMap[symbol]);
      if (alreadySupported) {
        console.log(`Token already supported: ${symbol}`);
      } else {
        missingTokens.push(tokenMap[symbol]);
      }
    }

    if (missingTokens.length > 0) {
      console.log("Registering supported tokens:", supportedSymbols.join(", "));
      await sendAndWait(
        factory.batchSetSupportedTokens(missingTokens, true),
        "batchSetSupportedTokens",
        ethers.provider,
      );
    }

    for (const [baseSymbol, quoteSymbol] of allowedPairs) {
      const base = tokenMap[baseSymbol];
      const quote = tokenMap[quoteSymbol];

      if (!base || !quote) {
        throw new Error(`Missing token address for allowed pair ${baseSymbol}/${quoteSymbol}`);
      }

      const alreadyAllowed = await factory.pairAllowed(base, quote);
      if (alreadyAllowed) {
        console.log(`Allowed pair already set: ${baseSymbol}/${quoteSymbol}`);
        continue;
      }

      await sendAndWait(
        factory.setPairAllowed(base, quote, true),
        `setPairAllowed ${baseSymbol}/${quoteSymbol}`,
        ethers.provider,
      );
      console.log(`Allowed pair: ${baseSymbol}/${quoteSymbol}`);
    }
  }

  const enforceAllowlist = parseBoolean(process.env.TOWER_ENFORCE_PAIR_ALLOWLIST, true);
  const currentEnforce = await factory.enforcePairAllowlist();
  if (Boolean(currentEnforce) === enforceAllowlist) {
    console.log("Pair allowlist enforcement already set:", enforceAllowlist);
  } else {
    await sendAndWait(
      factory.setEnforcePairAllowlist(enforceAllowlist),
      "setEnforcePairAllowlist",
      ethers.provider,
    );
    console.log("Pair allowlist enforcement:", enforceAllowlist);
  }

  if (treasury && treasury !== ethers.ZeroAddress) {
    const currentFeeTo = await factory.feeTo();
    if (sameAddress(currentFeeTo, treasury)) {
      console.log("Treasury fee recipient already set:", treasury);
    } else {
      await sendAndWait(factory.setFeeTo(treasury), "setFeeTo", ethers.provider);
      console.log("Treasury fee recipient:", treasury);
    }
  } else {
    console.log("Treasury fee recipient: disabled");
  }

  saveDeployment(snapshot());

  const createInitialPairs = parseBoolean(process.env.CREATE_INITIAL_PAIRS, true);
  if (!skipTokenSetup && createInitialPairs && allowedPairs.length > 0) {
    console.log("Creating initial pairs...");
    for (const [baseSymbol, quoteSymbol] of allowedPairs) {
      const base = tokenMap[baseSymbol];
      const quote = tokenMap[quoteSymbol];
      const [baseCode, quoteCode] = await Promise.all([
        ethers.provider.getCode(base),
        ethers.provider.getCode(quote),
      ]);

      if (!baseCode || baseCode === "0x" || !quoteCode || quoteCode === "0x") {
        console.warn(
          `Skipping pair ${baseSymbol}/${quoteSymbol}: token has no bytecode on ${network.name}.`,
        );
        continue;
      }

      const pairAddress = await factory.getPair(base, quote);

      if (pairAddress !== ethers.ZeroAddress) {
        if (!createdPairs.some((pair) => sameAddress(pair.address, pairAddress))) {
          createdPairs.push({
            symbols: `${baseSymbol}/${quoteSymbol}`,
            address: pairAddress,
          });
        }
        console.log(`Pair ${baseSymbol}/${quoteSymbol} already exists:`, pairAddress);
        saveDeployment(snapshot());
        continue;
      }

      try {
        await sendAndWait(
          factory.createPair(base, quote),
          `createPair ${baseSymbol}/${quoteSymbol}`,
          ethers.provider,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/PAIR_EXISTS/i.test(message)) {
          saveDeployment(snapshot());
          throw error;
        }
        console.log(`Pair ${baseSymbol}/${quoteSymbol} already exists on-chain.`);
      }

      const createdPair = await factory.getPair(base, quote);
      if (createdPair !== ethers.ZeroAddress) {
        createdPairs.push({
          symbols: `${baseSymbol}/${quoteSymbol}`,
          address: createdPair,
        });
    console.log(`Pair ${baseSymbol}/${quoteSymbol}:`, createdPair);
      }
      saveDeployment(snapshot());
    }
  } else if (
    network.name === "arc-mainnet" &&
    !skipTokenSetup &&
    allowedPairs.length === 0
  ) {
    console.log(
      "No counterpart token addresses on Arc mainnet yet; skipping pair creation. USDC remains registered.",
    );
  }

  const finalFeeToSetter = process.env.TOWER_FINAL_FEE_TO_SETTER;
  if (
    finalFeeToSetter &&
    finalFeeToSetter !== ethers.ZeroAddress &&
    finalFeeToSetter.toLowerCase() !== deployer.address.toLowerCase()
  ) {
    await sendAndWait(
      factory.setFeeToSetter(finalFeeToSetter),
      "setFeeToSetter",
      ethers.provider,
    );
    console.log("Final feeToSetter:", finalFeeToSetter);
  }

  const deployment = {
    ...snapshot(),
    incomplete: false,
    timestamp: new Date().toISOString(),
  };
  const deploymentFile = saveDeployment(deployment);

  console.log("\nTower AMM deployment complete");
  console.log("----------------------------------------");
  console.log("Factory:", factoryAddress);
  console.log("Router: ", routerAddress);
  console.log("Tokens: ", skipTokenSetup ? "(skipped)" : tokenMap);
  console.log("Pairs:  ", createdPairs.map((pair) => pair.symbols).join(", ") || "(none)");
  console.log("Saved:  ", deploymentFile);

  if (shouldVerify && network.name !== "hardhat" && createdPairs.length > 0) {
    console.log("\nVerifying pairs on explorer...");
    for (const pair of createdPairs) {
      await verifyAmmContract(
        pair.address,
        [],
        "contracts/core/TowerPair.sol:TowerPair",
        `TowerPair ${pair.symbols}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
