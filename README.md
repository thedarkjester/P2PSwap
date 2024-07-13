# OTC TokenSwapper

## Where is the official deploy at?

Verified contracts on Etherscan - 
Sepolia:
- https://sepolia.etherscan.io/address/0xea929e6916c6be1f649f9f0c6e7b8b0a5999414f#code

Mainnet:
- https://etherscan.io/address/0x26e36499b482cb2c738979eacf7b86bf00a301c3#code
- This is registered at: `otc-token-swap.eth` and `swap-token-otc.eth`

## Ok, so what is this Token Swapper thing? 

In our examples we will use two people who want to swap or sell their Token(s) directly to someone with the
security of an impartial escrow contract. We shall call them pI (person I for initiator) and pA (person A for acceptor).

These two parties find themselves chatting across various communities, Discord, X (Twitter), Farcaster, whatever, and decide they want to swap Token(s).

## How many flavours of swaps are there?

The Token Swapper is a way for two parties to:
- Sell ERC20s (or their variants, 777, xERC20 etc - just set ERC20) for ETH
- Swap ERC20s for other ERC20s, an ERC721, or a quantity of an ERC1155 tokens
- Sell an ERC721 for ETH
- Swap ERC721s for ERC20s, an ERC721, or a quantity of an ERC1155 tokens.
- Sell one or more ERC1155 for ETH
- Swap a quantity of an ERC1155 token for ERC20s, an ERC721, or a quantity of an ERC1155 tokens.

All token swaps can optionally include ETH on either the swap initiator's or swap acceptor's side.
e.g. My Pudgy Penguin for 3000 DAI and 1 ETH. or 10 of my ERC1155 Id=1 and 0.5 ETH for your Lazy Lion.

## Do I make fees or commission or anything on swaps/sells?
Nope, nada, zilch, nothing, diddly squat - I get nothing out of this. So why did I set this up? This is because a) I can, b) I want people to have a way to swap more easily than paying crazy fees to swap, or having to go through tons of hoops to get it done without having to trust people will just send them the token(s).

## Can I upgrade or make changes to rug?
Nope, the contract is not upgradeable and has no owners, everything is based on swap configuration and whoever interacts with the contract.

## How do you set up a swap then?

After discussing agreed terms, `pI will set up the swap` with those terms.  

**`Super important note for pI`:** If pA doesn't accept the swap, pI can always retrieve their sent ETH if any and remove the swap. (`removeSwap` function)

1. pI interacts with the swapper contract and gives the following information: (`initiateSwap` function)

   - pI's Token Contract address
   - pI's Token Type
   - pI's Token Id
   - pI's Token Quantity
   - pI's address
   - pA's Token Contract address
   - pI's Token Type
   - pA's Token Id
   - pA's Token Quantity
   - pA's address
   - Optional: ETH to sweeten the deal
   - Optional: An ETH value that pA is expected to sweeten the deal with

    **`Only one side can sweeten the deal as you might expect, it would be silly otherwise`**

2. pI and pA check the collection and tokenIds are correct (when there is a UI, this will be far simpler). 
3. Both pI and pA `approve` the Token Swapper contract on their respective Token Contracts (so the contract can swap them at the same time of course).
4. pA passes the `swapId` and `swap`details` into the contract to check if the following holds true (before spending and wasting gas accepting).

    a. pI still owns the Token(s) being swapped if any.
    
    b. pA still owns the Token(s) being swapped if any.

    c. The swapper contract has approval for pI's token.

    d. The swapper contract has approval for pA's token.

5. pA accepts the swap (sending ETH if the swap is expecting pA to sweeten the deal) and boom, the Token(s) change owners. (`completeSwap` function)
6. If pI or pA sweetened the deal with ETH, pI or pA can then `withdraw` their ETH from the contract at their leisure. Why didn't this happen automatically? - best practice is to use a withdraw pattern to keep operations discrete.

At this point it is important to note that the Swapper contract immediately loses approval for the Token(s) because they have changed ownership.

## FAQ
- Why do I have to pass the whole swap details back in to complete, remove or get the status?
  - Because it is far cheaper gas wise and the intent is to save gas.. gas bad.
- I see there is an ERC721Swapper deployed, what's with that?
  - Yes, it would be slightly cheaper to use it, but it is limited to just ERC721s on both sides (can't just sell).
  - This is found at: 
    - Mainnet [Verified contract on Etherscan](https://etherscan.io/address/0xeb85ef5be169362473eb535c60bc2a1dcfba1bc8#code)
    - Sepolia [Verified contract on Etherscan](https://sepolia.etherscan.io/address/0x1e29f6aeb2371728b83bf06caa1c5d8b5307411e#code)
    - See previous [Readme](ERC721Swapper.md) 
- Can I use this code/deploy it on other chains?
  - Of course, by all means go for it. Please keep attribution and pay attention to note 1 below.

## Notes for the Devs

1. A Cancun upgrade version is the default implementation and uses `transient storage` as well as `mcopy` for the hashing data. If deploying on another chain, comparable functions exist in the `PerTokenSwapping/LegacyUtils.sol` file.

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
