# OTC TokenSwapper

## Where is the official deploy at?

### Previous versions:

**NB:** *The deploy at 0x5343B7751483F60714Dc237d88f796b8023b529E has been replaced as it didn't support USDT, NFTs with id=0, and has a potential issue on open swaps where ETH was allocated incorrectly*

### Current version:
If you wish to use the currently deployed app with the new features:
[p2pswap.app](https://p2pswap.app)
[p2pswap.eth.limo](https://p2pswap.eth.limo)

Verified contracts on Etherscan - 
Ethereum Sepolia:
- https://sepolia.etherscan.io/address/0xb9ec645254457ad5a07a100ca150006aac97d24e#code

Ethereum Mainnet:
- https://etherscan.io/address/0xb9ec645254457ad5a07a100ca150006aac97d24e#code
- This is registered at: `p2pswap.eth`, `swapp2p.eth` and `p2pswop.eth`

Verified contracts on LineaScan - 
Linea Sepolia:
- https://sepolia.lineascan.build/address/0xb9ec645254457ad5a07a100ca150006aac97d24e#code

Linea Mainnet:
- https://lineascan.build/address/0xb9ec645254457ad5a07a100ca150006aac97d24e#code

## Ok, so what is this Token Swapper thing? 

In our examples we will use two people who want to swap or sell their Token(s) directly to someone with the
security of a fee-less impartial escrow contract. For the explanation we will denote the two parties with the following:

- **`pI`** (person I for initiator) - the party that initiates the swap 
- **`pA`** (person A for acceptor) - the party that completes the swap

These two parties find themselves chatting across various communities, Reddit, Discord, X (Twitter), Farcaster, Telegram, whatever, and decide they want to swap Token(s) at whatever details they agree on.

**Note:** Open Swaps are also available and are discussed [further down](#open-swaps).

## How many flavours of swaps are there?

The Token Swapper is a way for two parties to:
- Sell ERC20s (or their variants, 777, xERC20 etc - just set ERC20) for ETH.
- Swap ERC20s for other ERC20s, an ERC721, or a quantity of an ERC1155 tokens.
- Sell an ERC721 for ETH.
- Swap ERC721s for ERC20s, an ERC721, or a quantity of an ERC1155 tokens.
- Sell one or more ERC1155s for ETH.
- Swap a quantity of an ERC1155 token for ERC20s, an ERC721, or a quantity of an ERC1155 tokens.

**Note:** `USDT is now supported` due to the `SafeERC20` library used from OpenZeppelin.

All token swaps can optionally include ETH on either the `pI's` or `pA's` side.
e.g. My Pudgy Penguin for 3000 DAI and 1 ETH, or 10 of my ERC1155s Id=1 and 0.5 ETH for your Lazy Lion.

## Do I make fees or commission or anything on swaps/sells?
Nope, nada, zilch, nothing, diddly squat - `I get nothing out of this`. So why did I set this up? This is because a) I can, b) I want people to have a way to swap more easily than paying crazy fees to swap, or having to go through tons of hoops to get it done without having to trust people will just send them the token(s) - no more `trust me bro, I will send it to you after`.

## Can I upgrade or make changes to rug?
Nope, the contract is not upgradeable and has no owners, everything is based on swap configuration and whoever interacts with the contract. The only thing I can do is deploy new contracts (at my own expense) and change the UI to point to it. There is nothing stopping you using the older versions should you prefer to.

## Why the two variants? NonCancun?
There are some L2 chains that currently `don't have features such as transient storage` (which is used to save gas and increase security) and support for them is included as the additional gas on an L2 costs fractionally less, so there is less concern there, and functional parity is paramount.

## But bro, does it use a ton of gas?
I have spent a lot of time and effort trying to tweak the gas to be as minimal as possible while optimising for functionality. 

```
|  Contract               ·  Method             ·  Min        ·  Max        ·  Avg        ·  # calls      ·  usd (avg)  │
··························|·····················|·············|·············|·············|···············|··············
|  NonCancunTokenSwapper  ·  completeSwap       ·      76871  ·     129176  ·     103132  ·           43  ·          -  │
··························|·····················|·············|·············|·············|···············|··············
|  NonCancunTokenSwapper  ·  initiateSwap       ·      59402  ·      60072  ·      59720  ·          118  ·          -  │
··························|·····················|·············|·············|·············|···············|··············
|  NonCancunTokenSwapper  ·  removeSwap         ·      29147  ·      51126  ·      35442  ·           21  ·          -  │
··························|·····················|·············|·············|·············|···············|··············
|  NonCancunTokenSwapper  ·  withdraw           ·          -  ·          -  ·      29915  ·            6  ·          -  │
··························|·····················|·············|·············|·············|···············|··············
|  TokenSwapper           ·  completeSwap       ·      69149  ·     125180  ·      98621  ·           43  ·          -  │
··························|·····················|·············|·············|·············|···············|··············
|  TokenSwapper           ·  initiateSwap       ·      59368  ·      60058  ·      59722  ·          118  ·          -  │
··························|·····················|·············|·············|·············|···············|··············
|  TokenSwapper           ·  removeSwap         ·      26792  ·      49087  ·      33173  ·           21  ·          -  │
··························|·····················|·············|·············|·············|···············|··············
|  TokenSwapper           ·  withdraw           ·          -  ·          -  ·      29895  ·            6  ·          -  │
```

#### Some tweaks:
- Assembly hashing 
- Storing less on chain to reduce SLOAD and SSTORE costs
- L1 Transient Storage
- viaIR compilation
- deleting on swap completion (saves a little gas and increases security)

## How do you set up a swap then?

After discussing agreed terms, `pI will set up the swap` with those terms.  

**`Super important note for pI`:** If pA doesn't accept the swap, pI can always retrieve their sent ETH if any and remove the swap. (`removeSwap` function)

1. `pI` interacts with the swapper contract and gives the following information: (`initiateSwap` function)
   - `Swap expiry` in the future to prevent later concerns
   - pI's Token Contract address (if not ETH only on pI's side, zero address otherwise) 
   - pI's Token Type (use `NONE` for ETH only on pI's side)
   - pI's Token Id (if not ETH only on pI's side, zero otherwise) 
   - pI's Token Quantity (if not ETH only on pI's side, zero otherwise) 
   - pI's address (this is automatic as `msg.sender`, so you could do this with a contract/Safe supporting relevant NFT interfaces)
   - pA's Token Contract address (if not ETH only on pA's side, zero address otherwise) 
   - pI's Token Type (use `NONE` for ETH only on pA's side)
   - pA's Token Id (if not ETH only on pI's side, zero otherwise)
   - pA's Token Quantity (if not ETH only on pI's side, zero otherwise)
   - pA's address (Optional if not an NFT - allows anyone to accept the deal)
   - Optional: ETH to sweeten the deal (Required if ETH only on pI's side)
   - Optional: An ETH value that pA is expected to sweeten the deal with (Required if ETH only on pA's side)

  **`Only one side can sweeten the deal as you might expect, it would be silly otherwise`**

Struct definitiona from [ISwapTokens.sol](./contracts/ISwapTokens.sol)
```
  struct Swap {
    uint256 expiryDate;
    address initiatorERCContract;
    address acceptorERCContract;
    address initiator;
    uint256 initiatorTokenId;
    uint256 initiatorTokenQuantity;
    address acceptor;
    uint256 acceptorTokenId;
    uint256 acceptorTokenQuantity;
    uint256 initiatorETHPortion;
    uint256 acceptorETHPortion;
    TokenType initiatorTokenType;
    TokenType acceptorTokenType;
  }
```



2. pI and pA check the collection(s) and tokenIds are correct. 
3. Both pI and pA `approve` the Token Swapper contract on their respective Token Contracts (so the contract can swap them at the same time of course).
4. pA passes the `swapId` and `swap`details` into the contract to check if the following holds true (before spending and wasting gas accepting).

    a. pI still owns the Token(s) being swapped if any.
    
    b. pA still owns the Token(s) being swapped if any.

    c. The swapper contract has approval for pI's token.

    d. The swapper contract has approval for pA's token.

    e. The deal has not expired.

    **Note:** The UI does this for you, but if you interact directly with the contract, you would do this.

5. pA accepts the swap (sending ETH if the swap is expecting pA to sweeten the deal) and boom, the Token(s) change owners. (`completeSwap` function)
6. If pI or pA sweetened the deal with ETH, pI or pA can then `withdraw` their ETH from the contract at their leisure. Why didn't this happen automatically? - best practice is to use a withdraw pattern to keep operations discrete.

At this point it is important to note that the Swapper contract immediately loses approval for the ERC721 Token(s) because they have changed ownership unless you manually did an `approveForAll`. The same goes for the `ERC20` variants if you only set the allowance to the swap amounts.

7. If the deal has expired and `pI` put ETH in, they can retrieve their balance by removing the swap and then withdrawing their funds.

## Open Swaps
When `pI` wishes to make the swap open for anyone to accept, they are able to do so by specifying the acceptor as `address zero`. Importantly, this cannot apply to ERC721s on `pA`, so only the ERC20/1155/ETH variants are applicable.

What this all means is that anyone can accept the swap provided they fit the criteria specified by `pI`. e.g. `First person to give me 1 ETH can have my SuperDuperABCNFT Id = 1`

## FAQ
- Why do I have to pass the whole swap details back in to complete, remove or get the status?
  - Because it is far cheaper gas wise and the intent is to save gas.. gas bad.
- Can I use this code/deploy it on other chains?
  - Of course, by all means go for it. Please keep attribution and pay attention to note 1 below.

## Notes for the Devs
Foundry is required: Please install with [https://getfoundry.sh/](https://getfoundry.sh/) - feel free to submit PRs for the Foundry tests.

1. A Cancun upgrade version is the default implementation and uses `transient storage`. If deploying on another chain, see the [NonCancunTokenSwapper](./contracts/NonCancunTokenSwapper.sol) file.

2. The following tasks can be run:

```shell
npx hardhat test
npx hardhat coverage
npx hardhat test --parallel
npx hardhat run scripts/deploy.ts
```

3. To find swaps you have initiated filter the `SwapInitiated` event with your address at topic 2.
4. To find swaps you have been added to accept filter the `SwapInitiated` event with your address at topic 3.
5. To check if you have removed a swap as the initiator filter the `SwapRemoved` event with your address at topic 2 or the swapId at topic 1.
6. To check if the swap has been completed, filter the `SwapComplete` event with either the swapId at topic 1, the initiator at 2 or acceptor at 3. The full swap details are in the data part of the event (Swap struct).
7. Use the event Swap Struct data for all the functions.
