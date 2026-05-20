const { createHmac } = require('crypto')
const { ethers }     = require('ethers')

const SPARC_ADDRESS  = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"
const RPC_URL        = "https://rpc.testnet.arc.network"
const SESSION_SECRET = process.env.SESSION_SECRET
const PRIVATE_KEY    = process.env.SIGNER_PRIVATE_KEY

const GRID   = 4
const PIECES = 16

const ABI = [
  'function hasCompleted(uint256, address) external view returns (bool)',
  'function getPoolInfo(uint256) external view returns (uint256,uint256,uint256,bool,uint256,uint256,bool)'
]

// Verify all 16 tiles are in correct position
function isPuzzleSolved(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== PIECES) return false
  return tiles.every((t, i) => Number(t) === i)
}

// Recreate the shuffle from seed to verify player used correct starting state
function seededShuffle(hexSeed) {
  const seed = parseInt(hexSeed.slice(0, 8), 16)
  let s = seed | 0
  const rand = () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const arr = Array.from({ length: PIECES }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { player, poolId, roundId, shuffleSeed, sessionToken, tiles } = req.body

    // --- Input validation ---
    if (!player || poolId === undefined || roundId === undefined ||
        !shuffleSeed || !sessionToken || !tiles) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (!ethers.isAddress(player)) {
      return res.status(400).json({ error: 'Invalid player address' })
    }

    // --- Verify session token ---
    const expectedToken = createHmac('sha256', SESSION_SECRET)
      .update(`session:${player.toLowerCase()}:${poolId}:${roundId}:${shuffleSeed}`)
      .digest('hex')

    if (sessionToken !== expectedToken) {
      return res.status(403).json({ error: 'Invalid session token' })
    }

    // --- Verify shuffle seed belongs to this player ---
    const expectedSeed = createHmac('sha256', SESSION_SECRET)
      .update(`shuffle:${player.toLowerCase()}:${poolId}:${roundId}`)
      .digest('hex')

    if (shuffleSeed !== expectedSeed) {
      return res.status(403).json({ error: 'Invalid shuffle seed' })
    }

    // --- Verify puzzle is actually solved ---
    if (!isPuzzleSolved(tiles)) {
      return res.status(400).json({ error: 'Puzzle is not solved' })
    }

    // --- Verify round is still active on-chain ---
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const sparc    = new ethers.Contract(SPARC_ADDRESS, ABI, provider)

    const info        = await sparc.getPoolInfo(poolId)
    const endTime     = Number(info[2])
    const roundActive = info[3]
    const onchainRid  = Number(info[5])

    if (!roundActive) {
      return res.status(403).json({ error: 'Round is no longer active' })
    }

    if (Date.now() / 1000 > endTime) {
      return res.status(403).json({ error: 'Round has ended' })
    }

    if (onchainRid !== Number(roundId)) {
      return res.status(403).json({ error: 'Round ID mismatch — round may have changed' })
    }

    // --- Verify not already completed on-chain ---
    const completed = await sparc.hasCompleted(poolId, player)
    if (completed) {
      return res.status(403).json({ error: 'Already submitted for this round' })
    }

    // --- Sign completion ---
    const signer  = new ethers.Wallet(PRIVATE_KEY)
    const expiry  = Math.floor(Date.now() / 1000) + 600

    const msgHash = ethers.solidityPackedKeccak256(
      ['address', 'uint256', 'uint256', 'uint256'],
      [player, BigInt(poolId), BigInt(roundId), BigInt(expiry)]
    )

    const signature = await signer.signMessage(ethers.getBytes(msgHash))

    console.log(`✅ Signed: player=${player} pool=${poolId} round=${roundId}`)

    return res.status(200).json({ expiry, signature })

  } catch (err) {
    console.error('sign-completion error:', err)
    return res.status(500).json({ error: 'Signing failed' })
  }
}