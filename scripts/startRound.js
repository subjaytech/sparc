const hre = require("hardhat");

async function main() {
  const SPARC_ADDRESS = "0x590F2C2dE181B27907f7392297ab7A22a350ac52"
  const sparc = await hre.ethers.getContractAt("SPARC", SPARC_ADDRESS)

  console.log("Starting round for Starter pool...")
  const tx = await sparc.startRound(0)
  await tx.wait()
  console.log("Round started! Players can now join Pool 0.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
