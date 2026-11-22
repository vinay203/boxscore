import { useState } from 'react'
import {
  BarChart3,
  Undo2,
  ArrowLeftRight,
  RefreshCw,
  Flag,
  Pencil,
  UserCheck,
} from 'lucide-react'
import { Button } from './ui/Button'
import { BottomSheet } from './ui/BottomSheet'
import { Card } from './ui/Card'
import { Input } from './ui/Input'
import { PageTransition } from './ui/PageTransition'
import { ScorecardScreen } from './ScorecardScreen'
import { useMatchStore } from '../store/matchStore'
import type { Ball, ExtraType, Team, WicketType } from '../types'
import {
  getBattingStats,
  getBowlingStats,
  getCurrentOverBalls,
  getLastBowlerId,
  getOversDisplay,
  getPlayerById,
  getPlayerName,
  getRemainingBatsmen,
  getRequiredRunsInfo,
  getTeamById,
  getTotalRuns,
  getWicketCount,
  vibrate,
} from '../utils/cricket'

const DISMISSAL_TYPES: { type: WicketType; label: string }[] = [
  { type: 'bowled', label: 'Bowled' },
  { type: 'caught', label: 'Caught' },
  { type: 'runOut', label: 'Run Out' },
  { type: 'lbw', label: 'LBW' },
  { type: 'stumped', label: 'Stumped' },
  { type: 'hitWicket', label: 'Hit Wicket' },
]

function BallDot({ ball }: { ball: Ball }) {
  if (ball.isWicket) return <span className="ball-dot wicket">W</span>
  if (ball.extraType === 'wide') return <span className="ball-dot wide">Wd</span>
  if (ball.extraType === 'noBall') return <span className="ball-dot noball">Nb</span>
  const runs = ball.runs
  if (runs === 0) return <span className="ball-dot dot">·</span>
  return (
    <span className={`ball-dot ${runs === 4 ? 'four' : runs === 6 ? 'six' : 'runs'}`}>
      {ball.extraType === 'bye' || ball.extraType === 'legBye' ? `B${runs}` : runs}
    </span>
  )
}

interface OpeningBatsmenSheetProps {
  open: boolean
  onClose: () => void
  battingTeam: Team
  onConfirm: (strikerId: string, nonStrikerId: string) => void
}

function OpeningBatsmenForm({
  battingTeam,
  onConfirm,
}: {
  battingTeam: Team
  onConfirm: (strikerId: string, nonStrikerId: string) => void
}) {
  const [selectedStriker, setSelectedStriker] = useState(battingTeam.players[0]?.id ?? '')
  const [selectedNonStriker, setSelectedNonStriker] = useState(battingTeam.players[1]?.id ?? '')

  const handleConfirm = () => {
    const s = selectedStriker || battingTeam.players[0]?.id || ''
    const ns = selectedNonStriker || battingTeam.players[1]?.id || ''
    if (!s || !ns || s === ns) return
    onConfirm(s, ns)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Striker</p>
        <div className="space-y-2 max-h-36 overflow-y-auto">
          {battingTeam.players.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.id === (selectedNonStriker || battingTeam.players[1]?.id)}
              onClick={() => setSelectedStriker(p.id)}
              className={`sheet-option ${(selectedStriker || battingTeam.players[0]?.id) === p.id ? 'selected' : ''}`}
            >
              <span className="font-medium" style={{ color: '#111' }}>{p.name}</span>
              {(selectedStriker || battingTeam.players[0]?.id) === p.id && <span style={{ fontSize: '12px', color: '#888' }}>Striker</span>}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Non-Striker</p>
        <div className="space-y-2 max-h-36 overflow-y-auto">
          {battingTeam.players.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.id === (selectedStriker || battingTeam.players[0]?.id)}
              onClick={() => setSelectedNonStriker(p.id)}
              className={`sheet-option ${(selectedNonStriker || battingTeam.players[1]?.id) === p.id ? 'selected' : ''}`}
            >
              <span className="font-medium" style={{ color: '#111' }}>{p.name}</span>
              {(selectedNonStriker || battingTeam.players[1]?.id) === p.id && <span style={{ fontSize: '12px', color: '#888' }}>Non-Striker</span>}
            </button>
          ))}
        </div>
      </div>
      <Button fullWidth onClick={handleConfirm}>
        Confirm Opening Batsmen
      </Button>
    </div>
  )
}

function OpeningBatsmenSheet({
  open,
  onClose,
  battingTeam,
  onConfirm,
}: OpeningBatsmenSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Select Opening Batsmen"
    >
      <OpeningBatsmenForm battingTeam={battingTeam} onConfirm={onConfirm} />
    </BottomSheet>
  )
}

export function LiveScorerScreen() {
  const {
    match,
    innings,
    currentInningsIndex,
    matchStatus,
    showScorecard,
    setShowScorecard,
    recordRun,
    recordExtra,
    recordWicket,
    selectBowler,
    cancelBowlerSelection,
    selectOpeningBatsmen,
    cancelBatsmanSelection,
    retireBatsman,
    updateLiveMatchNames,
    undoLastBall,
    startSecondInnings,
    swapBatsmen,
    endInningsEarly,
    changeBowlerRequest,
    resetToHome,
  } = useMatchStore()

  const [wicketOpen, setWicketOpen] = useState(false)
  const [wicketType, setWicketType] = useState<WicketType>('bowled')
  const [outBatsmanId, setOutBatsmanId] = useState('')
  const [newBatsmanId, setNewBatsmanId] = useState('')
  const [byePickerOpen, setByePickerOpen] = useState<ExtraType | null>(null)
  const [confirmEndInnings, setConfirmEndInnings] = useState(false)

  // Switch / Retire batsman modal state
  const [retireOpen, setRetireOpen] = useState(false)
  const [retireTargetIsStriker, setRetireTargetIsStriker] = useState(true)
  const [retireNewBatsmanId, setRetireNewBatsmanId] = useState('')

  // Edit Names modal state
  const [editNamesOpen, setEditNamesOpen] = useState(false)
  const [editT1Name, setEditT1Name] = useState('')
  const [editT1Players, setEditT1Players] = useState<string[]>([])
  const [editT2Name, setEditT2Name] = useState('')
  const [editT2Players, setEditT2Players] = useState<string[]>([])

  if (!match) return null

  const current = innings[currentInningsIndex]
  if (!current && matchStatus !== 'innings_break') return null

  const battingTeam = getTeamById(match, current?.battingTeamId ?? match.battingFirstId)
  const bowlingTeam = getTeamById(match, current?.bowlingTeamId ?? '')

  const totalRuns = current ? getTotalRuns(current.balls) : 0
  const wickets = current ? getWicketCount(current.balls) : 0
  const oversDisplay = current ? getOversDisplay(current.balls, match.overs) : ''
  const overBalls = current ? getCurrentOverBalls(current.balls) : []
  const required = getRequiredRunsInfo(innings, currentInningsIndex, match.overs)

  const strikerId = current?.currentBatsmanIds[0] ?? battingTeam.players[0]?.id ?? ''
  const nonStrikerId = current?.currentBatsmanIds[1] ?? battingTeam.players[1]?.id ?? ''

  const strikerStats = getBattingStats(current?.balls ?? [], strikerId, battingTeam.players)
  const nonStrikerStats = getBattingStats(current?.balls ?? [], nonStrikerId, battingTeam.players)
  const bowlerStats = current?.currentBowlerId
    ? getBowlingStats(current.balls, current.currentBowlerId)
    : null

  const remainingBatsmen = current
    ? getRemainingBatsmen(battingTeam, current.balls, current.currentBatsmanIds)
    : []

  const lastBowlerId = current ? getLastBowlerId(current) : null

  const handleRun = (runs: number) => {
    if (!current?.currentBowlerId || current?.pendingBowlerSelection || current?.pendingBatsmanSelection) {
      changeBowlerRequest()
      return
    }
    vibrate()
    recordRun(runs)
  }

  const handleExtra = (type: ExtraType) => {
    if (!current?.currentBowlerId || current?.pendingBowlerSelection || current?.pendingBatsmanSelection) {
      changeBowlerRequest()
      return
    }
    if (type === 'bye' || type === 'legBye') {
      setByePickerOpen(type)
      return
    }
    vibrate()
    recordExtra(type)
  }

  const confirmBye = (runs: number) => {
    vibrate()
    recordExtra(byePickerOpen!, runs)
    setByePickerOpen(null)
  }

  const openWicket = () => {
    if (!current?.currentBowlerId || current?.pendingBowlerSelection || current?.pendingBatsmanSelection) {
      changeBowlerRequest()
      return
    }
    const defaultOut = strikerId
    const defaultNew = remainingBatsmen[0]?.id ?? ''
    setOutBatsmanId(defaultOut)
    setNewBatsmanId(defaultNew)
    setWicketOpen(true)
  }

  const confirmWicket = () => {
    const actualNew = newBatsmanId || remainingBatsmen[0]?.id || ''
    vibrate()
    recordWicket(wicketType, outBatsmanId || strikerId, actualNew)
    setWicketOpen(false)
  }

  const openRetireModal = (isStriker: boolean) => {
    setRetireTargetIsStriker(isStriker)
    setRetireNewBatsmanId(remainingBatsmen[0]?.id ?? '')
    setRetireOpen(true)
  }

  const confirmRetire = () => {
    if (!retireNewBatsmanId) return
    retireBatsman(retireTargetIsStriker, retireNewBatsmanId)
    setRetireOpen(false)
  }

  const openEditNames = () => {
    setEditT1Name(match.team1.name)
    setEditT1Players(match.team1.players.map((p) => p.name))
    setEditT2Name(match.team2.name)
    setEditT2Players(match.team2.players.map((p) => p.name))
    setEditNamesOpen(true)
  }

  const saveEditNames = () => {
    updateLiveMatchNames(editT1Name, editT1Players, editT2Name, editT2Players)
    setEditNamesOpen(false)
  }

  if (matchStatus === 'innings_break') {
    const firstInnings = innings[0]
    const score = getTotalRuns(firstInnings.balls)
    const wkts = getWicketCount(firstInnings.balls)

    return (
      <PageTransition>
        <div className="top-bar">
          <button type="button" onClick={resetToHome} className="top-bar-action btn-press">
            Home
          </button>
        </div>
        <h2 className="text-xl font-bold mb-4" style={{ color: '#111' }}>Innings Break</h2>
        <Card className="mb-4">
          <p className="text-sm mb-2" style={{ color: '#999' }}>1st Innings Complete</p>
          <p className="text-2xl font-bold" style={{ color: '#111' }}>
            {getTeamById(match, firstInnings.battingTeamId).name} {score} / {wkts}
          </p>
          <p className="text-sm mt-1" style={{ color: '#888' }}>Target: {score + 1} runs</p>
        </Card>
        <ScorecardScreen embedded />
        <Button fullWidth className="mt-4" onClick={startSecondInnings}>Start 2nd Innings</Button>
      </PageTransition>
    )
  }

  return (
    <>
      <PageTransition className="pb-16">
        {/* Top bar — Edit Names button (safe!) & Scorecard button */}
        <div className="top-bar">
          <button type="button" onClick={openEditNames} className="top-bar-action btn-press">
            <Pencil size={13} /> Edit Player Names
          </button>
          <button type="button" onClick={() => setShowScorecard(true)} className="top-bar-action btn-press">
            <BarChart3 size={14} /> Scorecard
          </button>
        </div>

        {/* Score header */}
        <div className="score-header">
          <p className="score-team">{battingTeam.name}</p>
          <p key={`${totalRuns}-${wickets}`} className="score-line score-update">
            {totalRuns}<span className="wickets"> / {wickets}</span>
          </p>
          <p className="score-overs">{oversDisplay}</p>
          {required && currentInningsIndex === 1 && (
            <p className="target-pill">Need {required.runs} in {required.balls} balls</p>
          )}
        </div>

        {/* This over strip */}
        <div className="mb-3">
          <p className="section-label">This over</p>
          <div className="over-strip min-h-[30px]">
            {overBalls.length === 0
              ? <span className="text-xs" style={{ color: '#DDD' }}>—</span>
              : overBalls.map((b, i) => <BallDot key={i} ball={b} />)
            }
          </div>
        </div>

        {/* Batsmen card */}
        <Card className="stats-card mb-3 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <p className="section-label mb-0">Batting</p>
            <div className="flex gap-1">
              <button type="button" onClick={swapBatsmen} className="action-btn" title="Swap Striker & Non-Striker">
                <ArrowLeftRight size={11} /> Swap
              </button>
              {remainingBatsmen.length > 0 && (
                <button type="button" onClick={() => openRetireModal(true)} className="action-btn" title="Retire / Switch Batter">
                  <UserCheck size={11} /> Switch Batter
                </button>
              )}
            </div>
          </div>
          <div className="stats-header grid-cols-7 px-3">
            <span className="col-span-2">Batsman</span>
            <span className="text-center">R</span>
            <span className="text-center">B</span>
            <span className="text-center">4s</span>
            <span className="text-center">6s</span>
            <span className="text-center">SR</span>
          </div>
          {[strikerId, nonStrikerId].map((id, idx) => {
            const stats = idx === 0 ? strikerStats : nonStrikerStats
            const name = getPlayerById(battingTeam, id)?.name ?? '-'
            return (
              <div key={id || idx} className={`stats-row grid-cols-7 ${idx === 0 ? 'striker' : ''}`}>
                <span className="col-span-2 truncate flex items-center gap-1">
                  {idx === 0 && <span style={{ fontSize: '10px' }}>●</span>}
                  {name}
                </span>
                <span className="runs-value text-center">{stats.runs}</span>
                <span className="text-center">{stats.ballsFaced}</span>
                <span className="text-center">{stats.fours}</span>
                <span className="text-center">{stats.sixes}</span>
                <span className="text-center">{stats.strikeRate.toFixed(0)}</span>
              </div>
            )
          })}
        </Card>

        {/* Bowler card */}
        <Card className="stats-card mb-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <p className="section-label mb-0">Bowling</p>
            <button type="button" onClick={changeBowlerRequest} className="action-btn">
              <RefreshCw size={11} /> Change Bowler
            </button>
          </div>
          <div className="stats-header grid-cols-6 px-3">
            <span className="col-span-2">Bowler</span>
            <span className="text-center">O</span>
            <span className="text-center">R</span>
            <span className="text-center">W</span>
            <span className="text-center">Eco</span>
          </div>
          <div className="stats-row grid-cols-6 px-3">
            <span className="col-span-2 truncate font-medium">
              {current.currentBowlerId ? getPlayerName(match, current.bowlingTeamId, current.currentBowlerId) : '—'}
            </span>
            <span className="text-center">{bowlerStats?.oversDisplay ?? '0.0'}</span>
            <span className="text-center">{bowlerStats?.runs ?? 0}</span>
            <span className="text-center">{bowlerStats?.wickets ?? 0}</span>
            <span className={`economy text-center ${!bowlerStats || bowlerStats.economy < 6 ? 'good' : bowlerStats.economy <= 9 ? 'average' : 'expensive'}`}>
              {bowlerStats?.economy.toFixed(1) ?? '0.0'}
            </span>
          </div>
        </Card>

        {/* Scoring buttons container */}
        <div className="space-y-3">
          <div className="run-buttons">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button key={r} type="button" onClick={() => handleRun(r)} className={`run-button run-${r}`}>{r}</button>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2" style={{ marginTop: '12px' }}>
            {(['wide', 'noBall', 'bye', 'legBye'] as ExtraType[]).map((type) => (
              <button key={type} type="button" onClick={() => handleExtra(type)} className="extra-button btn-press">
                {type === 'wide' ? 'Wide' : type === 'noBall' ? 'No Ball' : type === 'bye' ? 'Bye' : 'Leg Bye'}
              </button>
            ))}
          </div>

          {/* WICKET BUTTON - Prominent & Un-cut */}
          <div className="pt-1 pb-1">
            <Button fullWidth variant="danger" onClick={openWicket}>
              WICKET
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={undoLastBall} className="undo-button flex items-center gap-1 py-2 btn-press">
              <Undo2 size={13} /> Undo Ball
            </button>
            <button type="button" onClick={() => setConfirmEndInnings(true)} className="action-btn action-btn--end">
              <Flag size={11} /> End Innings
            </button>
          </div>
        </div>
      </PageTransition>

      {/* Opening batsmen selection sheet */}
      <OpeningBatsmenSheet
        key={currentInningsIndex}
        open={!!current.pendingBatsmanSelection}
        onClose={cancelBatsmanSelection}
        battingTeam={battingTeam}
        onConfirm={selectOpeningBatsmen}
      />

      {/* Bowler selection sheet */}
      <BottomSheet
        open={!current.pendingBatsmanSelection && !!current.pendingBowlerSelection}
        onClose={cancelBowlerSelection}
        title="Select Bowler"
      >
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {bowlingTeam.players.map((player) => {
            const stats = getBowlingStats(current.balls, player.id)
            const disabled = player.id === lastBowlerId && bowlingTeam.players.length > 2
            return (
              <button
                key={player.id}
                type="button"
                disabled={disabled}
                onClick={() => selectBowler(player.id)}
                className={`sheet-option ${disabled ? 'disabled' : 'btn-press'}`}
              >
                <span className="font-medium" style={{ color: '#111' }}>{player.name}</span>
                <span className="text-xs" style={{ color: '#999' }}>
                  {stats.oversDisplay} ov · {stats.runs}r · {stats.wickets}w
                </span>
              </button>
            )
          })}
        </div>
      </BottomSheet>

      {/* Switch / Retire Batter Modal */}
      <BottomSheet open={retireOpen} onClose={() => setRetireOpen(false)} title="Switch / Retire Batter">
        <p className="text-sm mb-3" style={{ color: '#777' }}>
          Voluntarily switch out a batter without adding a wicket.
        </p>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Who is stepping down?</p>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setRetireTargetIsStriker(true)}
            className={`toss-btn ${retireTargetIsStriker ? 'selected' : ''}`}
          >
            Striker: {getPlayerById(battingTeam, strikerId)?.name}
          </button>
          <button
            type="button"
            onClick={() => setRetireTargetIsStriker(false)}
            className={`toss-btn ${!retireTargetIsStriker ? 'selected' : ''}`}
          >
            Non-Striker: {getPlayerById(battingTeam, nonStrikerId)?.name}
          </button>
        </div>

        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>New Batter Coming In</p>
        <select
          value={retireNewBatsmanId}
          onChange={(e) => setRetireNewBatsmanId(e.target.value)}
          className="w-full rounded-xl py-3 px-4 mb-4"
          style={{ fontSize: '14px' }}
        >
          {remainingBatsmen.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <Button fullWidth onClick={confirmRetire}>Confirm Switch</Button>
      </BottomSheet>

      {/* Edit Player Names Modal — Preserves all match scores */}
      <BottomSheet open={editNamesOpen} onClose={() => setEditNamesOpen(false)} title="Edit Player Names">
        <p className="text-sm mb-3" style={{ color: '#777' }}>
          Update player & team names. Scores and match progress will be preserved.
        </p>
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: '#111' }}>{editT1Name || 'Team 1'}</p>
            <div className="space-y-2">
              {editT1Players.map((name, i) => (
                <Input
                  key={i}
                  placeholder={`Player ${i + 1}`}
                  value={name}
                  onChange={(e) => {
                    const next = [...editT1Players]
                    next[i] = e.target.value
                    setEditT1Players(next)
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: '#111' }}>{editT2Name || 'Team 2'}</p>
            <div className="space-y-2">
              {editT2Players.map((name, i) => (
                <Input
                  key={i}
                  placeholder={`Player ${i + 1}`}
                  value={name}
                  onChange={(e) => {
                    const next = [...editT2Players]
                    next[i] = e.target.value
                    setEditT2Players(next)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <Button fullWidth className="mt-4" onClick={saveEditNames}>Save Names</Button>
      </BottomSheet>

      {/* Wicket modal */}
      <BottomSheet open={wicketOpen} onClose={() => setWicketOpen(false)} title="Wicket">
        <div className="grid grid-cols-2 gap-2 mb-4">
          {DISMISSAL_TYPES.map((d) => (
            <button key={d.type} type="button" onClick={() => setWicketType(d.type)}
              className={`toss-btn ${wicketType === d.type ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>
              {d.label}
            </button>
          ))}
        </div>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Out batsman</p>
        <div className="flex gap-2 mb-4">
          {[strikerId, nonStrikerId].map((id) => (
            <button key={id} type="button" onClick={() => setOutBatsmanId(id)}
              className={`toss-btn ${outBatsmanId === id ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>
              {getPlayerById(battingTeam, id)?.name}
            </button>
          ))}
        </div>
        {remainingBatsmen.length > 0 && (
          <>
            <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>New batsman</p>
            <select value={newBatsmanId || remainingBatsmen[0]?.id} onChange={(e) => setNewBatsmanId(e.target.value)} className="w-full rounded-xl py-3 px-4 mb-4" style={{ fontSize: '14px' }}>
              {remainingBatsmen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>
        )}
        <Button fullWidth variant="danger" onClick={confirmWicket}>Confirm Wicket</Button>
      </BottomSheet>

      {/* Bye picker */}
      <BottomSheet open={!!byePickerOpen} onClose={() => setByePickerOpen(null)} title={`${byePickerOpen === 'legBye' ? 'Leg Bye' : 'Bye'} — Runs`}>
        <div className="flex justify-center gap-3">
          {[1, 2, 3, 4].map((r) => (
            <button key={r} type="button" onClick={() => confirmBye(r)} className="run-button run-1 btn-press">{r}</button>
          ))}
        </div>
      </BottomSheet>

      {/* End innings confirmation */}
      <BottomSheet open={confirmEndInnings} onClose={() => setConfirmEndInnings(false)} title="End Innings?">
        <p className="text-sm mb-4" style={{ color: '#888' }}>End this innings early? This cannot be undone.</p>
        <div className="flex gap-2">
          <Button fullWidth variant="secondary" onClick={() => setConfirmEndInnings(false)}>Cancel</Button>
          <Button fullWidth variant="danger" onClick={() => { setConfirmEndInnings(false); endInningsEarly() }}>End Innings</Button>
        </div>
      </BottomSheet>

      {showScorecard && <ScorecardScreen onClose={() => setShowScorecard(false)} />}
    </>
  )
}
