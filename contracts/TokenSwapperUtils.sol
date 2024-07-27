// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <=0.8.26;

import { ISwapTokens } from "./ISwapTokens.sol";
/**
 * @title A helper file for token swapping.
 * @author The Dark Jester
 * @notice You can use this contract for multi-token swaps.
 */

library TokenSwapperUtils {
  /**
   * @notice Gas efficient swap hashing using inline assembly.
   * @dev There are 12 items in the struct, each using 32 bytes in calldata when used,
   * so to hash it we use 0x180 (384), or 12*32 (384) bytes.
   * @param _swap The full Swap struct.
   */
  function hashTokenSwap(ISwapTokens.Swap memory _swap) internal pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      mcopy(mPtr, _swap, 0x180)
      swapHash := keccak256(mPtr, 0x180)
    }
  }

  function hashTokenSwapCalldata(ISwapTokens.Swap calldata _swap) internal pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      calldatacopy(mPtr, _swap, 0x180)
      swapHash := keccak256(mPtr, 0x180)
    }
  }

  function storeTransientBool(bytes32 _key, bool _storedBool) internal {
    assembly {
      tstore(_key, _storedBool)
    }
  }

  function wipeTransientBool(bytes32 _key) internal {
    storeTransientBool(_key, false);
  }

  function loadTransientBool(bytes32 _key) internal view returns (bool boolValue) {
    assembly {
      boolValue := tload(_key)
    }
  }
}
