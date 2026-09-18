// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPermit2AllowanceTransfer {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/**
 * @title LiFiAdapter
 * @dev Executor-friendly adapter for XyloNet mainnet swaps routed by LI.FI.
 *
 * The existing XyloNetAdapter is a testnet pool-AMM wrapper and cannot execute
 * LI.FI Diamond calldata. This adapter follows the DZap/Aero pattern:
 * TowerSwapExecutor approves this contract, and the adapter then:
 * - pulls the ERC20 input from the executor,
 * - approves the LI.FI Diamond and Permit2,
 * - forwards LI.FI's opaque swap calldata,
 * - routes output back to the executor so it can pay the user and collect fees.
 */
contract LiFiAdapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint160 private constant PERMIT2_MAX_AMOUNT = type(uint160).max;
    uint48 private constant PERMIT2_MAX_EXPIRATION = type(uint48).max;

    address public immutable lifiDiamond;
    address public immutable permit2;

    constructor(address _lifiDiamond, address _permit2) {
        require(_lifiDiamond != address(0), "Invalid LI.FI diamond");
        require(_lifiDiamond.code.length > 0, "LI.FI diamond is not a contract");
        if (_permit2 != address(0)) {
            require(_permit2.code.length > 0, "Permit2 is not a contract");
        }

        lifiDiamond = _lifiDiamond;
        permit2 = _permit2;
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
        require(_isAllowedRouteTarget(routeTarget), "Invalid LI.FI target");

        uint256 recipientOutBefore = IERC20(tokenOut).balanceOf(recipient);
        uint256 adapterOutBefore = IERC20(tokenOut).balanceOf(address(this));

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        _approveSpenders(tokenIn, amountIn);

        (bool success, bytes memory returnData) = routeTarget.call(routeCalldata);
        _clearSpenders(tokenIn);
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

    function _isAllowedRouteTarget(address routeTarget) private view returns (bool) {
        return routeTarget == lifiDiamond || (permit2 != address(0) && routeTarget == permit2);
    }

    function _approveSpenders(address token, uint256 amount) private {
        IERC20(token).safeApprove(lifiDiamond, 0);
        IERC20(token).safeApprove(lifiDiamond, amount);

        if (permit2 == address(0) || amount > PERMIT2_MAX_AMOUNT) {
            return;
        }

        IERC20(token).safeApprove(permit2, 0);
        IERC20(token).safeApprove(permit2, amount);
        IPermit2AllowanceTransfer(permit2).approve(
            token,
            lifiDiamond,
            uint160(amount),
            PERMIT2_MAX_EXPIRATION
        );
    }

    function _clearSpenders(address token) private {
        IERC20(token).safeApprove(lifiDiamond, 0);

        if (permit2 == address(0)) {
            return;
        }

        IERC20(token).safeApprove(permit2, 0);
        IPermit2AllowanceTransfer(permit2).approve(token, lifiDiamond, 0, 0);
    }

    function _getRevertMsg(bytes memory returnData) private pure returns (string memory) {
        if (returnData.length < 4) {
            return "LI.FI route execution failed";
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
            return "LI.FI route execution panicked";
        }

        return "LI.FI route execution failed";
    }
}
