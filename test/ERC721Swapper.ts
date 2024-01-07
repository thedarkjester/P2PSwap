import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { ERC721Swapper, MyToken } from "../typechain-types/contracts/ERC721Swapper.sol";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { IERC721Swapper } from "../typechain-types";

describe("ERC721Swapper", function () {
  let erc721Swapper: ERC721Swapper;
  let myToken: MyToken;
  let myTokenAddress: string;
  let owner: SignerWithAddress;
  let swapper1: SignerWithAddress;
  let swapper2: SignerWithAddress;

  async function deployERC721SwapperFixture() {
    const ERC721SwapperFactory = await ethers.getContractFactory("ERC721Swapper");
    erc721Swapper = await ERC721SwapperFactory.deploy();
  }

  async function deployMyTokenFixture() {
    const MyTokenFactory = await ethers.getContractFactory("MyToken");
    myToken = await MyTokenFactory.deploy(owner);
    myTokenAddress = await myToken.getAddress();
  }

  // swapper 1 has 2 tokens to start
  // swapper 2 has 2 tokens to start
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
    await mintTokensToSwap();
  })

  describe("Deployment", function () {
    it("Should deploy erc721Swapper", async function () {
      const address = await erc721Swapper.getAddress();
      expect(address).to.not.be.empty;
    });

    it("Should deploy myToken", async function () {
      const address = await myToken.getAddress();
      expect(address).to.not.be.empty;
    });
  });

  describe("Swap initiation", function () {
    it("Can't create swap with empty initiator contract address", async function () {
      await expect(erc721Swapper.initiateSwap(ethers.ZeroAddress, myTokenAddress, swapper1, ethers.toBigInt(0), ethers.toBigInt(0), ethers.toBigInt(2))).to.be.revertedWithCustomError(erc721Swapper, "ZeroAddressDisallowed");
    });

    it("Can't create swap with empty acceptor contract address", async function () {
      await expect(erc721Swapper.initiateSwap(myTokenAddress, ethers.ZeroAddress, swapper1, ethers.toBigInt(0), ethers.toBigInt(0), ethers.toBigInt(2))).to.be.revertedWithCustomError(erc721Swapper, "ZeroAddressDisallowed");
    });

    it("Can't create swap with acceptor empty address", async function () {
      await expect(erc721Swapper.connect(swapper1).initiateSwap(myTokenAddress, myTokenAddress, ethers.ZeroAddress, ethers.toBigInt(1000), ethers.toBigInt(1), ethers.toBigInt(2))).to.be.revertedWithCustomError(erc721Swapper, "ZeroAddressDisallowed");
    });

    it("Can't create swap with both acceptor and initiator ETH Portion", async function () {
      await expect(erc721Swapper.connect(swapper1).initiateSwap(myTokenAddress, myTokenAddress, swapper2, ethers.toBigInt(1000), ethers.toBigInt(1), ethers.toBigInt(2), { value: ethers.toBigInt(1000) })).to.be.revertedWithCustomError(erc721Swapper, "TwoWayEthPortionsDisallowed");
    });

    it("Can create swap with initiator ETH Portion", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(myTokenAddress, myTokenAddress, swapper2, ethers.toBigInt(0), ethers.toBigInt(1), ethers.toBigInt(2), { value: ethers.toBigInt(1000) });

      const swap: IERC721Swapper.SwapStruct = await erc721Swapper.swaps(ethers.toBigInt(1));

      expect(swap.swapId).equal(1);
      expect(swap.initiatorNftContract).equal(myTokenAddress);
      expect(swap.acceptorNftContract).equal(myTokenAddress);
      expect(swap.initiator).equal(swapper1.address);
      expect(swap.initiatorTokenId).equal(1);
      expect(swap.acceptor).equal(swapper2.address);
      expect(swap.acceptorTokenId).equal(2);
      expect(swap.initiatorETHPortion).equal(1000);
      expect(swap.acceptorETHPortion).equal(0);
    });

    it("Can create swap with acceptor ETH Portion", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(myTokenAddress, myTokenAddress, swapper2, ethers.toBigInt(1000), ethers.toBigInt(1), ethers.toBigInt(2));

      const swap: IERC721Swapper.SwapStruct = await erc721Swapper.swaps(ethers.toBigInt(1));

      expect(swap.swapId).equal(1);
      expect(swap.initiatorNftContract).equal(myTokenAddress);
      expect(swap.acceptorNftContract).equal(myTokenAddress);
      expect(swap.initiator).equal(swapper1.address);
      expect(swap.initiatorTokenId).equal(1);
      expect(swap.acceptor).equal(swapper2.address);
      expect(swap.acceptorTokenId).equal(2);
      expect(swap.initiatorETHPortion).equal(0);
      expect(swap.acceptorETHPortion).equal(1000);
    });

    it("Can create and emit events", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(myTokenAddress, myTokenAddress, swapper2, ethers.toBigInt(1000), ethers.toBigInt(1), ethers.toBigInt(2));

      expect(await erc721Swapper.swaps(ethers.toBigInt(1))).to.emit(erc721Swapper,"SwapInitiated").withArgs(1,swapper1.address,swapper2.address);
    });

    it("Swap Id increments and multiple offers can happen", async function () {
      await erc721Swapper.connect(swapper1).initiateSwap(myTokenAddress, myTokenAddress, swapper2, ethers.toBigInt(1000), ethers.toBigInt(1), ethers.toBigInt(2));

      let swap: IERC721Swapper.SwapStruct = await erc721Swapper.swaps(ethers.toBigInt(1));

      expect(swap.swapId).equal(ethers.toBigInt(1));
      expect(swap.initiatorNftContract).equal(myTokenAddress);
      expect(swap.acceptorNftContract).equal(myTokenAddress);
      expect(swap.initiator).equal(swapper1.address);
      expect(swap.initiatorTokenId).equal(1);
      expect(swap.acceptor).equal(swapper2.address);
      expect(swap.acceptorTokenId).equal(2);
      expect(swap.initiatorETHPortion).equal(0);
      expect(swap.acceptorETHPortion).equal(1000);

      await erc721Swapper.connect(swapper1).initiateSwap(myTokenAddress, myTokenAddress, swapper2, ethers.toBigInt(1000), ethers.toBigInt(1), ethers.toBigInt(2));

      swap = await erc721Swapper.swaps(ethers.toBigInt(2));

      expect(swap.swapId).equal(ethers.toBigInt(2));
      expect(swap.initiatorNftContract).equal(myTokenAddress);
      expect(swap.acceptorNftContract).equal(myTokenAddress);
      expect(swap.initiator).equal(swapper1.address);
      expect(swap.initiatorTokenId).equal(1);
      expect(swap.acceptor).equal(swapper2.address);
      expect(swap.acceptorTokenId).equal(2);
      expect(swap.initiatorETHPortion).equal(0);
      expect(swap.acceptorETHPortion).equal(1000);

      const swapCountId = await erc721Swapper.swapId();
      expect(swapCountId).equal(ethers.toBigInt(3));
    });
  });
});
