const { ethers } = require("hardhat");

const PROXY_ADDRESS  = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"
const NEW_SIGNER     = "0x265cb2f9e29bEd6c5E26d09e609DA4b7fB947e08"

async function main() {
  const sparc = await ethers.getContractAt("SPARC", PROXY_ADDRESS)
  console.log("Updating trusted signer...")
  const tx = await sparc.setTrustedSigner(NEW_SIGNER)
  await tx.wait()
  console.log("Trusted signer updated to:", NEW_SIGNER)
}

main().catch(console.error)
