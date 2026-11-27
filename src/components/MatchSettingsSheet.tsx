import { useState } from 'react'
import { Button } from './ui/Button'
import { BottomSheet } from './ui/BottomSheet'
import { Input } from './ui/Input'
import { Stepper } from './ui/Stepper'
import { isPlayerInvolved } from '../engine'
import type { Innings, Match, Team } from '../types'
import { useMatchStore } from '../store/matchStore'

interface Props {
  open: boolean
  match: Match
  innings: Innings[]
  onClose: () => void
}

export function MatchSettingsSheet({ open, match, innings, onClose }: Props) {
  const updateLiveMatchNames = useMatchStore((state) => state.updateLiveMatchNames)
  const addPlayer = useMatchStore((state) => state.addPlayer)
  const removePlayer = useMatchStore((state) => state.removePlayer)
  const updateMatchSettings = useMatchStore((state) => state.updateMatchSettings)
  const [team1Name, setTeam1Name] = useState(match.team1.name)
  const [team1Players, setTeam1Players] = useState(match.team1.players.map((player) => player.name))
  const [team2Name, setTeam2Name] = useState(match.team2.name)
  const [team2Players, setTeam2Players] = useState(match.team2.players.map((player) => player.name))
  const [overs, setOvers] = useState(match.overs)
  const [wicketLimit, setWicketLimit] = useState(match.wicketLimit)
  const [addTeam1Name, setAddTeam1Name] = useState('')
  const [addTeam2Name, setAddTeam2Name] = useState('')
  const [error, setError] = useState('')

  const applyNames = () => updateLiveMatchNames(team1Name, team1Players, team2Name, team2Players)
  const reloadFromMatch = () => {
    const updated = useMatchStore.getState().match
    if (!updated) return
    setTeam1Name(updated.team1.name)
    setTeam1Players(updated.team1.players.map((player) => player.name))
    setTeam2Name(updated.team2.name)
    setTeam2Players(updated.team2.players.map((player) => player.name))
    setOvers(updated.overs)
    setWicketLimit(updated.wicketLimit)
  }

  const changePlayerName = (team: 1 | 2, index: number, name: string) => {
    const players = team === 1 ? [...team1Players] : [...team2Players]
    players[index] = name
    if (team === 1) setTeam1Players(players)
    else setTeam2Players(players)
  }

  const handleAdd = (team: Team) => {
    applyNames()
    const name = team.id === match.team1.id ? addTeam1Name : addTeam2Name
    const result = addPlayer(team.id, name)
    reloadFromMatch()
    if (result.ok) {
      if (team.id === match.team1.id) setAddTeam1Name('')
      else setAddTeam2Name('')
    }
    setError(result.ok ? '' : result.error ?? 'Could not add player')
  }

  const handleRemove = (team: Team, playerId: string) => {
    applyNames()
    const result = removePlayer(team.id, playerId)
    reloadFromMatch()
    setError(result.ok ? '' : result.error ?? 'Could not remove player')
  }

  const save = () => {
    applyNames()
    const result = updateMatchSettings({ overs, wicketLimit })
    if (!result.ok) {
      setError(result.error ?? 'Could not update match settings')
      return
    }
    setError('')
    onClose()
  }

  const renderTeam = (
    team: Team,
    label: string,
    name: string,
    setName: (value: string) => void,
    playerNames: string[],
    teamIndex: 1 | 2,
    addName: string,
    setAddName: (value: string) => void,
  ) => <section className="space-y-2">
    <h4 className="text-sm font-semibold" style={{ color: '#111' }}>{label}</h4>
    <Input label="Team name" value={name} onChange={(event) => setName(event.target.value)} />
    <div className="space-y-2">
      {team.players.map((player, index) => {
        const involved = isPlayerInvolved(innings, player.id)
        return <div key={player.id} className="flex items-center gap-2">
          <Input placeholder={`Player ${index + 1}`} value={playerNames[index] ?? player.name} onChange={(event) => changePlayerName(teamIndex, index, event.target.value)} />
          <button type="button" disabled={involved} onClick={() => handleRemove(team, player.id)} className="shrink-0 rounded-full w-8 h-8 text-sm font-semibold" style={{ color: involved ? '#CCC' : '#777', background: involved ? '#F5F5F5' : '#EEE' }} aria-label={`Remove ${player.name}`}>x</button>
        </div>
      })}
    </div>
    <div className="flex items-end gap-2">
      <Input label="Add player" value={addName} onChange={(event) => setAddName(event.target.value)} />
      <Button onClick={() => handleAdd(team)}>Add</Button>
    </div>
  </section>

  return <BottomSheet open={open} onClose={onClose} title="Edit Match">
    <div className="space-y-4 max-h-[75dvh] overflow-y-auto pr-1">
      <div>
        <Stepper label="Total overs" value={overs} onChange={setOvers} min={1} max={20} step={1} />
        <Stepper label="Wickets per innings" value={wicketLimit} onChange={setWicketLimit} min={1} max={10} />
      </div>
      {renderTeam(match.team1, 'Team 1', team1Name, setTeam1Name, team1Players, 1, addTeam1Name, setAddTeam1Name)}
      {renderTeam(match.team2, 'Team 2', team2Name, setTeam2Name, team2Players, 2, addTeam2Name, setAddTeam2Name)}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button fullWidth onClick={save}>Save</Button>
    </div>
  </BottomSheet>
}
