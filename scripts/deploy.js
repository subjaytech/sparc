const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const SPARC = await ethers.getContractFactory("SPARC");

  // Deploy proxy — this address is PERMANENT
  const sparc = await upgrades.deployProxy(
    SPARC,
    [deployer.address, deployer.address], // owner, trustedSigner
    { kind: "uups", initializer: "initialize" }
  );

  await sparc.waitForDeployment();
  const address = await sparc.getAddress();

  console.log("SPARC Proxy (PERMANENT):", address);
  console.log("Explorer:", `https://testnet.arcscan.app/address/${address}`);
  console.log("\nSave this address — it never changes.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});