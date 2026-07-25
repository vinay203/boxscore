import { History } from 'lucide-react'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { PageTransition } from './ui/PageTransition'
import { useMatchStore } from '../store/matchStore'

export function HomeScreen() {
  const { startNewMatch, matchHistory, showResumePrompt, resumeMatch, dismissResumePrompt, setScreen } = useMatchStore()
  const lastMatch = matchHistory[0]

  return (
    <PageTransition className="home-screen justify-between">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <div className="brand-mark" aria-hidden="true">🏏</div>
        <h1 className="home-title mt-4">BoxScore</h1>
        <p style={{ color: '#999', fontSize: '15px' }}>Score smarter, play harder</p>
      </div>

      <div className="home-actions flex flex-col gap-3 pb-2">
        {showResumePrompt && (
          <Card className="mb-2">
            <p className="text-sm font-medium mb-3" style={{ color: '#111' }}>You have a match in progress</p>
            <div className="flex gap-2">
              <Button fullWidth onClick={resumeMatch}>Resume</Button>
              <Button fullWidth variant="secondary" onClick={dismissResumePrompt}>Dismiss</Button>
            </div>
          </Card>
        )}
        <Button fullWidth onClick={startNewMatch}>New Match</Button>
        <Button fullWidth variant="secondary" onClick={() => setScreen('history')} className="flex items-center justify-center gap-2">
          <History size={16} /> Match History
        </Button>
        {lastMatch && (
          <Card className="mt-3 text-left">
            <p className="section-label mb-1">Last Match</p>
            <p className="font-semibold text-sm" style={{ color: '#111' }}>{lastMatch.resultText}</p>
            <p className="text-xs mt-1" style={{ color: '#999' }}>{lastMatch.team1Name} {lastMatch.team1Score} vs {lastMatch.team2Name} {lastMatch.team2Score}</p>
          </Card>
        )}
        <p className="version">BoxScore v1.0</p>
      </div>
    </PageTransition>
  )
}
