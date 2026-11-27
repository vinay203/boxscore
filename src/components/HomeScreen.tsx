import { useState } from 'react'
import { ChevronRight, History, Users } from 'lucide-react'
import { Button } from './ui/Button'
import { BottomSheet } from './ui/BottomSheet'
import { Card } from './ui/Card'
import { PageTransition } from './ui/PageTransition'
import { useMatchStore } from '../store/matchStore'

export function HomeScreen() {
  const {
    startNewMatch,
    matchHistory,
    playerPool,
    showResumePrompt,
    resumeMatch,
    dismissResumePrompt,
    setScreen,
    setSelectedHistoryMatchId,
    discardCurrentMatch,
    hasResumableMatch,
  } = useMatchStore()
  const [inProgressSheetOpen, setInProgressSheetOpen] = useState(false)
  const lastMatch = matchHistory[0]

  const handleOpenLastMatch = () => {
    if (!lastMatch) return
    setSelectedHistoryMatchId(lastMatch.id)
    setScreen('history')
  }

  const handleNewMatchClick = () => {
    if (hasResumableMatch()) {
      setInProgressSheetOpen(true)
    } else {
      startNewMatch()
    }
  }

  const handleResume = () => {
    setInProgressSheetOpen(false)
    resumeMatch()
  }

  const handleDiscardAndStartNew = () => {
    setInProgressSheetOpen(false)
    discardCurrentMatch()
    startNewMatch()
  }

  return (
    <>
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
          <Button fullWidth onClick={handleNewMatchClick}>New Match</Button>
          <Button fullWidth variant="secondary" onClick={() => { setSelectedHistoryMatchId(null); setScreen('history') }} className="flex items-center justify-center gap-2">
            <History size={16} /> Match History
          </Button>
          <Button fullWidth variant="secondary" onClick={() => setScreen('players')} className="flex items-center justify-center gap-2">
            <Users size={16} /> Players ({playerPool.length})
          </Button>
          {lastMatch && (
            <button
              type="button"
              onClick={handleOpenLastMatch}
              className="w-full text-left p-0 border-0 bg-transparent block btn-press group mt-1"
            >
              <Card className="mt-2 text-left hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="section-label mb-1">Last Match</p>
                    <p className="font-semibold text-sm" style={{ color: '#111' }}>{lastMatch.resultText}</p>
                    <p className="text-xs mt-1" style={{ color: '#999' }}>{lastMatch.team1Name} {lastMatch.team1Score} vs {lastMatch.team2Name} {lastMatch.team2Score}</p>
                  </div>
                  <div className="text-gray-300 group-hover:text-gray-700 transition-colors">
                    <ChevronRight size={18} />
                  </div>
                </div>
              </Card>
            </button>
          )}
          <p className="version">BoxScore v1.0</p>
        </div>
      </PageTransition>

      <BottomSheet
        open={inProgressSheetOpen}
        onClose={() => setInProgressSheetOpen(false)}
        title="A match is in progress"
      >
        <div className="flex flex-col gap-2 pt-2">
          <Button fullWidth onClick={handleResume}>
            Resume
          </Button>
          <Button fullWidth variant="secondary" onClick={handleDiscardAndStartNew}>
            Discard and start new
          </Button>
        </div>
      </BottomSheet>
    </>
  )
}
