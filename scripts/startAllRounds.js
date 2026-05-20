const hre = require("hardhat");

async function main() {
  const SPARC_ADDRESS = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"
  const sparc = await hre.ethers.getContractAt("SPARC", SPARC_ADDRESS)

  for (let i = 0; i < 5; i++) {
    try {
      const tx = await sparc.startRound(i)
      await tx.wait()
      console.log(`Pool ${i} round started`)
    } catch (err) {
      console.log(`Pool ${i} skipped: ${err.reason || 'already active'}`)
    }
  }
  console.log("Done.")
}

main().catch(console.error)
