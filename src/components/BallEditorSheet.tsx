import { useState } from 'react'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import type { Team } from '../types'
import type { DeliveryKind, WicketKind } from '../engine/types'
import { allowedWicketKinds, buildBallFromEditor, DISMISSAL_TYPES, type BallEditorChoice, type BuiltEditorBall } from '../engine'

export type EditableBall = Omit<BuiltEditorBall, 'id'> & { id?: string }

interface Props {
  open: boolean
  title: string
  initial: EditableBall
  bowlingTeam: Team
  battingTeam: Team
  strikerId: string | null
  nonStrikerId: string | null
  isFreeHit: boolean
  availableBatters: { id: string; name: string }[]
  onClose: () => void
  onSave: (ball: EditableBall) => { ok: boolean; error?: string }
}

const choices: { value: BallEditorChoice; label: string }[] = [
  { value: 'legal', label: 'Bat runs' }, { value: 'wide', label: 'Wide' }, { value: 'noBall', label: 'No-ball' },
  { value: 'bye', label: 'Bye' }, { value: 'legBye', label: 'Leg-bye' },
  { value: 'noBallBye', label: 'No-ball + bye' }, { value: 'noBallLegBye', label: 'No-ball + leg-bye' },
]

export function BallEditorSheet(props: Props) {
  const [choice, setChoice] = useState<BallEditorChoice | null>(null)
  const [runs, setRuns] = useState<number | null>(null)
  const [bowlerId, setBowlerId] = useState('')
  const [wicketKind, setWicketKind] = useState<WicketKind | '' | null>(null)
  const [outId, setOutId] = useState('')
  const [fielderId, setFielderId] = useState<string | null>(null)
  const [newBatterId, setNewBatterId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Initialize form values when an editor is mounted for a particular ball.
  const initialChoice = props.initial.delivery === 'wide' ? 'wide'
    : props.initial.delivery === 'noBall'
      ? props.initial.byeRuns ? 'noBallBye' : props.initial.legByeRuns ? 'noBallLegBye' : 'noBall'
      : props.initial.byeRuns ? 'bye' : props.initial.legByeRuns ? 'legBye' : 'legal'
  const selectedChoice: BallEditorChoice = choice ?? initialChoice
  const sourceRuns = props.initial.delivery === 'wide' ? props.initial.wideExtraRuns
    : props.initial.byeRuns || props.initial.legByeRuns || props.initial.batRuns
  const selectedRuns = runs ?? (choice === null ? sourceRuns : 0)
  const selectedBowler = bowlerId || props.initial.bowlerId || props.bowlingTeam.players[0]?.id || ''
  const delivery: DeliveryKind = selectedChoice.startsWith('noBall') ? 'noBall' : selectedChoice === 'wide' ? 'wide' : 'legal'
  const byes = selectedChoice.endsWith('Bye') || selectedChoice === 'bye'
  const allowed = allowedWicketKinds(delivery, props.isFreeHit, byes)
  const currentKind = wicketKind === null ? props.initial.wicket?.kind || '' : wicketKind
  const wicketOutId = outId || props.initial.wicket?.outId || props.strikerId || ''
  const activePlayers = [props.strikerId, props.nonStrikerId].filter((id): id is string => !!id)
  const selectedFielder = fielderId === null ? props.initial.wicket?.fielderId ?? '' : fielderId
  const selectedNewBatter = newBatterId === null ? props.initial.wicket?.newBatterId ?? '' : newBatterId

  const save = () => {
    const result = buildBallFromEditor({
      choice: selectedChoice,
      runs: selectedRuns,
      bowlerId: selectedBowler,
      bouncer: props.initial.bouncer,
      ...(props.initial.id ? { id: props.initial.id } : {}),
      ...(currentKind ? { wicket: {
        kind: currentKind,
        outId: wicketOutId,
        ...(selectedFielder ? { fielderId: selectedFielder } : {}),
        ...(selectedNewBatter ? { newBatterId: selectedNewBatter } : {}),
      } } : {}),
    })
    if ('error' in result) {
      setError(result.error)
      return
    }
    const saved = props.onSave(result.ball)
    setError(saved.ok ? '' : saved.error || 'Could not save ball')
  }

  return <BottomSheet open={props.open} onClose={props.onClose} title={props.title}>
    <div className="space-y-3 max-h-[65dvh] overflow-y-auto">
      <div>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Delivery</p>
        <div className="grid grid-cols-2 gap-2">
          {choices.map(({ value, label }) => <button key={value} type="button" onClick={() => { setChoice(value); setRuns(null); setError('') }} className={`toss-btn ${selectedChoice === value ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>{label}</button>)}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Runs</p>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 - (byes ? 1 : 0) }, (_, index) => index + (byes ? 1 : 0)).map((value) => <button key={value} type="button" onClick={() => { setRuns(value); setError('') }} className={`toss-btn ${selectedRuns === value ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>{value}</button>)}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Bowler</p>
        <div className="grid grid-cols-2 gap-2">
          {props.bowlingTeam.players.map((player) => <button key={player.id} type="button" onClick={() => setBowlerId(player.id)} className={`toss-btn ${selectedBowler === player.id ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>{player.name}</button>)}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Wicket</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setWicketKind('')} className={`toss-btn ${!currentKind ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>No wicket</button>
          {DISMISSAL_TYPES.map(({ type, label }) => <button key={type} type="button" disabled={!allowed.includes(type)} onClick={() => {
            setWicketKind(type)
            if (['bowled', 'caught', 'lbw', 'stumped', 'hitWicket'].includes(type)) setRuns(0)
          }} className={`toss-btn ${currentKind === type ? 'selected' : ''} ${!allowed.includes(type) ? 'disabled' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>{label}</button>)}
        </div>
      </div>
      {!!currentKind && <>
        <div>
          <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Out batter</p>
          <div className="grid grid-cols-2 gap-2">
            {activePlayers.map((id) => <button key={id} type="button" onClick={() => setOutId(id)} className={`toss-btn ${wicketOutId === id ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>{props.battingTeam.players.find((p) => p.id === id)?.name ?? id}</button>)}
          </div>
        </div>
        {['caught', 'stumped', 'runOut'].includes(currentKind) && <div>
          <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Fielder</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setFielderId('')} className={`toss-btn ${!selectedFielder ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>Skip</button>
            {props.bowlingTeam.players.map((player) => <button key={player.id} type="button" onClick={() => setFielderId(player.id)} className={`toss-btn ${selectedFielder === player.id ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>{player.name}</button>)}
          </div>
        </div>}
        <div>
          <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Next batter</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setNewBatterId('')} className={`toss-btn ${!selectedNewBatter ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>Skip</button>
            {props.availableBatters.map((player) => <button key={player.id} type="button" onClick={() => setNewBatterId(player.id)} className={`toss-btn ${selectedNewBatter === player.id ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>{player.name}</button>)}
          </div>
        </div>
      </>}
      {!!error && <p className="text-sm text-red-600">{error}</p>}
      <Button fullWidth onClick={save}>Save ball</Button>
    </div>
  </BottomSheet>
}
