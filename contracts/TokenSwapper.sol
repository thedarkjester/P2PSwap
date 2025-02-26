// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ISwapTokens } from "./ISwapTokens.sol";
import { TransientStorage } from "./TransientStorage.sol";
import { SwapHashing } from "./SwapHashing.sol";

import { TokenSwapperBase } from "./TokenSwapperBase.sol";

/**
 * @title A simple Token swapper contract with no fee takers.
 * @author The Dark Jester
 * @notice You can use this contract for ERC-721,ERC-1155,ERC-20, xERC-20, ERC-777 swaps where one party can set up a deal and the other accept.
 * @notice Any party can sweeten the deal with ETH, but that must be set up by the initiator.
 * @custom:security-contact https://github.com/thedarkjester/P2PSwap/security/advisories/new
 */
contract TokenSwapper is TokenSwapperBase {
  /// @custom:storage-location erc7201:tokenswapper.sameswap.transient.key
  bytes32 private constant SAME_CONTRACT_SWAP_TRANSIENT_KEY =
    bytes32(uint256(keccak256("tokenswapper.sameswap.transient.key")) - 1) & ~bytes32(uint256(0xff));

  /// @custom:storage-location erc7201:tokenswapper.reentry.transient.key
  bytes32 private constant REENTRY_TRANSIENT_KEY =
    bytes32(uint256(keccak256("tokenswapper.reentry.transient.key")) - 1) & ~bytes32(uint256(0xff));

  using TransientStorage for *;
  using SwapHashing for *;

  /// @dev This exists purely to drop the deployment cost by a few hundred gas.
  constructor() payable {}

  /**
   * @dev Modifier to check reentry with transient storage.
   *
   */
  modifier nonReentrant() {
    if (TransientStorage._loadTransientBool(REENTRY_TRANSIENT_KEY)) {
      revert NoReentry();
    }

    TransientStorage._storeTransientBool(REENTRY_TRANSIENT_KEY, true);
    _;
    TransientStorage._storeTransientBool(REENTRY_TRANSIENT_KEY, false);
  }

  /**
   * @notice Completes the swap.
   * @dev If ETH is sent, it is used as the acceptor ETH portion.
   * @dev msg.sender is the acceptor.
   * @dev The ETH portion is added to either the acceptor or the initiator balance.
   * @param _swapId The ID of the swap.
   * @param _swap The swap data to use and verify.
   */
  function completeSwap(uint256 _swapId, Swap memory _swap) external payable nonReentrant {
    TransientStorage._storeTransientBool(
      SAME_CONTRACT_SWAP_TRANSIENT_KEY,
      _swap.acceptorERCContract == _swap.initiatorERCContract
    );

    _completeSwap(_swapId, _swap);

    TransientStorage._storeTransientBool(SAME_CONTRACT_SWAP_TRANSIENT_KEY, false);
  }

  /**
   * @notice Cancels/Removes the swap if not accepted.
   * @dev msg.sender is the initiator.
   * @dev The Initiator ETH portion is added to the initiator balance if exists.
   * @param _swapId The ID of the swap.
   */
  function removeSwap(uint256 _swapId, Swap calldata _swap) external nonReentrant {
    _removeSwap(_swapId, _swap);
  }

  /**
   * @notice Retrieves the isSameContractSwap value that is temporarily set.
   * @return isSameContractSwap If tokens are swapped between two parties on the same contract.
   */
  function isSwappingTokensOnSameContract() external view returns (bool isSameContractSwap) {
    isSameContractSwap = TransientStorage._loadTransientBool(SAME_CONTRACT_SWAP_TRANSIENT_KEY);
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
