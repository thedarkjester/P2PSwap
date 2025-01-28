// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import { ISwapTokens } from "./ISwapTokens.sol";
/**
 * @title A helper file for token swapping transient storage.
 * @author The Dark Jester
 * @notice You can use this contract for multi-token swaps.
 * @custom:security-contact https://github.com/thedarkjester/P2PSwap/security/advisories/new
 */

library TransientStorage {
  /**
   * @notice Stores a transient bool.
   * @param _key The key for the storage.
   * @param _storedBool The value to set.
   */
  function _storeTransientBool(bytes32 _key, bool _storedBool) internal {
    assembly {
      tstore(_key, _storedBool)
    }
  }

  /**
   * @notice Resets a transient bool to default.
   * @param _key The key for the storage.
   */
  function _wipeTransientBool(bytes32 _key) internal {
    _storeTransientBool(_key, false);
  }

  /**
   * @notice Loads a transient bool's value by key.
   * @param _key The key for the storage.
   * @return boolValue The value to return.
   */
  function _loadTransientBool(bytes32 _key) internal view returns (bool boolValue) {
    assembly {
      boolValue := tload(_key)
    }
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
