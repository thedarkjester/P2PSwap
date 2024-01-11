// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

/// @title A simple NFT swapper contract with no fee takers.
/// @author The Dark Jester
/// @notice You can use this contract for ERC721 swaps where one party can set up a deal and the other accept.
/// @notice Any party can sweeten the deal with ETH, but that must be set up by the initiator.
interface IERC721Swapper {
  /**
   * @dev Emitted when a new swap is initiated.
   */
  event SwapInitiated(uint256 indexed swapId, address indexed initiator, address indexed acceptor);

  /**
   * @dev Emitted when a new swap is removed by the initiator.
   */
  event SwapRemoved(uint256 indexed swapId, address indexed initiator);

  /**
   * @dev Emitted when a new swap is completed by the acceptor.
   */
  event SwapComplete(uint256 indexed swapId, address indexed initiator, address indexed acceptor, Swap swap);

  /**
   * @dev swapId is the unique ID for the swap.
   * @dev initiatorNftContract is the contract address for the initiator's NFT.
   * @dev acceptorNftContract is the contract address for the acceptors's NFT (may be same as initiator's).
   * @dev initiator is the address for the account initiating the swap.
   * @dev initiatorTokenId is the NFT Id for the initiator's token.
   * @dev acceptor is the address for the account accepting the swap.
   * @dev acceptorTokenId is the NFT Id for the acceptor's token.
   * @dev initiatorETHPortion is the ETH sweetener offered by the intiator.
   * @dev acceptorETHPortion is the ETH sweetener to be provided by the acceptor.
   */
  struct Swap {
    uint256 swapId; // 1 slot 32 bytes
    address initiatorNftContract; // 20 bytes next slot
    address acceptorNftContract; // 20 bytes same slot
    address initiator; // 20 bytes same slot
    uint256 initiatorTokenId; // next slot 32 bytes
    address acceptor; // 20 bytes next slot
    uint256 acceptorTokenId; // next slot 32 bytes
    uint256 initiatorETHPortion; // next slot 32 bytes
    uint256 acceptorETHPortion; // next slot 32 bytes
  }

  /**
   * @dev initiatorOwnsToken is the boolean indicating if the initiator owns the token.
   * @dev acceptorOwnsToken is the boolean indicating if the acceptor owns the token.
   * @dev initiatorApprovalsSet is the boolean indicating if the initiator has approved the swap contract for the NFT.
   * @dev acceptorApprovalsSet is the boolean indicating if the accepor has approved the swap contract for the NFT.
   * @dev all have to be true for the swap to work.
   */
  struct SwapStatus {
    bool initiatorOwnsToken;
    bool acceptorOwnsToken;
    bool initiatorApprovalsSet;
    bool acceptorApprovalsSet;
  }

  /**
   * @dev Thrown when an address is address(0).
   */
  error ZeroAddressDisallowed();

  /**
   * @dev Thrown when the swap is expecting both parties to provide ETH.
   */
  error TwoWayEthPortionsDisallowed();

  /**
   * @dev Thrown when the swap is returns an empty struct.
   */
  error SwapCompleteOrDoesNotExist();

  /**
   * @dev Thrown when the balance of the withdrawing address is 0.
   */
  error EmptyWithdrawDisallowed();

  /**
   * @dev Thrown when the swap completor is not the acceptor account.
   */
  error NotAcceptor();

  /**
   * @dev Thrown when the swap remover is not the initiator account.
   */
  error NotInitiator();

  /**
   * @dev Thrown when ETH is not provided on completing the swap.
   */
  error IncorrectOrMissingAcceptorETH(uint256 expectedETHPortion);

  /**
   * @dev Thrown when ETH is sent directly to the contract.
   */
  error DirectFundingDisallowed();

  /**
   * @dev Thrown when the destination for the ETH reverts acceptance.
   */
  error ETHSendingFailed();

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
  ) external payable;

  /**
   * @notice Completes the swap.
   * @dev If ETH is sent, it is used as the acceptor ETH portion.
   * @dev msg.sender is the acceptor.
   * @dev The ETH portion is added to either the acceptor or the initiator balance.
   * @param _swapId The ID of the swap.
   */
  function completeSwap(uint256 _swapId) external payable;

  /**
   * @notice Cancels/Removes the swap if not accepted.
   * @dev msg.sender is the initiator.
   * @dev The Initiator ETH portion is added to the initiator balance if exists.
   * @param _swapId The ID of the swap.
   */
  function removeSwap(uint256 _swapId) external;

  /**
   * @notice Withdraws the msg.sender's balance if it exists.
   * @dev The ETH balance is sent to the msg.sender.
   */
  function withdraw() external;

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
  function getSwapStatus(uint256 _swapId) external view returns (SwapStatus memory swapStatus);
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