// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockAeroSwapRouter {
    using SafeERC20 for IERC20;

    address public immutable factoryAddress;
    address public immutable weth9;

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

    constructor(address _factory, address _weth9) {
        factoryAddress = _factory;
        weth9 = _weth9;
    }

    function factory() external view returns (address) {
        return factoryAddress;
    }

    function WETH9() external view returns (address) {
        return weth9;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        require(params.tickSpacing > 0, "Invalid tickSpacing");
        require(block.timestamp <= params.deadline, "Transaction expired");
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn;
        require(amountOut >= params.amountOutMinimum, "Too little received");
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }

    function exactInput(ExactInputParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        require(params.path.length >= 43, "Invalid path");
        require(block.timestamp <= params.deadline, "Transaction expired");
        bytes calldata path = params.path;
        address tokenIn;
        address tokenOut;
        uint256 tokenOutOffset = path.length - 20;
        assembly {
            tokenIn := shr(96, calldataload(path.offset))
            tokenOut := shr(96, calldataload(add(path.offset, tokenOutOffset)))
        }
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn;
        require(amountOut >= params.amountOutMinimum, "Too little received");
        IERC20(tokenOut).safeTransfer(params.recipient, amountOut);
    }
}
