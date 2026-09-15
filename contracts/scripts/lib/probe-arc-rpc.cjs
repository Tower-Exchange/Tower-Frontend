const { ethers, network } = require("hardhat");
const { rpcHost } = require("./assertWritableRpc.cjs");

async function main() {
  const host = rpcHost(network.config.url);
  console.log("Probing", host, "as", network.name);

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log("chainId", chainId);

  const blockNumber = await ethers.provider.getBlockNumber();
  console.log("blockNumber", blockNumber);

  const feeData = await ethers.provider.getFeeData();
  console.log("gasPrice", feeData.gasPrice?.toString() || "null");
  console.log(
    "maxFeePerGas",
    feeData.maxFeePerGas?.toString() || "null",
  );

  const [signer] = await ethers.getSigners();
  if (signer) {
    const nonce = await ethers.provider.getTransactionCount(signer.address);
    console.log("deployer", signer.address);
    console.log("nonce", nonce);
  }

  console.log("RPC preflight succeeded.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
