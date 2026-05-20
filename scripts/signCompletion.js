/**
 * Backend signing script — simulates what your game server will do
 * Usage: npx hardhat run scripts/signCompletion.js --network arcTestnet
 *
 * Before running, set these variables:
 */

const PLAYER_ADDRESS = "0xf8634A8b88a6C7f2Ef46Bc6b99f444FD7E606cdB" // 🔴 replace with player wallet
const POOL_ID        = 0                                               // 🔴 pool player is in
const SPARC_ADDRESS  = "0xD39EA4F975c67fA8120eFdD1895C28C360076FfF"

async function main() {
  const [signer] = await ethers.getSigners() // uses your private key from .env
  const sparc    = await ethers.getContractAt("SPARC", SPARC_ADDRESS)

  // Get current roundId for this pool
  const info    = await sparc.getPoolInfo(POOL_ID)
  const roundId = info[5]

  // Signature valid for 10 minutes from now
  const expiry  = Math.floor(Date.now() / 1000) + 600

  // Sign exactly what the contract verifies:
  // keccak256(abi.encodePacked(player, poolId, roundId, expiry))
  const msgHash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "uint256", "uint256"],
    [PLAYER_ADDRESS, POOL_ID, roundId, expiry]
  )

  const signature = await signer.signMessage(ethers.getBytes(msgHash))

  console.log("Player  :", PLAYER_ADDRESS)
  console.log("Pool    :", POOL_ID)
  console.log("RoundId :", roundId.toString())
  console.log("Expiry  :", expiry)
  console.log("Signature:", signature)
  console.log("\nPaste these into the frontend submitCompletion call.")
}

main().catch(console.error)
