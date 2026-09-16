try {
  require("@nomicfoundation/hardhat-toolbox");
} catch (error) {
  require("../contracts/node_modules/@nomicfoundation/hardhat-toolbox");
}

try {
  require("dotenv/config");
} catch (error) {
  require("../contracts/node_modules/dotenv/config");
}

try {
  const { HttpProvider } = require("hardhat/internal/core/providers/http");
  require("../contracts/scripts/lib/patchArcscanRpc.cjs").patchArcscanRpcProvider(
    HttpProvider,
  );
} catch (error) {
  console.warn(
    "[arc-rpc] retry patch not applied:",
    error instanceof Error ? error.message : String(error),
  );
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    "arc-testnet": {
      url: process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 5042002,
      timeout: 60000,
    },
    "arc-mainnet": {
      url: process.env.ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 5042,
      timeout: 180000,
    },
    hardhat: {},
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  etherscan: {
    apiKey: {
      "arc-testnet": process.env.ARCSCAN_API_KEY || "empty",
      "arc-mainnet": process.env.ARCSCAN_API_KEY || "empty",
    },
    customChains: [
      {
        network: "arc-testnet",
        chainId: 5042002,
        urls: {
          apiURL: "https://testnet.arcscan.app/api",
          browserURL: "https://testnet.arcscan.app",
        },
      },
      {
        network: "arc-mainnet",
        chainId: 5042,
        urls: {
          apiURL: "https://api.arc-scan.org/api",
          browserURL: "https://arc-scan.org",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};
