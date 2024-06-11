import { ethers } from "hardhat";

async function main() {
  const swapper = await ethers.deployContract("TokenSwapper");

  await swapper.waitForDeployment();

  console.log(`TokenSwapper contract Deployed at address ${await swapper.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
