import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { IERC721Swapper, RemovalReentryTester, MyToken, ERC721Swapper } from "../typechain-types";

describe("ERC721Swapper", function () {
  const GENERIC_SWAP_ETH = ethers.parseEther("1");

  let erc721Swapper: ERC721Swapper;
  let erc721SwapperAddress: string;
  let myToken: MyToken;
  let removalReentryTester: RemovalReentryTester;
  let myTokenAddress: string;

  let owner: SignerWithAddress;
  let swapper1: SignerWithAddress;
  let swapper2: SignerWithAddress;

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
    const RemovalReentryTesterFactory = await ethers.getContractFactory("RemovalReentryTester");
    removalReentryTester = await RemovalReentryTesterFactory.deploy();
  }

  // swapper 1 has 2 tokens to start (0,1)
  // swapper 2 has 2 tokens to start (2,3)
  async function mintTokensToSwap() {
    await myToken.connect(owner).safeMint(swapper1.address);
    await myToken.connect(owner).safeMint(swapper1.address);
    await myToken.connect(owner).safeMint(swapper2.address);
    await myToken.connect(owner).safeMint(swapper2.address);
  }

  this.beforeEach(async () => {
    [owner, swapper1, swapper2] = await ethers.getSigners();
    await loadFixture(deployERC721SwapperFixture);
    await loadFixture(deployMyTokenFixture);
    await loadFixture(deployRentryContractsFixture);

    await mintTokensToSwap();
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

    it("Should deploy removalReentryTester", async function () {
      const address = await removalReentryTester.getAddress();
      expect(address).to.not.be.empty;
    });
  });

  describe("ETH Transfer", function () {
    it("Fails if direct and hits receive", async function () {
      await expect(owner.sendTransaction({ to: erc721SwapperAddress, value: 1 })).to.be.revertedWithCustomError(
        erc721Swapper,
        "DirectFundingDisallowed",
      );
    });

    it("Fails if function does not exist and hits fallback", async function () {
      await expect(
        owner.sendTransaction({
          to: erc721SwapperAddress,
          value: 1,
          data: "0xdeadbeef",
        }),
      ).to.be.revertedWithCustomError(erc721Swapper, "DirectFundingDisallowed");
    });
  });

  describe("Swap initiation", function () {
    it("Fails with empty initiator contract address", async function () {
      await expect(
        erc721Swapper.initiateSwap(
          ethers.ZeroAddress,
          myTokenAddress,
          swapper1,
          ethers.toBigInt(0),
          ethers.toBigInt(0),
          ethers.toBigInt(2),
        ),
      ).to.be.revertedWithCustomError(erc721Swapper, "ZeroAddressDisallowed");
    });

    it("Fails with empty acceptor contract address", async function () {
      await expect(
        erc721Swapper.initiateSwap(
          myTokenAddress,
          ethers.ZeroAddress,
          swapper1,
          ethers.toBigInt(0),
          ethers.toBigInt(0),
          ethers.toBigInt(2),
        ),
      ).to.be.revertedWithCustomError(erc721Swapper, "ZeroAddressDisallowed");
    });

    it("Fails with acceptor empty address", async function () {
      await expect(
        erc721Swapper
          .connect(swapper1)
          .initiateSwap(
            myTokenAddress,
            myTokenAddress,
            ethers.ZeroAddress,
            ethers.toBigInt(GENERIC_SWAP_ETH),
            ethers.toBigInt(1),
            ethers.toBigInt(2),
          ),
      ).to.be.revertedWithCustomError(erc721Swapper, "ZeroAddressDisallowed");
    });

    it("Fails with both acceptor and initiator ETH Portion", async function () {
      await expect(
        erc721Swapper
          .connect(swapper1)
          .initiateSwap(
            myTokenAddress,
            myTokenAddress,
            swapper2,
            ethers.toBigInt(GENERIC_SWAP_ETH),
            ethers.toBigInt(1),
            ethers.toBigInt(2),
            { value: ethers.toBigInt(GENERIC_SWAP_ETH) },
          ),
      ).to.be.revertedWithCustomError(erc721Swapper, "TwoWayEthPortionsDisallowed");
    });

    it("Initiates swap with initiator ETH Portion", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(0),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
          { value: ethers.toBigInt(GENERIC_SWAP_ETH) },
        );

      const swap: IERC721Swapper.SwapStruct = await erc721Swapper.swaps(ethers.toBigInt(1));

      expect(swap.swapId).equal(1);
      expect(swap.initiatorNftContract).equal(myTokenAddress);
      expect(swap.acceptorNftContract).equal(myTokenAddress);
      expect(swap.initiator).equal(swapper1.address);
      expect(swap.initiatorTokenId).equal(1);
      expect(swap.acceptor).equal(swapper2.address);
      expect(swap.acceptorTokenId).equal(2);
      expect(swap.initiatorETHPortion).equal(GENERIC_SWAP_ETH);
      expect(swap.acceptorETHPortion).equal(0);
    });

    it("Initiates swap with acceptor ETH Portion", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      const swap: IERC721Swapper.SwapStruct = await erc721Swapper.swaps(ethers.toBigInt(1));

      expect(swap.swapId).equal(1);
      expect(swap.initiatorNftContract).equal(myTokenAddress);
      expect(swap.acceptorNftContract).equal(myTokenAddress);
      expect(swap.initiator).equal(swapper1.address);
      expect(swap.initiatorTokenId).equal(1);
      expect(swap.acceptor).equal(swapper2.address);
      expect(swap.acceptorTokenId).equal(2);
      expect(swap.initiatorETHPortion).equal(0);
      expect(swap.acceptorETHPortion).equal(GENERIC_SWAP_ETH);
    });

    it("Initiates swap and emits SwapInitiated event", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      expect(await erc721Swapper.swaps(ethers.toBigInt(1)))
        .to.emit(erc721Swapper, "SwapInitiated")
        .withArgs(1, swapper1.address, swapper2.address);
    });

    it("Increments swap Id and multiple offers are possible", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      let swap: IERC721Swapper.SwapStruct = await erc721Swapper.swaps(ethers.toBigInt(1));

      expect(swap.swapId).equal(ethers.toBigInt(1));
      expect(swap.initiatorNftContract).equal(myTokenAddress);
      expect(swap.acceptorNftContract).equal(myTokenAddress);
      expect(swap.initiator).equal(swapper1.address);
      expect(swap.initiatorTokenId).equal(1);
      expect(swap.acceptor).equal(swapper2.address);
      expect(swap.acceptorTokenId).equal(2);
      expect(swap.initiatorETHPortion).equal(0);
      expect(swap.acceptorETHPortion).equal(GENERIC_SWAP_ETH);

      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      swap = await erc721Swapper.swaps(ethers.toBigInt(2));

      expect(swap.swapId).equal(ethers.toBigInt(2));
      expect(swap.initiatorNftContract).equal(myTokenAddress);
      expect(swap.acceptorNftContract).equal(myTokenAddress);
      expect(swap.initiator).equal(swapper1.address);
      expect(swap.initiatorTokenId).equal(1);
      expect(swap.acceptor).equal(swapper2.address);
      expect(swap.acceptorTokenId).equal(2);
      expect(swap.initiatorETHPortion).equal(0);
      expect(swap.acceptorETHPortion).equal(GENERIC_SWAP_ETH);

      const swapCountId = await erc721Swapper.swapId();
      expect(swapCountId).equal(ethers.toBigInt(3));
    });
  });

  describe("Getting swap status", function () {
    it("Fails if the swap does not exist", async function () {
      await expect(erc721Swapper.getSwapStatus(ethers.toBigInt(1))).to.be.revertedWithCustomError(
        erc721Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Returns true for ownership and false for approvals", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      const swapStatus: IERC721Swapper.SwapStatusStruct = await erc721Swapper.getSwapStatus(ethers.toBigInt(1));

      expect(swapStatus.initiatorOwnsToken).true;
      expect(swapStatus.acceptorOwnsToken).true;
      expect(swapStatus.initiatorApprovalsSet).false;
      expect(swapStatus.acceptorApprovalsSet).false;
    });

    it("Returns all true for ownership and approvals", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      await myToken.connect(swapper1).approve(erc721SwapperAddress, 1);
      await myToken.connect(swapper2).approve(erc721SwapperAddress, 2);

      const swapStatus: IERC721Swapper.SwapStatusStruct = await erc721Swapper.getSwapStatus(ethers.toBigInt(1));

      expect(swapStatus.initiatorOwnsToken).true;
      expect(swapStatus.acceptorOwnsToken).true;
      expect(swapStatus.initiatorApprovalsSet).true;
      expect(swapStatus.acceptorApprovalsSet).true;
    });

    it("Returns all false when no ownership", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      await myToken.connect(swapper1).transferFrom(swapper1.address, erc721SwapperAddress, 1);
      await myToken.connect(swapper2).transferFrom(swapper2.address, erc721SwapperAddress, 2);

      const swapStatus: IERC721Swapper.SwapStatusStruct = await erc721Swapper.getSwapStatus(ethers.toBigInt(1));

      expect(swapStatus.initiatorOwnsToken).false;
      expect(swapStatus.acceptorOwnsToken).false;
      expect(swapStatus.initiatorApprovalsSet).false;
      expect(swapStatus.acceptorApprovalsSet).false;
    });
  });

  describe("Swap removal and withdrawing", function () {
    it("Fails when not initiator", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      await expect(erc721Swapper.connect(swapper2).removeSwap(1)).to.be.revertedWithCustomError(
        erc721Swapper,
        "NotInitiator",
      );
    });

    it("Fails when already reset", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      const swap: IERC721Swapper.SwapStruct = await erc721Swapper.swaps(ethers.toBigInt(1));
      expect(swap.swapId).equal(ethers.toBigInt(1)); // the rest is tested elsewhere

      await erc721Swapper.connect(swapper1).removeSwap(1);

      await expect(erc721Swapper.connect(swapper1).removeSwap(1)).to.be.revertedWithCustomError(
        erc721Swapper,
        "SwapCompleteOrDoesNotExist",
      );
    });

    it("Resets the mapping values", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      let swap: IERC721Swapper.SwapStruct = await erc721Swapper.swaps(ethers.toBigInt(1));
      await erc721Swapper.connect(swapper1).removeSwap(1);

      swap = await erc721Swapper.swaps(ethers.toBigInt(1));

      expect(swap.swapId).equal(ethers.toBigInt(0)); // the rest is tested elsewhere
      expect(swap.initiatorNftContract).equal(ethers.ZeroAddress);
      expect(swap.acceptorNftContract).equal(ethers.ZeroAddress);
      expect(swap.initiator).equal(ethers.ZeroAddress);
      expect(swap.initiatorTokenId).equal(0);
      expect(swap.acceptor).equal(ethers.ZeroAddress);
      expect(swap.acceptorTokenId).equal(0);
      expect(swap.initiatorETHPortion).equal(0);
      expect(swap.acceptorETHPortion).equal(0);
    });

    it("Emits SwapRemoved event", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      expect(await erc721Swapper.connect(swapper1).removeSwap(1))
        .to.emit(erc721Swapper, "SwapRemoved")
        .withArgs(1, swapper1.address);
    });

    it("Does not increase the initiator balance if no ETH Portion sent", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(GENERIC_SWAP_ETH),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
        );

      let balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      await erc721Swapper.connect(swapper1).removeSwap(1);

      balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(0);
    });

    it("Fails reentry if withdraw called again", async function () {
      await removalReentryTester.initiateSwap(
        myTokenAddress,
        myTokenAddress,
        swapper2,
        ethers.toBigInt(0),
        ethers.toBigInt(1),
        ethers.toBigInt(2),
        erc721SwapperAddress,
        { value: ethers.parseEther("1") },
      );

      removalReentryTester.removeSwap(1, erc721SwapperAddress);

      await expect(removalReentryTester.withdraw(erc721SwapperAddress)).to.be.revertedWithCustomError(
        erc721Swapper,
        "ETHSendingFailed",
      );
    });

    it("Fails withdraw if balance is empty", async function () {
      await expect(removalReentryTester.withdraw(erc721SwapperAddress)).to.be.revertedWithCustomError(
        erc721Swapper,
        "EmptyWithdrawDisallowed",
      );
    });

    it("Increases the initiator balance if ETH Portion sent", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(0),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
          { value: GENERIC_SWAP_ETH },
        );

      let balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      await erc721Swapper.connect(swapper1).removeSwap(1);

      balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(GENERIC_SWAP_ETH);
    });

    it("Sends the initiator balance when withdrawing", async function () {
      await erc721Swapper
        .connect(swapper1)
        .initiateSwap(
          myTokenAddress,
          myTokenAddress,
          swapper2,
          ethers.toBigInt(0),
          ethers.toBigInt(1),
          ethers.toBigInt(2),
          { value: ethers.parseEther("1") },
        );
      await erc721Swapper.connect(swapper1).removeSwap(1);

      const balanceBefore = await ethers.provider.getBalance(swapper1.address);

      let balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).greaterThan(0);

      await erc721Swapper.connect(swapper1).withdraw();

      balance = await erc721Swapper.balances(swapper1.address);
      expect(balance).equal(0);

      const balanceAfter = await ethers.provider.getBalance(swapper1.address);

      expect(balanceAfter).greaterThan(balanceBefore);
    });
  });
});
