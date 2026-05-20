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

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer   = await provider.getSigner()
      const sparc    = new ethers.Contract(SPARC_ADDRESS, SPARC_ABI, signer)

      // Already joined — go straight to game
      const alreadyJoined = await sparc.hasJoined(selectedPool, wallet)
      if (alreadyJoined) {
        setGameActive(true)
        return
      }

      const pool = POOLS[selectedPool]
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer)

      setStatus('Approving USDC...')
      const approveTx = await usdc.approve(SPARC_ADDRESS, pool.entryWei)
      await approveTx.wait()

      setStatus('Joining pool...')
      const joinTx = await sparc.joinPool(selectedPool)
      await joinTx.wait()

      setStatus('Joined! Starting puzzle...')
      setTimeout(() => setGameActive(true), 800)

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
        <h1 className="text-4xl font-black mb-3 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          Choose Your Pool
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
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
                ? `${pool.border} bg-blue-50 dark:bg-white/10 scale-105 shadow-xl`
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg'
              }`}
          >
            <p className={`text-xs font-bold uppercase tracking-widest bg-gradient-to-r ${pool.color} bg-clip-text text-transparent mb-3`}>
              {pool.label}
            </p>
            <p className="text-3xl font-black text-slate-900 dark:text-white">{pool.entryFee}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">entry fee</p>

            <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <div>🥇 1st — 50%</div>
              <div>🥈 2nd — 30%</div>
              <div>🥉 3rd — 19.7%</div>
            </div>

            {selectedPool === pool.id && (
              <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-blue-500 shadow-md shadow-blue-500/50" />
            )}
          </div>
        ))}
      </div>

      {/* Info bar */}
      <div className="flex justify-center mb-8">
        <div className="flex flex-wrap justify-center gap-6 text-xs text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-white/10 rounded-xl px-8 py-4 bg-white dark:bg-white/5">
          <span>⏱ 6-hour rounds</span>
          <span>🏆 Top 3 win</span>
          <span>💰 0.3% platform fee</span>
          <span>🔗 Settled on Arc</span>
          <span>💵 USDC prizes</span>
        </div>
      </div>

      {error && <p className="text-red-500 text-center text-sm mb-4">{error}</p>}
      {status && <p className="text-blue-500 text-center text-sm mb-4 animate-pulse">{status}</p>}

      <div className="flex justify-center">
        <button
          onClick={joinPool}
          disabled={joining || selectedPool === null || !wallet}
          className="px-12 py-4 rounded-xl font-bold text-lg text-white transition-all
            bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500
            disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-blue-600/20"
        >
          {joining ? status || 'Processing...' : 'Enter Pool & Play'}
        </button>
      </div>
    </div>
  )
}