// SPDX-License-Identifier: MIT

import {IERC721Swapper} from "../IERC721Swapper.sol";

contract RemovalReentryTester {
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
        swapper.initiateSwap{value: msg.value}(
            _initiatorNftContract,
            _acceptorNftContract,
            _acceptor,
            _acceptorETHPortion,
            _initiatorTokenId,
            _acceptorTokenId
        );
    }

    function withdraw(address _swapperAddress) external {
        IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
        swapper.withdraw();
    }

    function removeSwap(uint256 _swapId, address _swapperAddress) external {
        IERC721Swapper swapper = IERC721Swapper(_swapperAddress);
        swapper.removeSwap(_swapId);
    }

    fallback() external payable {
        IERC721Swapper swapper = IERC721Swapper(msg.sender);
        swapper.withdraw();
    }

    receive() external payable {
        IERC721Swapper swapper = IERC721Swapper(msg.sender);
        swapper.withdraw();
    }
}
