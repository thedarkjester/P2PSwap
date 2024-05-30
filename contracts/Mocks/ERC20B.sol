// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20B is ERC20 {
  constructor() ERC20("ERC20B", "ERC20B") {}

  function safeMint(address to, uint256 amount) public {
    _mint(to, amount);
  }
}
