// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title De1Adapter
 * @dev Executor-friendly adapter for De¹ Exchange aggregator swaps on Arc.
 *
 * TowerSwapExecutor should allowlist this adapter as both a route target and
 * an approval spender. Do not allowlist De1's exchange/router directly on the
 * executor. The adapter then:
 * - pulls the ERC20 input from the executor,
 * - approves De1's exchange,
 * - forwards De1's opaque swap calldata,
 * - routes output back to the executor so it can pay the user and collect fees.
 */
contract De1Adapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable de1Exchange;

    constructor(address _de1Exchange) {
        require(_de1Exchange != address(0), "Invalid De1 exchange");
        require(_de1Exchange.code.length > 0, "De1 exchange is not a contract");

        de1Exchange = _de1Exchange;
    }

    receive() external payable {}

    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        address routeTarget,
        bytes calldata routeCalldata
    ) external nonReentrant returns (uint256 amountOut) {
        require(tokenIn != address(0), "Invalid tokenIn");
        require(tokenOut != address(0), "Invalid tokenOut");
        require(tokenIn != tokenOut, "Same token pair");
        require(amountIn > 0, "Invalid amountIn");
        require(recipient != address(0), "Invalid recipient");
        require(routeCalldata.length > 0, "Invalid route calldata");
        require(routeTarget == de1Exchange, "Invalid De1 target");

        uint256 recipientOutBefore = IERC20(tokenOut).balanceOf(recipient);
        uint256 adapterOutBefore = IERC20(tokenOut).balanceOf(address(this));

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).safeApprove(de1Exchange, 0);
        IERC20(tokenIn).safeApprove(de1Exchange, amountIn);

        (bool success, bytes memory returnData) = routeTarget.call(routeCalldata);
        IERC20(tokenIn).safeApprove(de1Exchange, 0);
        require(success, _getRevertMsg(returnData));

        uint256 adapterOutAfter = IERC20(tokenOut).balanceOf(address(this));
        if (recipient != address(this) && adapterOutAfter > adapterOutBefore) {
            IERC20(tokenOut).safeTransfer(recipient, adapterOutAfter - adapterOutBefore);
        }

        uint256 leftoverIn = IERC20(tokenIn).balanceOf(address(this));
        if (leftoverIn > 0) {
            IERC20(tokenIn).safeTransfer(msg.sender, leftoverIn);
        }

        uint256 recipientOutAfter = IERC20(tokenOut).balanceOf(recipient);
        amountOut = recipientOutAfter - recipientOutBefore;
        require(amountOut >= minAmountOut, "Insufficient output amount");
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

    function _getRevertMsg(bytes memory returnData) private pure returns (string memory) {
        if (returnData.length < 4) {
            return "De1 route execution failed";
        }

        bytes4 selector;
        assembly {
            selector := mload(add(returnData, 0x20))
        }

        if (selector == 0x08c379a0 && returnData.length >= 68) {
            assembly {
                returnData := add(returnData, 0x04)
            }

            return abi.decode(returnData, (string));
        }

        if (selector == 0x4e487b71) {
            return "De1 route execution panicked";
        }

        return "De1 route execution failed";
    }
}
