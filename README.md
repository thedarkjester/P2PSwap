# NFTSwapper

## Where is the official deploy at?
https://etherscan.io/address/0xa487cebf0e08249b8e976554167187cd76fcc09a

## Ok, so what is this ERC721 Swapper thing? 

The ERC721 Swapper is a way for two parties to swap NFTs from either the same collection, or across two collections. One party can also sweeten the deal with ETH, but isn't mandatory - depends on the swap's deal.

In our examples we will use two people who want to swap their NFTs, we shall call them pI (person I for initiator) and pA (person A for acceptor).

These two parties find themselves chatting across various communities, Discord, X (Twitter), Farcaster, whatever, and decide they want to swap NFTs.

## Do I make fees or commission or anything on swaps?
Nope, nada, zilch, nothing, diddly squat - I get nothing out of this. So why did I set this up? This is because a) I can, b) I want people to have a way to swap more easily than paying crazy fees to swap, or having to go through tons of hoops to get it done without having to trust people will just send them.

## Can I upgrade or make changes to rug?
Nope, the contract is not upgradeable and has no owners, everything is based on swap configuration and whoever interacts with the contract.

## How many flavours of swaps are there?

There are three main flavours of swap (yes, yes, for those super detail oriented, there are more depending on cross-collection swaps):

1. Straightup 1 for 1 swap - NFT for NFT, no ETH changes hands.
2. pI sweetens the deal by sending some additional ETH along with the NFT. (e.g. pI's Ape + 0.1 ETH for pA's Squiggle).
3. pA is expected to sweeten the deal. (e.g. pI's Ape for pA's Squiggle + 0.2 ETH ).

## How do you set up a swap then?

After discussing agreed terms, `pI will set up the swap` with those terms.  

**`Super important note for pI`:** If pA doesn't accept the swap, pI can always retrieve their sent ETH if any and remove the swap. (`removeSwap` function)

1. pI interacts with the swapper contract and gives the following information: (`initiateSwap` function)

    a. pI's NFT Contract address

    b. pI's NFT Token Id

    c. pA's NFT Contract address

    d. pA's NFT Token Id

    e. pA's address

    f. Optional: ETH to sweeten the deal

    g. Optional: An ETH value that pA is expected to sweeten the deal with

    **`Only one side can sweeten the deal as you might expect, it would be silly otherwise`**

2. pI and pI check the collection and tokenIds are correct (when there is a UI, this will be far simpler). 
3. Both pI and pA `approve` the ERC721 Swapper contract on their respective NFT Contracts (so the contract can swap them at the same time of course).
4. pA passes the `swapId` into the contract to check if the following holds true (before spending and wasting gas accepting).

    a. pI still owns the NFT being swapped.
    
    b. pA still owns the NFT being swapped.

    c. The swapper contract has approval for pI's token.

    d. The swapper contract has approval for pA's token.

5. pA accepts the swap (sending ETH if the swap is expecting pA to sweeten the deal) and boom, the NFTs change owners. (`completeSwap` function)
6. If pI or pA sweetened the deal with ETH, pI or pA can then `withdraw` their ETH from the contract at their leisure. Why didn't this happen automatically? - best practice is to use a withdraw pattern to keep operations discrete.

At this point it is important to note that the Swapper contract immediately loses approval for both NFTs because they have changed ownership.


## Notes for the Devs

1. The `nonReentrant modifier is technically redundant` and can actually be removed. It was really left in for those who skim the contract and want non reentrancy surety. A different contract will be deployed for those who want the cheaper gas.

2. The following tasks can be run:

```shell
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat run scripts/deploy.ts
```

3. To find swaps you have initiated filter the `SwapInitiated` event with your address at topic 2.
4. To find swaps you have been added to accept filter the `SwapInitiated` event with your address at topic 3.
5. To check if you have removed a swap as the initiator filter the `SwapRemoved` event with your address at topic 2 or the swapId at topic 1.
6. To check if the swap has been completed, filter the `SwapComplete` event with either the swapId at topic 1, the initiator at 2 or acceptor at 3. The full swap details are in the data part of the event (Swap struct).
