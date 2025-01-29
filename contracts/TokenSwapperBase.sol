// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20 <=0.8.26;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ISwapTokens } from "./ISwapTokens.sol";
import { SwapHashing } from "./SwapHashing.sol";

/**
 * @title A simple Token swapper base contract with no fee takers.
 * @author The Dark Jester
 * @notice You can use this contract for ERC-721,ERC-1155,ERC-20, xERC-20, ERC-777 swaps where one party can set up a deal and the other accept.
 * @notice Any party can sweeten the deal with ETH, but that must be set up by the initiator.
 * @custom:security-contact https://github.com/thedarkjester/P2PSwap/security/advisories/new
 */
abstract contract TokenSwapperBase is ISwapTokens {
  using Address for *;

  address internal constant ZERO_ADDRESS = address(0);

  // Deployer pays for the slot vs. the first swapper. Being kind.
  uint256 public swapId = 1;

  mapping(uint256 id => bytes32 hashedSwap) public swapHashes;

  /**
   * @notice Initiates a swap of two tokens.
   * @dev The expiryDate only checks for the past and is user/dev dependant on how long a swap should be valid for.
   * @dev If ETH is sent, it is used as the initiator ETH portion.
   * @dev NB: Some invariant conditions:
   * @dev msg.sender is validated to be the initiator.
   * @dev msg.value must match the _swap.initiatorETHPortion to avoid sneaky exploits.
   * @param _swap The full swap details.
   */
  function initiateSwap(Swap memory _swap) external payable {
    if (_swap.expiryDate < block.timestamp) {
      revert SwapIsInThePast();
    }

    /// @dev allow zero address for any but ERC721.
    if (_swap.acceptor == ZERO_ADDRESS && _swap.acceptorTokenType == TokenType.ERC721) {
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

    if (_swap.initiatorTokenType == TokenType.NONE && _swap.acceptorTokenType == TokenType.NONE) {
      revert TwoWayEthPortionsDisallowed();
    }

    _getTokenTypeValidator(_swap.initiatorTokenType)(
      _swap.initiatorERCContract,
      _swap.initiatorETHPortion,
      _swap.initiatorTokenQuantity
    );

    if (_swap.initiatorTokenType == TokenType.NONE) {
      _swap.initiatorTokenId = 0;
      _swap.initiatorERCContract = ZERO_ADDRESS;
      _swap.initiatorTokenQuantity = 0;
    }

    _getTokenTypeValidator(_swap.acceptorTokenType)(
      _swap.acceptorERCContract,
      _swap.acceptorETHPortion,
      _swap.acceptorTokenQuantity
    );

    if (_swap.acceptorTokenType == TokenType.NONE) {
      _swap.acceptorTokenId = 0;
      _swap.acceptorERCContract = ZERO_ADDRESS;
      _swap.acceptorTokenQuantity = 0;
    }

    unchecked {
      uint256 newSwapId = swapId++;

      // _swap emitted to pass in later when querying, completing or removing
      emit SwapInitiated(newSwapId, msg.sender, _swap.acceptor, _swap);

      swapHashes[newSwapId] = SwapHashing._hashTokenSwap(_swap);
    }
  }

  /**
   * @notice Retrieves the Swap status.
   * @param _swapId The ID of the swap.
   * @param _swap The swap details.
   * @return swapStatus The checked ownership and permissions struct for both parties's NFTs.
   */
  function getSwapStatus(
    uint256 _swapId,
    ISwapTokens.Swap memory _swap
  ) external view returns (ISwapTokens.SwapStatus memory swapStatus) {
    if (swapHashes[_swapId] != SwapHashing._hashTokenSwap(_swap)) {
      revert ISwapTokens.SwapCompleteOrDoesNotExist();
    }

    (bool initiatorNeedsToOwnToken, bool initiatorTokenRequiresApproval) = _getTokenSwapStatusFunction(
      _swap.initiatorTokenType
    )(_swap.initiatorERCContract, _swap.initiatorTokenId, _swap.initiatorTokenQuantity, _swap.initiator);

    swapStatus.initiatorNeedsToOwnToken = initiatorNeedsToOwnToken;
    swapStatus.initiatorTokenRequiresApproval = initiatorTokenRequiresApproval;

    (bool acceptorNeedsToOwnToken, bool acceptorTokenRequiresApproval) = _getTokenSwapStatusFunction(
      _swap.acceptorTokenType
    )(_swap.acceptorERCContract, _swap.acceptorTokenId, _swap.acceptorTokenQuantity, _swap.acceptor);

    swapStatus.acceptorNeedsToOwnToken = acceptorNeedsToOwnToken;
    swapStatus.acceptorTokenRequiresApproval = acceptorTokenRequiresApproval;

    swapStatus.isReadyForSwapping =
      !(swapStatus.initiatorNeedsToOwnToken) &&
      !(swapStatus.initiatorTokenRequiresApproval) &&
      !(swapStatus.acceptorNeedsToOwnToken) &&
      !(swapStatus.acceptorTokenRequiresApproval);
  }

  /**
   * @notice Cancels/Removes the swap if not accepted.
   * @dev msg.sender is the initiator.
   * @dev The Initiator ETH portion is added to the initiator balance if exists.
   * @param _swapId The ID of the swap.
   */
  function _removeSwap(uint256 _swapId, Swap calldata _swap) internal {
    if (swapHashes[_swapId] != SwapHashing._hashTokenSwapCalldata(_swap)) {
      revert SwapCompleteOrDoesNotExist();
    }

    if (_swap.initiator != msg.sender) {
      revert NotInitiator();
    }

    delete swapHashes[_swapId];

    if (_swap.initiatorETHPortion > 0) {
      _sendEthPortion(msg.sender, _swap.initiatorETHPortion);
    }

    emit SwapRemoved(_swapId, msg.sender);
  }

  /**
   * @notice Transfers an ETH Portion.
   * @dev The ETH portion is transferred, users must check their wallet for reasonable gas consumption.
   * @param _destination The destination receiving the ETH.
   * @param _amount The amount to send.
   */
  function _sendEthPortion(address _destination, uint256 _amount) internal {

    emit EthPortionTransferred(_destination, _amount);

    payable(_destination).sendValue(_amount);
  }

  /**
   * @notice Completes the swap.
   * @dev If ETH is sent, it is used as the acceptor ETH portion.
   * @dev msg.sender is the acceptor.
   * @dev The ETH portion is added to either the acceptor or the initiator balance.
   * @param _swapId The ID of the swap.
   * @param _swap The swap data to use and verify.
   */
  function _completeSwap(uint256 _swapId, Swap memory _swap) internal {
    if (block.timestamp > _swap.expiryDate) {
      revert SwapHasExpired();
    }

    if (swapHashes[_swapId] != SwapHashing._hashTokenSwap(_swap)) {
      revert SwapCompleteOrDoesNotExist();
    }

    /// @dev allow anyone to accept if the acceptor address is empty.
    if (_swap.acceptor != ZERO_ADDRESS && _swap.acceptor != msg.sender) {
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
      _sendEthPortion(_swap.initiator, msg.value);
    }

    address realAcceptor = _swap.acceptor == ZERO_ADDRESS ? msg.sender : _swap.acceptor;

    if (_swap.initiatorETHPortion > 0) {
      _sendEthPortion(realAcceptor, _swap.initiatorETHPortion);
    }

    emit SwapComplete(_swapId, _swap.initiator, realAcceptor, _swap);

    _getTokenTransferer(_swap.initiatorTokenType)(
      _swap.initiatorERCContract,
      _swap.initiatorTokenId,
      _swap.initiatorTokenQuantity,
      _swap.initiator,
      realAcceptor
    );

    _getTokenTransferer(_swap.acceptorTokenType)(
      _swap.acceptorERCContract,
      _swap.acceptorTokenId,
      _swap.acceptorTokenQuantity,
      realAcceptor,
      _swap.initiator
    );
  }

  /**
   * @notice Returns dynamic token type validator.
   * @dev We don't care about tokenId being zero anywhere because 721s and 1155s can have id==0.
   * @param _tokenType The token type to return.
   * @return The parameter validator for the token type.
   */
  function _getTokenTypeValidator(
    ISwapTokens.TokenType _tokenType
  ) internal pure returns (function(address, uint256, uint256) internal pure) {
    if (_tokenType == ISwapTokens.TokenType.ERC721) {
      return _validateERC721SwapParameters;
    }

    if (_tokenType == ISwapTokens.TokenType.ERC20 || _tokenType == ISwapTokens.TokenType.ERC777) {
      return _validateERC20SwapParameters;
    }

    if (_tokenType == ISwapTokens.TokenType.ERC1155) {
      return _validateERC1155SwapParameters;
    }

    return _validateNoTokenTypeSwapParameters;
  }

  /**
   * @notice Validates ERC20 parameters.
   * @param _ercContract The ERC20 contract.
   * @param _tokenQuantity The token quantity.
   */
  function _validateERC20SwapParameters(address _ercContract, uint256, uint256 _tokenQuantity) internal pure {
    // validate address exists
    if (_ercContract == ZERO_ADDRESS) {
      revert ISwapTokens.ZeroAddressSetForValidTokenType();
    }

    // validate quantity > 0
    if (_tokenQuantity == 0) {
      revert ISwapTokens.TokenQuantityMissing();
    }
  }

  /**
   * @notice Validates ERC721 parameters.
   * @param _ercContract The ERC721 contract.
   */
  function _validateERC721SwapParameters(address _ercContract, uint256, uint256) internal pure {
    // validate address exists
    if (_ercContract == ZERO_ADDRESS) {
      revert ISwapTokens.ZeroAddressSetForValidTokenType();
    }
  }

  /**
   * @notice Validates ERC1155 parameters.
   * @param _ercContract The ERC1155 contract.
   * @param _tokenQuantity The tokenId.
   */
  function _validateERC1155SwapParameters(address _ercContract, uint256, uint256 _tokenQuantity) internal pure {
    // validate address exists
    if (_ercContract == ZERO_ADDRESS) {
      revert ISwapTokens.ZeroAddressSetForValidTokenType();
    }

    // validate quantity > 0
    if (_tokenQuantity == 0) {
      revert ISwapTokens.TokenQuantityMissing();
    }
  }

  /**
   * @notice Validates token type none parameters.
   * @param _ethPortion The ETH portion of the side of the swap.
   */
  function _validateNoTokenTypeSwapParameters(address, uint256 _ethPortion, uint256) internal pure {
    if (_ethPortion == 0) {
      revert ISwapTokens.ValueOrTokenMissing();
    }
  }

  /**
   * @notice Retrieves the function to determine a swap's status based on token type.
   * @param _tokenType The token type to return.
   * @return The swap status checking function.
   */
  function _getTokenSwapStatusFunction(
    ISwapTokens.TokenType _tokenType
  ) internal pure returns (function(address, uint256, uint256, address) view returns (bool, bool)) {
    if (_tokenType == ISwapTokens.TokenType.ERC20 || _tokenType == ISwapTokens.TokenType.ERC777) {
      return _erc20Status;
    }

    if (_tokenType == ISwapTokens.TokenType.ERC721) {
      return _erc721Status;
    }

    if (_tokenType == ISwapTokens.TokenType.ERC1155) {
      return _erc1155Status;
    }

    return _noneStatus;
  }

  /**
   * @notice Retrieves the function to determine a swap's status based on ERC20 token type.
   * @param _tokenAddress The token address being checked.
   * @param _tokenQuantity The token quantity being swapped.
   * @param _tokenOwner The expected owber of the token(s).
   * @return needsToOwnToken Does the user need to own the token.
   * @return tokenRequiresApproval Does the user need to grant approval.
   */
  function _erc20Status(
    address _tokenAddress,
    uint256,
    uint256 _tokenQuantity,
    address _tokenOwner
  ) internal view returns (bool needsToOwnToken, bool tokenRequiresApproval) {
    IERC20 erc20Token = IERC20(_tokenAddress);

    needsToOwnToken = erc20Token.balanceOf(_tokenOwner) < _tokenQuantity;
    tokenRequiresApproval = erc20Token.allowance(_tokenOwner, address(this)) < _tokenQuantity;
  }

  /**
   * @notice Retrieves the function to determine a swap's status based on ERC721 token type.
   * @param _tokenAddress The token address being checked.
   * @param _tokenId The token Id being swapped.
   * @param _tokenOwner The expected owber of the token(s).
   * @return needsToOwnToken Does the user need to own the token.
   * @return tokenRequiresApproval Does the user need to grant approval.
   */
  function _erc721Status(
    address _tokenAddress,
    uint256 _tokenId,
    uint256,
    address _tokenOwner
  ) internal view returns (bool needsToOwnToken, bool tokenRequiresApproval) {
    IERC721 erc721Token = IERC721(_tokenAddress);

    needsToOwnToken = erc721Token.ownerOf(_tokenId) != _tokenOwner;
    tokenRequiresApproval =
      erc721Token.getApproved(_tokenId) != address(this) &&
      !erc721Token.isApprovedForAll(_tokenOwner, address(this));
  }

  /**
   * @notice Retrieves the function to determine a swap's status based on ERC1155 token type.
   * @param _tokenAddress The token address being checked.
   * @param _tokenId The token Id being swapped.
   * @param _tokenQuantity The token quantity being swapped.
   * @param _tokenOwner The expected owber of the token(s).
   * @return needsToOwnToken Does the user need to own the token.
   * @return tokenRequiresApproval Does the user need to grant approval.
   */
  function _erc1155Status(
    address _tokenAddress,
    uint256 _tokenId,
    uint256 _tokenQuantity,
    address _tokenOwner
  ) internal view returns (bool needsToOwnToken, bool tokenRequiresApproval) {
    IERC1155 erc1155Token = IERC1155(_tokenAddress);

    needsToOwnToken = erc1155Token.balanceOf(_tokenOwner, _tokenId) < _tokenQuantity;
    tokenRequiresApproval = !erc1155Token.isApprovedForAll(_tokenOwner, address(this));
  }

  /**
   * @notice Retrieves the function to determine a swap's status based on NONE token type.
   * @dev default false values are expected.
   * @return needsToOwnToken Does the user need to own the token.
   * @return tokenRequiresApproval Does the user need to grant approval.
   */
  function _noneStatus(
    address,
    uint256,
    uint256,
    address
  ) internal view returns (bool needsToOwnToken, bool tokenRequiresApproval) {}

  /**
   * @notice Retrieves the function to transfer a swap's token based on token type.
   * @param _tokenType The token type to return.
   * @return Returns the function to do the transferring for the token type.
   */
  function _getTokenTransferer(
    ISwapTokens.TokenType _tokenType
  ) internal pure returns (function(address, uint256, uint256, address, address)) {
    if (_tokenType == ISwapTokens.TokenType.ERC20 || _tokenType == ISwapTokens.TokenType.ERC777) {
      return _erc20Transferer;
    }

    if (_tokenType == ISwapTokens.TokenType.ERC721) {
      return _erc721Transferer;
    }

    if (_tokenType == ISwapTokens.TokenType.ERC1155) {
      return _erc1155Transferer;
    }

    return _noneTransferer;
  }

  /**
   * @notice Retrieves the function to transfer a swap's token based on ERC20 token type.
   * @param _tokenAddress The token address being checked.
   * @param _tokenQuantity The token quantity being swapped.
   * @param _tokenOwner The expected owber of the token(s).
   * @param _recipient The token recipient.
   */
  function _erc20Transferer(
    address _tokenAddress,
    uint256,
    uint256 _tokenQuantity,
    address _tokenOwner,
    address _recipient
  ) internal {
    SafeERC20.safeTransferFrom(IERC20(_tokenAddress), _tokenOwner, _recipient, _tokenQuantity);
  }

  /**
   * @notice Retrieves the function to transfer a swap's token based on ERC721 token type.
   * @param _tokenAddress The token address being checked.
   * @param _tokenId The token Id being swapped.
   * @param _tokenOwner The expected owber of the token(s).
   * @param _recipient The token recipient.
   */
  function _erc721Transferer(
    address _tokenAddress,
    uint256 _tokenId,
    uint256,
    address _tokenOwner,
    address _recipient
  ) internal {
    IERC721(_tokenAddress).safeTransferFrom(_tokenOwner, _recipient, _tokenId);
  }

  /**
   * @notice Retrieves the function to transfer a swap's token based on ERC721 token type.
   * @param _tokenAddress The token address being checked.
   * @param _tokenId The token Id being swapped.
   * @param _tokenQuantity The token quantity being swapped.
   * @param _tokenOwner The expected owber of the token(s).
   * @param _recipient The token recipient.
   */
  function _erc1155Transferer(
    address _tokenAddress,
    uint256 _tokenId,
    uint256 _tokenQuantity,
    address _tokenOwner,
    address _recipient
  ) internal {
    IERC1155(_tokenAddress).safeTransferFrom(_tokenOwner, _recipient, _tokenId, _tokenQuantity, "0x");
  }

  /**
   * @notice Retrieves the function to transfer a swap's token based on NONE token type.
   * @dev While this seems counterintuitive to do nothing, it is cleaner this way.
   */
  function _noneTransferer(address, uint256, uint256, address, address) internal pure {}
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
