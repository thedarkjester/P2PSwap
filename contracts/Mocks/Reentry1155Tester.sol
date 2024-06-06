// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import { IERC721Swapper } from "../IERC721Swapper.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

contract Reentry1155Tester is IERC1155Receiver {
  address private swapperAddress;
  address private target;

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

    IERC721Swapper.Swap memory swap = IERC721Swapper.Swap({
      initiatorNftContract: _initiatorNftContract,
      acceptorNftContract: _acceptorNftContract,
      initiator: address(this),
      initiatorTokenId: _initiatorTokenId,
      acceptor: _acceptor,
      acceptorTokenId: _acceptorTokenId,
      initiatorETHPortion: msg.value,
      acceptorETHPortion: _acceptorETHPortion
    });

    swapper.initiateSwap{ value: msg.value }(swap);
  }

  function onERC1155Received(
    address operator,
    address from,
    uint256 id,
    uint256 value,
    bytes calldata data
  ) external returns (bytes4) {
    if (id == 1) {
      IERC721Swapper.Swap memory swap = IERC721Swapper.Swap({
        initiatorNftContract: msg.sender,
        acceptorNftContract: msg.sender,
        initiator: target,
        initiatorTokenId: 1,
        acceptor: address(this),
        acceptorTokenId: 4,
        initiatorETHPortion: 0,
        acceptorETHPortion: 0
      });

      swap.initiator = target;
      IERC721Swapper swapper = IERC721Swapper(swapperAddress);
      swapperAddress = swapperAddress;
      swapper.completeSwap(1, swap);
    }

    if (id == 2) {
      IERC721Swapper.Swap memory swap = IERC721Swapper.Swap({
        initiatorNftContract: msg.sender,
        acceptorNftContract: msg.sender,
        initiator: address(this),
        initiatorTokenId: 1,
        acceptor: target,
        acceptorTokenId: 2,
        initiatorETHPortion: 1 ether,
        acceptorETHPortion: 0
      });

      IERC721Swapper swapperRemover = IERC721Swapper(swapperAddress);
      swapperAddress = swapperAddress;
      swapperRemover.removeSwap(2, swap);
    }

    return IERC1155Receiver.onERC1155Received.selector;
  }

  function onERC1155BatchReceived(
    address _operator,
    address _from,
    uint256[] calldata _ids,
    uint256[] calldata _values,
    bytes calldata _data
  ) external returns (bytes4) {
    return IERC1155Receiver.onERC1155BatchReceived.selector;
  }

  function supportsInterface(bytes4 interfaceID) external view returns (bool) {
    return interfaceID == IERC1155Receiver.onERC1155Received.selector;
  }

  function withdraw(address _swapperAddress) external {
    IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
    swapper.withdraw();
  }

  function approveToken(uint256 _tokenId, address _nftContractAddress, address _swapperAddress) external {
    IERC721 nftContract = IERC721(_nftContractAddress);
    nftContract.approve(_swapperAddress, _tokenId);
  }

  function removeSwap(uint256 _swapId, address _swapperAddress, IERC721Swapper.Swap calldata _swap) external {
    target = _swap.acceptor;
    IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
    swapper.removeSwap(_swapId, _swap);
  }

  function completeSwap(uint256 _swapId, address _swapperAddress, IERC721Swapper.Swap calldata _swap) public {
    target = _swap.initiator;

    IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
    swapperAddress = _swapperAddress;
    swapper.completeSwap(_swapId, _swap);
  }

  function completeProperSwap(uint256 _swapId, address _swapperAddress, IERC721Swapper.Swap calldata _swap) public {
    IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
    swapperAddress = _swapperAddress;
    swapper.completeSwap(_swapId, _swap);
  }

  function setSwapperAddress(address _swapperAddress) external {
    swapperAddress = _swapperAddress;
  }

  receive() external payable {
    IERC721Swapper swapper = IERC721Swapper(msg.sender);
    swapper.withdraw();
  }
}
