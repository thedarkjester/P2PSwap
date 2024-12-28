// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ISwapTokens } from "./ISwapTokens.sol";
/**
 * @title A helper file for token swapping.
 * @author The Dark Jester
 * @notice You can use this contract for multi-token swaps.
 */

library TransientStorage {
  /**
   * @notice Stores a transient bool.
   * @param _key The key for the storage.
   * @param _storedBool The value to set.
   */
  function storeTransientBool(bytes32 _key, bool _storedBool) internal {
    assembly {
      tstore(_key, _storedBool)
    }
  }

  /**
   * @notice Resets a transient bool to default.
   * @param _key The key for the storage.
   */
  function wipeTransientBool(bytes32 _key) internal {
    storeTransientBool(_key, false);
  }

  /**
   * @notice Loads a transient bool's value by key.
   * @param _key The key for the storage.
   * @return boolValue The value to return.
   */
  function loadTransientBool(bytes32 _key) internal view returns (bool boolValue) {
    assembly {
      boolValue := tload(_key)
    }
  }
}
