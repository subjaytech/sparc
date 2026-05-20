import { useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

export default function Header({ wallet, setWallet, theme, setTheme }) {
  const [connecting, setConnecting] = useState(false)

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask not found. Please install it.')
      return
    }
    setConnecting(true)
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })

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

  const ThemeBtn = ({ mode, icon, label }) => (
    <button
      onClick={() => setTheme(mode)}
      title={label}
      className={`p-2 rounded-xl border transition-all duration-200
        ${theme === mode
          ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
        }`}
    >
      {icon}
    </button>
  )

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-[#050816]/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black tracking-widest bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            SPARC
          </span>
          <span className="hidden sm:block text-xs text-slate-400 dark:text-slate-500 font-mono">
            Competitive Onchain Puzzle · Arc Testnet
          </span>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">

          {/* Theme toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5">
            <ThemeBtn mode="light"  icon={<Sun size={14} />}     label="Light mode" />
            <ThemeBtn mode="dark"   icon={<Moon size={14} />}    label="Dark mode" />
            <ThemeBtn mode="system" icon={<Monitor size={14} />} label="System default" />
          </div>

          {/* Wallet button */}
          <button
            onClick={connectWallet}
            disabled={connecting}
            className="px-5 py-2 rounded-xl text-sm font-semibold transition-all
              bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500
              text-white disabled:opacity-50 shadow-lg shadow-blue-600/20"
          >
            {connecting ? 'Connecting...' : wallet ? `✓ ${short(wallet)}` : 'Connect Wallet'}
          </button>
        </div>
      </div>
    </header>
  )
}