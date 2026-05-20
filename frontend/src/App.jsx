import { useState, useEffect } from 'react'
import Header from './components/Header'
import PoolSelector from './components/PoolSelector'
import PuzzleGame from './components/PuzzleGame'

function App() {
  const [wallet, setWallet] = useState(null)
  const [selectedPool, setSelectedPool] = useState(null)
  const [gameActive, setGameActive] = useState(false)
  const [theme, setTheme] = useState(
    () => localStorage.getItem('sparc-theme') || 'dark'
  )

  // Apply theme class to <html> element
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      prefersDark ? root.classList.add('dark') : root.classList.remove('dark')
    }
    localStorage.setItem('sparc-theme', theme)
  }, [theme])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050816] text-slate-900 dark:text-white transition-colors duration-300">
      <Header
        wallet={wallet}
        setWallet={setWallet}
        theme={theme}
        setTheme={setTheme}
      />
      {!gameActive ? (
        <PoolSelector
          wallet={wallet}
          selectedPool={selectedPool}
          setSelectedPool={setSelectedPool}
          setGameActive={setGameActive}
        />
      ) : (
        <PuzzleGame
          wallet={wallet}
          selectedPool={selectedPool}
          setGameActive={setGameActive}
        />
      )}
    </div>
  )
}

export default App