// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/**
 * @title A simple NFT swapper contract with no fee takers.
 * @author The Dark Jester
 * @notice You can use this contract for ERC721 swaps where one party can set up a deal and the other accept.
 * @notice Any party can sweeten the deal with ETH, but that must be set up by the initiator.
 */
interface ISwapTokens {
  enum TokenType {
    NONE,
    ERC20,
    ERC777, // erc20 really
    ERC721,
    ERC1155
  }

  /**
   * @dev Emitted when a new swap is initiated.
   * @param swapId The unique swapId.
   * @param initiator The initiator address.
   * @param acceptor The acceptor address.
   * @param swap The full swap data.
   */
  event SwapInitiated(uint256 indexed swapId, address indexed initiator, address indexed acceptor, Swap swap);

  /**
   * @dev Emitted when a new swap is removed by the initiator.
   * @param swapId The unique swapId.
   * @param initiator The initiator address.
   */
  event SwapRemoved(uint256 indexed swapId, address indexed initiator);

  /**
   * @dev Emitted when a a user withdraws their balance.
   * @param user The user address withdrawing a balance.
   * @param amount The amount being withdrawn.
   */
  event BalanceWithDrawn(address indexed user, uint256 amount);

  /**
   * @dev Emitted when a new swap is completed by the acceptor.
   * @param swapId The unique swapId.
   * @param initiator The initiator address.
   * @param acceptor The acceptor address.
   * @param swap The full swap data.
   */
  event SwapComplete(uint256 indexed swapId, address indexed initiator, address indexed acceptor, Swap swap);

  /**
   * @dev initiatorERCContract is the contract address for the initiator's NFT.
   * @dev acceptorERCContract is the contract address for the acceptors's NFT (may be same as initiator's).
   * @dev initiator is the address for the account initiating the swap.
   * @dev initiatorTokenIdOrAmount is the NFT Id for the initiator's token.
   * @dev acceptor is the address for the account accepting the swap.
   * @dev acceptorTokenIdOrAmount is the NFT Id for the acceptor's token.
   * @dev initiatorETHPortion is the ETH sweetener offered by the intiator.
   * @dev acceptorETHPortion is the ETH sweetener to be provided by the acceptor.
   * @dev initiatorTokenType The type of token used to determine swap mechanics.
   * @dev acceptorTokenType The type of token used to determine swap mechanics.
   */
  struct Swap {
    address initiatorERCContract;
    address acceptorERCContract;
    address initiator;
    uint256 initiatorTokenIdOrAmount;
    address acceptor;
    uint256 acceptorTokenIdOrAmount;
    uint256 initiatorETHPortion;
    uint256 acceptorETHPortion;
    TokenType initiatorTokenType;
    TokenType acceptorTokenType;
  }

  /**
   * @dev initiatorNeedsToOwnToken is the boolean indicating if the initiator owns the token.
   * @dev acceptorNeedsToOwnToken is the boolean indicating if the acceptor owns the token.
   * @dev initiatorTokenRequiresApproval is the boolean indicating if the initiator has approved the swap contract for the NFT.
   * @dev acceptorTokenRequiresApproval is the boolean indicating if the accepor has approved the swap contract for the NFT.
   * @dev isReadyForSwapping a bool indicating if the swap is ready.
   * @dev all have to be true for the swap to work.
   */
  struct SwapStatus {
    bool initiatorNeedsToOwnToken;
    bool acceptorNeedsToOwnToken;
    bool initiatorTokenRequiresApproval;
    bool acceptorTokenRequiresApproval;
    bool isReadyForSwapping;
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
   * @dev Thrown when the initiator is not providing a token or a value.
   */
  error InitiatorValueOrTokenMissing();

  /**
   * @dev Thrown when the acceptor is not providing a token or a value.
   */
  error AcceptorValueOrTokenMissing();

  /**
   * @dev Thrown when ETH is not provided on completing the swap.
   * @param expectedETHPortion The expected ETH portion.
   */
  error IncorrectOrMissingAcceptorETH(uint256 expectedETHPortion);

  /**
   * @dev Thrown when the destination for the ETH reverts acceptance.
   */
  error ETHSendingFailed();

  /**
   * @dev Thrown when the initiator in the config does not match the msg.sender.
   * @param expected The expected initiator address.
   * @param actual The actual initiator address (msg.sender).
   */
  error InitiatorNotMatched(address expected, address actual);

  /**
   * @dev Thrown when the initiator ETH portion does not match the msg.value.
   * @param expected The expected initator ETH portion.
   * @param actual The actual initator ETH portion (msg.value).
   */
  error InitiatorEthPortionNotMatched(uint256 expected, uint256 actual);

  /**
   * @notice Initiates a swap of two NFTs.
   * @dev If ETH is sent, it is used as the initiator ETH portion.
   * @dev msg.sender is the initiator.
   * @param _swap The full swap details.
   */
  function initiateSwap(Swap calldata _swap) external payable;

  /**
   * @notice Completes the swap.
   * @dev If ETH is sent, it is used as the acceptor ETH portion.
   * @dev msg.sender is the acceptor.
   * @dev The ETH portion is added to either the acceptor or the initiator balance.
   * @param _swapId The ID of the swap.
   * @param _swap The full swap data as retrieved from the initiating event.
   */
  function completeSwap(uint256 _swapId, Swap calldata _swap) external payable;

  /**
   * @notice Cancels/Removes the swap if not accepted.
   * @dev msg.sender is the initiator.
   * @dev The Initiator ETH portion is added to the initiator balance if exists.
   * @param _swapId The ID of the swap.
   * @param _swap The full swap data as retrieved from the initiating event.
   */
  function removeSwap(uint256 _swapId, Swap calldata _swap) external;

  /**
   * @notice Withdraws the msg.sender's balance if it exists.
   * @dev The ETH balance is sent to the msg.sender.
   */
  function withdraw() external;

  /**
   * @notice Retrieves the NFT status.
   * @param _swapId The ID of the swap.
   * @param _swap The full swap details.
   * @dev Unhandled error scenarios:
   * @dev  contract 1 does not exist.
   * @dev contract 2 does not exist.
   * @dev token 1 does not exist.
   * @dev token 2 does not exist.
   * @return swapStatus The checked ownership and permissions struct for both parties's NFTs.
   */
  function getSwapStatus(uint256 _swapId, Swap calldata _swap) external view returns (SwapStatus memory swapStatus);
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
