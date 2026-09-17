let ethers;
try {
  ({ ethers } = require("ethers"));
} catch (error) {
  ({ ethers } = require("../../contracts/node_modules/ethers"));
}

try {
  require("dotenv").config();
} catch (error) {
  require("../../contracts/node_modules/dotenv").config();
}

const DEFAULT_RPC_URL = "https://rpc.testnet.arc.network";
const DEFAULT_DEADLINE_MINUTES = 20;
const MAINNET_FACTORY = "0x49Aa1C63EA4E126a88E27A2A7673e6d31D954A3C";

const TESTNET_TOKENS = {
  USDC: {
    address: "0x3600000000000000000000000000000000000000",
    decimals: 6,
  },
  EURC: {
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    decimals: 6,
  },
  USDT: {
    address: "0x175CdB1D338945f0D851A741ccF787D343E57952",
    decimals: 18,
  },
  CIRBTC: {
    address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
    decimals: 8,
  },
  CNGN: {
    address: "0x9a9c18A371d98200FE910f62c45875f1abb68d20",
    decimals: 6,
  },
  QCAD: {
    address: "0x23d7CFFd0876f3ABb6B074287ba2aeefBc83825d",
    decimals: 6,
  },
};

const MAINNET_TOKENS = {
  USDC: {
    address: "0x3600000000000000000000000000000000000000",
    decimals: 6,
  },
  EURC: {
    address: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    decimals: 6,
  },
  CIRBTC: {
    address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
    decimals: 8,
  },
};

function rpcUrl() {
  return (
    process.env.ARC_RPC_URL ||
    process.env.ARC_MAINNET_RPC_URL ||
    process.env.ARC_TESTNET_RPC_URL ||
    DEFAULT_RPC_URL
  );
}

function useMainnetTokens() {
  const network = String(
    process.env.HARDHAT_NETWORK || process.env.ARC_NETWORK || "",
  ).toLowerCase();
  if (network.includes("mainnet")) {
    return true;
  }
  if (/mainnet\.arc\.io/i.test(rpcUrl())) {
    return true;
  }
  const factory = String(process.env.TOWER_FACTORY_ADDRESS || "").toLowerCase();
  return factory === MAINNET_FACTORY.toLowerCase();
}

function tokenCatalog() {
  const defaults = useMainnetTokens() ? MAINNET_TOKENS : TESTNET_TOKENS;
  return {
    USDC: {
      address: process.env.USDC_ADDRESS || defaults.USDC.address,
      decimals: 6,
    },
    EURC: {
      address: process.env.EURC_ADDRESS || defaults.EURC.address,
      decimals: 6,
    },
    ...(defaults.USDT
      ? {
          USDT: {
            address: process.env.USDT_ADDRESS || defaults.USDT.address,
            decimals: 18,
          },
        }
      : process.env.USDT_ADDRESS
        ? {
            USDT: {
              address: process.env.USDT_ADDRESS,
              decimals: 18,
            },
          }
        : {}),
    CIRBTC: {
      address: process.env.CIRBTC_ADDRESS || defaults.CIRBTC.address,
      decimals: 8,
    },
    ...(defaults.CNGN
      ? {
          CNGN: {
            address: process.env.CNGN_ADDRESS || defaults.CNGN.address,
            decimals: 6,
          },
        }
      : {}),
    ...(defaults.QCAD
      ? {
          QCAD: {
            address: process.env.QCAD_ADDRESS || defaults.QCAD.address,
            decimals: 6,
          },
        }
      : {}),
  };
}

const FACTORY_ABI = [
  "function createPair(address tokenA, address tokenB) external returns (address pair)",
  "function setFeeTo(address _feeTo) external",
  "function setFeeToSetter(address _feeToSetter) external",
  "function setSupportedToken(address token, bool allowed) external",
  "function batchSetSupportedTokens(address[] calldata tokens, bool allowed) external",
  "function setPairAllowed(address tokenA, address tokenB, bool allowed) external",
  "function batchSetPairAllowed(address[] calldata tokenAs, address[] calldata tokenBs, bool allowed) external",
  "function setEnforcePairAllowlist(bool enabled) external",
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

const ROUTER_ABI = [
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

const PAIR_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)"
];

function printHelp() {
  console.log(`
Tower AMM direct write script

Usage:
  node scripts/write.cjs <factory|router> <action> [...args] [--flag value]

Required env:
  PRIVATE_KEY
  TOWER_FACTORY_ADDRESS
  TOWER_ROUTER_ADDRESS

Factory actions:
  factory create-pair <tokenA> <tokenB>
  factory set-supported <token> <true|false>
  factory batch-set-supported <token1,token2,...> <true|false>
  factory set-pair-allowed <tokenA> <tokenB> <true|false>
  factory batch-set-pair-allowed <tokenA/tokenB,tokenC/tokenD,...> <true|false>
  factory set-enforce <true|false>
  factory set-fee-to <address>
  factory set-fee-to-setter <address>

Router actions:
  router approve-token <token> <amount> [--spender <address>] [--max]
  router approve-lp <tokenA> <tokenB> <amount> [--spender <address>] [--max]
  router add-liquidity <tokenA> <tokenB> <amountA> <amountB> <amountAMin> <amountBMin> [--to <address>] [--deadline-minutes <n>]
  router remove-liquidity <tokenA> <tokenB> <liquidity> <amountAMin> <amountBMin> [--to <address>] [--deadline-minutes <n>]
  router swap-exact <path> <amountIn> <amountOutMin> [--to <address>] [--deadline-minutes <n>]
  router swap-for-exact <path> <amountOut> <amountInMax> [--to <address>] [--deadline-minutes <n>]

Examples:
  node scripts/write.cjs factory set-supported USDT true
  node scripts/write.cjs factory set-pair-allowed USDT CIRBTC true
  node scripts/write.cjs router approve-token USDT 1000
  node scripts/write.cjs router add-liquidity USDC USDT 100 100 99 99
  node scripts/write.cjs router swap-exact USDC,EURC 50 49
`);
}

function parseFlags(flagArgs) {
  const flags = {};
  for (let i = 0; i < flagArgs.length; i++) {
    const current = flagArgs[i];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = flagArgs[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    i += 1;
  }
  return flags;
}

function normalizeBoolean(value) {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function resolveToken(rawToken) {
  const normalized = String(rawToken).trim();
  const upper = normalized.toUpperCase();
  const tokens = tokenCatalog();
  const token = tokens[upper] || (upper === "CIRBTC" ? tokens.CIRBTC : null);

  if (token) {
    return {
      symbol: upper === "CIRBTC" ? "CIRBTC" : upper,
      address: token.address,
      decimals: token.decimals,
    };
  }

  if (ethers.isAddress(normalized)) {
    return {
      symbol: normalized,
      address: normalized,
      decimals: 18,
    };
  }

  throw new Error(`Unknown token: ${rawToken}`);
}

function parseAmount(amount, decimals) {
  return ethers.parseUnits(String(amount), decimals);
}

function parseDeadline(flags) {
  const minutes = flags["deadline-minutes"]
    ? Number(flags["deadline-minutes"])
    : DEFAULT_DEADLINE_MINUTES;

  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`Invalid deadline minutes: ${flags["deadline-minutes"]}`);
  }

  return Math.floor(Date.now() / 1000) + minutes * 60;
}

function txOverrides() {
  const overrides = {};
  if (process.env.GAS_LIMIT) {
    overrides.gasLimit = BigInt(process.env.GAS_LIMIT);
  }
  return overrides;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePath(rawPath) {
  return String(rawPath)
    .split(",")
    .map((entry) => resolveToken(entry));
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientRpcError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();

  return (
    code.includes("SSL") ||
    code.includes("NETWORK") ||
    code.includes("TIMEOUT") ||
    code.includes("SERVER_ERROR") ||
    code.includes("ECONNRESET") ||
    code.includes("ETIMEDOUT") ||
    message.includes("ssl") ||
    message.includes("bad record mac") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("network") ||
    message.includes("timeout")
  );
}

async function waitForReceipt(provider, txHash, label, attempts = 8) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        if (receipt.status !== 1) {
          throw new Error(`${label} reverted in block ${receipt.blockNumber}`);
        }
        console.log(`${label} confirmed in block ${receipt.blockNumber}`);
        return receipt;
      }
    } catch (error) {
      lastError = error;
      if (!isTransientRpcError(error) || attempt === attempts) {
        throw error;
      }
      console.warn(
        `${label} receipt check failed (attempt ${attempt}/${attempts}): ${error.code || error.message}`,
      );
    }

    await sleep(1500 * attempt);
  }

  throw lastError || new Error(`${label} receipt not found for ${txHash}`);
}

async function submitAndWait(txPromise, label) {
  const tx = await txPromise;
  console.log(`${label} submitted: ${tx.hash}`);

  try {
    const receipt = await tx.wait();
    console.log(`${label} confirmed in block ${receipt.blockNumber}`);
    return receipt;
  } catch (error) {
    if (!isTransientRpcError(error)) {
      throw error;
    }

    console.warn(
      `${label} wait interrupted by RPC error (${error.code || error.message}); retrying receipt lookup...`,
    );
    return waitForReceipt(tx.provider, tx.hash, label);
  }
}

async function getContext() {
  const provider = new ethers.JsonRpcProvider(rpcUrl());
  const signer = new ethers.Wallet(requireEnv("PRIVATE_KEY"), provider);
  const factoryAddress = requireEnv("TOWER_FACTORY_ADDRESS");
  const routerAddress = requireEnv("TOWER_ROUTER_ADDRESS");

  return {
    signer,
    factoryAddress,
    routerAddress,
    factory: new ethers.Contract(factoryAddress, FACTORY_ABI, signer),
    router: new ethers.Contract(routerAddress, ROUTER_ABI, signer),
  };
}

async function getPairAddress(factory, tokenA, tokenB) {
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
  if (pairAddress === ethers.ZeroAddress) {
    throw new Error(`Pair not found for ${tokenA.symbol}/${tokenB.symbol}`);
  }
  return pairAddress;
}

async function handleFactory(action, args, context) {
  switch (action) {
    case "create-pair": {
      const tokenA = resolveToken(args[0]);
      const tokenB = resolveToken(args[1]);
      await submitAndWait(
        context.factory.createPair(tokenA.address, tokenB.address, txOverrides()),
        `createPair ${tokenA.symbol}/${tokenB.symbol}`,
      );
      const pairAddress = await context.factory.getPair(tokenA.address, tokenB.address);
      console.log(`Pair address: ${pairAddress}`);
      return;
    }
    case "set-supported": {
      const token = resolveToken(args[0]);
      const allowed = normalizeBoolean(args[1]);
      await submitAndWait(
        context.factory.setSupportedToken(token.address, allowed, txOverrides()),
        `setSupportedToken ${token.symbol}=${allowed}`,
      );
      return;
    }
    case "batch-set-supported": {
      const tokens = String(args[0]).split(",").map((entry) => resolveToken(entry).address);
      const allowed = normalizeBoolean(args[1]);
      await submitAndWait(
        context.factory.batchSetSupportedTokens(tokens, allowed, txOverrides()),
        `batchSetSupportedTokens allowed=${allowed}`,
      );
      return;
    }
    case "set-pair-allowed": {
      const tokenA = resolveToken(args[0]);
      const tokenB = resolveToken(args[1]);
      const allowed = normalizeBoolean(args[2]);
      await submitAndWait(
        context.factory.setPairAllowed(tokenA.address, tokenB.address, allowed, txOverrides()),
        `setPairAllowed ${tokenA.symbol}/${tokenB.symbol}=${allowed}`,
      );
      return;
    }
    case "batch-set-pair-allowed": {
      const pairEntries = String(args[0]).split(",").map((entry) => entry.trim()).filter(Boolean);
      const tokenAs = [];
      const tokenBs = [];
      for (const pairEntry of pairEntries) {
        const [rawA, rawB] = pairEntry.split("/");
        const tokenA = resolveToken(rawA);
        const tokenB = resolveToken(rawB);
        tokenAs.push(tokenA.address);
        tokenBs.push(tokenB.address);
      }
      const allowed = normalizeBoolean(args[1]);
      await submitAndWait(
        context.factory.batchSetPairAllowed(tokenAs, tokenBs, allowed, txOverrides()),
        `batchSetPairAllowed allowed=${allowed}`,
      );
      return;
    }
    case "set-enforce": {
      const enabled = normalizeBoolean(args[0]);
      await submitAndWait(
        context.factory.setEnforcePairAllowlist(enabled, txOverrides()),
        `setEnforcePairAllowlist ${enabled}`,
      );
      return;
    }
    case "set-fee-to": {
      const feeTo = args[0];
      if (!ethers.isAddress(feeTo)) {
        throw new Error(`Invalid address: ${feeTo}`);
      }
      await submitAndWait(
        context.factory.setFeeTo(feeTo, txOverrides()),
        `setFeeTo ${feeTo}`,
      );
      return;
    }
    case "set-fee-to-setter": {
      const feeToSetter = args[0];
      if (!ethers.isAddress(feeToSetter)) {
        throw new Error(`Invalid address: ${feeToSetter}`);
      }
      await submitAndWait(
        context.factory.setFeeToSetter(feeToSetter, txOverrides()),
        `setFeeToSetter ${feeToSetter}`,
      );
      return;
    }
    default:
      throw new Error(`Unknown factory action: ${action}`);
  }
}

async function handleRouter(action, args, flags, context) {
  switch (action) {
    case "approve-token": {
      const token = resolveToken(args[0]);
      const spender = flags.spender || context.routerAddress;
      if (!ethers.isAddress(spender)) {
        throw new Error(`Invalid spender address: ${spender}`);
      }
      const amount = flags.max ? ethers.MaxUint256 : parseAmount(args[1], token.decimals);
      const erc20 = new ethers.Contract(token.address, ERC20_ABI, context.signer);
      await submitAndWait(
        erc20.approve(spender, amount, txOverrides()),
        `approve ${token.symbol}`,
      );
      return;
    }
    case "approve-lp": {
      const tokenA = resolveToken(args[0]);
      const tokenB = resolveToken(args[1]);
      const spender = flags.spender || context.routerAddress;
      if (!ethers.isAddress(spender)) {
        throw new Error(`Invalid spender address: ${spender}`);
      }
      const pairAddress = await getPairAddress(context.factory, tokenA, tokenB);
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, context.signer);
      const amount = flags.max ? ethers.MaxUint256 : parseAmount(args[2], 18);
      await submitAndWait(
        pair.approve(spender, amount, txOverrides()),
        `approve LP ${tokenA.symbol}/${tokenB.symbol}`,
      );
      return;
    }
    case "add-liquidity": {
      const tokenA = resolveToken(args[0]);
      const tokenB = resolveToken(args[1]);
      const to = flags.to || context.signer.address;
      const deadline = parseDeadline(flags);
      await submitAndWait(
        context.router.addLiquidity(
          tokenA.address,
          tokenB.address,
          parseAmount(args[2], tokenA.decimals),
          parseAmount(args[3], tokenB.decimals),
          parseAmount(args[4], tokenA.decimals),
          parseAmount(args[5], tokenB.decimals),
          to,
          deadline,
          txOverrides(),
        ),
        `addLiquidity ${tokenA.symbol}/${tokenB.symbol}`,
      );
      return;
    }
    case "remove-liquidity": {
      const tokenA = resolveToken(args[0]);
      const tokenB = resolveToken(args[1]);
      const to = flags.to || context.signer.address;
      const deadline = parseDeadline(flags);
      await submitAndWait(
        context.router.removeLiquidity(
          tokenA.address,
          tokenB.address,
          parseAmount(args[2], 18),
          parseAmount(args[3], tokenA.decimals),
          parseAmount(args[4], tokenB.decimals),
          to,
          deadline,
          txOverrides(),
        ),
        `removeLiquidity ${tokenA.symbol}/${tokenB.symbol}`,
      );
      return;
    }
    case "swap-exact": {
      const tokens = parsePath(args[0]);
      const path = tokens.map((token) => token.address);
      const to = flags.to || context.signer.address;
      const deadline = parseDeadline(flags);
      await submitAndWait(
        context.router.swapExactTokensForTokens(
          parseAmount(args[1], tokens[0].decimals),
          parseAmount(args[2], tokens[tokens.length - 1].decimals),
          path,
          to,
          deadline,
          txOverrides(),
        ),
        `swapExact ${tokens.map((token) => token.symbol).join("->")}`,
      );
      return;
    }
    case "swap-for-exact": {
      const tokens = parsePath(args[0]);
      const path = tokens.map((token) => token.address);
      const to = flags.to || context.signer.address;
      const deadline = parseDeadline(flags);
      await submitAndWait(
        context.router.swapTokensForExactTokens(
          parseAmount(args[1], tokens[tokens.length - 1].decimals),
          parseAmount(args[2], tokens[0].decimals),
          path,
          to,
          deadline,
          txOverrides(),
        ),
        `swapForExact ${tokens.map((token) => token.symbol).join("->")}`,
      );
      return;
    }
    default:
      throw new Error(`Unknown router action: ${action}`);
  }
}

async function main() {
  const [, , scope, action, ...rest] = process.argv;
  if (!scope || scope === "help" || scope === "--help") {
    printHelp();
    return;
  }

  const firstFlagIndex = rest.findIndex((entry) => entry.startsWith("--"));
  const args = firstFlagIndex === -1 ? rest : rest.slice(0, firstFlagIndex);
  const flags = parseFlags(firstFlagIndex === -1 ? [] : rest.slice(firstFlagIndex));
  const context = await getContext();

  console.log(`Using signer: ${context.signer.address}`);
  console.log(`Factory: ${context.factoryAddress}`);
  console.log(`Router:  ${context.routerAddress}`);

  if (scope === "factory") {
    await handleFactory(action, args, context);
    return;
  }

  if (scope === "router") {
    await handleRouter(action, args, flags, context);
    return;
  }

  throw new Error(`Unknown scope: ${scope}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
