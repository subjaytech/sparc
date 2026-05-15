import { useState } from 'react'

export default function Header({ wallet, setWallet }) {
  const [connecting, setConnecting] = useState(false)

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask not found. Please install it.')
      return
    }
    setConnecting(true)
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })

      // Switch to Arc Testnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x4CEF52' }],
        })
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x4CEF52',
              chainName: 'Arc Testnet',
              nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
              rpcUrls: ['https://rpc.testnet.arc.network'],
              blockExplorerUrls: ['https://testnet.arcscan.app'],
            }],
          })
        }
      }

      setWallet(accounts[0])
    } catch (err) {
      console.error(err)
    }
    setConnecting(false)
  }

  const short = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-blue-900/30 bg-black/40 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-black tracking-widest bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          SPARC
        </span>
        <span className="text-xs text-blue-400/50 font-mono hidden sm:block">
          Competitive Onchain Puzzle — Arc Testnet
        </span>
      </div>

      <button
        onClick={connectWallet}
        disabled={connecting}
        className="px-5 py-2 rounded-lg text-sm font-semibold transition-all
          bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500
          disabled:opacity-50 shadow-lg shadow-blue-900/40"
      >
        {connecting ? 'Connecting...' : wallet ? `✓ ${short(wallet)}` : 'Connect Wallet'}
      </button>
    </header>
  )
}