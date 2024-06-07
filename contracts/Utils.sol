// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <=0.8.26;

import { IERC721Swapper } from "./IERC721Swapper.sol";
import { IERC20Swapper } from "./IERC20Swapper.sol";

import { ISwapTokens } from "./ISwapTokens.sol";
/**
 * @title A helper file for hashing swap data.
 * @author The Dark Jester
 * @notice You can use this contract for ERC721 swaps.
 */

library Utils {
  /**
   * @notice Gas efficient swap hashing using inline assembly.
   * @dev There are 8 items in the struct, each using 32 bytes in calldata when used,
   * so to hash it we use 0x100 (256), or 8*32 (256) bytes.
   * @param _swap The full Swap struct.
   */
  function hashSwap(IERC721Swapper.Swap memory _swap) internal pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      mcopy(mPtr, _swap, 0x100)
      swapHash := keccak256(mPtr, 0x100)
    }
  }

  /**
   * @notice Gas efficient swap hashing using inline assembly.
   * @dev There are 8 items in the struct, each using 32 bytes in calldata when used,
   * so to hash it we use 0x180 (320), or 12*32 (360) bytes.
   * @param _swap The full Swap struct.
   */
  function hashTokenSwap(ISwapTokens.Swap memory _swap) internal pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      mcopy(mPtr, _swap, 0x180)
      swapHash := keccak256(mPtr, 0x180)
    }
  }

  /**
   * @notice Gas efficient swap hashing using inline assembly.
   * @dev There are 8 items in the struct, each using 32 bytes in calldata when used,
   * so to hash it we use 0x100 (256), or 8*32 (256) bytes.
   * @param _swap The full Swap struct.
   */
  function hashSwap(IERC20Swapper.Swap memory _swap) internal pure returns (bytes32 swapHash) {
    assembly {
      let mPtr := mload(0x40)
      mcopy(mPtr, _swap, 0x100)
      swapHash := keccak256(mPtr, 0x100)
    }
  }

  function tstoreAddress(bytes32 _key, ISwapTokens.Swap memory _swap) internal {
    assembly {
      tstore(_key, _swap)
    }
  }

  function storeTransientSwap(bytes32 _key, ISwapTokens.Swap memory _swap) internal {
    assembly {
      tstore(_key, _swap)
    }
  }

  function wipeTransientSwap(bytes32 _key) internal {
    ISwapTokens.Swap memory swap;
    storeTransientSwap(_key, swap);
  }

  function loadTransientSwap(bytes32 _key) internal view returns (ISwapTokens.Swap memory swap) {
    assembly {
      swap := tload(_key)
    }
  }
}
