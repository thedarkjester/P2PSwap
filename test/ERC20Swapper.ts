import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { AbiCoder } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { IERC20Swapper, ReentryTester, ERC20Swapper, ERC20B, ERC20A } from "../typechain-types";

describe("erc20Swapper", function () {
  const GENERIC_SWAP_ETH = ethers.parseEther("1");

  let erc20Swapper: ERC20Swapper;
  let erc20SwapperAddress: string;
  let erc20B: ERC20B;
  let erc20BAddress: string;

  let erc20A: ERC20A;
  let erc20AAddress: string;

  let reentryTester: ReentryTester;
  let reentryTesterAddress: string;

  let owner: SignerWithAddress;
  let swapper1: SignerWithAddress;
  let swapper1Address: string;
  let swapper2: SignerWithAddress;
  let swapper2Address: string;

  let defaultSwap: Erc20Swap;

  async function deployerc20SwapperFixture() {
    const ERC20SwapperFactory = await ethers.getContractFactory("ERC20Swapper", {
      // libraries: {
      //   Utils: utilsContract,
      // },
    });
    erc20Swapper = await ERC20SwapperFactory.deploy();
    erc20SwapperAddress = await erc20Swapper.getAddress();
  }

  async function deployMyTokenFixture() {
    const erc20AFactory = await ethers.getContractFactory("ERC20A");
    erc20A = await erc20AFactory.deploy();
    erc20AAddress = await erc20A.getAddress();

    const erc20BFactory = await ethers.getContractFactory("ERC20B");
    erc20B = await erc20BFactory.deploy();
    erc20BAddress = await erc20B.getAddress();
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
    await erc20A.connect(owner).safeMint(swapper1Address, 1000);
    await erc20B.connect(owner).safeMint(swapper2Address, 1000);
    await erc20A.connect(owner).safeMint(reentryTesterAddress, 1000);
    await erc20B.connect(owner).safeMint(reentryTesterAddress, 1000);
  }

  before(async () => {
    [owner, swapper1, swapper2] = await ethers.getSigners();
    swapper1Address = swapper1.address;
    swapper2Address = swapper2.address;
  });

  this.beforeEach(async () => {
    await loadFixture(deployerc20SwapperFixture);
    await loadFixture(deployMyTokenFixture);
    await loadFixture(deployRentryContractsFixture);

    await mintTokensToSwap();

    defaultSwap = getDefaultSwap(erc20AAddress, erc20BAddress, swapper1Address, swapper2Address);
  });

  describe("Deployment", function () {
    it("Should deploy erc20Swapper", async function () {
      const address = await erc20Swapper.getAddress();
      expect(address).to.not.be.empty;
    });

    it("Should deploy erc20A", async function () {
      const address = await erc20A.getAddress();
      expect(address).to.not.be.empty;
    });

    it("Should deploy erc20B", async function () {
      const address = await erc20B.getAddress();
      expect(address).to.not.be.empty;
    });

    it("Should deploy ReentryTester", async function () {
      const address = await reentryTester.getAddress();
      expect(address).to.not.be.empty;
    });
  });

  describe("ETH Transfer", function () {
    it("Fails if direct and hits receive", async function () {
      await expect(owner.sendTransaction({ to: erc20SwapperAddress, value: 1 })).to.be.reverted;
    });
  });

  describe("Swap initiation", function () {
    it("Fails with empty initiator contract address", async function () {
      defaultSwap.initiatorErcContract = ethers.ZeroAddress;
      await expect(erc20Swapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        erc20Swapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with empty acceptor contract address", async function () {
      defaultSwap.acceptorErcContract = ethers.ZeroAddress;
      await expect(erc20Swapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        erc20Swapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with acceptor mismatched to msg.sender", async function () {
      defaultSwap.initiator = reentryTesterAddress;
      await expect(erc20Swapper.connect(swapper1).initiateSwap(defaultSwap))
        .to.be.revertedWithCustomError(erc20Swapper, "InitiatorNotMatched")
        .withArgs(reentryTesterAddress, swapper1Address);
    });

    it("Fails with acceptor mismatched", async function () {
      defaultSwap.acceptor = ethers.ZeroAddress;
      await expect(erc20Swapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        erc20Swapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with initiator ETH Portion does not match msg.value", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH + GENERIC_SWAP_ETH;
      await expect(
        erc20Swapper.connect(swapper1).initiateSwap(defaultSwap, {
          value: ethers.toBigInt(GENERIC_SWAP_ETH),
        }),
      )
        .to.be.revertedWithCustomError(erc20Swapper, "InitiatorEthPortionNotMatched")
        .withArgs(defaultSwap.initiatorETHPortion, GENERIC_SWAP_ETH);
    });

    it("Fails with both acceptor and initiator ETH Portion", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await expect(
        erc20Swapper.connect(swapper1).initiateSwap(defaultSwap, {
          value: ethers.toBigInt(GENERIC_SWAP_ETH),
        }),
      ).to.be.revertedWithCustomError(erc20Swapper, "TwoWayEthPortionsDisallowed");
    });

    it("Initiates swap and stores hash correctly", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap, {
        value: ethers.toBigInt(GENERIC_SWAP_ETH),
      });

      const expectedHash = keccakSwap(defaultSwap);

      expect(await erc20Swapper.swapHashes(1n)).equal(expectedHash);
    });

    it("Initiates swap with acceptor ETH Portion", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      const swapHash = await erc20Swapper.swapHashes(1n);

      const expectedHash = keccakSwap(defaultSwap);
      expect(swapHash).equal(expectedHash);
    });

    it("Initiates swap and emits SwapInitiated event", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      expect(await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap))
        .to.emit(erc20Swapper, "SwapInitiated")
        .withArgs(1, swapper1.address, swapper2.address, defaultSwap);
    });

    it("Increments swap Id and multiple offers are possible", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      let expectedHash = keccakSwap(defaultSwap);
      expect(await erc20Swapper.swapHashes(1n)).equal(expectedHash);

      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      expectedHash = keccakSwap(defaultSwap);

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      expect(await erc20Swapper.swapHashes(2n)).equal(expectedHash);

      const swapCountId = await erc20Swapper.swapId();
      expect(swapCountId).equal(ethers.toBigInt(3));
    });
  });

  describe("Getting swap status", function () {
    it("Fails if the swap does not exist", async function () {
      await expect(erc20Swapper.getSwapStatus(1n, defaultSwap)).to.be.revertedWithCustomError(
        erc20Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Returns true for ownership and false for approvals", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      const swapStatus: IERC20Swapper.SwapStatusStruct = await erc20Swapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorHasBalance).true;
      expect(swapStatus.acceptorHasBalance).true;
      expect(swapStatus.initiatorApprovalsSet).false;
      expect(swapStatus.acceptorApprovalsSet).false;
    });

    it("Returns all true for ownership and approvals", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500);

      const swapStatus: IERC20Swapper.SwapStatusStruct = await erc20Swapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorHasBalance).true;
      expect(swapStatus.acceptorHasBalance).true;
      expect(swapStatus.initiatorApprovalsSet).true;
      expect(swapStatus.acceptorApprovalsSet).true;
    });

    it("Returns all false when no balance", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).transfer(erc20SwapperAddress, 501);
      await erc20B.connect(swapper2).transfer(erc20SwapperAddress, 501);

      const swapStatus: IERC20Swapper.SwapStatusStruct = await erc20Swapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorHasBalance).false;
      expect(swapStatus.acceptorHasBalance).false;
      expect(swapStatus.initiatorApprovalsSet).false;
      expect(swapStatus.acceptorApprovalsSet).false;
    });
  });

  describe("Swap removal and withdrawing", function () {
    it("Fails when not initiator", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(erc20Swapper.connect(swapper2).removeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc20Swapper,
        "NotInitiator",
      );
    });

    it("Fails when already reset or does not exist", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      await expect(erc20Swapper.connect(swapper1).removeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc20Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Resets the mapping values", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      let swapHash = await erc20Swapper.swapHashes(1n);
      expect(swapHash).to.not.equal(ethers.ZeroHash);

      await erc20Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      swapHash = await erc20Swapper.swapHashes(1n);

      expect(swapHash).equal(ethers.ZeroHash);
    });

    it("Emits SwapRemoved event", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      expect(await erc20Swapper.connect(swapper1).removeSwap(1, defaultSwap))
        .to.emit(erc20Swapper, "SwapRemoved")
        .withArgs(1, swapper1.address);
    });

    it("Does not increase the initiator balance if no ETH Portion sent", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      let balance = await erc20Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      await erc20Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      balance = await erc20Swapper.balances(swapper1.address);
      expect(balance).equal(0);
    });

    it("Fails withdraw with no balance", async function () {
      await expect(reentryTester.withdraw(erc20SwapperAddress)).to.be.revertedWithCustomError(
        erc20Swapper,
        "EmptyWithdrawDisallowed",
      );
    });

    it("Fails withdraw if balance is empty", async function () {
      await expect(reentryTester.withdraw(erc20SwapperAddress)).to.be.revertedWithCustomError(
        erc20Swapper,
        "EmptyWithdrawDisallowed",
      );
    });

    it("Increases the initiator balance if ETH Portion sent", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      let balance = await erc20Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      await erc20Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      balance = await erc20Swapper.balances(swapper1.address);
      expect(balance).equal(GENERIC_SWAP_ETH);
    });

    it("Sends the initiator balance when withdrawing", async function () {
      defaultSwap.initiatorETHPortion = ethers.parseEther("1");

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      await erc20Swapper.connect(swapper1).removeSwap(1, defaultSwap);

      const balanceBefore = await ethers.provider.getBalance(swapper1.address);

      let balance = await erc20Swapper.balances(swapper1.address);
      expect(balance).greaterThan(0);

      await expect(erc20Swapper.connect(swapper1).withdraw())
        .to.emit(erc20Swapper, "BalanceWithDrawn")
        .withArgs(swapper1Address, balance);

      balance = await erc20Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      const balanceAfter = await ethers.provider.getBalance(swapper1.address);

      expect(balanceAfter).greaterThan(balanceBefore);
    });
  });

  describe("Swap completion", function () {
    it("Fails when does not exist", async function () {
      await expect(erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc20Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Fails when not acceptor", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(erc20Swapper.connect(swapper1).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        erc20Swapper,
        "NotAcceptor",
      );
    });

    it("Fails when not sending ETH and initiator also sent ETH", async function () {
      defaultSwap.initiatorETHPortion = ethers.parseEther("1");

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      await expect(
        erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap, { value: 1 }),
      ).to.be.revertedWithCustomError(erc20Swapper, "TwoWayEthPortionsDisallowed");
    });

    it("Fails when acceptor does not send expected ETH", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap, { value: 1 }))
        .to.be.revertedWithCustomError(erc20Swapper, "IncorrectOrMissingAcceptorETH")
        .withArgs(GENERIC_SWAP_ETH);
    });

    it("Resets swap to default values", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500);

      await erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap);

      const swapHash = await erc20Swapper.swapHashes(1n);
      expect(swapHash).equal(ethers.ZeroHash);
    });

    it("Emits the SwapComplete event", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500);

      expect(await erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap))
        .to.emit(erc20Swapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, defaultSwap);
    });

    it("Fails when contract does not have allowance", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 499n);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await erc20Swapper.balances(swapper1.address);
      const swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await expect(erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when accept does not have balance", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await erc20Swapper.balances(swapper1.address);
      const swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await erc20B.connect(swapper2).transfer(erc20SwapperAddress, 501n);

      await expect(erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when contract does not have allowance", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 499n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await erc20Swapper.balances(swapper1.address);
      const swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await expect(erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when accept does not have balance", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await erc20Swapper.balances(swapper1.address);
      const swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await erc20A.connect(swapper1).transfer(erc20SwapperAddress, 501n);

      await expect(erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Swaps ownership with no ETH balances needing updating", async function () {
      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500n);

      let swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      let swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      let swapper1Balance = await erc20Swapper.balances(swapper1.address);
      let swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap);

      swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      swapper1BBalance = await erc20B.balanceOf(swapper1Address);

      expect(swapper2ABalance).equal(500n);
      expect(swapper1BBalance).equal(500n);

      swapper1Balance = await erc20Swapper.balances(swapper1.address);
      swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);
    });

    it("Swaps ownership with acceptor balance being updated", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorETHPortion = 0n;

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH });

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500n);

      let swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      let swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      let swapper1Balance = await erc20Swapper.balances(swapper1.address);
      let swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap);

      swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      swapper1BBalance = await erc20B.balanceOf(swapper1Address);

      expect(swapper2ABalance).equal(500n);
      expect(swapper1BBalance).equal(500n);

      swapper1Balance = await erc20Swapper.balances(swapper1.address);
      swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(GENERIC_SWAP_ETH);
    });

    it("Swaps ownership with initiator balance being updated", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await erc20Swapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(erc20SwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(erc20SwapperAddress, 500n);

      let swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      let swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      let swapper1Balance = await erc20Swapper.balances(swapper1.address);
      let swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await erc20Swapper.connect(swapper2).completeSwap(1, defaultSwap, { value: GENERIC_SWAP_ETH });

      swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      swapper1BBalance = await erc20B.balanceOf(swapper1Address);

      expect(swapper2ABalance).equal(500n);
      expect(swapper1BBalance).equal(500n);

      swapper1Balance = await erc20Swapper.balances(swapper1.address);
      swapper2Balance = await erc20Swapper.balances(swapper2.address);

      expect(swapper1Balance).equal(GENERIC_SWAP_ETH);
      expect(swapper2Balance).equal(0);
    });
  });
});

export function getDefaultSwap(
  initiatorErc20Contract: string,
  acceptorErcContract: string,
  swapper1Address: string,
  swapper2Address: string,
): Erc20Swap {
  return {
    initiatorErcContract: initiatorErc20Contract,
    acceptorErcContract: acceptorErcContract,
    initiator: swapper1Address,
    initiatorTokenAmount: 500n,
    acceptor: swapper2Address,
    acceptorTokenAmount: 500n,
    initiatorETHPortion: 0n,
    acceptorETHPortion: 0n,
  };
}

export type Erc20Swap = {
  initiatorErcContract: string;
  acceptorErcContract: string;
  initiator: string;
  initiatorTokenAmount: bigint;
  acceptor: string;
  acceptorTokenAmount: bigint;
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

export function keccakSwap(swap: Erc20Swap) {
  return abiEncodeAndKeccak256(
    ["address", "address", "address", "uint256", "address", "uint256", "uint256", "uint256"],
    [
      swap.initiatorErcContract,
      swap.acceptorErcContract,
      swap.initiator,
      swap.initiatorTokenAmount,
      swap.acceptor,
      swap.acceptorTokenAmount,
      swap.initiatorETHPortion,
      swap.acceptorETHPortion,
    ],
  );
}
