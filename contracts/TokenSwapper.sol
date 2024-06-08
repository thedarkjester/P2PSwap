// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ISwapTokens } from "./ISwapTokens.sol";
import { Utils } from "./Utils.sol";

/**
 * @title A simple NFT swapper contract with no fee takers.
 * @author The Dark Jester
 * @notice You can use this contract for ERC721 swaps where one party can set up a deal and the other accept.
 * @notice Any party can sweeten the deal with ETH, but that must be set up by the initiator.
 */
contract TokenSwapper is ISwapTokens {
  bytes32 private constant SAME_CONTRACT_SWAP_TRANSIENT_KEY =
    bytes32(uint256(keccak256("eip1967.same.contract.swap.transient.key")) - 1);

  using Utils for *;

  address private constant ZERO_ADDRESS = address(0);

  // user account => balance
  mapping(address userAddress => uint256 balance) public balances;

  // Deployer pays for the slot vs. the first swapper. Being kind.
  uint256 public swapId = 1;

  mapping(uint256 id => bytes32 hashedSwap) public swapHashes;

  /// @dev This exists purely to drop the deployment cost by a few hundred gas.
  constructor() payable {}

  /**
   * @notice Initiates a swap of two NFTs.
   * @dev If ETH is sent, it is used as the initiator ETH portion.
   * @dev NB: Some invariant conditions:
   * @dev msg.sender is validated to be the initiator, and,
   * This is deliberate so that nobody and do it without you knowing.
   * @dev msg.value must match the _swap.initiatorETHPortion to avoid sneaky exploits.
   * @param _swap The full swap details.
   */
  function initiateSwap(Swap memory _swap) external payable {
    if (_swap.acceptor == ZERO_ADDRESS) {
      revert ZeroAddressDisallowed();
    }

    if (msg.sender != _swap.initiator) {
      revert InitiatorNotMatched(_swap.initiator, msg.sender);
    }

    if (msg.value != _swap.initiatorETHPortion) {
      revert InitiatorEthPortionNotMatched(_swap.initiatorETHPortion, msg.value);
    }

    if (msg.value > 0 && _swap.acceptorETHPortion > 0) {
      revert TwoWayEthPortionsDisallowed();
    }

    getTokenTypeValidator(_swap.initiatorTokenType)(
      _swap.initiatorERCContract,
      _swap.initiatorETHPortion,
      _swap.initiatorTokenId,
      _swap.initiatorTokenQuantity
    );

    if (_swap.initiatorTokenType == TokenType.NONE) {
      _swap.initiatorTokenId = 0;
      _swap.initiatorERCContract = ZERO_ADDRESS;
      _swap.initiatorTokenQuantity = 0;
    }

    getTokenTypeValidator(_swap.acceptorTokenType)(
      _swap.acceptorERCContract,
      _swap.acceptorETHPortion,
      _swap.acceptorTokenId,
      _swap.acceptorTokenQuantity
    );

    if (_swap.acceptorTokenType == TokenType.NONE) {
      _swap.acceptorTokenId = 0;
      _swap.acceptorERCContract = ZERO_ADDRESS;
      _swap.acceptorTokenQuantity = 0;
    }

    unchecked {
      uint256 newSwapId = swapId++;
      swapHashes[newSwapId] = Utils.hashTokenSwap(_swap);

      // _swap emitted to pass in later when querying, completing or removing
      emit SwapInitiated(newSwapId, msg.sender, _swap.acceptor, _swap);
    }
  }

  function getTokenTypeValidator(
    TokenType _tokenType
  ) internal pure returns (function(address, uint256, uint256, uint256) internal pure) {
    if (_tokenType == TokenType.ERC721) {
      return validateERC721SwapParameters;
    }

    if (_tokenType == TokenType.ERC20 || _tokenType == TokenType.ERC777) {
      return validateERC20SwapParameters;
    }

    if (_tokenType == TokenType.ERC1155) {
      return validateERC1155SwapParameters;
    }

    return validateNoTokenTypeSwapParameters;
  }

  function validateERC20SwapParameters(address _ercContract, uint256, uint256, uint256 _tokenQuantity) internal pure {
    // validate address exists
    if (_ercContract == ZERO_ADDRESS) {
      revert ZeroAddressSetForValidTokenType();
    }

    // validate quantity > 0
    if (_tokenQuantity == 0) {
      revert TokenQuantityMissing();
    }
  }

  function validateERC721SwapParameters(address _ercContract, uint256, uint256 _tokenId, uint256) internal pure {
    // validate address exists
    if (_ercContract == ZERO_ADDRESS) {
      revert ZeroAddressSetForValidTokenType();
    }

    // validate _tokenId > 0
    if (_tokenId == 0) {
      revert TokenIdMissing();
    }
  }

  function validateERC1155SwapParameters(
    address _ercContract,
    uint256,
    uint256 _tokenId,
    uint256 _tokenQuantity
  ) internal pure {
    // validate address exists
    // validate tokenId > 0
    // validate _tokenQuantity > 0

    // validate address exists
    if (_ercContract == ZERO_ADDRESS) {
      revert ZeroAddressSetForValidTokenType();
    }

    // validate _tokenId > 0
    if (_tokenId == 0) {
      revert TokenIdMissing();
    }

    // validate quantity > 0
    if (_tokenQuantity == 0) {
      revert TokenQuantityMissing();
    }
  }

  function validateNoTokenTypeSwapParameters(address, uint256 _ethPortion, uint256, uint256) internal pure {
    if (_ethPortion == 0) {
      revert ValueOrTokenMissing();
    }
  }

  /**
   * @notice Completes the swap.
   * @dev If ETH is sent, it is used as the acceptor ETH portion.
   * @dev msg.sender is the acceptor.
   * @dev The ETH portion is added to either the acceptor or the initiator balance.
   * @param _swapId The ID of the swap.
   * @param _swap The swap data to use and verify.
   */
  function completeSwap(uint256 _swapId, Swap memory _swap) external payable {
    if (swapHashes[_swapId] != Utils.hashTokenSwap(_swap)) {
      revert SwapCompleteOrDoesNotExist();
    }

    if (_swap.acceptor != msg.sender) {
      revert NotAcceptor();
    }

    if (_swap.initiatorETHPortion > 0 && msg.value > 0) {
      revert TwoWayEthPortionsDisallowed();
    }

    if (_swap.acceptorETHPortion != msg.value) {
      revert IncorrectOrMissingAcceptorETH(_swap.acceptorETHPortion);
    }

    /// @dev Doing this prevents reentry.
    delete swapHashes[_swapId];

    if (msg.value > 0) {
      unchecked {
        /// @dev msg.value should never overflow - nobody has that amount of ETH.
        balances[_swap.initiator] += msg.value;
      }
    }

    if (_swap.initiatorETHPortion > 0) {
      unchecked {
        /// @dev This should never overflow - portion is either zero or a number way less that max uint256.
        balances[_swap.acceptor] += _swap.initiatorETHPortion;
      }
    }

    emit SwapComplete(_swapId, _swap.initiator, _swap.acceptor, _swap);

    Utils.storeTransientBool(SAME_CONTRACT_SWAP_TRANSIENT_KEY, _swap.acceptorERCContract == _swap.initiatorERCContract);

    getTokenTransfer(_swap.initiatorTokenType)(
      _swap.initiatorERCContract,
      _swap.initiatorTokenId,
      _swap.initiatorTokenQuantity,
      _swap.initiator,
      _swap.acceptor
    );

    getTokenTransfer(_swap.acceptorTokenType)(
      _swap.acceptorERCContract,
      _swap.acceptorTokenId,
      _swap.acceptorTokenQuantity,
      _swap.acceptor,
      _swap.initiator
    );

    Utils.wipeTransientBool(SAME_CONTRACT_SWAP_TRANSIENT_KEY);
  }

  /**
   * @notice Cancels/Removes the swap if not accepted.
   * @dev msg.sender is the initiator.
   * @dev The Initiator ETH portion is added to the initiator balance if exists.
   * @param _swapId The ID of the swap.
   */
  function removeSwap(uint256 _swapId, Swap memory _swap) external {
    if (swapHashes[_swapId] != Utils.hashTokenSwap(_swap)) {
      revert SwapCompleteOrDoesNotExist();
    }

    if (_swap.initiator != msg.sender) {
      revert NotInitiator();
    }

    delete swapHashes[_swapId];

    if (_swap.initiatorETHPortion > 0) {
      unchecked {
        // msg.value should never overflow - nobody has that amount of ETH
        balances[msg.sender] += _swap.initiatorETHPortion;
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

    delete balances[msg.sender];

    emit BalanceWithDrawn(msg.sender, callerBalance);

    bytes4 errorSelector = ISwapTokens.ETHSendingFailed.selector;
    assembly {
      let success := call(gas(), caller(), callerBalance, 0, 0, 0, 0)
      if iszero(success) {
        let ptr := mload(0x40)
        mstore(ptr, errorSelector)
        revert(ptr, 0x4)
      }
    }
  }

  /**
   * @notice Retrieves the Swap status.
   * @param _swapId The ID of the swap.
   * @param _swap The swap details.
   * @return swapStatus The checked ownership and permissions struct for both parties's NFTs.
   */
  function getSwapStatus(uint256 _swapId, Swap memory _swap) external view returns (SwapStatus memory swapStatus) {
    if (swapHashes[_swapId] != Utils.hashTokenSwap(_swap)) {
      revert SwapCompleteOrDoesNotExist();
    }

    (bool initiatorNeedsToOwnToken, bool initiatorTokenRequiresApproval) = getTokenSwapStatus(_swap.initiatorTokenType)(
      _swap.initiatorERCContract,
      _swap.initiatorTokenId,
      _swap.initiatorTokenQuantity,
      _swap.initiator
    );

    swapStatus.initiatorNeedsToOwnToken = initiatorNeedsToOwnToken;
    swapStatus.initiatorTokenRequiresApproval = initiatorTokenRequiresApproval;

    (bool acceptorNeedsToOwnToken, bool acceptorTokenRequiresApproval) = getTokenSwapStatus(_swap.acceptorTokenType)(
      _swap.acceptorERCContract,
      _swap.acceptorTokenId,
      _swap.acceptorTokenQuantity,
      _swap.acceptor
    );

    swapStatus.acceptorNeedsToOwnToken = acceptorNeedsToOwnToken;
    swapStatus.acceptorTokenRequiresApproval = acceptorTokenRequiresApproval;

    swapStatus.isReadyForSwapping =
      !(swapStatus.initiatorNeedsToOwnToken) &&
      !(swapStatus.initiatorTokenRequiresApproval) &&
      !(swapStatus.acceptorNeedsToOwnToken) &&
      !(swapStatus.acceptorTokenRequiresApproval);
  }

  function isSwappingTokensOnSameContract() external view returns (bool isSameContractSwap) {
    isSameContractSwap = Utils.loadTransientBool(SAME_CONTRACT_SWAP_TRANSIENT_KEY);
  }

  /**
   * @notice Retrieves the function to determine a swap's status based on token type.
   * @return The swap function.
   */
  function getTokenSwapStatus(
    TokenType _tokenType
  ) internal pure returns (function(address, uint256, uint256, address) view returns (bool, bool)) {
    if (_tokenType == TokenType.ERC20 || _tokenType == TokenType.ERC777) {
      return erc20Status;
    }

    if (_tokenType == TokenType.ERC721) {
      return erc721Status;
    }

    if (_tokenType == TokenType.ERC1155) {
      return erc1155Status;
    }

    return noneStatus;
  }

  /**
   * @notice Retrieves the function to transfer a swap's token based on token type.
   */
  function getTokenTransfer(
    TokenType _tokenType
  ) internal pure returns (function(address, uint256, uint256, address, address)) {
    if (_tokenType == TokenType.ERC20 || _tokenType == TokenType.ERC777) {
      return erc20Transferer;
    }

    if (_tokenType == TokenType.ERC721) {
      return erc721Transferer;
    }

    if (_tokenType == TokenType.ERC1155) {
      return erc1155Transferer;
    }

    return noneTransferer;
  }

  /**
   * @notice Retrieves the function to transfer a swap's token based on token type.
   */
  function erc20Transferer(
    address _tokenAddress,
    uint256,
    uint256 _tokenQuantity,
    address _tokenOwner,
    address _recipient
  ) internal {
    if (!IERC20(_tokenAddress).transferFrom(_tokenOwner, _recipient, _tokenQuantity)) {
      revert TokenTransferFailed(_tokenAddress, _tokenQuantity);
    }
  }

  function erc721Transferer(
    address _tokenAddress,
    uint256 _tokenId,
    uint256,
    address _tokenOwner,
    address _recipient
  ) internal {
    IERC721(_tokenAddress).safeTransferFrom(_tokenOwner, _recipient, _tokenId);
  }

  function erc1155Transferer(
    address _tokenAddress,
    uint256 _tokenId,
    uint256 _tokenQuantity,
    address _tokenOwner,
    address _recipient
  ) internal {
    IERC1155(_tokenAddress).safeTransferFrom(_tokenOwner, _recipient, _tokenId, _tokenQuantity, "0x");
  }

  function noneTransferer(address, uint256, uint256, address, address) internal pure {}

  function erc20Status(
    address _tokenAddress,
    uint256,
    uint256 _tokenQuantity,
    address _tokenOwner
  ) internal view returns (bool needsToOwnToken, bool tokenRequiresApproval) {
    IERC20 erc20Token = IERC20(_tokenAddress);

    needsToOwnToken = erc20Token.balanceOf(_tokenOwner) < _tokenQuantity;
    tokenRequiresApproval = erc20Token.allowance(_tokenOwner, address(this)) < _tokenQuantity;
  }

  function erc721Status(
    address _tokenAddress,
    uint256 _tokenId,
    uint256,
    address _tokenOwner
  ) internal view returns (bool needsToOwnToken, bool tokenRequiresApproval) {
    IERC721 erc721Token = IERC721(_tokenAddress);

    needsToOwnToken = erc721Token.ownerOf(_tokenId) != _tokenOwner;
    tokenRequiresApproval = erc721Token.getApproved(_tokenId) != address(this);
  }

  function erc1155Status(
    address _tokenAddress,
    uint256 _tokenId,
    uint256 _tokenQuantity,
    address _tokenOwner
  ) internal view returns (bool needsToOwnToken, bool tokenRequiresApproval) {
    IERC1155 erc1155Token = IERC1155(_tokenAddress);

    needsToOwnToken = erc1155Token.balanceOf(_tokenOwner, _tokenId) < _tokenQuantity;
    tokenRequiresApproval = !erc1155Token.isApprovedForAll(_tokenOwner, address(this));
  }

  function noneStatus(
    address,
    uint256,
    uint256,
    address
  ) internal view returns (bool needsToOwnToken, bool tokenRequiresApproval) {}
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
