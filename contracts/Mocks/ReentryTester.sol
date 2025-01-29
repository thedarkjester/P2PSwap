// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import { ISwapTokens } from "../ISwapTokens.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ReentryTester is IERC721Receiver {
  address private swapperAddress;
  address private target;

  function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
    if (tokenId == 1) {
      ISwapTokens.Swap memory swap = ISwapTokens.Swap({
        expiryDate: 2733055232,
        initiatorERCContract: msg.sender,
        acceptorERCContract: msg.sender,
        initiator: target,
        initiatorTokenId: 1,
        initiatorTokenQuantity: 0,
        acceptor: address(this),
        acceptorTokenId: 4,
        acceptorTokenQuantity: 0,
        initiatorETHPortion: 0,
        acceptorETHPortion: 0,
        initiatorTokenType: ISwapTokens.TokenType.ERC721,
        acceptorTokenType: ISwapTokens.TokenType.ERC721
      });

      swap.initiator = target;
      ISwapTokens swapper = ISwapTokens(swapperAddress);
      swapperAddress = swapperAddress;
      swapper.completeSwap(1, swap);
    }

    if (tokenId == 2) {
      ISwapTokens.Swap memory swap = ISwapTokens.Swap({
        expiryDate: 2733055232,
        initiatorERCContract: msg.sender,
        acceptorERCContract: msg.sender,
        initiator: address(this),
        initiatorTokenId: 1,
        initiatorTokenQuantity: 0,
        acceptor: target,
        acceptorTokenId: 2,
        acceptorTokenQuantity: 0,
        initiatorETHPortion: 1 ether,
        acceptorETHPortion: 0,
        initiatorTokenType: ISwapTokens.TokenType.ERC721,
        acceptorTokenType: ISwapTokens.TokenType.ERC721
      });

      ISwapTokens swapperRemover = ISwapTokens(swapperAddress);
      swapperAddress = swapperAddress;
      swapperRemover.removeSwap(2, swap);
    }

    return IERC721Receiver.onERC721Received.selector;
  }

  function approveToken(uint256 _tokenId, address _nftContractAddress, address _swapperAddress) external {
    IERC721 nftContract = IERC721(_nftContractAddress);
    nftContract.approve(_swapperAddress, _tokenId);
  }

  function removeSwap(uint256 _swapId, address _swapperAddress, ISwapTokens.Swap calldata _swap) external {
    target = _swap.acceptor;
    ISwapTokens swapper = ISwapTokens(_swapperAddress);
    swapper.removeSwap(_swapId, _swap);
  }

  function completeSwap(uint256 _swapId, address _swapperAddress, ISwapTokens.Swap calldata _swap) public {
    target = _swap.initiator;

    ISwapTokens swapper = ISwapTokens(_swapperAddress);
    swapperAddress = _swapperAddress;
    swapper.completeSwap(_swapId, _swap);
  }

  function completeProperSwap(uint256 _swapId, address _swapperAddress, ISwapTokens.Swap calldata _swap) public {
    ISwapTokens swapper = ISwapTokens(_swapperAddress);
    swapperAddress = _swapperAddress;
    swapper.completeSwap(_swapId, _swap);
  }

  function setSwapperAddress(address _swapperAddress) external {
    swapperAddress = _swapperAddress;
  }

  receive() external payable {}
}
