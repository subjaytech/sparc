const { ethers } = require('ethers')

const SPARC_ADDRESS    = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"
const RPC_URL          = "https://rpc.testnet.arc.network"
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY
const CRON_SECRET      = process.env.CRON_SECRET

const ABI = [
  'function startRound(uint256 poolId) external',
  'function finalizeRound(uint256 poolId) external',
  'function getPoolInfo(uint256) external view returns (uint256,uint256,uint256,bool,uint256,uint256,bool)'
]

module.exports = async function handler(req, res) {
  // Security — only Vercel Cron can call this
  const auth = req.headers.authorization
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const wallet   = new ethers.Wallet(OWNER_PRIVATE_KEY, provider)
    const sparc    = new ethers.Contract(SPARC_ADDRESS, ABI, wallet)

    const now     = Math.floor(Date.now() / 1000)
    const results = []

    for (let i = 0; i < 5; i++) {
      try {
        const info    = await sparc.getPoolInfo(i)
        const endTime = Number(info[2])
        const active  = info[3]

        if (active && now > endTime) {
          const tx = await sparc.finalizeRound(i)
          await tx.wait()
          results.push(`Pool ${i}: finalized`)
        }

        if (!active) {
          const tx = await sparc.startRound(i)
          await tx.wait()
          results.push(`Pool ${i}: new round started`)
        }

        if (active && now <= endTime) {
          const remaining = endTime - now
          results.push(`Pool ${i}: active — ${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m left`)
        }

      } catch (err) {
        results.push(`Pool ${i}: error — ${err.message}`)
      }
    }

    console.log('Auto-round results:', results)
    return res.status(200).json({ success: true, results, timestamp: new Date().toISOString() })

  } catch (err) {
    console.error('Cron error:', err)
    return res.status(500).json({ error: err.message })
  }
}