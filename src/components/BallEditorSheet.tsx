import { useState } from 'react'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'
import type { Team } from '../types'
import type { DeliveryKind, WicketKind } from '../engine/types'
import { allowedWicketKinds } from '../engine'

export interface EditableBall {
  id?: string
  bowlerId: string
  delivery: DeliveryKind
  batRuns: number
  byeRuns: number
  legByeRuns: number
  wideExtraRuns: number
  wicket?: { kind: WicketKind; outId: string; fielderId?: string; newBatterId?: string }
}

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

const choices = [
  ['legal', 'Bat runs'], ['wide', 'Wide'], ['noBall', 'No-ball'], ['bye', 'Bye'],
  ['legBye', 'Leg-bye'], ['noBallBye', 'No-ball + bye'], ['noBallLegBye', 'No-ball + leg-bye'],
] as const

export function BallEditorSheet(props: Props) {
  const [choice, setChoice] = useState<string | null>(null)
  const [runs, setRuns] = useState<number | null>(null)
  const [bowlerId, setBowlerId] = useState('')
  const [wicketKind, setWicketKind] = useState<WicketKind | '' | null>(null)
  const [outId, setOutId] = useState('')
  const [fielderId, setFielderId] = useState('')
  const [newBatterId, setNewBatterId] = useState('')
  const [error, setError] = useState('')

  // Initialize form values when an editor is mounted for a particular ball.
  const initialChoice = props.initial.delivery === 'wide' ? 'wide'
    : props.initial.delivery === 'noBall'
      ? props.initial.byeRuns ? 'noBallBye' : props.initial.legByeRuns ? 'noBallLegBye' : 'noBall'
      : props.initial.byeRuns ? 'bye' : props.initial.legByeRuns ? 'legBye' : 'legal'
  const selectedChoice = choice ?? initialChoice
  const sourceRuns = props.initial.delivery === 'wide' ? props.initial.wideExtraRuns
    : props.initial.byeRuns || props.initial.legByeRuns || props.initial.batRuns
  const selectedRuns = runs ?? (choice === null ? sourceRuns : 0)
  const selectedBowler = bowlerId || props.initial.bowlerId || props.bowlingTeam.players[0]?.id || ''
  const delivery: DeliveryKind = selectedChoice.startsWith('noBall') ? 'noBall' : selectedChoice === 'wide' ? 'wide' : 'legal'
  const byes = selectedChoice.endsWith('Bye') || selectedChoice === 'bye'
  const allowed = allowedWicketKinds(delivery, props.isFreeHit, byes && selectedRuns > 0)
  const currentKind = wicketKind === null ? props.initial.wicket?.kind || '' : wicketKind
  const wicketOutId = outId || props.initial.wicket?.outId || props.strikerId || ''
  const activePlayers = [props.strikerId, props.nonStrikerId].filter((id): id is string => !!id)

  const save = () => {
    const ball: EditableBall = {
      ...(props.initial.id ? { id: props.initial.id } : {}),
      bowlerId: selectedBowler,
      delivery,
      batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0,
      ...(selectedChoice === 'wide' ? { wideExtraRuns: selectedRuns }
        : selectedChoice === 'noBall' || selectedChoice === 'legal' ? { batRuns: selectedRuns }
          : selectedChoice.toLowerCase().includes('leg') ? { legByeRuns: selectedRuns } : { byeRuns: selectedRuns }),
      ...(currentKind ? { wicket: { kind: currentKind as WicketKind, outId: wicketOutId,
        ...(fielderId || props.initial.wicket?.fielderId ? { fielderId: fielderId || props.initial.wicket?.fielderId } : {}),
        ...(newBatterId ? { newBatterId } : props.initial.wicket?.newBatterId ? { newBatterId: props.initial.wicket.newBatterId } : {}),
      } } : {}),
    }
    const result = props.onSave(ball)
    setError(result.ok ? '' : result.error || 'Could not save ball')
  }

  return <BottomSheet open={props.open} onClose={props.onClose} title={props.title}>
    <div className="space-y-3 max-h-[65dvh] overflow-y-auto">
      <label className="block text-sm">Delivery
        <select className="w-full mt-1 border rounded p-2" value={selectedChoice} onChange={(e) => { setChoice(e.target.value); setRuns(null); setError('') }}>
          {choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="block text-sm">Runs
        <input className="w-full mt-1 border rounded p-2" type="number" min={byes ? 1 : 0} max={7} value={selectedRuns} onChange={(e) => setRuns(Number(e.target.value))} />
      </label>
      <label className="block text-sm">Bowler
        <select className="w-full mt-1 border rounded p-2" value={selectedBowler} onChange={(e) => setBowlerId(e.target.value)}>
          {props.bowlingTeam.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">Wicket
        <select className="w-full mt-1 border rounded p-2" value={currentKind} onChange={(e) => {
          const nextKind = e.target.value as WicketKind | ''
          setWicketKind(nextKind)
          if (['bowled', 'caught', 'lbw', 'stumped', 'hitWicket'].includes(nextKind)) setRuns(0)
        }}>
          <option value="">No wicket</option>
          {allowed.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </label>
      {!!currentKind && <>
        <label className="block text-sm">Out batter
          <select className="w-full mt-1 border rounded p-2" value={wicketOutId} onChange={(e) => setOutId(e.target.value)}>
            {activePlayers.map((id) => <option key={id} value={id}>{props.battingTeam.players.find((p) => p.id === id)?.name ?? id}</option>)}
          </select>
        </label>
        {['caught', 'stumped', 'runOut'].includes(currentKind) && <label className="block text-sm">Fielder
          <select className="w-full mt-1 border rounded p-2" value={fielderId || props.initial.wicket?.fielderId || ''} onChange={(e) => setFielderId(e.target.value)}>
            <option value="">No fielder</option>
            {props.bowlingTeam.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>}
        <label className="block text-sm">Next batter
          <select className="w-full mt-1 border rounded p-2" value={newBatterId || props.initial.wicket?.newBatterId || ''} onChange={(e) => setNewBatterId(e.target.value)}>
            <option value="">Select batter</option>
            {props.availableBatters.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>
      </>}
      {!!error && <p className="text-sm text-red-600">{error}</p>}
      <Button fullWidth onClick={save}>Save ball</Button>
    </div>
  </BottomSheet>
}
