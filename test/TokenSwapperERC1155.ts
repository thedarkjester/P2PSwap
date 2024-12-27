import { loadFixture, time as networkTime } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { AbiCoder } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ISwapTokens, Reentry1155Tester, TokenSwapper, My1155Token } from "../typechain-types";
import { bigint } from "hardhat/internal/core/params/argumentTypes";

describe("tokenSwapper 1155 testing", function () {
  const GENERIC_SWAP_ETH = ethers.parseEther("1");
  let tokenSwapper: TokenSwapper;
  let tokenSwapperAddress: string;
  let myToken: My1155Token;
  let reentryTester: Reentry1155Tester;
  let reentryTesterAddress: string;

  let myTokenAddress: string;

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
    const MyTokenFactory = await ethers.getContractFactory("My1155Token");
    myToken = await MyTokenFactory.deploy(owner, tokenSwapperAddress);
    myTokenAddress = await myToken.getAddress();
  }

  async function deployRentryContractsFixture() {
    const ReentryTesterFactory = await ethers.getContractFactory("Reentry1155Tester");
    reentryTester = await ReentryTesterFactory.deploy();
    reentryTesterAddress = await reentryTester.getAddress();
  }

  // swapper 1 has 2 tokens to start (0,1)
  // swapper 2 has 2 tokens to start (2,3)
  // reentry has 2 tokens to start (4,5)
  async function mintTokensToSwap() {
    await myToken.connect(owner).safeMintById(swapper1.address, 0);
    await myToken.connect(owner).safeMintById(swapper1.address, 1);
    await myToken.connect(owner).safeMintById(swapper2.address, 2);
    await myToken.connect(owner).safeMintById(swapper2.address, 3);
    await myToken.connect(owner).safeMintById(reentryTesterAddress, 4);
    await myToken.connect(owner).safeMintById(reentryTesterAddress, 5);
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

    defaultSwap = getDefaultSwap(myTokenAddress, myTokenAddress, swapper1Address, swapper2Address);
  });

  describe("Deployment", function () {
    it("Should deploy tokenSwapper", async function () {
      const address = await tokenSwapper.getAddress();
      expect(address).to.not.be.empty;
    });

    it("Should deploy erc20A", async function () {
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
      await expect(owner.sendTransaction({ to: tokenSwapperAddress, value: 1 })).to.be.reverted;
    });
  });

  describe("Swap initiation", function () {
    it("Fails with empty initiator contract address and amount", async function () {
      defaultSwap.initiatorERCContract = ethers.ZeroAddress;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "ZeroAddressSetForValidTokenType",
      );
    });

    it("Fails with empty acceptor contract address and amount", async function () {
      defaultSwap.acceptorERCContract = ethers.ZeroAddress;

      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "ZeroAddressSetForValidTokenType",
      );
    });

    it("Fails with empty initiator contract address and tokenIdOrAmount set", async function () {
      defaultSwap.initiatorERCContract = ethers.ZeroAddress;
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      await expect(
        tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH }),
      ).to.be.revertedWithCustomError(tokenSwapper, "ZeroAddressSetForValidTokenType");
    });

    it("Fails with no value and no token data", async function () {
      defaultSwap.initiatorERCContract = ethers.ZeroAddress;
      defaultSwap.initiatorETHPortion = 0n;
      defaultSwap.initiatorTokenId = 0n;
      defaultSwap.initiatorTokenQuantity = 0n;
      defaultSwap.initiatorTokenType = 0n;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "ValueOrTokenMissing",
      );
    });

    it("Fails with empty acceptor contract address and tokenIdOrAmount set", async function () {
      defaultSwap.acceptorERCContract = ethers.ZeroAddress;
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "ZeroAddressSetForValidTokenType",
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
      defaultSwap.acceptorTokenType = 3n;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
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

    it("Fails with no ETH and TokenType is none", async function () {
      defaultSwap.initiatorTokenType = 0n;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "ValueOrTokenMissing",
      );
    });

    it("Fails with no tokenId", async function () {
      defaultSwap.initiatorTokenId = 0n;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "TokenIdMissing",
      );
    });

    it("Fails with no amount", async function () {
      defaultSwap.initiatorTokenQuantity = 0n;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "TokenQuantityMissing",
      );
    });

    it("Fails with no amount", async function () {
      defaultSwap.acceptorTokenQuantity = 0n;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "TokenQuantityMissing",
      );
    });

    it("Fails to initiate with both types as none", async function () {
      defaultSwap.initiatorERCContract = ethers.ZeroAddress;
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.initiatorTokenQuantity = 0;
      defaultSwap.initiatorTokenType = 0;

      defaultSwap.acceptorERCContract = ethers.ZeroAddress;
      defaultSwap.acceptorETHPortion = 0;
      defaultSwap.acceptorTokenQuantity = 0;
      defaultSwap.acceptorTokenType = 0;

      await expect(
        tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, {
          value: GENERIC_SWAP_ETH,
        }),
      ).to.be.revertedWithCustomError(tokenSwapper, "TwoWayEthPortionsDisallowed");
    });

    it("Fails when token type unknown", async function () {
      defaultSwap.acceptorTokenType = 5;
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.reverted;
    });

    it("Initiates with empty acceptor address and ERC1155 set", async function () {
      defaultSwap.acceptor = ethers.ZeroAddress;
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorTokenId = 1;
      defaultSwap.acceptorTokenType = 4;
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      const expectedHash = keccakSwap(defaultSwap);

      expect(await tokenSwapper.swapHashes(1n)).equal(expectedHash);
    });

    it("Fails when it has expiry is in the past.", async function () {
      await networkTime.increase(86400);
      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "SwapIsInThePast",
      );
    });

    it("Initiates with empty initiator contract address and ETH value set", async function () {
      defaultSwap.initiatorERCContract = ethers.ZeroAddress;
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.initiatorTokenId = 0n;
      defaultSwap.initiatorTokenType = 0n;
      defaultSwap.initiatorTokenQuantity = 0n;
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, {
        value: GENERIC_SWAP_ETH,
      });

      const expectedHash = keccakSwap(defaultSwap);

      expect(await tokenSwapper.swapHashes(1n)).equal(expectedHash);
    });

    it("Initiates with empty acceptor contract address and ETH value set", async function () {
      defaultSwap.acceptorERCContract = ethers.ZeroAddress;
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorTokenType = 0n;
      defaultSwap.acceptorTokenQuantity = 0n;
      defaultSwap.acceptorTokenId = 0n;
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      const expectedHash = keccakSwap(defaultSwap);

      expect(await tokenSwapper.swapHashes(1n)).equal(expectedHash);
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

      await expect(tokenSwapper.connect(swapper1).initiateSwap(defaultSwap))
        .to.emit(tokenSwapper, "SwapInitiated")
        .withArgs(1, swapper1.address, swapper2.address, Object.values(defaultSwap));
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

    it("Returns false for ready, ownership, and true for approvals", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      const swapStatus: ISwapTokens.SwapStatusStruct = await tokenSwapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorNeedsToOwnToken).false;
      expect(swapStatus.acceptorNeedsToOwnToken).false;
      expect(swapStatus.initiatorTokenRequiresApproval).true;
      expect(swapStatus.acceptorTokenRequiresApproval).true;
      expect(swapStatus.isReadyForSwapping).false;
    });

    it("Returns all false for ownership and approvals and true for readiness", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      const swapStatus: ISwapTokens.SwapStatusStruct = await tokenSwapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorNeedsToOwnToken).false;
      expect(swapStatus.acceptorNeedsToOwnToken).false;
      expect(swapStatus.initiatorTokenRequiresApproval).false;
      expect(swapStatus.acceptorTokenRequiresApproval).false;
      expect(swapStatus.isReadyForSwapping).true;
    });

    it("Returns all true except readiness when no balance", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).safeTransferFrom(swapper1Address, swapper2Address, 1, 1, "0x");
      await myToken.connect(swapper2).safeTransferFrom(swapper2Address, swapper1Address, 2, 1, "0x");

      const swapStatus: ISwapTokens.SwapStatusStruct = await tokenSwapper.getSwapStatus(1n, defaultSwap);

      expect(swapStatus.initiatorNeedsToOwnToken).true;
      expect(swapStatus.acceptorNeedsToOwnToken).true;
      expect(swapStatus.initiatorTokenRequiresApproval).true;
      expect(swapStatus.acceptorTokenRequiresApproval).true;
      expect(swapStatus.isReadyForSwapping).false;
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

      await expect(tokenSwapper.connect(swapper1).removeSwap(1, defaultSwap))
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
    it("Fails if removeSwap called again", async function () {
      defaultSwap.initiatorETHPortion = ethers.parseEther("1");
      defaultSwap.initiator = reentryTesterAddress;
      await reentryTester.initiateSwap(
        BigInt(Math.floor(Date.now() / 1000)) + 86400n,
        myTokenAddress,
        myTokenAddress,
        swapper2,
        0n,
        1n,
        2n,
        tokenSwapper,
        {
          value: ethers.parseEther("1"),
        },
      );

      await expect(reentryTester.removeSwap(1, tokenSwapperAddress, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Fails reentry if completeSwap called again", async function () {
      defaultSwap.acceptor = reentryTesterAddress;
      defaultSwap.acceptorTokenId = 4n;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await reentryTester.approveToken(myTokenAddress, tokenSwapperAddress);

      await expect(reentryTester.completeSwap(1, tokenSwapperAddress, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "NoReentry",
      );
    });

    it("Fails reentry if calling removeswap while swapping", async function () {
      defaultSwap.initiator = reentryTesterAddress;
      defaultSwap.initiatorTokenId = 4n;
      defaultSwap.acceptor = swapper2Address;

      await reentryTester.initiateSwap(
        BigInt(Math.floor(Date.now() / 1000)) + 66400n,
        myTokenAddress,
        myTokenAddress,
        swapper2Address,
        0n,
        4n,
        2n,
        tokenSwapperAddress,
      );

      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);
      await reentryTester.approveToken(myTokenAddress, tokenSwapperAddress);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "NoReentry",
      );
    });

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

    it("Fails when it has expired", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await networkTime.increase(86400);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.revertedWithCustomError(
        tokenSwapper,
        "SwapHasExpired",
      );
    });

    it("Resets swap to default values", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap);

      const swapHash = await tokenSwapper.swapHashes(1n);
      expect(swapHash).equal(ethers.ZeroHash);
    });

    it("Increases the initiator balance if ETH Portion sent and no initiator tokens sent", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.initiatorTokenId = 0n;
      defaultSwap.initiatorERCContract = ethers.ZeroAddress;
      defaultSwap.initiatorTokenType = 0n;
      defaultSwap.initiatorTokenQuantity = 0n;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH });

      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      const ownerOfAcceptorToken = (await myToken.balanceOf(swapper2Address, 2n)) > 0n;

      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(ownerOfAcceptorToken).true;

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap))
        .to.emit(tokenSwapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, Object.values(defaultSwap));

      expect((await myToken.balanceOf(swapper1Address, 2n)) > 0).true;
      expect(await tokenSwapper.balances(swapper2Address)).equal(GENERIC_SWAP_ETH);
    });

    it("Increases the acceptor balance if ETH Portion sent and no acceptor tokens sent", async function () {
      defaultSwap.initiatorETHPortion = 0n;
      defaultSwap.acceptorTokenId = 0n;
      defaultSwap.acceptorERCContract = ethers.ZeroAddress;
      defaultSwap.acceptorTokenType = 0n;
      defaultSwap.acceptorTokenQuantity = 0n;

      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);

      const ownerOfInitiatorToken = (await myToken.balanceOf(swapper1Address, 1n)) > 0n;
      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(ownerOfInitiatorToken).true;

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap, { value: GENERIC_SWAP_ETH }))
        .to.emit(tokenSwapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, Object.values(defaultSwap));

      expect((await myToken.balanceOf(swapper2Address, 1n)) > 0).true;
      expect(await tokenSwapper.balances(swapper1Address)).equal(GENERIC_SWAP_ETH);
    });

    it("Emits the SwapComplete event", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap))
        .to.emit(tokenSwapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, Object.values(defaultSwap));
    });

    it("Emits the SwapComplete event on open swap", async function () {
      defaultSwap.acceptor = ethers.ZeroAddress;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap))
        .to.emit(tokenSwapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, Object.values(defaultSwap));
    });

    it("Increases the acceptor balance on an open swap", async function () {
      defaultSwap.acceptor = ethers.ZeroAddress;
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH });

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      expect(await tokenSwapper.balances(swapper2Address)).equal(0n);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap))
        .to.emit(tokenSwapper, "SwapComplete")
        .withArgs(1, swapper1.address, swapper2.address, Object.values(defaultSwap));

      expect(await tokenSwapper.balances(swapper2Address)).equal(GENERIC_SWAP_ETH);
    });

    it("Fails when contract does not have swapper 1 approval", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when acceptor does not have ownership", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      await myToken.connect(swapper2).safeTransferFrom(swapper2Address, swapper1Address, 2n, 1n, "0x");

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when contract does not have swapper 2 approval", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);

      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Fails when initiator does not have ownership", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      const swapper1Balance = await tokenSwapper.balances(swapper1.address);
      const swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      await myToken.connect(swapper1).safeTransferFrom(swapper1Address, swapper2Address, 1n, 1n, "0x");

      await expect(tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap)).to.be.reverted;
    });

    it("Swaps ownership with no ETH balances needing updating", async function () {
      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      let ownerOfInitiatorToken = (await myToken.balanceOf(swapper1Address, 1n)) > 0n;
      let ownerOfAcceptorToken = (await myToken.balanceOf(swapper2Address, 2n)) > 0n;

      let swapper1Balance = await tokenSwapper.balances(swapper1.address);
      let swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(ownerOfInitiatorToken).true;
      expect(ownerOfAcceptorToken).true;

      await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap);

      ownerOfInitiatorToken = (await myToken.balanceOf(swapper2Address, 1n)) > 0n;
      ownerOfAcceptorToken = (await myToken.balanceOf(swapper1Address, 2n)) > 0n;

      expect(ownerOfInitiatorToken).true;
      expect(ownerOfAcceptorToken).true;

      swapper1Balance = await tokenSwapper.balances(swapper1.address);
      swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);
    });

    it("Swaps ownership with acceptor balance being updated", async function () {
      defaultSwap.initiatorETHPortion = GENERIC_SWAP_ETH;
      defaultSwap.acceptorETHPortion = 0n;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap, { value: GENERIC_SWAP_ETH });

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      let ownerOfInitiatorToken = (await myToken.balanceOf(swapper1Address, 1n)) > 0n;
      let ownerOfAcceptorToken = (await myToken.balanceOf(swapper2Address, 2n)) > 0n;

      let swapper1Balance = await tokenSwapper.balances(swapper1.address);
      let swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      expect(ownerOfInitiatorToken).true;
      expect(ownerOfAcceptorToken).true;

      await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap);

      ownerOfInitiatorToken = (await myToken.balanceOf(swapper2Address, 1n)) > 0n;
      ownerOfAcceptorToken = (await myToken.balanceOf(swapper1Address, 2n)) > 0n;

      expect(ownerOfInitiatorToken).true;
      expect(ownerOfAcceptorToken).true;

      swapper1Balance = await tokenSwapper.balances(swapper1.address);
      swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(GENERIC_SWAP_ETH);
    });

    it("Swaps ownership with initiator balance being updated", async function () {
      defaultSwap.acceptorETHPortion = GENERIC_SWAP_ETH;

      await tokenSwapper.connect(swapper1).initiateSwap(defaultSwap);

      await myToken.connect(swapper1).setApprovalForAll(tokenSwapperAddress, true);
      await myToken.connect(swapper2).setApprovalForAll(tokenSwapperAddress, true);

      let ownerOfInitiatorToken = (await myToken.balanceOf(swapper1Address, 1n)) > 0n;
      let ownerOfAcceptorToken = (await myToken.balanceOf(swapper2Address, 2n)) > 0n;

      let swapper1Balance = await tokenSwapper.balances(swapper1.address);
      let swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(ownerOfInitiatorToken).true;
      expect(ownerOfAcceptorToken).true;

      expect(swapper1Balance).equal(0);
      expect(swapper2Balance).equal(0);

      await tokenSwapper.connect(swapper2).completeSwap(1, defaultSwap, { value: GENERIC_SWAP_ETH });

      ownerOfInitiatorToken = (await myToken.balanceOf(swapper2Address, 1n)) > 0n;
      ownerOfAcceptorToken = (await myToken.balanceOf(swapper1Address, 2n)) > 0n;

      expect(ownerOfInitiatorToken).true;
      expect(ownerOfAcceptorToken).true;

      swapper1Balance = await tokenSwapper.balances(swapper1.address);
      swapper2Balance = await tokenSwapper.balances(swapper2.address);

      expect(swapper1Balance).equal(GENERIC_SWAP_ETH);
      expect(swapper2Balance).equal(0);
    });
  });
});

export function getDefaultSwap(
  initiatorERCContract: string,
  acceptorERCContract: string,
  swapper1Address: string,
  swapper2Address: string,
): ErcSwap {
  return {
    expiryDate: BigInt(Math.floor(Date.now() / 1000)) + 66400n,
    initiatorERCContract: initiatorERCContract,
    acceptorERCContract: acceptorERCContract,
    initiator: swapper1Address,
    initiatorTokenId: 1n,
    initiatorTokenQuantity: 1n,
    acceptor: swapper2Address,
    acceptorTokenId: 2n,
    acceptorTokenQuantity: 1n,
    initiatorETHPortion: 0n,
    acceptorETHPortion: 0n,
    initiatorTokenType: 4n,
    acceptorTokenType: 4n,
  };
}

export type ErcSwap = {
  expiryDate: bigint;
  initiatorERCContract: string;
  acceptorERCContract: string;
  initiator: string;
  initiatorTokenId: bigint;
  initiatorTokenQuantity: bigint;
  acceptor: string;
  acceptorTokenId: bigint;
  acceptorTokenQuantity: bigint;
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

export function keccakSwap(swap: ISwapTokens.SwapStruct) {
  return abiEncodeAndKeccak256(
    [
      "uint256",
      "address",
      "address",
      "address",
      "uint256",
      "uint256",
      "address",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
    ],
    [
      swap.expiryDate,
      swap.initiatorERCContract,
      swap.acceptorERCContract,
      swap.initiator,
      swap.initiatorTokenId,
      swap.initiatorTokenQuantity,
      swap.acceptor,
      swap.acceptorTokenId,
      swap.acceptorTokenQuantity,
      swap.initiatorETHPortion,
      swap.acceptorETHPortion,
      swap.initiatorTokenType,
      swap.acceptorTokenType,
    ],
  );
}
