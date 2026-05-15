import { useState } from 'react'
import Header from './components/Header'
import PoolSelector from './components/PoolSelector'
import PuzzleGame from './components/PuzzleGame'

function App() {
  const [wallet, setWallet] = useState(null)
  const [selectedPool, setSelectedPool] = useState(null)
  const [gameActive, setGameActive] = useState(false)

  return (
    <div className="min-h-screen">
      <Header wallet={wallet} setWallet={setWallet} />
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