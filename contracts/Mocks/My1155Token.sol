// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { ISwapTokens } from "../ISwapTokens.sol";
import "hardhat/console.sol";

contract My1155Token is ERC1155, Ownable {
  address swapperAddress;
  constructor(address initialOwner, address _swapperAddress) ERC1155("http://uri.for.token") Ownable(initialOwner) {
    swapperAddress = _swapperAddress;
  }

  function safeMint(address to) public {
    _mint(to, 1, 1, "");
  }

  function safeTransferFrom(
    address from,
    address to,
    uint256 id,
    uint256 value,
    bytes memory data
  ) public virtual override {
    if (msg.sender == swapperAddress) {
      // getting coverage to know it is coming back
      ISwapTokens(msg.sender).isSwappingTokensOnSameContract();
    }

    super.safeTransferFrom(from, to, id, value, data);
  }

  function safeMintById(address to, uint256 id) public {
    _mint(to, id, 1, "");
  }

  // fallback() external payable{

  // }
}
