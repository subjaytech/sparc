const { createHmac } = require('crypto')
const { ethers }     = require('ethers')

const SPARC_ADDRESS  = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"
const RPC_URL        = "https://rpc.testnet.arc.network"
const SESSION_SECRET = process.env.SESSION_SECRET
const PRIVATE_KEY    = process.env.SIGNER_PRIVATE_KEY

const PIECES = 16

const ABI = [
  'function hasCompleted(uint256, address) external view returns (bool)',
  'function getPoolInfo(uint256) external view returns (uint256,uint256,uint256,bool,uint256,uint256,bool)'
]

function isPuzzleSolved(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== PIECES) return false
  return tiles.every((t, i) => Number(t) === i)
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { player, poolId, roundId, shuffleSeed, sessionToken, startedAt, tiles } = req.body

    if (!player || poolId === undefined || roundId === undefined ||
        !shuffleSeed || !sessionToken || !startedAt || !tiles)
      return res.status(400).json({ error: 'Missing required fields' })

    if (!ethers.isAddress(player))
      return res.status(400).json({ error: 'Invalid player address' })

    // Verify session token
    const expectedToken = createHmac('sha256', SESSION_SECRET)
      .update(`session:${player.toLowerCase()}:${poolId}:${roundId}:${shuffleSeed}:${startedAt}`)
      .digest('hex')

    if (sessionToken !== expectedToken)
      return res.status(403).json({ error: 'Invalid session — please refresh and try again.' })

    // Verify shuffle seed belongs to this player
    const expectedSeed = createHmac('sha256', SESSION_SECRET)
      .update(`shuffle:${player.toLowerCase()}:${poolId}:${roundId}`)
      .digest('hex')

    if (shuffleSeed !== expectedSeed)
      return res.status(403).json({ error: 'Invalid puzzle session.' })

    // Verify puzzle is actually solved
    if (!isPuzzleSolved(tiles))
      return res.status(400).json({ error: 'Puzzle is not solved correctly.' })

    // Verify round is still active on-chain
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const sparc    = new ethers.Contract(SPARC_ADDRESS, ABI, provider)
    const info     = await sparc.getPoolInfo(poolId)
    const endTime  = Number(info[2])
    const active   = info[3]
    const chainRid = Number(info[5])
    const now      = Math.floor(Date.now() / 1000)

    if (!active)
      return res.status(403).json({ error: 'Round is no longer active.' })

    if (now > endTime)
      return res.status(403).json({ error: 'Round ended before you could submit.' })

    if (chainRid !== Number(roundId))
      return res.status(403).json({ error: 'Round has changed. Please refresh.' })

    // Check not already completed
    const completed = await sparc.hasCompleted(poolId, player)
    if (completed)
      return res.status(403).json({ error: 'Already submitted for this round.' })

    // Sign completion
    const signer  = new ethers.Wallet(PRIVATE_KEY)
    const expiry  = now + 600

    const msgHash = ethers.solidityPackedKeccak256(
      ['address', 'uint256', 'uint256', 'uint256'],
      [player, BigInt(poolId), BigInt(roundId), BigInt(expiry)]
    )

    const signature = await signer.signMessage(ethers.getBytes(msgHash))

    // Calculate exact solving time in seconds
    const solvingSeconds = now - Number(startedAt)

    console.log(`Signed: player=${player} pool=${poolId} round=${roundId} solveTime=${solvingSeconds}s`)

    return res.status(200).json({ expiry, signature, solvingSeconds })

  } catch (err) {
    console.error('sign-completion error:', err)
    return res.status(500).json({ error: 'Server error. Please try again.' })
  }
}