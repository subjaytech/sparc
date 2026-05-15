import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import { SPARC_ADDRESS, SPARC_ABI, POOLS } from '../utils/contract'

const GRID = 4 // 4x4 puzzle
const PIECES = GRID * GRID

// Sample puzzle images (Unsplash — free to use)
const PUZZLE_IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
  'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=80',
  'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=600&q=80',
]

function createPuzzle() {
  const arr = Array.from({ length: PIECES }, (_, i) => i)
  // Shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function isSolved(tiles) {
  return tiles.every((t, i) => t === i)
}

export default function PuzzleGame({ wallet, selectedPool, setGameActive }) {
  const [tiles, setTiles] = useState(createPuzzle)
  const [selected, setSelected] = useState(null)
  const [solved, setSolved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(6 * 60 * 60) // 6 hours in seconds
  const [leaderboard, setLeaderboard] = useState([])

  const pool = POOLS[selectedPool]
  const image = PUZZLE_IMAGES[selectedPool % PUZZLE_IMAGES.length]

  // Countdown timer
  useEffect(() => {
    if (solved || submitted) return
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(interval); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [solved, submitted])

  // Format time
  const formatTime = (s) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0')
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${h}:${m}:${sec}`
  }

  // Swap tiles on click
  const handleTileClick = (index) => {
    if (solved || submitted) return
    if (selected === null) {
      setSelected(index)
    } else {
      if (selected !== index) {
        const newTiles = [...tiles]
        ;[newTiles[selected], newTiles[index]] = [newTiles[index], newTiles[selected]]
        setTiles(newTiles)
        if (isSolved(newTiles)) setSolved(true)
      }
      setSelected(null)
    }
  }

  // Submit completion to contract
  const submitCompletion = async () => {
    if (!wallet) { setError('Wallet not connected'); return }
    setSubmitting(true)
    setError('')
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const sparc = new ethers.Contract(SPARC_ADDRESS, SPARC_ABI, signer)
      const tx = await sparc.submitCompletion(selectedPool)
      await tx.wait()
      setSubmitted(true)
    } catch (err) {
      setError(err.reason || err.message || 'Submission failed')
    }
    setSubmitting(false)
  }

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const sparc = new ethers.Contract(SPARC_ADDRESS, SPARC_ABI, provider)
      const [players, times] = await sparc.getTopThree(selectedPool)
      const entries = players
        .map((p, i) => ({ player: p, time: Number(times[i]) }))
        .filter(e => e.player !== '0x0000000000000000000000000000000000000000')
      setLeaderboard(entries)
    } catch (err) {
      console.error(err)
    }
  }, [selectedPool])

  useEffect(() => {
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 30000)
    return () => clearInterval(interval)
  }, [fetchLeaderboard])

  const short = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => setGameActive(false)}
          className="text-blue-400/60 hover:text-blue-400 text-sm transition-colors"
        >
          ← Back to Pools
        </button>
        <div className="flex items-center gap-4">
          <span className={`px-3 py-1 rounded-lg text-xs font-bold border bg-gradient-to-r ${pool.color} bg-clip-text text-transparent ${pool.border}`}>
            {pool.label} Pool · {pool.entryFee}
          </span>
          <div className={`font-mono font-bold text-xl ${timeLeft < 300 ? 'text-red-400 animate-pulse' : 'text-blue-300'}`}>
            ⏱ {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Puzzle Grid */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-blue-300/50 text-sm">
              {solved ? '✅ Puzzle solved!' : 'Click a tile, then click where to move it'}
            </p>
            <button
              onClick={() => { setTiles(createPuzzle()); setSolved(false); setSelected(null) }}
              className="text-xs text-blue-400/40 hover:text-blue-400 transition-colors"
            >
              Shuffle
            </button>
          </div>

          {/* Reference image */}
          <div className="mb-3 rounded-xl overflow-hidden border border-blue-900/30 h-32 w-full">
            <img src={image} alt="Reference" className="w-full h-full object-cover opacity-60" />
          </div>

          {/* Puzzle tiles */}
          <div
            className="grid gap-1 rounded-xl overflow-hidden border-2 border-blue-900/40"
            style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}
          >
            {tiles.map((tileIndex, position) => {
              const row = Math.floor(tileIndex / GRID)
              const col = tileIndex % GRID
              const isSelected = selected === position
              const isCorrect = tileIndex === position

              return (
                <div
                  key={position}
                  onClick={() => handleTileClick(position)}
                  className={`relative cursor-pointer aspect-square overflow-hidden transition-all duration-150
                    ${isSelected ? 'ring-2 ring-blue-400 ring-inset scale-95' : ''}
                    ${isCorrect && !isSelected ? 'brightness-110' : ''}
                    hover:brightness-110`}
                >
                  <img
                    src={image}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    style={{
                      objectPosition: `${(col / (GRID - 1)) * 100}% ${(row / (GRID - 1)) * 100}%`,
                      transform: `scale(${GRID})`,
                      transformOrigin: `${(col / (GRID - 1)) * 100}% ${(row / (GRID - 1)) * 100}%`
                    }}
                  />
                  {isCorrect && (
                    <div className="absolute inset-0 border border-green-500/30 pointer-events-none" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Submit button */}
          {solved && !submitted && (
            <div className="mt-6 text-center">
              <p className="text-green-400 font-bold mb-3">🎉 You solved it! Submit to claim your rank.</p>
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <button
                onClick={submitCompletion}
                disabled={submitting}
                className="px-10 py-3 rounded-xl font-bold bg-gradient-to-r from-green-600 to-emerald-500
                  hover:from-green-500 hover:to-emerald-400 disabled:opacity-50 shadow-lg shadow-green-900/40 transition-all"
              >
                {submitting ? 'Submitting...' : 'Submit Completion'}
              </button>
            </div>
          )}

          {submitted && (
            <div className="mt-6 text-center p-4 rounded-xl bg-green-900/20 border border-green-700/30">
              <p className="text-green-400 font-bold">✅ Completion submitted onchain!</p>
              <p className="text-blue-300/50 text-sm mt-1">The round finalizes after 6 hours. Check back for results.</p>
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-blue-400/60 mb-4">
            Live Leaderboard
          </h3>
          <div className="space-y-3">
            {leaderboard.length === 0 ? (
              <p className="text-blue-400/30 text-sm">No completions yet — be first!</p>
            ) : (
              leaderboard.map((entry, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 border border-blue-900/20">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{['🥇', '🥈', '🥉'][i]}</span>
                    <span className="text-sm font-mono text-blue-300">{short(entry.player)}</span>
                  </div>
                  <span className="text-xs text-blue-400/40">
                    {new Date(entry.time * 1000).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Pool stats */}
          <div className="mt-8 p-4 rounded-xl bg-white/5 border border-blue-900/20">
            <h4 className="text-xs font-bold uppercase tracking-widest text-blue-400/50 mb-3">Prize Split</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-yellow-400"><span>🥇 1st place</span><span>50%</span></div>
              <div className="flex justify-between text-slate-300"><span>🥈 2nd place</span><span>30%</span></div>
              <div className="flex justify-between text-amber-600"><span>🥉 3rd place</span><span>19.7%</span></div>
              <div className="flex justify-between text-blue-400/40 text-xs pt-2 border-t border-blue-900/20">
                <span>Platform fee</span><span>0.3%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}