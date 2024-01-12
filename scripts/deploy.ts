import { ethers } from "hardhat";

async function main() {
  const swapper = await ethers.deployContract("ERC721Swapper");

  await swapper.waitForDeployment();

  console.log(`ERC721Swapper contract Deployed at address ${await swapper.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
