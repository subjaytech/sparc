const { createHmac } = require('crypto')
const { ethers }     = require('ethers')

const SPARC_ADDRESS  = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"
const RPC_URL        = "https://rpc.testnet.arc.network"
const SESSION_SECRET = process.env.SESSION_SECRET

const ABI = [
  'function hasJoined(uint256, address) external view returns (bool)',
  'function hasCompleted(uint256, address) external view returns (bool)',
  'function getPoolInfo(uint256) external view returns (uint256,uint256,uint256,bool,uint256,uint256,bool)',
  'function roundDuration() external view returns (uint256)'
]

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { player, poolId } = req.body

    if (!player || poolId === undefined) {
      return res.status(400).json({ error: 'Missing player or poolId' })
    }

    if (!ethers.isAddress(player)) {
      return res.status(400).json({ error: 'Invalid player address' })
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const sparc    = new ethers.Contract(SPARC_ADDRESS, ABI, provider)

    // Verify player has joined this pool
    const joined = await sparc.hasJoined(poolId, player)
    if (!joined) {
      return res.status(403).json({ error: 'Player has not joined this pool' })
    }

    // Check if already completed
    const completed = await sparc.hasCompleted(poolId, player)
    if (completed) {
      return res.status(403).json({ error: 'Player already completed this round' })
    }

    // Get round info
    const info         = await sparc.getPoolInfo(poolId)
    const endTime      = Number(info[2])
    const roundActive  = info[3]
    const roundId      = Number(info[5])

    if (!roundActive) {
      return res.status(403).json({ error: 'No active round for this pool' })
    }

    if (Date.now() / 1000 > endTime) {
      return res.status(403).json({ error: 'Round has ended' })
    }

    const duration = Number(await sparc.roundDuration())

    // Image session — same for all players in same round
    const imageSession = Math.floor(endTime / duration)

    // Unique shuffle seed per player per round — backend controls this
    const shuffleSeed = createHmac('sha256', SESSION_SECRET)
      .update(`shuffle:${player.toLowerCase()}:${poolId}:${roundId}`)
      .digest('hex')

    // Session token — proves this session was legitimately started
    const sessionToken = createHmac('sha256', SESSION_SECRET)
      .update(`session:${player.toLowerCase()}:${poolId}:${roundId}:${shuffleSeed}`)
      .digest('hex')

    return res.status(200).json({
      shuffleSeed,
      imageSession,
      roundId,
      sessionToken
    })

  } catch (err) {
    console.error('start-session error:', err)
    return res.status(500).json({ error: 'Failed to start session' })
  }
}