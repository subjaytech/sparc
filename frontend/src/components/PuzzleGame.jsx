import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import { SPARC_ADDRESS, SPARC_ABI, POOLS } from '../utils/contract'

const GRID = 4
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

  const totalSeconds =
    now.getUTCHours() * 3600 +
    now.getUTCMinutes() * 60 +
    now.getUTCSeconds()

  const slots = [6 * 3600, 12 * 3600, 18 * 3600, 24 * 3600]

  const nextSlot =
    slots.find((s) => totalSeconds < s) || 24 * 3600

  return nextSlot - totalSeconds
}

function getCurrentSlotLabel() {
  const h = new Date().getUTCHours()

  if (h < 6) return 'Session 1 · 00:00 - 05:59 UTC'
  if (h < 12) return 'Session 2 · 06:00 - 11:59 UTC'
  if (h < 18) return 'Session 3 · 12:00 - 17:59 UTC'

  return 'Session 4 · 18:00 - 23:59 UTC'
}

export default function PuzzleGame({
  wallet,
  selectedPool,
  setGameActive,
}) {
  const [tiles, setTiles] = useState(randomShuffle)
  const [selected, setSelected] = useState(null)
  const [solved, setSolved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [alreadyCompleted, setAlreadyCompleted] = useState(false)
  const [error, setError] = useState('')
  const [sessionTimeLeft, setSessionTimeLeft] = useState(
    getFixedSessionTimeLeft()
  )
  const [leaderboard, setLeaderboard] = useState([])
  const [roundStart, setRoundStart] = useState(0)
  const [image, setImage] = useState(null)
  const [imageReady, setImageReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [personalTime, setPersonalTime] = useState(0)

  const personalTimerRef = useRef(null)
  const sessionRef = useRef(null)

  const pool = POOLS[selectedPool]

  useEffect(() => {
    personalTimerRef.current = setInterval(() => {
      setPersonalTime((t) => t + 1)
    }, 10)

    return () => clearInterval(personalTimerRef.current)
  }, [])

  useEffect(() => {
    if (solved) {
      clearInterval(personalTimerRef.current)
    }
  }, [solved])

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionTimeLeft(getFixedSessionTimeLeft())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      setError('')

      try {
        if (!window.ethereum) {
          throw new Error('MetaMask not detected')
        }

        const provider = new ethers.BrowserProvider(window.ethereum)

        const sparc = new ethers.Contract(
          SPARC_ADDRESS,
          SPARC_ABI,
          provider
        )

        const info = await sparc.getPoolInfo(selectedPool)

        const endTime = Number(info[2])

        const duration = Number(await sparc.roundDuration())

        setRoundStart(endTime - duration)

        if (wallet) {
          const completed = await sparc.hasCompleted(
            selectedPool,
            wallet
          )

          if (completed) {
            setAlreadyCompleted(true)
            setLoading(false)
            return
          }
        }

        const sessionRes = await fetch('/api/start-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            player: wallet,
            poolId: selectedPool,
          }),
        })

        if (!sessionRes.ok) {
          const err = await sessionRes.json()
          throw new Error(err.error || 'Failed to start session')
        }

        const session = await sessionRes.json()

        sessionRef.current = session

        setImage(
          `https://picsum.photos/seed/${session.imageSession}/1200/675`
        )

        setTiles(
          seededShuffle(PIECES, session.shuffleSeed)
        )
      } catch (err) {
        console.error(err)

        setError(
          err.message || 'Failed to load game session'
        )

        const fallback = Math.floor(Date.now() / 21600000)

        setImage(
          `https://picsum.photos/seed/${fallback}/1200/675`
        )

        setTiles(randomShuffle())
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [selectedPool, wallet])

  const formatSessionTime = (s) => {
    const h = Math.floor(s / 3600)
      .toString()
      .padStart(2, '0')

    const m = Math.floor((s % 3600) / 60)
      .toString()
      .padStart(2, '0')

    const sec = (s % 60)
      .toString()
      .padStart(2, '0')

    return `${h}:${m}:${sec}`
  }

  const formatPersonalTime = (cs) => {
    const h = Math.floor(cs / 360000)
      .toString()
      .padStart(2, '0')

    const m = Math.floor((cs % 360000) / 6000)
      .toString()
      .padStart(2, '0')

    const s = Math.floor((cs % 6000) / 100)
      .toString()
      .padStart(2, '0')

    const c = (cs % 100)
      .toString()
      .padStart(2, '0')

    return `${h}:${m}:${s}.${c}`
  }

  const formatLeaderboardTime = (seconds) => {
    if (seconds <= 0) return '--:--:--'

    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, '0')

    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, '0')

    const s = (seconds % 60)
      .toString()
      .padStart(2, '0')

    return `${h}:${m}:${s}`
  }

  const handleTileClick = (index) => {
    if (solved || submitted) return

    if (selected === null) {
      setSelected(index)
      return
    }

    if (selected !== index) {
      const newTiles = [...tiles]

      ;[newTiles[selected], newTiles[index]] = [
        newTiles[index],
        newTiles[selected],
      ]

      setTiles(newTiles)

      if (isSolved(newTiles)) {
        setSolved(true)
      }
    }

    setSelected(null)
  }

  const submitCompletion = async () => {
    if (!wallet) {
      setError('Wallet not connected')
      return
    }

    if (!sessionRef.current) {
      setError('Session not loaded')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const {
        shuffleSeed,
        roundId,
        sessionToken,
      } = sessionRef.current

      const signRes = await fetch(
        '/api/sign-completion',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            player: wallet,
            poolId: selectedPool,
            roundId,
            shuffleSeed,
            sessionToken,
            tiles,
          }),
        }
      )

      if (!signRes.ok) {
        const err = await signRes.json()

        throw new Error(
          err.error || 'Backend signing failed'
        )
      }

      const { expiry, signature } =
        await signRes.json()

      const provider = new ethers.BrowserProvider(
        window.ethereum
      )

      const signer = await provider.getSigner()

      const sparc = new ethers.Contract(
        SPARC_ADDRESS,
        SPARC_ABI,
        signer
      )

      const tx = await sparc.submitCompletion(
        selectedPool,
        expiry,
        signature
      )

      await tx.wait()

      setSubmitted(true)

      fetchLeaderboard()
    } catch (err) {
      console.error(err)

      setError(
        err.reason ||
          err.shortMessage ||
          err.message ||
          'Submission failed'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const fetchLeaderboard = useCallback(async () => {
    try {
      const provider = new ethers.BrowserProvider(
        window.ethereum
      )

      const sparc = new ethers.Contract(
        SPARC_ADDRESS,
        SPARC_ABI,
        provider
      )

      const [players, times] =
        await sparc.getTopThree(selectedPool)

      const entries = players
        .map((p, i) => ({
          player: p,
          time: Number(times[i]),
        }))
        .filter(
          (e) =>
            e.player !==
            '0x0000000000000000000000000000000000000000'
        )

      setLeaderboard(entries)
    } catch (err) {
      console.error(err)
    }
  }, [selectedPool])

  useEffect(() => {
    fetchLeaderboard()

    const interval = setInterval(
      fetchLeaderboard,
      30000
    )

    return () => clearInterval(interval)
  }, [fetchLeaderboard])

  const short = (addr) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <div className="min-h-screen bg-white dark:bg-[#050816] text-black dark:text-white transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-5 py-8">

        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setGameActive(false)}
            className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:scale-105 transition"
          >
            ← Back
          </button>

          <div
            className={`px-4 py-2 rounded-xl border text-sm font-semibold ${pool.border}`}
          >
            {pool.label} · {pool.entryFee}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">

          <div className="lg:col-span-2">

            <div className="mb-4 p-4 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs opacity-60">
                    {getCurrentSlotLabel()}
                  </p>

                  <p className="font-mono text-lg font-bold mt-1">
                    {formatSessionTime(sessionTimeLeft)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs opacity-60">
                    Your Time
                  </p>

                  <p className="font-mono text-2xl font-bold">
                    {formatPersonalTime(personalTime)}
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="mb-4 rounded-3xl overflow-hidden border border-black/10 dark:border-white/10">
              {loading || !image ? (
                <div className="aspect-video flex items-center justify-center">
                  Loading...
                </div>
              ) : (
                <img
                  src={image}
                  alt="Puzzle"
                  onLoad={() => setImageReady(true)}
                  className={`w-full aspect-video object-cover transition-opacity duration-500 ${
                    imageReady ? 'opacity-80' : 'opacity-0'
                  }`}
                />
              )}
            </div>

            <div
              className="grid gap-1 rounded-3xl overflow-hidden border border-black/10 dark:border-white/10"
              style={{
                gridTemplateColumns: `repeat(${GRID}, 1fr)`,
              }}
            >
              {tiles.map((tileIndex, position) => {
                const row = Math.floor(tileIndex / GRID)

                const col = tileIndex % GRID

                const bgX =
                  (col / (GRID - 1)) * 100

                const bgY =
                  (row / (GRID - 1)) * 100

                return (
                  <div
                    key={position}
                    onClick={() =>
                      handleTileClick(position)
                    }
                    className={`aspect-video cursor-pointer transition-all duration-200 hover:scale-[0.98]
                    ${
                      selected === position
                        ? 'ring-4 ring-blue-500'
                        : ''
                    }`}
                    style={{
                      backgroundImage: `url(${image})`,
                      backgroundSize: `${GRID * 100}% ${GRID * 100}%`,
                      backgroundPosition: `${bgX}% ${bgY}%`,
                    }}
                  />
                )
              })}
            </div>

            {solved && !submitted && (
              <div className="mt-6 text-center">
                <button
                  onClick={submitCompletion}
                  disabled={submitting}
                  className="px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition disabled:opacity-50"
                >
                  {submitting
                    ? 'Submitting...'
                    : 'Submit Completion'}
                </button>
              </div>
            )}

            {submitted && (
              <div className="mt-6 p-5 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-400 text-center">
                Completion submitted successfully.
              </div>
            )}
          </div>

          <div>

            <div className="p-5 rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] mb-5">
              <h3 className="font-bold mb-4">
                Live Leaderboard
              </h3>

              <div className="space-y-3">
                {leaderboard.map((entry, i) => {
                  const duration =
                    roundStart > 0
                      ? entry.time - roundStart
                      : 0

                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-2xl bg-black/5 dark:bg-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <span>
                          {['🥇', '🥈', '🥉'][i]}
                        </span>

                        <span className="font-mono text-sm">
                          {entry.player.toLowerCase() ===
                          wallet?.toLowerCase()
                            ? 'You'
                            : short(entry.player)}
                        </span>
                      </div>

                      <span className="font-mono text-sm">
                        {formatLeaderboardTime(
                          duration
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="p-5 rounded-3xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03]">
              <h3 className="font-bold mb-4">
                Prize Split
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>🥇 First</span>
                  <span>50%</span>
                </div>

                <div className="flex justify-between">
                  <span>🥈 Second</span>
                  <span>30%</span>
                </div>

                <div className="flex justify-between">
                  <span>🥉 Third</span>
                  <span>19.7%</span>
                </div>

                <div className="flex justify-between opacity-60 pt-2 border-t border-black/10 dark:border-white/10">
                  <span>Platform Fee</span>
                  <span>0.3%</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}