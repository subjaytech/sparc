const hre = require("hardhat");

async function main() {
  const SPARC_ADDRESS = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"
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
