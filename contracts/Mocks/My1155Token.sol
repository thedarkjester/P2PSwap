// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract My1155Token is ERC1155, Ownable {
  constructor(address initialOwner) ERC1155("http://uri.for.token") Ownable(initialOwner) {}

  function safeMint(address to) public {
    _mint(to, 1, 1, "");
  }

  function safeTransferFrom(address from, address to, uint256 tokenId) external {
    safeTransferFrom(from, to, tokenId, 1, "");
  }

  fallback() payable external {

  }
}
