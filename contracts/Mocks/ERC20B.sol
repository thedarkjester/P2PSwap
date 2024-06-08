// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20B is ERC20 {
  address deniedAddress;

  constructor(address _deniedAddress) ERC20("ERC20B", "ERC20B") {
    deniedAddress = _deniedAddress;
  }

  function safeMint(address to, uint256 amount) public {
    _mint(to, amount);
  }

  function transferFrom(address from, address to, uint256 value) public virtual override returns (bool) {
    if (to == deniedAddress) {
      return false;
    }

    return super.transferFrom(from, to, value);
  }
}
