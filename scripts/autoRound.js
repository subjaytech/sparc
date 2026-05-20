const hre = require("hardhat");

const SPARC_ADDRESS = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"

async function main() {
  const sparc = await hre.ethers.getContractAt("SPARC", SPARC_ADDRESS)

  for (let i = 0; i < 5; i++) {
    try {
      const info = await sparc.getPoolInfo(i)
      const now = Math.floor(Date.now() / 1000)
      const endTime = Number(info[2])
      const isActive = info[3]

      if (isActive && now > endTime) {
        console.log(`Pool ${i}: finalizing...`)
        await (await sparc.finalizeRound(i)).wait()
        console.log(`Pool ${i}: finalized`)
      }

      if (!isActive) {
        console.log(`Pool ${i}: starting new round...`)
        await (await sparc.startRound(i)).wait()
        console.log(`Pool ${i}: round started`)
      }

      if (isActive && now <= endTime) {
        const remaining = endTime - now
        const hrs = Math.floor(remaining / 3600)
        const mins = Math.floor((remaining % 3600) / 60)
        console.log(`Pool ${i}: active — ${hrs}h ${mins}m remaining`)
      }
    } catch (err) {
      console.log(`Pool ${i}: error — ${err.reason || err.message}`)
    }
  }
}

main().catch(console.error)