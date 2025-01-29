// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import { ISwapTokens } from "../ISwapTokens.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

import "hardhat/console.sol";

contract Reentry1155Tester is IERC1155Receiver {
  address private swapperAddress;
  address private target;
  uint256 private expiryDate;

  function initiateSwap(
    uint256 _expiryDate,
    address _initiatorERCContract,
    address _acceptorERCContract,
    address _acceptor,
    uint256 _acceptorETHPortion,
    uint256 _initiatorTokenId,
    uint256 _acceptorTokenId,
    address _swapperAddress
  ) external payable {
    target = _acceptor;

    ISwapTokens swapper = ISwapTokens(_swapperAddress);

    ISwapTokens.Swap memory swap = ISwapTokens.Swap({
      expiryDate: _expiryDate,
      initiatorERCContract: _initiatorERCContract,
      acceptorERCContract: _acceptorERCContract,
      initiator: address(this),
      initiatorTokenId: _initiatorTokenId,
      initiatorTokenQuantity: 1,
      acceptor: _acceptor,
      acceptorTokenId: _acceptorTokenId,
      acceptorTokenQuantity: 1,
      initiatorETHPortion: msg.value,
      acceptorETHPortion: _acceptorETHPortion,
      initiatorTokenType: ISwapTokens.TokenType.ERC1155,
      acceptorTokenType: ISwapTokens.TokenType.ERC1155
    });

    swapperAddress = _swapperAddress;

    swapper.initiateSwap{ value: msg.value }(swap);
  }

  function onERC1155Received(address, address, uint256 id, uint256, bytes calldata) external returns (bytes4) {
    if (id == 1) {
      ISwapTokens.Swap memory swap = ISwapTokens.Swap({
        expiryDate: expiryDate,
        initiatorERCContract: msg.sender,
        acceptorERCContract: msg.sender,
        initiator: target,
        initiatorTokenId: id,
        initiatorTokenQuantity: 1,
        acceptor: address(this),
        acceptorTokenId: 4,
        acceptorTokenQuantity: 1,
        initiatorETHPortion: 0,
        acceptorETHPortion: 0,
        initiatorTokenType: ISwapTokens.TokenType.ERC1155,
        acceptorTokenType: ISwapTokens.TokenType.ERC1155
      });

      ISwapTokens swapper = ISwapTokens(swapperAddress);

      swapper.completeSwap(1, swap);
    }

    if (id == 2) {
      ISwapTokens.Swap memory swap = ISwapTokens.Swap({
        expiryDate: expiryDate,
        initiatorERCContract: msg.sender,
        acceptorERCContract: msg.sender,
        initiator: address(this),
        initiatorTokenId: 4,
        initiatorTokenQuantity: 1,
        acceptor: target,
        acceptorTokenId: 2,
        acceptorTokenQuantity: 1,
        initiatorETHPortion: 0,
        acceptorETHPortion: 0,
        initiatorTokenType: ISwapTokens.TokenType.ERC1155,
        acceptorTokenType: ISwapTokens.TokenType.ERC1155
      });

      ISwapTokens swapperRemover = ISwapTokens(swapperAddress);

      swapperRemover.removeSwap(1, swap);
    }

    if (id == 2) {
      ISwapTokens.Swap memory swap = ISwapTokens.Swap({
        expiryDate: expiryDate,
        initiatorERCContract: msg.sender,
        acceptorERCContract: msg.sender,
        initiator: address(this),
        initiatorTokenId: 4,
        initiatorTokenQuantity: 1,
        acceptor: target,
        acceptorTokenId: 2,
        acceptorTokenQuantity: 1,
        initiatorETHPortion: 0,
        acceptorETHPortion: 0,
        initiatorTokenType: ISwapTokens.TokenType.ERC1155,
        acceptorTokenType: ISwapTokens.TokenType.ERC1155
      });

      ISwapTokens swapperRemover = ISwapTokens(swapperAddress);

      swapperRemover.removeSwap(1, swap);
    }

    return IERC1155Receiver.onERC1155Received.selector;
  }

  function onERC1155BatchReceived(
    address,
    address,
    uint256[] calldata,
    uint256[] calldata,
    bytes calldata
  ) external pure returns (bytes4) {
    return IERC1155Receiver.onERC1155BatchReceived.selector;
  }

  function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
    return interfaceID == IERC1155Receiver.onERC1155Received.selector;
  }

  function approveToken(address _nftContractAddress, address _swapperAddress) external {
    IERC1155 nftContract = IERC1155(_nftContractAddress);
    nftContract.setApprovalForAll(_swapperAddress, true);
  }

  function removeSwap(uint256 _swapId, address _swapperAddress, ISwapTokens.Swap calldata _swap) external {
    target = _swap.acceptor;
    ISwapTokens swapper = ISwapTokens(_swapperAddress);
    swapper.removeSwap(_swapId, _swap);
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

  receive() external payable {
  }
}
