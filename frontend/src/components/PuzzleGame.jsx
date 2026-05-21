import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import { SPARC_ADDRESS, SPARC_ABI, POOLS } from '../utils/contract'

const GRID   = 4
const PIECES = 16

function seededShuffle(count, hexSeed) {
  const seed = parseInt(hexSeed.slice(0, 8), 16)
  let s = seed | 0
  const rand = () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const arr = Array.from({ length: count }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function randomShuffle() {
  const arr = Array.from({ length: PIECES }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function isSolved(tiles) {
  return tiles.every((t, i) => t === i)
}

function getFixedSessionTimeLeft() {
  const now = new Date()
  const totalSeconds = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()
  const slots = [6 * 3600, 12 * 3600, 18 * 3600, 24 * 3600]
  const nextSlot = slots.find(s => totalSeconds < s) || 24 * 3600
  return nextSlot - totalSeconds
}

function getCurrentSlotLabel() {
  const h = new Date().getUTCHours()
  if (h < 6)  return 'Session 1 · 00:00 – 05:59 UTC'
  if (h < 12) return 'Session 2 · 06:00 – 11:59 UTC'
  if (h < 18) return 'Session 3 · 12:00 – 17:59 UTC'
  return 'Session 4 · 18:00 – 23:59 UTC'
}

function fmt(s) {
  const h   = Math.floor(s / 3600).toString().padStart(2, '0')
  const m   = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${h}:${m}:${sec}`
}

function fmtMs(cs) {
  const h = Math.floor(cs / 360000).toString().padStart(2, '0')
  const m = Math.floor((cs % 360000) / 6000).toString().padStart(2, '0')
  const s = Math.floor((cs % 6000) / 100).toString().padStart(2, '0')
  const c = (cs % 100).toString().padStart(2, '0')
  return `${h}:${m}:${s}.${c}`
}

function short(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function PuzzleGame({ wallet, selectedPool, setGameActive }) {
  const [tiles, setTiles]                   = useState(randomShuffle)
  const [selected, setSelected]             = useState(null)
  const [solved, setSolved]                 = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const [submitted, setSubmitted]           = useState(false)
  const [alreadyCompleted, setAlreadyCompleted] = useState(false)
  const [error, setError]                   = useState('')
  const [sessionError, setSessionError]     = useState('')
  const [sessionTimeLeft, setSessionTimeLeft] = useState(getFixedSessionTimeLeft())
  const [leaderboard, setLeaderboard]       = useState([])
  const [roundStart, setRoundStart]         = useState(0)
  const [image, setImage]                   = useState(null)
  const [imageReady, setImageReady]         = useState(false)
  const [loading, setLoading]               = useState(true)
  const [personalTime, setPersonalTime]     = useState(0)
  const [myFinalTime, setMyFinalTime]       = useState(null) // exact seconds after submit

  const personalTimerRef = useRef(null)
  const sessionRef       = useRef(null)
  const pool             = POOLS[selectedPool]

  // Personal timer
  useEffect(() => {
    personalTimerRef.current = setInterval(() => setPersonalTime(t => t + 1), 10)
    return () => clearInterval(personalTimerRef.current)
  }, [])

  useEffect(() => {
    if (solved) clearInterval(personalTimerRef.current)
  }, [solved])

  // Session countdown
  useEffect(() => {
    const interval = setInterval(() => setSessionTimeLeft(getFixedSessionTimeLeft()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Load game session from backend
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      setSessionError('')
      setError('')

      try {
        if (!window.ethereum) throw new Error('MetaMask not detected')
        if (!wallet) throw new Error('Connect your wallet first')

        const provider = new ethers.BrowserProvider(window.ethereum)
        const sparc    = new ethers.Contract(SPARC_ADDRESS, SPARC_ABI, provider)
        const info     = await sparc.getPoolInfo(selectedPool)
        const endTime  = Number(info[2])
        const duration = Number(await sparc.roundDuration())

        setRoundStart(endTime - duration)

        const completed = await sparc.hasCompleted(selectedPool, wallet)
        if (completed) { setAlreadyCompleted(true); setLoading(false); return }

        const res = await fetch('/api/start-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player: wallet, poolId: selectedPool })
        })

        const data = await res.json()

        if (!res.ok) {
          setSessionError(data.error || 'Failed to load session')
          const fallback = Math.floor(Date.now() / 21600000)
          setImage(`https://picsum.photos/seed/${fallback}/1200/675`)
          setTiles(randomShuffle())
          setLoading(false)
          return
        }

        sessionRef.current = data
        setImage(`https://picsum.photos/seed/${data.imageSession}/1200/675`)
        setTiles(seededShuffle(PIECES, data.shuffleSeed))

      } catch (err) {
        console.error(err)
        setSessionError(err.message || 'Failed to load game session')
        const fallback = Math.floor(Date.now() / 21600000)
        setImage(`https://picsum.photos/seed/${fallback}/1200/675`)
        setTiles(randomShuffle())
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [selectedPool, wallet])

  const fetchLeaderboard = useCallback(async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const sparc    = new ethers.Contract(SPARC_ADDRESS, SPARC_ABI, provider)
      const [players, times] = await sparc.getTopThree(selectedPool)
      const entries = players
        .map((p, i) => ({ player: p, time: Number(times[i]) }))
        .filter(e => e.player !== '0x0000000000000000000000000000000000000000')
      setLeaderboard(entries)
    } catch (err) { console.error(err) }
  }, [selectedPool])

  useEffect(() => {
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 15000)
    return () => clearInterval(interval)
  }, [fetchLeaderboard])

  const handleTileClick = (index) => {
    if (solved || submitted) return
    if (selected === null) { setSelected(index); return }
    if (selected !== index) {
      const newTiles = [...tiles]
      ;[newTiles[selected], newTiles[index]] = [newTiles[index], newTiles[selected]]
      setTiles(newTiles)
      if (isSolved(newTiles)) setSolved(true)
    }
    setSelected(null)
  }

  const submitCompletion = async () => {
    if (!wallet) { setError('Wallet not connected'); return }

    if (!sessionRef.current) {
      setError(sessionError || 'Session not loaded. Please refresh.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const { shuffleSeed, roundId, sessionToken, startedAt } = sessionRef.current

      const signRes = await fetch('/api/sign-completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player: wallet,
          poolId: selectedPool,
          roundId,
          shuffleSeed,
          sessionToken,
          startedAt,
          tiles
        })
      })

      const signData = await signRes.json()
      if (!signRes.ok) throw new Error(signData.error || 'Signing failed')

      const { expiry, signature, solvingSeconds } = signData

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer   = await provider.getSigner()
      const sparc    = new ethers.Contract(SPARC_ADDRESS, SPARC_ABI, signer)
      const tx       = await sparc.submitCompletion(selectedPool, expiry, signature)
      await tx.wait()

      setMyFinalTime(solvingSeconds)
      setSubmitted(true)
      setTimeout(fetchLeaderboard, 3000)

    } catch (err) {
      console.error(err)
      setError(err.reason || err.shortMessage || err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Already completed screen
  if (alreadyCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-slate-50 dark:bg-[#050816]">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-8 text-center shadow-2xl">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-black text-green-500 mb-2">Already Completed</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
            You already submitted for the <span className="font-bold">{pool.label}</span> pool this session. Payouts distributed at session end.
          </p>

          {leaderboard.length > 0 && (
            <div className="mb-6 space-y-2 text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Current Standings</p>
              {leaderboard.map((entry, i) => {
                const duration = roundStart > 0 ? entry.time - roundStart : 0
                const isMe = entry.player.toLowerCase() === wallet?.toLowerCase()
                return (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-2xl border
                    ${isMe ? 'border-blue-500/30 bg-blue-500/10' : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{['🥇','🥈','🥉'][i]}</span>
                      <div>
                        <p className="font-mono text-sm font-semibold">{isMe ? 'You' : short(entry.player)}</p>
                        <p className="font-mono text-xs text-slate-400">{entry.player}</p>
                      </div>
                    </div>
                    <span className="font-mono text-sm text-green-500 font-bold">{fmt(duration)}</span>
                  </div>
                )
              })}
            </div>
          )}

          <button onClick={() => setGameActive(false)}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold hover:opacity-90 transition">
            Back to Pools
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050816] text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-5 py-8">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setGameActive(false)}
            className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition font-semibold">
            ← Back
          </button>
          <div className={`px-4 py-2 rounded-xl border-2 text-sm font-bold ${pool.border}`}>
            {pool.label} · {pool.entryFee}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{getCurrentSlotLabel()}</p>
            <p className={`font-mono text-2xl font-black ${sessionTimeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-blue-500'}`}>
              {fmt(sessionTimeLeft)}
            </p>
            <p className="text-xs text-slate-400 mt-1">session ends in</p>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Your Time</p>
            <p className={`font-mono text-2xl font-black ${solved ? 'text-green-500' : 'text-slate-900 dark:text-white'}`}>
              {fmtMs(personalTime)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{solved ? 'puzzle solved!' : 'solving...'}</p>
          </div>
        </div>

        {/* Session error — shown clearly but game still visible */}
        {sessionError && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm font-semibold">
            ⚠️ {sessionError}
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-semibold">
            ❌ {error}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">

          {/* Puzzle */}
          <div className="lg:col-span-2">

            {/* Reference image */}
            <div className="mb-3 rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 aspect-video bg-slate-100 dark:bg-white/5">
              {loading || !image ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : (
                <img src={image} alt="Reconstruct this"
                  className={`w-full h-full object-cover transition-opacity duration-500 ${imageReady ? 'opacity-75' : 'opacity-0'}`}
                  onLoad={() => setImageReady(true)} />
              )}
            </div>

            {/* Puzzle grid */}
            <div className="grid gap-0.5 rounded-3xl overflow-hidden border-2 border-slate-200 dark:border-white/10 aspect-video"
              style={{ gridTemplateColumns: `repeat(${GRID}, 1fr)` }}>
              {loading || !image || !imageReady ? (
                <div className="flex items-center justify-center col-span-4 aspect-video bg-slate-100 dark:bg-white/5">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : (
                tiles.map((tileIndex, position) => {
                  const row = Math.floor(tileIndex / GRID)
                  const col = tileIndex % GRID
                  const bgX = (col / (GRID - 1)) * 100
                  const bgY = (row / (GRID - 1)) * 100
                  const isSelected = selected === position
                  const isCorrect  = tileIndex === position
                  return (
                    <div key={position}
                      onClick={() => handleTileClick(position)}
                      className={`cursor-pointer transition-all duration-150
                        ${isSelected ? 'ring-4 ring-blue-500 opacity-70' : ''}
                        ${isCorrect && !isSelected ? 'ring-2 ring-green-500/50' : ''}
                        hover:opacity-85`}
                      style={{
                        backgroundImage: `url(${image})`,
                        backgroundSize: `${GRID * 100}% ${GRID * 100}%`,
                        backgroundPosition: `${bgX}% ${bgY}%`
                      }}
                    />
                  )
                })
              )}
            </div>

            {/* Solved — submit */}
            {solved && !submitted && (
              <div className="mt-6 p-6 rounded-3xl border border-green-500/20 bg-green-500/10 text-center">
                <div className="text-4xl mb-2">🎉</div>
                <p className="text-xl font-black text-green-500 mb-1">Puzzle Solved!</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
                  Your time: <span className="font-mono font-black text-green-500">{fmtMs(personalTime)}</span>
                </p>
                {sessionError ? (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm">
                    ⚠️ Cannot submit: {sessionError}
                  </div>
                ) : (
                  <button onClick={submitCompletion} disabled={submitting}
                    className="px-10 py-3 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 text-white font-black hover:opacity-90 transition disabled:opacity-50">
                    {submitting ? 'Submitting onchain...' : 'Submit Completion'}
                  </button>
                )}
              </div>
            )}

            {/* Submitted */}
            {submitted && (
              <div className="mt-6 p-6 rounded-3xl border border-blue-500/20 bg-blue-500/10 text-center">
                <div className="text-4xl mb-2">🚀</div>
                <p className="text-xl font-black text-blue-500 mb-1">Submitted Onchain!</p>
                {myFinalTime !== null && (
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    Verified solving time: <span className="font-mono font-black text-green-500">{fmt(myFinalTime)}</span>
                  </p>
                )}
                <p className="text-slate-400 text-xs mt-2">Payouts distributed at session end.</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5">

            {/* Leaderboard */}
            <div className="p-5 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
              <h3 className="font-black text-lg mb-1">Live Leaderboard</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                Time shown = seconds from round start to submission (on-chain, verifiable)
              </p>

              {leaderboard.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-slate-200 dark:border-white/10 rounded-2xl text-slate-400 text-sm">
                  No completions yet — be first!
                </div>
              ) : (
                <div className="space-y-3">
                  {leaderboard.map((entry, i) => {
                    const duration = roundStart > 0 ? entry.time - roundStart : 0
                    const isMe = entry.player.toLowerCase() === wallet?.toLowerCase()
                    return (
                      <div key={i} className={`p-4 rounded-2xl border
                        ${isMe ? 'border-blue-500/30 bg-blue-500/10' : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{['🥇','🥈','🥉'][i]}</span>
                            <span className="font-bold text-sm">{isMe ? 'You' : `Rank #${i + 1}`}</span>
                          </div>
                          <span className="font-mono font-black text-green-500 text-sm">{fmt(duration)}</span>
                        </div>
                        {/* Full wallet address for transparency */}
                        <p className="font-mono text-xs text-slate-400 dark:text-slate-500 break-all">
                          {entry.player}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Prize split */}
            <div className="p-5 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
              <h3 className="font-black text-lg mb-4">Prize Distribution</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span>🥇 1st place</span><span className="font-black text-yellow-500">50%</span></div>
                <div className="flex justify-between"><span>🥈 2nd place</span><span className="font-black text-slate-400">30%</span></div>
                <div className="flex justify-between"><span>🥉 3rd place</span><span className="font-black text-amber-600">19.7%</span></div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-white/10 text-xs text-slate-400">
                  <span>Platform fee</span><span>0.3%</span>
                </div>
              </div>
            </div>

            {/* Payout rules */}
            <div className="p-5 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5">
              <h3 className="font-black text-lg mb-4">Payout Rules</h3>
              <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                <p>🏆 3 finishers → 50 / 30 / 19.7%</p>
                <p>🥈 2 finishers → 65 / 34.7%</p>
                <p>🥇 1 finisher → 99.7% of pot</p>
                <p>💸 0 finishers → full refunds claimable</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}