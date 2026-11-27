import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import { HomeScreen } from './components/HomeScreen'
import { MatchSetupScreen } from './components/MatchSetupScreen'
import { LiveScorerScreen } from './components/LiveScorerScreen'
import { MatchSummaryScreen } from './components/MatchSummaryScreen'
import { MatchHistoryScreen } from './components/MatchHistoryScreen'
import { PlayersScreen } from './components/PlayersScreen'
import { useMatchStore } from './store/matchStore'

function App() {
  const { screen, initApp } = useMatchStore()

  useEffect(() => {
    initApp()
  }, [initApp])

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait">
        {screen === 'home' && <HomeScreen key="home" />}
        {screen === 'history' && <MatchHistoryScreen key="history" />}
        {screen === 'players' && <PlayersScreen key="players" />}
        {screen === 'setup' && <MatchSetupScreen key="setup" />}
        {screen === 'live' && <LiveScorerScreen key="live" />}
        {screen === 'summary' && <MatchSummaryScreen key="summary" />}
      </AnimatePresence>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            borderRadius: '12px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
          },
        }}
      />
    </div>
  )
}

export default App
