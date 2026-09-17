const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AeroAdapter", function () {
  const feeBps = 30n;
  const bpsDenominator = 10000n;

  async function deployFixture() {
    const [owner, user, treasury, recipient] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenIn = await MockERC20.deploy("USD Coin", "USDC", 6);
    const tokenOut = await MockERC20.deploy("Euro Coin", "EURC", 6);

    const MockAeroSwapRouter = await ethers.getContractFactory("MockAeroSwapRouter");
    const router = await MockAeroSwapRouter.deploy(owner.address, ethers.ZeroAddress);

    const AeroAdapter = await ethers.getContractFactory("AeroAdapter");
    const adapter = await AeroAdapter.deploy(await router.getAddress());

    const TowerSwapExecutor = await ethers.getContractFactory("TowerSwapExecutor");
    const executor = await TowerSwapExecutor.deploy(
      treasury.address,
      owner.address,
      feeBps,
    );
    await executor.setRouteTarget(await adapter.getAddress(), true);
    await executor.setApprovalSpender(await adapter.getAddress(), true);

    return {
      owner,
      user,
      treasury,
      recipient,
      tokenIn,
      tokenOut,
      router,
      adapter,
      executor,
    };
  }

  it("pulls input from the caller and sends Aero output to the recipient", async function () {
    const { user, recipient, tokenIn, tokenOut, router, adapter } =
      await deployFixture();
    const amountIn = 500_000n;
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 600;

    await tokenIn.mint(user.address, amountIn);
    await tokenOut.mint(await router.getAddress(), amountIn * 10n);
    await tokenIn.connect(user).approve(await adapter.getAddress(), amountIn);

    await adapter
      .connect(user)
      .swapExactInputSingle(
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        1,
        amountIn,
        amountIn,
        recipient.address,
        deadline,
      );

    expect(await tokenOut.balanceOf(recipient.address)).to.equal(amountIn);
    expect(await tokenIn.balanceOf(await adapter.getAddress())).to.equal(0n);
    expect(await tokenOut.balanceOf(await adapter.getAddress())).to.equal(0n);
  });

  it("lets TowerSwapExecutor collect the platform fee and pay the user in one swap", async function () {
    const { user, treasury, tokenIn, tokenOut, router, adapter, executor } =
      await deployFixture();
    const amountIn = 1_000_000n;
    const swapAmountIn = amountIn - (amountIn * feeBps) / bpsDenominator;
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 600;

    await tokenIn.mint(user.address, amountIn);
    await tokenOut.mint(await router.getAddress(), amountIn * 10n);
    await tokenIn.connect(user).approve(await executor.getAddress(), amountIn);

    const routeCalldata = adapter.interface.encodeFunctionData(
      "swapExactInputSingle",
      [
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        1,
        swapAmountIn,
        swapAmountIn,
        await executor.getAddress(),
        deadline,
      ],
    );

    await executor.connect(user).executeSwap({
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      amountIn,
      minAmountOut: swapAmountIn,
      recipient: user.address,
      routeTarget: await adapter.getAddress(),
      approvalSpender: await adapter.getAddress(),
      routeCalldata,
    });

    expect(await tokenIn.balanceOf(treasury.address)).to.equal(
      (amountIn * feeBps) / bpsDenominator,
    );
    expect(await tokenOut.balanceOf(user.address)).to.equal(swapAmountIn);
    expect(await tokenIn.balanceOf(await executor.getAddress())).to.equal(0n);
    expect(await tokenOut.balanceOf(await executor.getAddress())).to.equal(0n);
  });
});
