// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { ISwapTokens } from "./ISwapTokens.sol";
/**
 * @title A helper file for token swapping.
 * @author The Dark Jester
 * @notice You can use this contract for multi-token swaps.
 */

library NonCancunTokenSwapperUtils {
  /**
   * @notice Gas efficient swap hashing using inline assembly with memory.
   * @dev There are 13 items in the struct, each using 32 bytes in memory when used,
   * so to hash it we use 0x1a0 (416), or 13*32 (416) bytes.
   * @param _swap The full Swap struct.
   * @return swapHash The hash of the swap.
   */
  function hashTokenSwap(ISwapTokens.Swap memory _swap) internal pure returns (bytes32 swapHash) {
    assembly {
      swapHash := keccak256(_swap, 0x1a0)
    }
  }

  /**
   * @notice Gas efficient swap hashing using inline assembly with calldata.
   * @dev There are 13 items in the struct, each using 32 bytes in calldata when used,
   * so to hash it we use 0x1a0 (416), or 13*32 (384) bytes.
   * @param _swap The full Swap struct.
   * @return swapHash The hash of the swap.
   */
  function hashTokenSwapCalldata(ISwapTokens.Swap calldata _swap) internal pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      calldatacopy(mPtr, _swap, 0x1a0)
      swapHash := keccak256(mPtr, 0x1a0)
    }
  }
}
