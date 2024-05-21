import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { AbiCoder } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { IERC721Swapper, ReentryTester, MyToken, ERC721Swapper } from "../typechain-types";

describe("ERC721Swapper", function () {
  const GENERIC_SWAP_ETH = ethers.parseEther("1");

  let erc721Swapper: ERC721Swapper;
  let erc721SwapperAddress: string;
  let myToken: MyToken;
  let reentryTester: ReentryTester;
  let reentryTesterAddress: string;

  let myTokenAddress: string;

  let owner: SignerWithAddress;
  let swapper1: SignerWithAddress;
  let swapper1Address: string;
  let swapper2: SignerWithAddress;
  let swapper2Address: string;

  let defaultSwap: Swap;

  async function deployERC721SwapperFixture() {
    const ERC721SwapperFactory = await ethers.getContractFactory("ERC721Swapper");
    erc721Swapper = await ERC721SwapperFactory.deploy();
    erc721SwapperAddress = await erc721Swapper.getAddress();
  }

  async function deployMyTokenFixture() {
    const MyTokenFactory = await ethers.getContractFactory("MyToken");
    myToken = await MyTokenFactory.deploy(owner);
    myTokenAddress = await myToken.getAddress();
  }

  async function deployRentryContractsFixture() {
    const ReentryTesterFactory = await ethers.getContractFactory("ReentryTester");
    reentryTester = await ReentryTesterFactory.deploy();
    reentryTesterAddress = await reentryTester.getAddress();
  }

  // swapper 1 has 2 tokens to start (0,1)
  // swapper 2 has 2 tokens to start (2,3)
  // reentry has 2 tokens to start (4,5)
  async function mintTokensToSwap() {
    await myToken.connect(owner).safeMint(swapper1.address);
    await myToken.connect(owner).safeMint(swapper1.address);
    await myToken.connect(owner).safeMint(swapper2.address);
    await myToken.connect(owner).safeMint(swapper2.address);
    await myToken.connect(owner).safeMint(reentryTesterAddress);
    await myToken.connect(owner).safeMint(reentryTesterAddress);
  }

  before(async () => {
    [owner, swapper1, swapper2] = await ethers.getSigners();
    swapper1Address = swapper1.address;
    swapper2Address = swapper2.address;
  });

  this.beforeEach(async () => {
    await loadFixture(deployERC721SwapperFixture);
    await loadFixture(deployMyTokenFixture);
    await loadFixture(deployRentryContractsFixture);

    await mintTokensToSwap();

    defaultSwap = getDefaultSwap(myTokenAddress, swapper1Address, swapper2Address);
  });

  describe("Deployment", function () {
    it("Should deploy erc721Swapper", async function () {
      const address = await erc721Swapper.getAddress();
      expect(address).to.not.be.empty;
    });

    it("Should deploy myToken", async function () {
      const address = await myToken.getAddress();
      expect(address).to.not.be.empty;
    });

    it("Should deploy ReentryTester", async function () {
      const address = await reentryTester.getAddress();
      expect(address).to.not.be.empty;
    });
  });

  describe("ETH Transfer", function () {
    it("Fails if direct and hits receive", async function () {
      await expect(owner.sendTransaction({ to: erc721SwapperAddress, value: 1 })).to.be.reverted;
    });
  });

  describe("Swap initiation", function () {
    it("Fails with empty initiator contract address", async function () {
      defaultSwap.initiatorNftContract = ethers.ZeroAddress;
      await expect(erc721Swapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with empty acceptor contract address", async function () {
      defaultSwap.acceptorNftContract = ethers.ZeroAddress;
      await expect(erc721Swapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with acceptor mismatched to msg.sender", async function () {
      defaultSwap.initiator = reentryTesterAddress;
      await expect(erc721Swapper.connect(swapper1).initiateSwap(defaultSwap))
        .to.be.revertedWithCustomError(erc721Swapper, "InitiatorNotMatched")
        .withArgs(reentryTesterAddress, swapper1Address);
    });

    it("Fails with acceptor mismatched", async function () {
      defaultSwap.acceptor = ethers.ZeroAddress;
      await expect(erc721Swapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with initiator ETH Portion does not match msg.value", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH + GENERIC_SWAP_ETH;
      await expect(
        erc721Swapper.connect(swapper1).initiateSwap(defaultSwap, {
          value: ethers.toBigInt(GENERIC_SWAP_ETH),
        }),
      )
        .to.be.revertedWithCustomError(erc721Swapper, "InitiatorEthPortionNotMatched")
        .withArgs(defaultSwap.initiatorETHPortion, GENERIC_SWAP_ETH);
    });

    it("Fails with both acceptor and initiator ETH Portion", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await expect(
        erc721Swapper.connect(swapper1).initiateSwap(defaultSwap, {
          value: ethers.toBigInt(GENERIC_SWAP_ETH),
        }),
      ).to.be.revertedWithCustomError(erc721Swapper, "TwoWayEthPortionsDisallowed");
    });

    it("Initiates swap and stores hash correctly", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap, {
        value: ethers.toBigInt(GENERIC_SWAP_ETH),
      });

      const expectedHash = keccakSwap(defaultSwap);

      expect(await erc721Swapper.swapHashes(1n)).equal(expectedHash);
    });

    it("Initiates swap with acceptor ETH Portion", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      const swapHash = await erc721Swapper.swapHashes(1n);

      const expectedHash = keccakSwap(defaultSwap);
      expect(swapHash).equal(expectedHash);
    });

    it("Initiates swap and emits SwapInitiated event", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      expect(await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap))
        .to.emit(erc721Swapper, "SwapInitiated")
        .withArgs(1, swapper1.address, swapper2.address, defaultSwap);
    });

    it("Increments swap Id and multiple offers are possible", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      let expectedHash = keccakSwap(defaultSwap);
      expect(await erc721Swapper.swapHashes(1n)).equal(expectedHash);

      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      expectedHash = keccakSwap(defaultSwap);

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      expect(await erc721Swapper.swapHashes(2n)).equal(expectedHash);

      const swapCountId = await erc721Swapper.swapId();
      expect(swapCountId).equal(ethers.toBigInt(3));
    });
  });

  describe("Getting swap status", function () {
    it("Fails if the swap does not exist", async function () {
      await expect(erc721Swapper.getSwapStatus(1n, defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Returns true for ownership and false for approvals", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      const swapStatus: IERC721Swapper.SwapStatusStruct = await erc721Swapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorOwnsToken).true;
      expect(swapStatus.acceptorOwnsToken).true;
      expect(swapStatus.initiatorApprovalsSet).false;
      expect(swapStatus.acceptorApprovalsSet).false;
    });

    it("Returns all true for ownership and approvals", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).approve(erc721SwapperAddress, 1);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 2);

      const swapStatus: IERC721Swapper.SwapStatusStruct = await erc721Swapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorOwnsToken).true;
      expect(swapStatus.acceptorOwnsToken).true;
      expect(swapStatus.initiatorApprovalsSet).true;
      expect(swapStatus.acceptorApprovalsSet).true;
    });

    it("Returns all false when no ownership", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).transferFrom(swapper1.address, erc721SwapperAddress, 1);
      await myToken.connect(swapper2).transferFrom(swapper2.address, erc721SwapperAddress, 2);

      const swapStatus: IERC721Swapper.SwapStatusStruct = await erc721Swapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorOwnsToken).false;
      expect(swapStatus.acceptorOwnsToken).false;
      expect(swapStatus.initiatorApprovalsSet).false;
      expect(swapStatus.acceptorApprovalsSet).false;
    });
  });

  describe("Swap removal and withdrawing", function () {
    it("Fails when not initiator", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(erc721Swapper.connect(swapper2).removeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "NotInitiator",
      );
    });

    it("Fails when already reset or does not exist", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc721Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      await expect(erc721Swapper.connect(swapper1).removeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Resets the mapping values", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      let swapHash = await erc721Swapper.swapHashes(1n);
      expect(swapHash).to.not.equal(ethers.ZeroHash);

      await erc721Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      swapHash = await erc721Swapper.swapHashes(1n);

      expect(swapHash).equal(ethers.ZeroHash);
    });

    it("Emits SwapRemoved event", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      expect(await erc721Swapper.connect(swapper1).removeSwap(1, defaultSwap))
        .to.emit(erc721Swapper, "SwapRemoved")
        .withArgs(1, swapper1.address);
    });

    it("Does not increase the initiator balance if no ETH Portion sent", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      let balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      await erc721Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(0);
    });

    it("Fails reentry if removeSwap called again", async function () {
      defaultSwap.initiatorETHPortion = ethers.parseEther("1");
      await reentryTester.initiateSwap(myTokenAddress, myTokenAddress, swapper2, 0n, 1n, 2n, erc721SwapperAddress, {
        value: ethers.parseEther("1"),
      });

      await expect(reentryTester.removeSwap(1, erc721SwapperAddress, defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Fails withdraw with no balance", async function () {
      await expect(reentryTester.withdraw(erc721SwapperAddress)).to.be.revertedWithCustomError(
        erc721Swapper,
        "EmptyWithdrawDisallowed",
      );
    });

    it("Failure to withdraw causes custom error", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.initiatorTokenId = 3n;
      defaultSwap.acceptorTokenId = 5n;
      defaultSwap.acceptor = reentryTesterAddress;
      defaultSwap.initiator = swapper2Address;

      await erc721Swapper.connect(swapper2).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH });

      await reentryTester.approveToken(5n, myTokenAddress, erc721SwapperAddress);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 3n);

      await reentryTester.completeProperSwap(1n, erc721SwapperAddress, defaultSwap);

      await expect(reentryTester.withdraw(erc721SwapperAddress)).to.be.revertedWithCustomError(
        erc721Swapper,
        "ETHSendingFailed",
      );
    });

    it("Fails withdraw if balance is empty", async function () {
      await expect(reentryTester.withdraw(erc721SwapperAddress)).to.be.revertedWithCustomError(
        erc721Swapper,
        "EmptyWithdrawDisallowed",
      );
    });

    it("Increases the initiator balance if ETH Portion sent", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      let balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      await erc721Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(GENERIC_SWAP_ETH);
    });

    it("Sends the initiator balance when withdrawing", async function () {
      defaultSwap.initiatorETHPortion = ethers.parseEther("1");

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      await erc721Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      const balanceBefore = await ethers.provider.getBalance(swapper1.address);

      let balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).greaterThan(0);

      await expect(erc721Swapper.connect(swapper1).withdraw())
        .to.emit(erc721Swapper, "BalanceWithDrawn")
        .withArgs(swapper1Address, balance);

      balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      const balanceAfter = await ethers.provider.getBalance(swapper1.address);

      expect(balanceAfter).greaterThan(balanceBefore);
    });
  });

  describe("Swap completion", function () {
    it("Fails when does not exist", async function () {
      await expect(erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Fails when not acceptor", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(erc721Swapper.connect(swapper1).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "NotAcceptor",
      );
    });

    it("Fails when not sending ETH and initiator also sent ETH", async function () {
      defaultSwap.initiatorETHPortion = ethers.parseEther("1");

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      await expect(
        erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap, { value: 1 }),
      ).to.be.revertedWithCustomError(erc721Swapper, "TwoWayEthPortionsDisallowed");
    });

    it("Fails when reentering", async function () {
      defaultSwap.acceptor = reentryTesterAddress;
      defaultSwap.acceptorTokenId = 4n;

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).approve(erc721SwapperAddress, 1);
      await reentryTester.approveToken(4, myTokenAddress, erc721SwapperAddress);

      await expect(reentryTester.completeSwap(1, erc721SwapperAddress, defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Fails when acceptor does not send expected ETH", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap, { value: 1 }))
        .to.be.revertedWithCustomError(erc721Swapper, "IncorrectOrMissingAcceptorETH")
        .withArgs(GENERIC_SWAP_ETH);
    });

    it("Resets swap to default values", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).approve(erc721SwapperAddress, 1);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 2);

      await erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap);

      const swapHash = await erc721Swapper.swapHashes(1n);
      expect(swapHash).equal(ethers.ZeroHash);
    });

    it("Emits the SwapComplete event", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).approve(erc721SwapperAddress, 1);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 2);

      expect(await erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap))
        .to.emit(erc721Swapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, defaultSwap);
    });

    it("Swaps ownership with no ETH balances needing updating", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).approve(erc721SwapperAddress, 1);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 2);

      let token1Owner = await myToken.ownerOf(1);
      let token2Owner = await myToken.ownerOf(2);
      let swapper1Balance = await erc721Swapper.balances(swapper1.address);
      let swapper2Balance = await erc721Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(token1Owner).equal(swapper1.address);
      expect(token2Owner).equal(swapper2.address);

      await erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap);

      token1Owner = await myToken.ownerOf(1);
      token2Owner = await myToken.ownerOf(2);

      expect(token1Owner).equal(swapper2.address);
      expect(token2Owner).equal(swapper1.address);

      swapper1Balance = await erc721Swapper.balances(swapper1.address);
      swapper2Balance = await erc721Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);
    });

    it("Swaps ownership with acceptor balance being updated", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorETHPortion = 0n;

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH });

      await myToken.connect(swapper1).approve(erc721SwapperAddress, 1);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 2);

      let token1Owner = await myToken.ownerOf(1);
      let token2Owner = await myToken.ownerOf(2);
      let swapper1Balance = await erc721Swapper.balances(swapper1.address);
      let swapper2Balance = await erc721Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(token1Owner).equal(swapper1.address);
      expect(token2Owner).equal(swapper2.address);

      await erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap);

      token1Owner = await myToken.ownerOf(1);
      token2Owner = await myToken.ownerOf(2);

      expect(token1Owner).equal(swapper2.address);
      expect(token2Owner).equal(swapper1.address);

      swapper1Balance = await erc721Swapper.balances(swapper1.address);
      swapper2Balance = await erc721Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(GENERIC_SWAP_ETH);
    });

    it("Swaps ownership with acceptor balance being updated and initiator malicious contract trying to remove early", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.initiatorTokenId = 4n;
      defaultSwap.acceptorTokenId = 2n;

      await reentryTester.initiateSwap(myTokenAddress, myTokenAddress, swapper2, 0n, 4n, 2n, erc721SwapperAddress, {
        value: GENERIC_SWAP_ETH,
      });

      await reentryTester.approveToken(4, myTokenAddress, erc721SwapperAddress);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 2);

      const token1Owner = await myToken.ownerOf(2);
      const token2Owner = await myToken.ownerOf(4);
      const swapper1Balance = await erc721Swapper.balances(swapper1.address);
      const swapper2Balance = await erc721Swapper.balances(reentryTesterAddress);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(token1Owner).equal(swapper2.address);
      expect(token2Owner).equal(reentryTesterAddress);

      await reentryTester.setSwapperAddress(erc721SwapperAddress);
      await expect(erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc721Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Swaps ownership with initiator balance being updated", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await erc721Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).approve(erc721SwapperAddress, 1);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 2);

      let token1Owner = await myToken.ownerOf(1);
      let token2Owner = await myToken.ownerOf(2);
      let swapper1Balance = await erc721Swapper.balances(swapper1.address);
      let swapper2Balance = await erc721Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(token1Owner).equal(swapper1.address);
      expect(token2Owner).equal(swapper2.address);

      await erc721Swapper.connect(swapper2).completeSwap(1, defaultSwap, { value: GENERIC_SWAP_ETH });

      token1Owner = await myToken.ownerOf(1);
      token2Owner = await myToken.ownerOf(2);

      expect(token1Owner).equal(swapper2.address);
      expect(token2Owner).equal(swapper1.address);

      swapper1Balance = await erc721Swapper.balances(swapper1.address);
      swapper2Balance = await erc721Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(GENERIC_SWAP_ETH);
      expect(swapper2Balance).equal(0);
    });
  });
});

// struct SwapStatus {
//   bool initiatorOwnsToken;
//   bool acceptorOwnsToken;
//   bool initiatorApprovalsSet;
//   bool acceptorApprovalsSet;
// }

export function getDefaultSwap(tokenAddress: string, swapper1Address: string, swapper2Address: string): Swap {
  return {
    initiatorNftContract: tokenAddress,
    acceptorNftContract: tokenAddress,
    initiator: swapper1Address,
    initiatorTokenId: 1n,
    acceptor: swapper2Address,
    acceptorTokenId: 2n,
    initiatorETHPortion: 0n,
    acceptorETHPortion: 0n,
  };
}

export type Swap = {
  initiatorNftContract: string;
  acceptorNftContract: string;
  initiator: string;
  initiatorTokenId: bigint;
  acceptor: string;
  acceptorTokenId: bigint;
  initiatorETHPortion: bigint;
  acceptorETHPortion: bigint;
};

export function abiEncodeAndKeccak256(paramTypes: string[], paramValues: unknown[], encodePacked?: boolean): string {
  return ethers.keccak256(encodeData(paramTypes, paramValues, encodePacked));
}

export const encodeData = (paramTypes: string[], paramValues: unknown[], encodePacked?: boolean) => {
  if (encodePacked) {
    return ethers.solidityPacked(paramTypes, paramValues);
  }
  return AbiCoder.defaultAbiCoder().encode(paramTypes, paramValues);
};

export function keccakSwap(swap: Swap) {
  return abiEncodeAndKeccak256(
    ["address", "address", "address", "uint256", "address", "uint256", "uint256", "uint256"],
    [
      swap.initiatorNftContract,
      swap.acceptorNftContract,
      swap.initiator,
      swap.initiatorTokenId,
      swap.acceptor,
      swap.acceptorTokenId,
      swap.initiatorETHPortion,
      swap.acceptorETHPortion,
    ],
  );
}
