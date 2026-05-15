const hre = require("hardhat");

async function main() {
  console.log("Deploying SPARC to Arc Testnet...");

  const SPARC = await hre.ethers.getContractFactory("SPARC");
  const sparc = await SPARC.deploy();

  await sparc.waitForDeployment();

  const address = await sparc.getAddress();
  console.log("SPARC deployed successfully!");
  console.log("Contract address:", address);
  console.log("View on explorer: https://testnet.arcscan.app/address/" + address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});