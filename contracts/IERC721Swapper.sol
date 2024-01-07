// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC721Swapper {
    error ZeroAddressDisallowed();
    error TwoWayEthPortionsDisallowed();
    error ReentryBanned();
    error SwapCompleteOrDoesNotExist();
    error EmptyWithdrawDisallowed();
    error NotAcceptor();
    error NotInitiator();
    error IncorrectOrMissingAcceptorETH();
    error DirectFundingDisallowed();
    error ETHSendingFailed();

    event SwapInitiated(
        uint256 indexed swapId,
        address indexed initiator,
        address indexed acceptor
    );

    event SwapRemoved(uint256 indexed swapId, address indexed initiator);

    event SwapComplete(
        uint256 indexed swapId,
        address indexed initiator,
        address indexed acceptor,
        Swap swap
    );

    struct Swap {
        uint256 swapId;
        address initiatorNftContract;
        address acceptorNftContract;
        address initiator;
        uint256 initiatorTokenId;
        address acceptor;
        uint256 acceptorTokenId;
        uint256 initiatorETHPortion;
        uint256 acceptorETHPortion;
    }

    struct SwapStatus {
        bool initiatorOwnsToken;
        bool acceptorOwnsToken;
        bool initiatorApprovalsSet;
        bool acceptorApprovalsSet;
    }

    function initiateSwap(
        address _initiatorNftContract,
        address _acceptorNftContract,
        address _acceptor,
        uint256 _acceptorETHPortion,
        uint256 _initiatorTokenId,
        uint256 _acceptorTokenId
    ) external payable;

    function completeSwap(uint256 _swapId) external payable;

    function removeSwap(uint256 _swapId) external;

    function withdraw() external;

    function getSwapStatus(
        uint256 _swapId
    ) external view returns (SwapStatus memory swapStatus);
}
