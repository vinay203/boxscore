import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { PageTransition } from './ui/PageTransition'
import { StepIndicator } from './ui/StepIndicator'
import { Stepper } from './ui/Stepper'
import { useMatchStore } from '../store/matchStore'

export function MatchSetupScreen() {
  const {
    setupStep,
    setupDraft,
    updateSetupDraft,
    setSetupStep,
    startMatch,
    resetToHome,
  } = useMatchStore()

  const [coinFlipped, setCoinFlipped] = useState(false)
  const [coinResult, setCoinResult] = useState<1 | 2 | null>(null)
  const [flipping, setFlipping] = useState(false)

  const handlePlayersChange = (count: number) => {
    const resize = (arr: string[]) => {
      const next = [...arr]
      while (next.length < count) next.push('')
      return next.slice(0, count)
    }
    updateSetupDraft({
      playersPerTeam: count,
      team1Players: resize(setupDraft.team1Players),
      team2Players: resize(setupDraft.team2Players),
    })
  }

  const flipCoin = () => {
    if (flipping) return
    setFlipping(true)
    setCoinFlipped(false)
    setCoinResult(null)
    setTimeout(() => {
      const winner: 1 | 2 = Math.random() < 0.5 ? 1 : 2
      setCoinResult(winner)
      setCoinFlipped(true)
      setFlipping(false)
      updateSetupDraft({ tossWinnerTeam: winner })
    }, 2000)
  }

  const canProceedStep1 = setupDraft.overs > 0 && setupDraft.wicketLimit > 0
  const canProceedStep2 = setupDraft.team1Name.trim().length > 0
  const canProceedStep3 = setupDraft.team2Name.trim().length > 0
  const canStart =
    setupDraft.tossWinnerTeam !== null &&
    (setupDraft.tossChoice === 'bat' || setupDraft.tossChoice === 'field')

  return (
    <PageTransition>
      <button
        type="button"
        onClick={() => (setupStep === 1 ? resetToHome() : setSetupStep((setupStep - 1) as 1 | 2 | 3))}
        className="back-button mb-4 btn-press"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <StepIndicator current={setupStep} />

      {setupStep === 1 && (
        <Card>
          <h2 className="text-lg font-bold mb-4" style={{ color: '#111' }}>Match Settings</h2>
          <Input
            label="Match title (optional)"
            placeholder="Sunday Box Cricket"
            value={setupDraft.title}
            onChange={(e) => updateSetupDraft({ title: e.target.value })}
          />
          <div className="mt-2">
            <Stepper label="Total overs" value={setupDraft.overs} onChange={(v) => updateSetupDraft({ overs: v })} min={1} max={20} step={1} />
            <Stepper label="Wickets per innings" value={setupDraft.wicketLimit} onChange={(v) => updateSetupDraft({ wicketLimit: v })} min={1} max={10} />
            <Stepper label="Players per team" value={setupDraft.playersPerTeam} onChange={handlePlayersChange} min={3} max={11} />
          </div>
          <Button fullWidth className="mt-6 flex items-center justify-center gap-2" disabled={!canProceedStep1} onClick={() => setSetupStep(2)}>
            Next <ArrowRight size={18} />
          </Button>
        </Card>
      )}

      {setupStep === 2 && (
        <Card>
          <h2 className="text-lg font-bold mb-4" style={{ color: '#111' }}>Team 1 Setup</h2>
          <Input label="Team name" placeholder="Team Alpha" value={setupDraft.team1Name} onChange={(e) => updateSetupDraft({ team1Name: e.target.value })} />
          <div className="mt-4 space-y-2">
            {setupDraft.team1Players.map((player, i) => (
              <Input key={i} placeholder={`Player ${i + 1}`} value={player} onChange={(e) => {
                const next = [...setupDraft.team1Players]; next[i] = e.target.value; updateSetupDraft({ team1Players: next })
              }} />
            ))}
          </div>
          <Button fullWidth className="mt-6 flex items-center justify-center gap-2" disabled={!canProceedStep2} onClick={() => setSetupStep(3)}>
            Next <ArrowRight size={18} />
          </Button>
        </Card>
      )}

      {setupStep === 3 && (
        <>
          <Card className="mb-4">
            <h2 className="text-lg font-bold mb-4" style={{ color: '#111' }}>Team 2 Setup</h2>
            <Input label="Team name" placeholder="Team Beta" value={setupDraft.team2Name} onChange={(e) => updateSetupDraft({ team2Name: e.target.value })} />
            <div className="mt-4 space-y-2">
              {setupDraft.team2Players.map((player, i) => (
                <Input key={i} placeholder={`Player ${i + 1}`} value={player} onChange={(e) => {
                  const next = [...setupDraft.team2Players]; next[i] = e.target.value; updateSetupDraft({ team2Players: next })
                }} />
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-bold mb-4" style={{ color: '#111' }}>Toss</h2>
            <div className="flex flex-col items-center gap-4 py-3">
              <button type="button" onClick={flipCoin} disabled={flipping} className={`coin-button btn-press ${flipping || coinFlipped ? 'coin-flip' : ''}`}>
                <span aria-hidden="true">🪙</span>
              </button>
              <p className="text-sm" style={{ color: '#999' }}>
                {flipping ? 'Flipping...' : coinResult ? `Team ${coinResult} won the toss` : 'Tap to flip coin'}
              </p>
            </div>

            {coinResult && (
              <div className="mt-2">
                <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Who won the toss?</p>
                <div className="flex gap-2 mb-4">
                  <button type="button" onClick={() => updateSetupDraft({ tossWinnerTeam: 1 })} className={`toss-btn ${setupDraft.tossWinnerTeam === 1 ? 'selected' : ''}`}>
                    {setupDraft.team1Name || 'Team 1'}
                  </button>
                  <button type="button" onClick={() => updateSetupDraft({ tossWinnerTeam: 2 })} className={`toss-btn ${setupDraft.tossWinnerTeam === 2 ? 'selected' : ''}`}>
                    {setupDraft.team2Name || 'Team 2'}
                  </button>
                </div>
                <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Elected to</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => updateSetupDraft({ tossChoice: 'bat' })} className={`toss-btn ${setupDraft.tossChoice === 'bat' ? 'selected-fill' : ''}`}>
                    Bat first
                  </button>
                  <button type="button" onClick={() => updateSetupDraft({ tossChoice: 'field' })} className={`toss-btn ${setupDraft.tossChoice === 'field' ? 'selected-fill' : ''}`}>
                    Field first
                  </button>
                </div>
              </div>
            )}

            <Button fullWidth className="mt-6" disabled={!canProceedStep3 || !canStart} onClick={() => startMatch()}>
              Start Match
            </Button>
          </Card>
        </>
      )}
    </PageTransition>
  )
}
