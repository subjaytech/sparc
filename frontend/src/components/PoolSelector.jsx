import { useState } from 'react'
import { ethers } from 'ethers'
import { SPARC_ADDRESS, SPARC_ABI, USDC_ADDRESS, USDC_ABI, POOLS } from '../utils/contract'

export default function PoolSelector({ wallet, selectedPool, setSelectedPool, setGameActive }) {
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const joinPool = async () => {
    if (!wallet) { setError('Connect your wallet first.'); return }
    if (selectedPool === null) { setError('Select a pool to continue.'); return }

    setJoining(true)
    setError('')
    setStatus('Approving USDC...')

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      const pool = POOLS[selectedPool]
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer)
      const sparc = new ethers.Contract(SPARC_ADDRESS, SPARC_ABI, signer)

      // Approve USDC spend
      const approveTx = await usdc.approve(SPARC_ADDRESS, pool.entryWei)
      await approveTx.wait()
      setStatus('Joining pool...')

      // Join the pool
      const joinTx = await sparc.joinPool(selectedPool)
      await joinTx.wait()

      setStatus('Joined! Starting puzzle...')
      setTimeout(() => setGameActive(true), 1000)

    } catch (err) {
      setError(err.reason || err.message || 'Transaction failed.')
    }

    setJoining(false)
    setStatus('')
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Title */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black mb-3 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Choose Your Pool
        </h1>
        <p className="text-blue-300/50 text-sm">
          Top 3 fastest solvers share the prize pool · 6-hour rounds · Powered by USDC on Arc
        </p>
      </div>

      {/* Pool Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        {POOLS.map((pool) => (
          <div
            key={pool.id}
            onClick={() => setSelectedPool(pool.id)}
            className={`relative cursor-pointer rounded-2xl p-6 border-2 transition-all duration-200
              ${selectedPool === pool.id
                ? `${pool.border} bg-white/10 scale-105 shadow-lg`
                : 'border-blue-900/30 bg-white/5 hover:bg-white/8 hover:border-blue-800/50'
              }`}
          >
            <p className={`text-xs font-bold uppercase tracking-widest bg-gradient-to-r ${pool.color} bg-clip-text text-transparent mb-3`}>
              {pool.label}
            </p>
            <p className="text-3xl font-black text-white">{pool.entryFee}</p>
            <p className="text-xs text-blue-400/40 mb-5">entry fee</p>

            <div className="space-y-1 text-xs text-blue-300/50">
              <div>🥇 1st — 50%</div>
              <div>🥈 2nd — 30%</div>
              <div>🥉 3rd — 19.7%</div>
            </div>

            {selectedPool === pool.id && (
              <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-blue-400 shadow-md shadow-blue-400/60" />
            )}
          </div>
        ))}
      </div>

      {/* Reward Info */}
      <div className="flex justify-center mb-8">
        <div className="flex gap-8 text-xs text-blue-400/40 border border-blue-900/20 rounded-xl px-8 py-4 bg-white/5">
          <span>⏱ 6-hour rounds</span>
          <span>🏆 Top 3 win</span>
          <span>💰 0.3% platform fee</span>
          <span>🔗 Settled on Arc</span>
        </div>
      </div>

      {error && <p className="text-red-400 text-center text-sm mb-4">{error}</p>}
      {status && <p className="text-blue-400 text-center text-sm mb-4 animate-pulse">{status}</p>}

      <div className="flex justify-center">
        <button
          onClick={joinPool}
          disabled={joining || selectedPool === null || !wallet}
          className="px-12 py-4 rounded-xl font-bold text-lg transition-all
            bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500
            disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-blue-900/50"
        >
          {joining ? status || 'Processing...' : 'Enter Pool & Play'}
        </button>
      </div>
    </div>
  )
}