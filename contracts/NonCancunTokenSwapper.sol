// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ISwapTokens } from "./ISwapTokens.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SwapHashing } from "./SwapHashing.sol";
import { TokenSwapperBase } from "./TokenSwapperBase.sol";

/**
 * @title A simple Token swapper contract with no fee takers.
 * @author The Dark Jester
 * @notice You can use this contract for ERC721,ERC1155,ERC20, xERC20, ERC777 swaps where one party can set up a deal and the other accept.
 * @notice Any party can sweeten the deal with ETH, but that must be set up by the initiator.
 */
contract NonCancunTokenSwapper is ReentrancyGuard, TokenSwapperBase {
  using SwapHashing for *;

  uint256 private constant DEFAULT_IS_SAME_CONTRACT_SWAP = 1;
  uint256 private constant IS_SAME_CONTRACT_SWAP = 2;
  uint256 private constant IS_NOT_SAME_CONTRACT_SWAP = 1;

  uint256 private isSameContractSwap = DEFAULT_IS_SAME_CONTRACT_SWAP;

  /// @dev This exists purely to drop the deployment cost by a few hundred gas.
  constructor() payable {}

  /**
   * @notice Completes the swap.
   * @dev If ETH is sent, it is used as the acceptor ETH portion.
   * @dev msg.sender is the acceptor.
   * @dev The ETH portion is added to either the acceptor or the initiator balance.
   * @param _swapId The ID of the swap.
   * @param _swap The swap data to use and verify.
   */
  function completeSwap(uint256 _swapId, Swap memory _swap) external payable nonReentrant {
    /**
     * @dev While this is more expensive upfront with the SSTORE, the intent is that L2s will be the only consumers of this,
     * and it simplifies the codebase considerably.
     */
    if (_swap.initiatorERCContract == _swap.acceptorERCContract) {
      isSameContractSwap = IS_SAME_CONTRACT_SWAP;
    } else {
      isSameContractSwap = IS_NOT_SAME_CONTRACT_SWAP;
    }

    _completeSwap(_swapId, _swap);

    isSameContractSwap = DEFAULT_IS_SAME_CONTRACT_SWAP;
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
   * @notice Returns whether or not the swap is using the same contract address on both side.
   * @return returnedIsSameContractSwap The bool indicating if the swap is using the same address.
   */
  function isSwappingTokensOnSameContract() external view returns (bool returnedIsSameContractSwap) {
    return isSameContractSwap == IS_SAME_CONTRACT_SWAP;
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
