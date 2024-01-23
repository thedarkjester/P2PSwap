// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Swapper } from "./IERC721Swapper.sol";

/**
 * @title A simple NFT swapper contract with no fee takers.
 * @author The Dark Jester
 * @notice You can use this contract for ERC721 swaps where one party can set up a deal and the other accept.
 * @notice Any party can sweeten the deal with ETH, but that must be set up by the initiator.
 */
contract ERC721Swapper is IERC721Swapper {
  address private constant ZERO_ADDRESS = address(0);

  // user account => balance
  mapping(address => uint256) public balances;

  // Deployer pays for the slot vs. the first swapper. Being kind.
  uint256 public swapId = 1;

  // swapId=>Swap
  mapping(uint256 => Swap) public swaps;

  /**
   * @notice Initiates a swap of two NFTs.
   * @dev If ETH is sent, it is used as the initiator ETH portion.
   * @dev msg.sender is the initiator.
   * @param _initiatorNftContract The NFT contract address of the initiator.
   * @param _acceptorNftContract The NFT contract address of the acceptor.
   * @param _acceptor The acceptor address of the swap.
   * @param _acceptorETHPortion The ETH portion to be provided by the acceptor.
   * @param _initiatorTokenId The initiator's NFT token ID.
   * @param _acceptorTokenId The acceptos's NFT token ID.
   */
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

      swaps[newSwapId] = Swap({
        initiatorNftContract: _initiatorNftContract,
        acceptorNftContract: _acceptorNftContract,
        initiator: msg.sender,
        initiatorTokenId: _initiatorTokenId,
        acceptor: _acceptor,
        acceptorTokenId: _acceptorTokenId,
        initiatorETHPortion: msg.value,
        acceptorETHPortion: _acceptorETHPortion
      });

      emit SwapInitiated(newSwapId, msg.sender, _acceptor);
    }
  }

  /**
   * @notice Completes the swap.
   * @dev If ETH is sent, it is used as the acceptor ETH portion.
   * @dev msg.sender is the acceptor.
   * @dev The ETH portion is added to either the acceptor or the initiator balance.
   * @param _swapId The ID of the swap.
   */
  function completeSwap(uint256 _swapId) external payable {
    Swap memory swap = swaps[_swapId];

    if (swap.initiator == ZERO_ADDRESS) {
      revert SwapCompleteOrDoesNotExist();
    }

    if (swap.acceptor != msg.sender) {
      revert NotAcceptor();
    }

    if (swap.initiatorETHPortion > 0 && msg.value > 0) {
      revert TwoWayEthPortionsDisallowed();
    }

    if (swap.acceptorETHPortion != msg.value) {
      revert IncorrectOrMissingAcceptorETH(swap.acceptorETHPortion);
    }

    if (msg.value > 0) {
      unchecked {
        // msg.value should never overflow - nobody has that amount of ETH
        balances[swap.initiator] += msg.value;
      }
    }

    if (swap.initiatorETHPortion > 0) {
      unchecked {
        // This should never overflow - portion is either zero or a number way less that max uint256
        balances[swap.acceptor] += swap.initiatorETHPortion;
      }
    }

    // trash this as the deal is done and any reentry fails
    delete swaps[_swapId];

    IERC721 initiatorNftContract = IERC721(swap.initiatorNftContract);
    IERC721 acceptorNftContract = IERC721(swap.acceptorNftContract);

    initiatorNftContract.safeTransferFrom(swap.initiator, swap.acceptor, swap.initiatorTokenId);
    acceptorNftContract.safeTransferFrom(swap.acceptor, swap.initiator, swap.acceptorTokenId);

    emit SwapComplete(_swapId, swap.initiator, swap.acceptor, swap);
  }

  /**
   * @notice Cancels/Removes the swap if not accepted.
   * @dev msg.sender is the initiator.
   * @dev The Initiator ETH portion is added to the initiator balance if exists.
   * @param _swapId The ID of the swap.
   */
  function removeSwap(uint256 _swapId) external {
    Swap memory swap = swaps[_swapId];

    if (swap.initiator == ZERO_ADDRESS) {
      revert SwapCompleteOrDoesNotExist();
    }

    if (swap.initiator != msg.sender) {
      revert NotInitiator();
    }

    delete swaps[_swapId];

    if (swap.initiatorETHPortion > 0) {
      unchecked {
        // msg.value should never overflow - nobody has that amount of ETH
        balances[msg.sender] += swap.initiatorETHPortion;
      }
    }

    emit SwapRemoved(_swapId, msg.sender);
  }

  /**
   * @notice Withdraws the msg.sender's balance if it exists.
   * @dev The ETH balance is sent to the msg.sender.
   */
  function withdraw() external {
    uint256 callerBalance = balances[msg.sender];

    if (callerBalance == 0) {
      revert EmptyWithdrawDisallowed();
    }

    balances[msg.sender] = 0;

    (bool success, ) = msg.sender.call{ value: callerBalance }("");

    if (!success) {
      revert ETHSendingFailed();
    }
  }

  /**
   * @notice Retrieves the NFT status.
   * @param _swapId The ID of the swap.
   * @dev Unhandled error scenarios:
   * @dev  contract 1 does not exist.
   * @dev contract 2 does not exist.
   * @dev token 1 does not exist.
   * @dev token 2 does not exist.
   * @return swapStatus The checked ownership and permissions struct for both parties's NFTs.
   */
  function getSwapStatus(uint256 _swapId) external view returns (SwapStatus memory swapStatus) {
    Swap memory swap = swaps[_swapId];

    if (swap.initiator == ZERO_ADDRESS) {
      revert SwapCompleteOrDoesNotExist();
    }

    IERC721 initiatorNftContract = IERC721(swap.initiatorNftContract);

    address initiatorTokenOwner = initiatorNftContract.ownerOf(swap.initiatorTokenId);
    swapStatus.initiatorOwnsToken = initiatorTokenOwner == swap.initiator;

    address initiatorApproved = initiatorNftContract.getApproved(swap.initiatorTokenId);
    swapStatus.initiatorApprovalsSet = initiatorApproved == address(this);

    IERC721 acceptorNftContract = IERC721(swap.acceptorNftContract);
    address acceptorTokenOwner = acceptorNftContract.ownerOf(swap.acceptorTokenId);
    swapStatus.acceptorOwnsToken = acceptorTokenOwner == swap.acceptor;

    address acceptorApproved = acceptorNftContract.getApproved(swap.initiatorTokenId);
    swapStatus.acceptorApprovalsSet = acceptorApproved == address(this);
  }

  fallback() external payable {
    revert DirectFundingDisallowed();
  }

  receive() external payable {
    revert DirectFundingDisallowed();
  }
}

/*   
                                                              
T H E D A R K J E S T E R . E T H


                                        %%##%%%&                                
                           ,@@@@(     %#%%%%%%%%%&                              
                          ,&&&&@@@& %##%%%&%    ,#&                             
                          &&&&%&&&&%%#%#%%&       #                             
                         *&   %&& @% .% @&%       .,                            
                         /     & %  @#% @%&%                                    
                                  /....@/#&&                                    
                                  .../*@..%&.                                   
                                 ,    **&@&&                                    
                           *&#%%&%&&@@&&&&%&@@&@                                
                       %#####&&&&&&&&&/(&&&&&&&&&&&%%                            
                     %#######&&&&&&&#//((%&&&&&&&&&@@&&(                         
 @@# *&*   @&       &%######%&&&&&&////((((&&&&&&&&@@&&&&                        
 . .%&&&&%%@&*     &%########&&&&//////(((((#&&&&&&@@&@%@#                       
     &&&@@&@@@@@&&@&#&&%#####&&&////(((())(((&&&&&@@@@@@&                       
    &*&&&@&%@@@@@@@@@&&%#%###&#((((((()))))))))%&&&&&&@%%%                       
     &%&&&&@@@@@@@&@&&#*  ##&&#\(((#(((())))))%%&&@@&&&%%@                      
    % %*&%.%.  .*@&@#  * .#%&&&&//(# T D J ((&&&&@@@ &&&&&&&*                   
       / %*              , #%&&&&&/////((((/&&&&&&@  @&&&&&&%%%##/#/  .*&&*      
         .,                 #&&&&&&%///(((/&&&&&&&(    /&%%%&%%%%&%&%%%%@@@@@@@@,
                             @%#%%%##\%%&/&&@&@@*         &%%&%%%&%%%&%@@@@ #%@@
                            &#&&@&&&&&\&/@@@@@@@@@             *%&&%&&%&&@@   #@ 
                           ##&@&&%%%%%&&&@&@&@@&&@               %%&&%#.%  @    
                          ,#%&@&&&%#%%&&&&&&@@&&@@/             *% *%%( &       
                          .#%@@@&@%%%%&&&&&&&&&&@@.                 *%          
                          %#&@@&&@%%%%&&&&&&&&&&&&&.                 (          
                          ##&@&&&&%%%&&&&&%%&&%%&&&%                            
                          #%&@&&&&&%%&%&&&%%%%%%%%&%&                           
                         *#&&@&&&&@#@@%%&&%%%%%%%%%&%&                          
                         %&&@@&&&&&@@@@%%%%%%%%%%%%%%%&                         
                         &&&@@&&&&&@@#   %%%%%%%%%%%%%%.                        
                         &&&@@&&&&&&#     *%%%%%%%%%%%%%                        
                         .%&@@&&&&&@        %%%%%%%%%%%%%                       
                          &&@@&@@&&/         ,%%%%%%%%%%%&,                     
                           &@@@@@@&@           %%%%%%%%%%%%%                    
                           @@@@@@@@@#           (%%%%%%&%%%%%%                  
                           (&&@@@@@@@             %%%%%%&%%%%%#                 
                            @&&@@@@@&@             /%%%%%&%%%%%(                
                             &&&@@@@@@               %%%%%&&%%%%                
                             *&&&@@@@@@               %%%%%%&&%%&               
                              (&&&@@@@&@.               &%%%%%&%%%&             
                               #&&@@@@@@@                 &%%&%&%&&             
                                  @@@@@@@&@                  &&&&%%&%           
                                  &@@&&&&@ .                %&%&&%@%&&%         
                                 *&@@&&@@&&                 %%%.@&(&&@          
                             &&@&&&&@@@@@@(                 %(%#&&%(%,          
                               (#%#,                         ,,&&@&&&,  
                                                              
T H E D A R K J E S T E R . E T H
                
*/
