// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAeroSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        int24 tickSpacing;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);

    function exactInput(ExactInputParams calldata params)
        external
        payable
        returns (uint256 amountOut);

    function factory() external view returns (address);

    function WETH9() external view returns (address);
}

/**
 * @title AeroAdapter
 * @dev Executor-friendly adapter for Aero Slipstream (CL) swaps.
 *
 * TowerSwapExecutor approves this adapter, and the adapter then:
 * - pulls the ERC20 input from the executor,
 * - approves the Aero swap router,
 * - performs exactInputSingle / exactInput,
 * - routes output back to the executor so it can pay the user.
 *
 * This keeps platform fee collection inside executeSwap (approve + one swap tx).
 */
contract AeroAdapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IAeroSwapRouter public immutable swapRouter;
    address public immutable factoryAddress;
    address public immutable wrappedNativeToken;

    constructor(address _swapRouter) {
        require(_swapRouter != address(0), "Invalid Aero router");

        swapRouter = IAeroSwapRouter(_swapRouter);
        factoryAddress = swapRouter.factory();
        wrappedNativeToken = swapRouter.WETH9();
    }

    receive() external payable {}

    function swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        int24 tickSpacing,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        require(tokenIn != address(0), "Invalid tokenIn");
        require(tokenOut != address(0), "Invalid tokenOut");
        require(tokenIn != tokenOut, "Same token pair");
        require(amountIn > 0, "Invalid amountIn");
        require(recipient != address(0), "Invalid recipient");
        require(tickSpacing > 0, "Invalid tickSpacing");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).safeApprove(address(swapRouter), 0);
        IERC20(tokenIn).safeApprove(address(swapRouter), amountIn);

        amountOut = swapRouter.exactInputSingle(
            IAeroSwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                tickSpacing: tickSpacing,
                recipient: recipient,
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(tokenIn).safeApprove(address(swapRouter), 0);
        require(amountOut >= minAmountOut, "Insufficient output amount");
    }

    function swapExactInput(
        address tokenIn,
        bytes calldata path,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        require(tokenIn != address(0), "Invalid tokenIn");
        require(amountIn > 0, "Invalid amountIn");
        require(recipient != address(0), "Invalid recipient");
        require(path.length >= 43, "Invalid path");
        require(_pathTokenIn(path) == tokenIn, "Path tokenIn mismatch");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).safeApprove(address(swapRouter), 0);
        IERC20(tokenIn).safeApprove(address(swapRouter), amountIn);

        amountOut = swapRouter.exactInput(
            IAeroSwapRouter.ExactInputParams({
                path: path,
                recipient: recipient,
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut
            })
        );

        IERC20(tokenIn).safeApprove(address(swapRouter), 0);
        require(amountOut >= minAmountOut, "Insufficient output amount");
    }

    function factory() external view returns (address) {
        return factoryAddress;
    }

    function WETH() external view returns (address) {
        return wrappedNativeToken;
    }

    function recoverToken(address token, address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(recipient, amount);
    }

    function recoverNative(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Native recovery failed");
    }

    function _pathTokenIn(bytes calldata path) private pure returns (address tokenIn) {
        assembly {
            tokenIn := shr(96, calldataload(path.offset))
        }
    }
}
