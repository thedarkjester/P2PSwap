// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { IERC721Swapper } from "../IERC721Swapper.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ReentryTester is IERC721Receiver {
  address private swapperAddress;

  function initiateSwap(
    address _initiatorNftContract,
    address _acceptorNftContract,
    address _acceptor,
    uint256 _acceptorETHPortion,
    uint256 _initiatorTokenId,
    uint256 _acceptorTokenId,
    address _swapperAddress
  ) external payable {
    IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
    swapper.initiateSwap{ value: msg.value }(
      _initiatorNftContract,
      _acceptorNftContract,
      _acceptor,
      _acceptorETHPortion,
      _initiatorTokenId,
      _acceptorTokenId
    );
  }

  function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
    if (tokenId == 1) {
      completeSwap(1, swapperAddress);
    }

    return IERC721Receiver.onERC721Received.selector;
  }

  function withdraw(address _swapperAddress) external {
    IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
    swapper.withdraw();
  }

  function approveToken(uint256 _tokenId, address _nftContractAddress, address _swapperAddress) external {
    IERC721 nftContract = IERC721(_nftContractAddress);
    nftContract.approve(_swapperAddress, _tokenId);
  }

  function removeSwap(uint256 _swapId, address _swapperAddress) external {
    IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
    swapper.removeSwap(_swapId);
  }

  function completeSwap(uint256 _swapId, address _swapperAddress) public {
    IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
    swapperAddress = _swapperAddress;
    swapper.completeSwap(_swapId);
  }

  receive() external payable {
    IERC721Swapper swapper = IERC721Swapper(msg.sender);
    swapper.withdraw();
  }
}
