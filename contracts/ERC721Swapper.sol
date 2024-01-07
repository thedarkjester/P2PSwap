// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Swapper} from "./IERC721Swapper.sol";

contract ERC721Swapper is IERC721Swapper, ReentrancyGuard {
    address private constant ZERO_ADDRESS = address(0);

    mapping(address => uint256) public balances;

    // deployer pays for the slot vs. the first swapper.
    uint256 public swapId = 1;

    // contractAddress => tokenId
    mapping(uint256 => Swap) public swaps;

    /// @dev - some contracts have NFT at 0..
    function initiateSwap(
        address _initiatorNftContract,
        address _acceptorNftContract,
        address _acceptor,
        uint256 _acceptorETHPortion,
        uint256 _initiatorTokenId,
        uint256 _acceptorTokenId
    ) external payable {
        if (_initiatorNftContract == ZERO_ADDRESS) {
            revert ZeroAddressDisallowed();
        }
        if (_acceptorNftContract == ZERO_ADDRESS) {
            revert ZeroAddressDisallowed();
        }

        if (_acceptor == ZERO_ADDRESS) {
            revert ZeroAddressDisallowed();
        }

        if (msg.value > 0 && _acceptorETHPortion > 0) {
            revert TwoWayEthPortionsDisallowed();
        }

        unchecked {
            uint256 newSwapId = swapId++;

            Swap memory newSwap;

            newSwap.swapId = newSwapId;
            newSwap.initiatorNftContract = _initiatorNftContract;
            newSwap.acceptorNftContract = _acceptorNftContract;
            newSwap.initiator = msg.sender;
            newSwap.initiatorTokenId = _initiatorTokenId;
            newSwap.acceptor = _acceptor;
            newSwap.acceptorTokenId = _acceptorTokenId;
            newSwap.initiatorETHPortion = msg.value;
            newSwap.acceptorETHPortion = _acceptorETHPortion;

            swaps[newSwapId] = newSwap;

            emit SwapInitiated(newSwapId, msg.sender, _acceptor);
        }
    }

    function completeSwap(uint256 _swapId) external payable nonReentrant {
        Swap memory swap = swaps[_swapId];

        if (swap.swapId == 0) {
            revert SwapCompleteOrDoesNotExist();
        }

        if (swap.acceptor != msg.sender) {
            revert NotAcceptor();
        }

        if (
            swap.acceptorETHPortion > 0 && swap.acceptorETHPortion != msg.value
        ) {
            revert IncorrectOrMissingAcceptorETH();
        }

        IERC721 initiatorNftContract = IERC721(swap.initiatorNftContract);
        IERC721 acceptorNftContract = IERC721(swap.acceptorNftContract);

        initiatorNftContract.safeTransferFrom(
            swap.initiator,
            swap.acceptor,
            swap.initiatorTokenId
        );
        acceptorNftContract.safeTransferFrom(
            swap.acceptor,
            swap.initiator,
            swap.acceptorTokenId
        );

        if (msg.value > 0) {
            balances[swap.initiator] = balances[swap.initiator] + msg.value;
        }

        if (swap.initiatorETHPortion > 0) {
            balances[swap.initiator] =
                balances[swap.acceptor] +
                swap.initiatorETHPortion;
        }

        delete swaps[_swapId];

        emit SwapComplete(_swapId, swap.initiator, swap.acceptor, swap);
    }

    function withdraw() external nonReentrant {
        uint256 callerBalance = balances[msg.sender];

        if (callerBalance == 0) {
            revert EmptyWithdrawDisallowed();
        }

        balances[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: callerBalance}("");

        if (!success) {
            revert ETHSendingFailed();
        }
    }

    function removeSwap(uint256 _swapId) external nonReentrant {
        // return eth balance if needs be
        Swap memory swap = swaps[_swapId];

        if (swap.swapId == 0) {
            revert SwapCompleteOrDoesNotExist();
        }

        if (swap.initiator != msg.sender) {
            revert NotInitiator();
        }

        delete swaps[_swapId];

        if(swap.initiatorETHPortion > 0){
            balances[msg.sender] = balances[msg.sender] + swap.initiatorETHPortion;
        }      

        emit SwapRemoved(_swapId, msg.sender);
    }

    // error scenarios:
    // contract 1 does not exist
    // contract 2 does not exist
    // token 1 does not exist
    // token 2 does not exist
    function getSwapStatus(uint256 _swapId)
        external
        view
        returns (SwapStatus memory swapStatus)
    {
        Swap memory swap = swaps[_swapId];

        if (swap.swapId == 0) {
            revert SwapCompleteOrDoesNotExist();
        }

        IERC721 initiatorNftContract = IERC721(swap.initiatorNftContract);

        address initiatorTokenOwner = initiatorNftContract.ownerOf(
            swap.initiatorTokenId
        );
        swapStatus.initiatorOwnsToken = initiatorTokenOwner == swap.initiator;

        address initiatorApproved = initiatorNftContract.getApproved(
            swap.initiatorTokenId
        );
        swapStatus.initiatorApprovalsSet = initiatorApproved == address(this);

        IERC721 acceptorNftContract = IERC721(swap.acceptorNftContract);
        address acceptorTokenOwner = acceptorNftContract.ownerOf(
            swap.acceptorTokenId
        );
        swapStatus.acceptorOwnsToken = acceptorTokenOwner == swap.acceptor;

        address acceptorApproved = acceptorNftContract.getApproved(
            swap.initiatorTokenId
        );
        swapStatus.acceptorApprovalsSet = acceptorApproved == address(this);
    }

    fallback() external payable {
        revert DirectFundingDisallowed();
    }

    receive() external payable {
        revert DirectFundingDisallowed();
    }
}

