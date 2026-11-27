import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { PageTransition } from './ui/PageTransition'
import { StepIndicator } from './ui/StepIndicator'
import { Stepper } from './ui/Stepper'
import { findDuplicateTypedName, useMatchStore } from '../store/matchStore'

export function MatchSetupScreen() {
  const {
    setupStep,
    setupDraft,
    updateSetupDraft,
    setSetupStep,
    startMatch,
    resetToHome,
    savedTeams,
    playerPool,
    applySavedTeamToDraft,
    saveTeamFromDraft,
  } = useMatchStore()

  const [coinFlipped, setCoinFlipped] = useState(false)
  const [coinResult, setCoinResult] = useState<1 | 2 | null>(null)
  const [flipping, setFlipping] = useState(false)
  const [teamSaveError, setTeamSaveError] = useState('')

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
  const duplicateTeam1Name = findDuplicateTypedName(setupDraft.team1Players)
  const duplicateTeam2Name = findDuplicateTypedName(setupDraft.team2Players)
  const canProceedStep2 = setupDraft.team1Name.trim().length > 0 && !duplicateTeam1Name
  const canProceedStep3 = setupDraft.team2Name.trim().length > 0 && !duplicateTeam2Name
  const canStart =
    setupDraft.tossWinnerTeam !== null &&
    (setupDraft.tossChoice === 'bat' || setupDraft.tossChoice === 'field')

  const saveTeam = (teamNo: 1 | 2) => {
    const result = saveTeamFromDraft(teamNo)
    if (result.ok) {
      setTeamSaveError('')
      toast.success(result.updated ? 'Team updated' : 'Team saved')
    } else {
      setTeamSaveError(result.error ?? 'Could not save team')
    }
  }

  const renderPlayerSetup = (teamNo: 1 | 2) => {
    const isTeam1 = teamNo === 1
    const teamPlayers = isTeam1 ? setupDraft.team1Players : setupDraft.team2Players
    const captainIndex = isTeam1 ? setupDraft.team1CaptainIndex : setupDraft.team2CaptainIndex
    const duplicateName = isTeam1 ? duplicateTeam1Name : duplicateTeam2Name
    const namesAlreadyTyped = new Set([...setupDraft.team1Players, ...setupDraft.team2Players]
      .map((player) => player.trim().toLocaleLowerCase()).filter(Boolean))
    const availablePlayers = [...playerPool]
      .filter((player) => !namesAlreadyTyped.has(player.name.trim().toLocaleLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    const setTeamPlayers = (players: string[]) => updateSetupDraft(isTeam1
      ? { team1Players: players }
      : { team2Players: players })
    const setCaptain = (index: number) => updateSetupDraft(isTeam1
      ? { team1CaptainIndex: captainIndex === index ? null : index }
      : { team2CaptainIndex: captainIndex === index ? null : index })
    const addSavedPlayer = (name: string) => {
      const emptyIndex = teamPlayers.findIndex((player) => !player.trim())
      if (emptyIndex < 0) return
      const next = [...teamPlayers]
      next[emptyIndex] = name
      setTeamPlayers(next)
    }

    return (
      <>
        {savedTeams.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-1.5">Saved teams</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {savedTeams.map((team) => (
                <button key={team.id} type="button" onClick={() => applySavedTeamToDraft(teamNo, team.id)} className="toss-btn whitespace-nowrap" style={{ padding: '7px 10px', fontSize: '11px' }}>
                  {team.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {playerPool.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-1.5">Saved players</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {availablePlayers.map((player) => (
                <button key={player.id} type="button" onClick={() => addSavedPlayer(player.name)} className="toss-btn whitespace-nowrap" style={{ padding: '7px 10px', fontSize: '11px' }}>
                  {player.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 space-y-2">
          {teamPlayers.map((player, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Input placeholder={`Player ${index + 1}`} value={player} onChange={(event) => {
                  const next = [...teamPlayers]
                  next[index] = event.target.value
                  updateSetupDraft(isTeam1
                    ? { team1Players: next, ...(captainIndex === index && !event.target.value.trim() ? { team1CaptainIndex: null } : {}) }
                    : { team2Players: next, ...(captainIndex === index && !event.target.value.trim() ? { team2CaptainIndex: null } : {}) })
                }} />
              </div>
              <button
                type="button"
                disabled={!player.trim()}
                onClick={() => setCaptain(index)}
                aria-label={`Set ${player || `Player ${index + 1}`} as captain`}
                className={`toss-btn ${captainIndex === index ? 'selected' : ''}`}
                style={{ width: '30px', height: '30px', minWidth: '30px', padding: 0, borderRadius: '50%', fontSize: '11px' }}
              >C</button>
            </div>
          ))}
        </div>
        {duplicateName && (
          <p className="mt-2 text-xs text-red-600">Two players are named {duplicateName}. Use different names, for example {duplicateName} K and {duplicateName} S.</p>
        )}
        <button type="button" onClick={() => saveTeam(teamNo)} className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-900 btn-press">
          Save this team
        </button>
        {teamSaveError && <p className="mt-1 text-xs text-red-600">{teamSaveError}</p>}
      </>
    )
  }

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
          {renderPlayerSetup(1)}
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
            {renderPlayerSetup(2)}
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
