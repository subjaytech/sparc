const { ethers, upgrades } = require("hardhat");

// 🔴 This stays the same FOREVER — your permanent proxy address
const PROXY_ADDRESS = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF";

async function main() {
  console.log("Upgrading SPARC logic at proxy:", PROXY_ADDRESS);

  const SPARCv2 = await ethers.getContractFactory("SPARC"); // or SPARCv2
  const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, SPARCv2, {
    kind: "uups"
  });

  await upgraded.waitForDeployment();
  console.log("Upgraded. Proxy address unchanged:", PROXY_ADDRESS);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});