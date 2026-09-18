const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiFiAdapter", function () {
  const feeBps = 30n;
  const bpsDenominator = 10000n;

  async function deployFixture() {
    const [owner, user, treasury, recipient] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenIn = await MockERC20.deploy("USD Coin", "USDC", 6);
    const tokenOut = await MockERC20.deploy("Euro Coin", "EURC", 6);

    const MockSwapRouter = await ethers.getContractFactory("MockSwapRouter");
    const router = await MockSwapRouter.deploy();

    const LiFiAdapter = await ethers.getContractFactory("LiFiAdapter");
    const adapter = await LiFiAdapter.deploy(await router.getAddress(), ethers.ZeroAddress);

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

  it("pulls input from the caller and sends LI.FI output to the recipient", async function () {
    const { user, recipient, tokenIn, tokenOut, router, adapter } =
      await deployFixture();
    const amountIn = 500_000n;

    await tokenIn.mint(user.address, amountIn);
    await tokenOut.mint(await router.getAddress(), amountIn * 10n);
    await tokenIn.connect(user).approve(await adapter.getAddress(), amountIn);

    const routeCalldata = router.interface.encodeFunctionData("swapExactInput", [
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      amountIn,
      amountIn,
      recipient.address,
    ]);

    await adapter
      .connect(user)
      .swapExactInput(
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        amountIn,
        amountIn,
        recipient.address,
        await router.getAddress(),
        routeCalldata,
      );

    expect(await tokenOut.balanceOf(recipient.address)).to.equal(amountIn);
    expect(await tokenIn.balanceOf(await adapter.getAddress())).to.equal(0n);
    expect(await tokenOut.balanceOf(await adapter.getAddress())).to.equal(0n);
  });

  it("forwards leftover LI.FI output sitting on the adapter to the recipient", async function () {
    const { user, recipient, tokenIn, tokenOut, router, adapter } =
      await deployFixture();
    const amountIn = 250_000n;

    await tokenIn.mint(user.address, amountIn);
    await tokenOut.mint(await router.getAddress(), amountIn * 10n);
    await tokenIn.connect(user).approve(await adapter.getAddress(), amountIn);

    const routeCalldata = router.interface.encodeFunctionData("swapExactInput", [
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      amountIn,
      amountIn,
      await adapter.getAddress(),
    ]);

    await adapter
      .connect(user)
      .swapExactInput(
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        amountIn,
        amountIn,
        recipient.address,
        await router.getAddress(),
        routeCalldata,
      );

    expect(await tokenOut.balanceOf(recipient.address)).to.equal(amountIn);
    expect(await tokenOut.balanceOf(await adapter.getAddress())).to.equal(0n);
  });

  it("lets TowerSwapExecutor collect the platform fee and pay the user in one swap", async function () {
    const { user, treasury, tokenIn, tokenOut, router, adapter, executor } =
      await deployFixture();
    const amountIn = 1_000_000n;
    const swapAmountIn = amountIn - (amountIn * feeBps) / bpsDenominator;

    await tokenIn.mint(user.address, amountIn);
    await tokenOut.mint(await router.getAddress(), amountIn * 10n);
    await tokenIn.connect(user).approve(await executor.getAddress(), amountIn);

    const routeCalldata = router.interface.encodeFunctionData("swapExactInput", [
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      swapAmountIn,
      swapAmountIn,
      await executor.getAddress(),
    ]);
    const adapterCalldata = adapter.interface.encodeFunctionData("swapExactInput", [
      await tokenIn.getAddress(),
      await tokenOut.getAddress(),
      swapAmountIn,
      swapAmountIn,
      await executor.getAddress(),
      await router.getAddress(),
      routeCalldata,
    ]);

    await executor.connect(user).executeSwap({
      tokenIn: await tokenIn.getAddress(),
      tokenOut: await tokenOut.getAddress(),
      amountIn,
      minAmountOut: swapAmountIn,
      recipient: user.address,
      routeTarget: await adapter.getAddress(),
      approvalSpender: await adapter.getAddress(),
      routeCalldata: adapterCalldata,
    });

    expect(await tokenIn.balanceOf(treasury.address)).to.equal(
      (amountIn * feeBps) / bpsDenominator,
    );
    expect(await tokenOut.balanceOf(user.address)).to.equal(swapAmountIn);
    expect(await tokenIn.balanceOf(await executor.getAddress())).to.equal(0n);
    expect(await tokenOut.balanceOf(await executor.getAddress())).to.equal(0n);
  });

  it("rejects a route target that is not the LI.FI Diamond or Permit2", async function () {
    const { user, recipient, tokenIn, tokenOut, adapter } = await deployFixture();
    const amountIn = 1_000n;

    await tokenIn.mint(user.address, amountIn);
    await tokenIn.connect(user).approve(await adapter.getAddress(), amountIn);

    await expect(
      adapter
        .connect(user)
        .swapExactInput(
          await tokenIn.getAddress(),
          await tokenOut.getAddress(),
          amountIn,
          1n,
          recipient.address,
          user.address,
          "0x1234",
        ),
    ).to.be.revertedWith("Invalid LI.FI target");
  });
});
