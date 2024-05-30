import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { AbiCoder } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ISwapTokens, ReentryTester, TokenSwapper, ERC20B, ERC20A } from "../typechain-types";

describe.only("tokenSwapper", function () {
  const GENERIC_SWAP_ETH = ethers.parseEther("1");

  let tokenSwapper: TokenSwapper;
  let tokenSwapperAddress: string;
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

  let defaultSwap: ISwapTokens.SwapStruct;

  async function deploytokenSwapperFixture() {
    const tokenSwapperFactory = await ethers.getContractFactory("TokenSwapper");
    tokenSwapper = await tokenSwapperFactory.deploy();
    tokenSwapperAddress = await tokenSwapper.getAddress();
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
    await loadFixture(deploytokenSwapperFixture);
    await loadFixture(deployMyTokenFixture);
    await loadFixture(deployRentryContractsFixture);

    await mintTokensToSwap();

    defaultSwap = getDefaultSwap(erc20AAddress, erc20BAddress, swapper1Address, swapper2Address);
  });

  describe("Deployment", function () {
    it("Should deploy tokenSwapper", async function () {
      const address = await tokenSwapper.getAddress();
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
      await expect(owner.sendTransaction({ to: tokenSwapperAddress, value: 1 })).to.be.reverted;
    });
  });

  describe("Swap initiation", function () {
    it("Fails with empty initiator contract address", async function () {
      defaultSwap.initiatorERCContract = ethers.ZeroAddress;
      await expect(tokenSwapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with empty initiator values", async function () {
      defaultSwap.initiatorTokenAmount = 0n;
      defaultSwap.initiatorETHPortion = 0n;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "MissingInitiatorSwapValues",
      );
    });

    it("Fails with empty acceptor values", async function () {
      defaultSwap.acceptorETHPortion = 0n;
      defaultSwap.acceptorTokenAmount = 0n;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "MissingAcceptorSwapValues",
      );
    });

    it("Fails with empty acceptor contract address", async function () {
      defaultSwap.acceptorErcContract = ethers.ZeroAddress;
      await expect(tokenSwapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with acceptor mismatched to msg.sender", async function () {
      defaultSwap.initiator = reentryTesterAddress;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap))
        .to.be.revertedWithCustomError(tokenSwapper, "InitiatorNotMatched")
        .withArgs(reentryTesterAddress, swapper1Address);
    });

    it("Fails with acceptor mismatched", async function () {
      defaultSwap.acceptor = ethers.ZeroAddress;
      await expect(tokenSwapper.initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "ZeroAddressDisallowed",
      );
    });

    it("Fails with initiator ETH Portion does not match msg.value", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH + GENERIC_SWAP_ETH;
      await expect(
        tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, {
          value: ethers.toBigInt(GENERIC_SWAP_ETH),
        }),
      )
        .to.be.revertedWithCustomError(tokenSwapper, "InitiatorEthPortionNotMatched")
        .withArgs(defaultSwap.initiatorETHPortion, GENERIC_SWAP_ETH);
    });

    it("Fails with both acceptor and initiator ETH Portion", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await expect(
        tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, {
          value: ethers.toBigInt(GENERIC_SWAP_ETH),
        }),
      ).to.be.revertedWithCustomError(tokenSwapper, "TwoWayEthPortionsDisallowed");
    });

    it("Initiates swap and stores hash correctly", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, {
        value: ethers.toBigInt(GENERIC_SWAP_ETH),
      });

      const expectedHash = keccakSwap(defaultSwap);

      expect(await tokenSwapper.swapHashes(1n)).equal(expectedHash);
    });

    it("Initiates swap with acceptor ETH Portion", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      const swapHash = await tokenSwapper.swapHashes(1n);

      const expectedHash = keccakSwap(defaultSwap);
      expect(swapHash).equal(expectedHash);
    });

    it("Initiates swap and emits SwapInitiated event", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      expect(await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap))
        .to.emit(tokenSwapper, "SwapInitiated")
        .withArgs(1, swapper1.address, swapper2.address, defaultSwap);
    });

    it("Increments swap Id and multiple offers are possible", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      let expectedHash = keccakSwap(defaultSwap);
      expect(await tokenSwapper.swapHashes(1n)).equal(expectedHash);

      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      expectedHash = keccakSwap(defaultSwap);

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      expect(await tokenSwapper.swapHashes(2n)).equal(expectedHash);

      const swapCountId = await tokenSwapper.swapId();
      expect(swapCountId).equal(ethers.toBigInt(3));
    });
  });

  describe("Getting swap status", function () {
    it("Fails if the swap does not exist", async function () {
      await expect(tokenSwapper.getSwapStatus(1n, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Returns true for ownership and false for approvals", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      const swapStatus: ItokenSwapper.SwapStatusStruct = await tokenSwapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorHasBalance).true;
      expect(swapStatus.acceptorHasBalance).true;
      expect(swapStatus.initiatorApprovalsSet).false;
      expect(swapStatus.acceptorApprovalsSet).false;
    });

    it("Returns all true for ownership and approvals", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500);

      const swapStatus: ISwapTokens.SwapStatusStruct = await tokenSwapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorHasBalance).true;
      expect(swapStatus.acceptorHasBalance).true;
      expect(swapStatus.initiatorApprovalsSet).true;
      expect(swapStatus.acceptorApprovalsSet).true;
    });

    it("Returns all false when no balance", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).transfer(tokenSwapperAddress, 501);
      await erc20B.connect(swapper2).transfer(tokenSwapperAddress, 501);

      const swapStatus: ISwapTokens.SwapStatusStruct = await tokenSwapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorHasBalance).false;
      expect(swapStatus.acceptorHasBalance).false;
      expect(swapStatus.initiatorApprovalsSet).false;
      expect(swapStatus.acceptorApprovalsSet).false;
    });
  });

  describe("Swap removal and withdrawing", function () {
    it("Fails when not initiator", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(tokenSwapper.connect(swapper2).removeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "NotInitiator",
      );
    });

    it("Fails when already reset or does not exist", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await tokenSwapper.connect(swapper1).removeSwap(1, defaultSwap);

      await expect(tokenSwapper.connect(swapper1).removeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Resets the mapping values", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      let swapHash = await tokenSwapper.swapHashes(1n);
      expect(swapHash).to.not.equal(ethers.ZeroHash);

      await tokenSwapper.connect(swapper1).removeSwap(1, defaultSwap);

      swapHash = await tokenSwapper.swapHashes(1n);

      expect(swapHash).equal(ethers.ZeroHash);
    });

    it("Emits SwapRemoved event", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      expect(await tokenSwapper.connect(swapper1).removeSwap(1, defaultSwap))
        .to.emit(tokenSwapper, "SwapRemoved")
        .withArgs(1, swapper1.address);
    });

    it("Does not increase the initiator balance if no ETH Portion sent", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      let balance = await tokenSwapper.balances(swapper1.address);
      expect(balance).equal(0);

      await tokenSwapper.connect(swapper1).removeSwap(1, defaultSwap);

      balance = await tokenSwapper.balances(swapper1.address);
      expect(balance).equal(0);
    });

    it("Fails withdraw with no balance", async function () {
      await expect(reentryTester.withdraw(tokenSwapperAddress)).to.be.revertedWithCustomError(
        tokenSwapper,
        "EmptyWithdrawDisallowed",
      );
    });

    it("Fails withdraw if balance is empty", async function () {
      await expect(reentryTester.withdraw(tokenSwapperAddress)).to.be.revertedWithCustomError(
        tokenSwapper,
        "EmptyWithdrawDisallowed",
      );
    });

    it("Increases the initiator balance if ETH Portion sent", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      let balance = await tokenSwapper.balances(swapper1.address);
      expect(balance).equal(0);

      await tokenSwapper.connect(swapper1).removeSwap(1, defaultSwap);

      balance = await tokenSwapper.balances(swapper1.address);
      expect(balance).equal(GENERIC_SWAP_ETH);
    });

    it("Sends the initiator balance when withdrawing", async function () {
      defaultSwap.initiatorETHPortion = ethers.parseEther("1");

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      await tokenSwapper.connect(swapper1).removeSwap(1, defaultSwap);

      const balanceBefore = await ethers.provider.getBalance(swapper1.address);

      let balance = await tokenSwapper.balances(swapper1.address);
      expect(balance).greaterThan(0);

      await expect(tokenSwapper.connect(swapper1).withdraw())
        .to.emit(tokenSwapper, "BalanceWithDrawn")
        .withArgs(swapper1Address, balance);

      balance = await tokenSwapper.balances(swapper1.address);
      expect(balance).equal(0);

      const balanceAfter = await ethers.provider.getBalance(swapper1.address);

      expect(balanceAfter).greaterThan(balanceBefore);
    });
  });

  describe("Swap completion", function () {
    it("Fails when does not exist", async function () {
      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Fails when not acceptor", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(tokenSwapper.connect(swapper1).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "NotAcceptor",
      );
    });

    it("Fails when not sending ETH and initiator also sent ETH", async function () {
      defaultSwap.initiatorETHPortion = ethers.parseEther("1");

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: ethers.parseEther("1") });

      await expect(
        tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap, { value: 1 }),
      ).to.be.revertedWithCustomError(tokenSwapper, "TwoWayEthPortionsDisallowed");
    });

    it("Fails when acceptor does not send expected ETH", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap, { value: 1 }))
        .to.be.revertedWithCustomError(tokenSwapper, "IncorrectOrMissingAcceptorETH")
        .withArgs(GENERIC_SWAP_ETH);
    });

    it("Resets swap to default values", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500);

      await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap);

      const swapHash = await tokenSwapper.swapHashes(1n);
      expect(swapHash).equal(ethers.ZeroHash);
    });

    it("Increases the initiator balance if ETH Portion sent and no initiator tokens sent", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.initiatorTokenIdOrAmount = 0n;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH });

      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      expect(await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap))
        .to.emit(tokenSwapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, defaultSwap);

      expect(await erc20A.balanceOf(swapper2Address)).equal(swapper2ABalance);
      expect(await erc20B.balanceOf(swapper1Address)).equal(500n);
    });

    it("Increases the acceptor balance if ETH Portion sent and no acceptor tokens sent", async function () {
      defaultSwap.initiatorETHPortion = 0n;
      defaultSwap.acceptorTokenIdOrAmount = 0n;
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      expect(await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap, { value: GENERIC_SWAP_ETH }))
        .to.emit(tokenSwapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, defaultSwap);

      expect(await erc20B.balanceOf(swapper1Address)).equal(swapper1BBalance);
      expect(await erc20A.balanceOf(swapper2Address)).equal(500n);
    });

    it("Emits the SwapComplete event", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500);

      expect(await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap))
        .to.emit(tokenSwapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, defaultSwap);
    });

    it("Fails when contract does not have allowance", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 499n);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when accept does not have balance", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await erc20B.connect(swapper2).transfer(tokenSwapperAddress, 501n);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when contract does not have allowance", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 499n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when accept does not have balance", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500n);

      const swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      const swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await erc20A.connect(swapper1).transfer(tokenSwapperAddress, 501n);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Swaps ownership with no ETH balances needing updating", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500n);

      let swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      let swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      let swapper1Balance = await tokenSwapper.balances(swapper1.address);
      let swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap);

      swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      swapper1BBalance = await erc20B.balanceOf(swapper1Address);

      expect(swapper2ABalance).equal(500n);
      expect(swapper1BBalance).equal(500n);

      swapper1Balance = await tokenSwapper.balances(swapper1.address);
      swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);
    });

    it("Swaps ownership with acceptor balance being updated", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorETHPortion = 0n;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH });

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500n);

      let swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      let swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      let swapper1Balance = await tokenSwapper.balances(swapper1.address);
      let swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap);

      swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      swapper1BBalance = await erc20B.balanceOf(swapper1Address);

      expect(swapper2ABalance).equal(500n);
      expect(swapper1BBalance).equal(500n);

      swapper1Balance = await tokenSwapper.balances(swapper1.address);
      swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(GENERIC_SWAP_ETH);
    });

    it("Swaps ownership with initiator balance being updated", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await erc20A.connect(swapper1).approve(tokenSwapperAddress, 500n);
      await erc20B.connect(swapper2).approve(tokenSwapperAddress, 500n);

      let swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      let swapper1BBalance = await erc20B.balanceOf(swapper1Address);
      let swapper1Balance = await tokenSwapper.balances(swapper1.address);
      let swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(swapper2ABalance).equal(0n);
      expect(swapper1BBalance).equal(0n);

      await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap, { value: GENERIC_SWAP_ETH });

      swapper2ABalance = await erc20A.balanceOf(swapper2Address);
      swapper1BBalance = await erc20B.balanceOf(swapper1Address);

      expect(swapper2ABalance).equal(500n);
      expect(swapper1BBalance).equal(500n);

      swapper1Balance = await tokenSwapper.balances(swapper1.address);
      swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(GENERIC_SWAP_ETH);
      expect(swapper2Balance).equal(0);
    });
  });
});

export function getDefaultSwap(
  initiatorERCContract: string,
  acceptorErcContract: string,
  swapper1Address: string,
  swapper2Address: string,
): ISwapTokens.SwapStruct {
  return {
    initiatorERCContract: initiatorERCContract,
    acceptorERCContract: acceptorErcContract,
    initiator: swapper1Address,
    initiatorTokenIdOrAmount: 500n,
    acceptor: swapper2Address,
    acceptorTokenIdOrAmount: 500n,
    initiatorETHPortion: 0n,
    acceptorETHPortion: 0n,
    initiatorTokenType: 1n,
    acceptorTokenType : 2n
  };
}

export type ErcSwap = {
  initiatorERCContract: string;
  acceptorERCContract: string;
  initiator: string;
  initiatorTokenAmount: bigint;
  acceptor: string;
  acceptorTokenAmount: bigint;
  initiatorETHPortion: bigint;
  acceptorETHPortion: bigint;
  initiatorTokenType: bigint;
  acceptorTokenType: bigint;
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

export function keccakSwap(swap: ErcSwap) {
  return abiEncodeAndKeccak256(
    ["address", "address", "address", "uint256", "address", "uint256", "uint256", "uint256", "uint256", "uint256"],
    [
      swap.initiatorERCContract,
      swap.acceptorErcContract,
      swap.initiator,
      swap.initiatorTokenAmount,
      swap.acceptor,
      swap.acceptorTokenAmount,
      swap.initiatorETHPortion,
      swap.acceptorETHPortion,
      swap.initiatorTokenType,
      swap.acceptorTokenType
    ],
  );
}
