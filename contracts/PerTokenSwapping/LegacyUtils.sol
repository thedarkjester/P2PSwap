// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC721Swapper } from "./IERC721Swapper.sol";
import { IERC20Swapper } from "./IERC20Swapper.sol";
import { ISwapTokens } from "../ISwapTokens.sol";
/**
 * @title A helper file for hashing swap data.
 * @author The Dark Jester
 * @notice You can use this contract for ERC721 swaps.
 */

/// @dev If you are compiling for an EVM fork lower than Cancun, use this instead in the SwapperContracts.
library LegacyUtils {
  /**
   * @notice Gas efficient swap hashing using inline assembly.
   * @dev There are 8 items in the struct, each using 32 bytes in calldata when used,
   * so to hash it we use 0x100 (256), or 8*32 (256) bytes.
   * @param _swap The full Swap struct.
   */
  function hashSwap(IERC721Swapper.Swap memory _swap) external pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      mstore(mPtr, mload(_swap))
      mstore(add(mPtr, 0x20), mload(add(_swap, 0x20)))
      mstore(add(mPtr, 0x40), mload(add(_swap, 0x40)))
      mstore(add(mPtr, 0x60), mload(add(_swap, 0x60)))
      mstore(add(mPtr, 0x80), mload(add(_swap, 0x80)))
      mstore(add(mPtr, 0xa0), mload(add(_swap, 0xa0)))
      mstore(add(mPtr, 0xc0), mload(add(_swap, 0xc0)))
      mstore(add(mPtr, 0xe0), mload(add(_swap, 0xe0)))
      swapHash := keccak256(mPtr, 0x100)
    }
  }

  /**
   * @notice Gas efficient swap hashing using inline assembly.
   * @dev There are 8 items in the struct, each using 32 bytes in calldata when used,
   * so to hash it we use 0x100 (256), or 8*32 (256) bytes.
   * @param _swap The full Swap struct.
   */
  function hashErc20Swap(IERC20Swapper.Swap memory _swap) external pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      mstore(mPtr, mload(_swap))
      mstore(add(mPtr, 0x20), mload(add(_swap, 0x20)))
      mstore(add(mPtr, 0x40), mload(add(_swap, 0x40)))
      mstore(add(mPtr, 0x60), mload(add(_swap, 0x60)))
      mstore(add(mPtr, 0x80), mload(add(_swap, 0x80)))
      mstore(add(mPtr, 0xa0), mload(add(_swap, 0xa0)))
      mstore(add(mPtr, 0xc0), mload(add(_swap, 0xc0)))
      mstore(add(mPtr, 0xe0), mload(add(_swap, 0xe0)))
      swapHash := keccak256(mPtr, 0x100)
    }
  }

    /**
   * @notice Gas efficient swap hashing using inline assembly.
   * @dev There are 12 items in the struct, each using 32 bytes in calldata when used,
   * so to hash it we use 0x180 (320), or 12*32 (360) bytes.
   * @param _swap The full Swap struct.
   */
  function hashErcGenericSwap(ISwapTokens.Swap memory _swap) external pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      mstore(mPtr, mload(_swap))
      mstore(add(mPtr, 0x20), mload(add(_swap, 0x20)))
      mstore(add(mPtr, 0x40), mload(add(_swap, 0x40)))
      mstore(add(mPtr, 0x60), mload(add(_swap, 0x60)))
      mstore(add(mPtr, 0x80), mload(add(_swap, 0x80)))
      mstore(add(mPtr, 0xa0), mload(add(_swap, 0xa0)))
      mstore(add(mPtr, 0xc0), mload(add(_swap, 0xc0)))
      mstore(add(mPtr, 0xe0), mload(add(_swap, 0xe0)))
      mstore(add(mPtr, 0x100), mload(add(_swap, 0x100)))
      mstore(add(mPtr, 0x120), mload(add(_swap, 0x120)))
      mstore(add(mPtr, 0x140), mload(add(_swap, 0x140)))
      mstore(add(mPtr, 0x160), mload(add(_swap, 0x160)))
      mstore(add(mPtr, 0x180), mload(add(_swap, 0x180)))
      swapHash := keccak256(mPtr, 0x100)
    }
  }
}
