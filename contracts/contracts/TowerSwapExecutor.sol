// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TowerSwapExecutor
 * @dev Stateless swap executor that collects platform fees directly to treasury
 * and sends swap output directly to the user in the same transaction.
 *
 * The contract intentionally does not keep an accumulated fee ledger and does
 * not rely on a backend-triggered second transaction to distribute user output.
 * Swap calldata must route output tokens back to this contract; the executor
 * then validates the received output and forwards it to the recipient.
 */
contract TowerSwapExecutor is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PLATFORM_FEE_BPS = 1_000; // 10%

    address public treasury;
    uint256 public platformFeeBps;

    mapping(address => bool) public routeTargets;
    mapping(address => bool) public approvalSpenders;

    struct ExecuteSwapParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        address recipient;
        address routeTarget;
        address approvalSpender;
        bytes routeCalldata;
    }

    event TreasuryUpdated(address indexed treasury);
    event PlatformFeeUpdated(uint256 feeBps);
    event RouteTargetUpdated(address indexed target, bool isAllowed);
    event ApprovalSpenderUpdated(address indexed spender, bool isAllowed);
    event SwapExecuted(
        address indexed user,
        address indexed recipient,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 swapAmountIn,
        uint256 amountOut,
        uint256 feeAmount,
        uint256 inputRefund,
        address routeTarget,
        address approvalSpender
    );

    constructor(address _treasury, address _owner, uint256 _platformFeeBps) {
        require(_treasury != address(0), "Invalid treasury");
        require(_owner != address(0), "Invalid owner");
        require(_platformFeeBps <= MAX_PLATFORM_FEE_BPS, "Fee too high");

        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
        transferOwnership(_owner);

        emit TreasuryUpdated(_treasury);
        emit PlatformFeeUpdated(_platformFeeBps);
    }

    function executeSwap(
        ExecuteSwapParams calldata params
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amountOut, uint256 feeAmount, uint256 inputRefund)
    {
        _validateParams(params);

        IERC20 inputToken = IERC20(params.tokenIn);
        IERC20 outputToken = IERC20(params.tokenOut);

        uint256 inputBalanceBefore = inputToken.balanceOf(address(this));
        uint256 outputBalanceBefore = outputToken.balanceOf(address(this));

        inputToken.safeTransferFrom(msg.sender, address(this), params.amountIn);

        uint256 receivedInput = inputToken.balanceOf(address(this)) - inputBalanceBefore;
        require(receivedInput > 0, "No input received");

        feeAmount = (receivedInput * platformFeeBps) / BPS_DENOMINATOR;
        uint256 swapAmountIn = receivedInput - feeAmount;
        require(swapAmountIn > 0, "Swap amount too small");

        if (feeAmount > 0) {
            inputToken.safeTransfer(treasury, feeAmount);
        }

        inputToken.safeApprove(params.approvalSpender, 0);
        inputToken.safeApprove(params.approvalSpender, swapAmountIn);

        (bool success, bytes memory returnData) = _callRouteTarget(
            params.routeTarget,
            params.routeCalldata
        );
        require(success, _getRevertMsg(returnData));

        inputToken.safeApprove(params.approvalSpender, 0);

        uint256 outputBalanceAfter = outputToken.balanceOf(address(this));
        amountOut = outputBalanceAfter - outputBalanceBefore;
        require(amountOut >= params.minAmountOut, "Insufficient output amount");

        uint256 inputBalanceAfter = inputToken.balanceOf(address(this));
        if (inputBalanceAfter > inputBalanceBefore) {
            inputRefund = inputBalanceAfter - inputBalanceBefore;
            inputToken.safeTransfer(params.recipient, inputRefund);
        }

        outputToken.safeTransfer(params.recipient, amountOut);

        emit SwapExecuted(
            msg.sender,
            params.recipient,
            params.tokenIn,
            params.tokenOut,
            receivedInput,
            swapAmountIn,
            amountOut,
            feeAmount,
            inputRefund,
            params.routeTarget,
            params.approvalSpender
        );
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setPlatformFeeBps(uint256 _platformFeeBps) external onlyOwner {
        require(_platformFeeBps <= MAX_PLATFORM_FEE_BPS, "Fee too high");
        platformFeeBps = _platformFeeBps;
        emit PlatformFeeUpdated(_platformFeeBps);
    }

    function setRouteTarget(address target, bool isAllowed) external onlyOwner {
        require(target != address(0), "Invalid target");
        require(target.code.length > 0, "Target is not a contract");
        routeTargets[target] = isAllowed;
        emit RouteTargetUpdated(target, isAllowed);
    }

    function setApprovalSpender(address spender, bool isAllowed) external onlyOwner {
        require(spender != address(0), "Invalid spender");
        require(spender.code.length > 0, "Spender is not a contract");
        approvalSpenders[spender] = isAllowed;
        emit ApprovalSpenderUpdated(spender, isAllowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function recoverToken(address token, address recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(recipient, amount);
    }

    function _validateParams(ExecuteSwapParams calldata params) private view {
        require(params.tokenIn != address(0), "Invalid tokenIn");
        require(params.tokenOut != address(0), "Invalid tokenOut");
        require(params.tokenIn != params.tokenOut, "Same token pair");
        require(params.amountIn > 0, "Invalid amountIn");
        require(params.minAmountOut > 0, "Invalid minAmountOut");
        require(params.recipient != address(0), "Invalid recipient");
        require(routeTargets[params.routeTarget], "Route target not allowed");
        require(approvalSpenders[params.approvalSpender], "Approval spender not allowed");
        require(params.routeCalldata.length > 0, "Invalid route calldata");
    }

    function _callRouteTarget(
        address target,
        bytes calldata data
    ) private returns (bool success, bytes memory returnData) {
        // Copy to memory first. Passing nested calldata bytes via data.offset in
        // assembly is unreliable with viaIR and surfaces as "Route execution failed".
        (success, returnData) = target.call(data);
    }

    function _getRevertMsg(bytes memory returnData) private pure returns (string memory) {
        if (returnData.length < 4) {
            return "Route execution failed";
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
            return "Route execution panicked";
        }

        return "Route execution failed";
    }
}
