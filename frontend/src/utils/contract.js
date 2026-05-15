export const SPARC_ADDRESS = "0x590F2C2dE181B27907f7392297ab7A22a350ac52"
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"

export const SPARC_ABI = [
  "function joinPool(uint256 poolId) external",
  "function submitCompletion(uint256 poolId) external",
  "function finalizeRound(uint256 poolId) external",
  "function getPoolInfo(uint256 poolId) external view returns (uint256 entryFee, uint256 totalPot, uint256 endTime, bool active, uint256 finisherCount)",
  "function getTopThree(uint256 poolId) external view returns (address[3] memory players, uint256[3] memory times)",
  "function entryFees(uint256) external view returns (uint256)"
]

export const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
]

export const POOLS = [
  { id: 0, label: "Starter",  entryFee: "$0.50",  entryWei: "500000",         color: "from-cyan-500 to-blue-500",     border: "border-cyan-800" },
  { id: 1, label: "Bronze",   entryFee: "$5",      entryWei: "5000000",        color: "from-orange-500 to-amber-400",  border: "border-orange-800" },
  { id: 2, label: "Silver",   entryFee: "$50",     entryWei: "50000000",       color: "from-slate-400 to-gray-300",    border: "border-slate-600" },
  { id: 3, label: "Gold",     entryFee: "$500",    entryWei: "500000000",      color: "from-yellow-400 to-amber-300",  border: "border-yellow-700" },
  { id: 4, label: "Diamond",  entryFee: "$5,000",  entryWei: "5000000000",     color: "from-purple-500 to-pink-400",   border: "border-purple-700" },
]