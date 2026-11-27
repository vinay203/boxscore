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
import { PageTransition } from './ui/PageTransition'
import { ScorecardScreen } from './ScorecardScreen'
import { BallEditorSheet, type EditableBall } from './BallEditorSheet'
import { MatchSettingsSheet } from './MatchSettingsSheet'
import { useMatchStore } from '../store/matchStore'
import {
  allowedWicketKinds,
  deriveForInnings,
  getCurrentOverBalls,
  getInningsSummary,
  getInningsContext,
  getAvailableBattersAt,
  DISMISSAL_TYPES,
  getLastBowlerId,
  getRequiredInfo,
  type DerivedBall,
} from '../engine'
import type { ExtraType, Team, WicketType } from '../types'
import type { InningsEvent } from '../engine/types'
import {
  getPlayerById,
  getPlayerName,
  getTeamById,
  vibrate,
} from '../utils/cricket'

function getBallDotText(ball: DerivedBall): string {
  if (ball.delivery === 'wide') return `Wd${ball.wideExtraRuns || ''}${ball.wicket ? 'W' : ''}`
  if (ball.delivery === 'noBall') {
    const noBallRuns = ball.byeRuns > 0 || ball.legByeRuns > 0
      ? `B${ball.byeRuns + ball.legByeRuns}`
      : ball.batRuns > 0 ? `${ball.batRuns}` : ''
    return `Nb${noBallRuns}${ball.wicket ? 'W' : ''}`
  }
  const runs = ball.batRuns + ball.byeRuns + ball.legByeRuns
  if (ball.wicket) return runs === 0 ? 'W' : `${ball.byeRuns > 0 || ball.legByeRuns > 0 ? `B${runs}` : runs}W`
  if (runs === 0) return '·'
  return ball.byeRuns > 0 || ball.legByeRuns > 0 ? `B${runs}` : `${runs}`
}

function BallDot({ ball }: { ball: DerivedBall }) {
  const ring = ball.isFreeHit ? ' free-hit' : ''
  if (ball.delivery === 'wide') {
    const label = getBallDotText(ball)
    return <span className={`ball-dot ${ball.wicket ? 'wicket' : 'wide'}${ring} ${label.length > 2 ? 'ball-dot--long' : ''}`}>{label}</span>
  }
  if (ball.delivery === 'noBall') {
    const label = getBallDotText(ball)
    return <span className={`ball-dot ${ball.wicket ? 'wicket' : 'noball'}${ring} ${label.length > 2 ? 'ball-dot--long' : ''}`}>{label}</span>
  }
  const runs = ball.batRuns + ball.byeRuns + ball.legByeRuns
  if (ball.wicket) return <span className={`ball-dot wicket${ring} ${runs > 0 ? 'ball-dot--long' : ''}`}>{getBallDotText(ball)}</span>
  if (runs === 0) return <span className={`ball-dot dot${ring}`}>·</span>
  return (
    <span
      className={`ball-dot ${runs === 4 ? 'four' : runs === 6 ? 'six' : 'runs'}${ring}`}
    >
      {ball.byeRuns > 0 || ball.legByeRuns > 0 ? `B${runs}` : runs}
    </span>
  )
}

interface OpeningBatsmenSheetProps {
  open: boolean
  onClose: () => void
  battingTeam: Team
  onConfirm: (strikerId: string, nonStrikerId: string) => { ok: boolean; error?: string } | void
  initialStrikerId?: string
  initialNonStrikerId?: string
  onBackToInningsBreak?: () => void
}

function OpeningBatsmenForm({
  battingTeam,
  onConfirm,
  initialStrikerId,
  initialNonStrikerId,
  onBackToInningsBreak,
}: {
  battingTeam: Team
  onConfirm: (strikerId: string, nonStrikerId: string) => { ok: boolean; error?: string } | void
  initialStrikerId?: string
  initialNonStrikerId?: string
  onBackToInningsBreak?: () => void
}) {
  const [selectedStriker, setSelectedStriker] = useState(initialStrikerId ?? battingTeam.players[0]?.id ?? '')
  const [selectedNonStriker, setSelectedNonStriker] = useState(initialNonStrikerId ?? battingTeam.players[1]?.id ?? '')
  const [error, setError] = useState('')

  const handleConfirm = () => {
    const s = selectedStriker || battingTeam.players[0]?.id || ''
    const ns = selectedNonStriker || battingTeam.players[1]?.id || ''
    if (!s || !ns || s === ns) return
    const result = onConfirm(s, ns)
    setError(result && !result.ok ? result.error ?? 'Could not edit openers' : '')
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      {onBackToInningsBreak && <button type="button" onClick={onBackToInningsBreak} className="text-xs text-gray-500 underline">Back to innings break</button>}
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
  initialStrikerId,
  initialNonStrikerId,
  onBackToInningsBreak,
}: OpeningBatsmenSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Select Opening Batsmen"
    >
      <OpeningBatsmenForm key={`${initialStrikerId ?? ''}-${initialNonStrikerId ?? ''}`} battingTeam={battingTeam} onConfirm={onConfirm} initialStrikerId={initialStrikerId} initialNonStrikerId={initialNonStrikerId} onBackToInningsBreak={onBackToInningsBreak} />
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
    recordDelivery,
    recordWicket,
    redoStack,
    redoLastBall,
    deleteEvent,
    editEvent,
    insertEvent,
    editOpeners,
    selectBowler,
    cancelBowlerSelection,
    selectOpeningBatsmen,
    cancelBatsmanSelection,
    retireBatsman,
    undoLastBall,
    startSecondInnings,
    swapBatsmen,
    endInningsEarly,
    changeBowlerRequest,
    resetToHome,
  } = useMatchStore()

  const [wicketOpen, setWicketOpen] = useState(false)
  const [ballLogOpen, setBallLogOpen] = useState(false)
  const [ballEditor, setBallEditor] = useState<{ mode: 'edit' | 'insert'; eventId?: string; initial: EditableBall; index: number } | null>(null)
  const [editOpenersOpen, setEditOpenersOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [wicketType, setWicketType] = useState<WicketType>('bowled')
  const [outBatsmanId, setOutBatsmanId] = useState('')
  const [newBatsmanId, setNewBatsmanId] = useState('')
  const [fielderId, setFielderId] = useState('')
  const [completedRuns, setCompletedRuns] = useState(0)
  const [selectedDelivery, setSelectedDelivery] = useState<'wide' | 'noBall' | null>(null)
  const [selectedBye, setSelectedBye] = useState<'bye' | 'legBye' | null>(null)
  const [confirmEndInnings, setConfirmEndInnings] = useState(false)

  // Switch / Retire batsman modal state
  const [retireOpen, setRetireOpen] = useState(false)
  const [retireTargetIsStriker, setRetireTargetIsStriker] = useState(true)
  const [retireNewBatsmanId, setRetireNewBatsmanId] = useState('')

  // Edit Names modal state
  const [editNamesOpen, setEditNamesOpen] = useState(false)

  if (!match) return null

  const current = innings[currentInningsIndex]
  if (!current && matchStatus !== 'innings_break') return null

  const battingTeam = getTeamById(match, current?.battingTeamId ?? match.battingFirstId)
  const bowlingTeam = getTeamById(match, current?.bowlingTeamId ?? '')

  const derived = current
    ? deriveForInnings(match, innings, currentInningsIndex)
    : null
  const summary = current
    ? getInningsSummary(match, innings, currentInningsIndex)
    : null
  const editorPrefixDerived = ballEditor && current
    ? deriveForInnings(match, innings.map((item, index) => index === currentInningsIndex
      ? { ...item, events: (item.events ?? []).slice(0, ballEditor.index) }
      : item), currentInningsIndex)
    : null
  const closeBallLog = () => { setBallLogOpen(false); setDeleteConfirmId(null); setDeleteError('') }
  const openInsertEditor = (afterEventId: string | null, index: number) => {
    const lastBowler = [...(current?.events ?? [])].slice(0, index).reverse().find((event) => event.type === 'ball')
    setBallEditor({ mode: 'insert', eventId: afterEventId ?? undefined, index, initial: {
      type: 'ball',
      bowlerId: lastBowler?.type === 'ball' ? lastBowler.bowlerId : current?.currentBowlerId ?? '',
      delivery: 'legal', batRuns: 0, byeRuns: 0, legByeRuns: 0, wideExtraRuns: 0,
    } })
    closeBallLog()
  }

  const totalRuns = summary ? summary.runs : 0
  const wickets = summary ? summary.wickets : 0
  const oversDisplay = summary
    ? `(${summary.oversDisplay} / ${match.overs} ov)`
    : ''
  const overBalls = derived ? getCurrentOverBalls(derived.balls) : []
  const required = getRequiredInfo(match, innings)

  const strikerId = current?.currentBatsmanIds[0] ?? battingTeam.players[0]?.id ?? ''
  const nonStrikerId = current?.currentBatsmanIds[1] ?? battingTeam.players[1]?.id ?? ''

  const strikerStats = summary?.batting.find((b) => b.id === strikerId) ?? {
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    strikeRate: 0,
  }
  const nonStrikerStats = summary?.batting.find((b) => b.id === nonStrikerId) ?? {
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    strikeRate: 0,
  }
  const bowlerStats =
    current?.currentBowlerId && derived
      ? derived.bowling[current.currentBowlerId]
      : null

  const remainingBatsmen = summary ? summary.remainingBatsmen : []

  const lastBowlerId = derived ? getLastBowlerId(derived.balls) : null
  const derivedBallById = new Map((derived?.balls ?? []).map((ball) => [ball.eventId, ball]))
  const logGroups = new Map<number, { event: InningsEvent; ball?: DerivedBall; index: number }[]>()
  let logLegalBalls = 0
  for (const [index, event] of (current?.events ?? []).entries()) {
    const ball = event.type === 'ball' ? derivedBallById.get(event.id) : undefined
    const over = ball?.over ?? Math.floor(logLegalBalls / 6)
    const entries = logGroups.get(over) ?? []
    entries.push({ event, ball, index })
    logGroups.set(over, entries)
    if (ball?.isLegal) logLegalBalls += 1
  }
  const orderedLogGroups = [...logGroups.entries()].sort(([overA], [overB]) => overB - overA)

  const confirmDeleteEvent = (eventId: string) => {
    if (deleteConfirmId !== eventId) {
      setDeleteConfirmId(eventId)
      setDeleteError('')
      return
    }
    const result = deleteEvent(eventId)
    if (!result.ok) {
      setDeleteError(result.error ?? 'Could not delete event')
      return
    }
    setDeleteConfirmId(null)
    setDeleteError('')
  }

  const handleRun = (runs: number) => {
    if (!current?.currentBowlerId || current?.pendingBowlerSelection || current?.pendingBatsmanSelection) {
      changeBowlerRequest()
      return
    }
    vibrate()
    if (!selectedDelivery && !selectedBye) {
      recordDelivery({ delivery: 'legal', batRuns: runs })
    } else if (selectedDelivery === 'wide') {
      recordDelivery({ delivery: 'wide', wideExtraRuns: runs })
    } else if (selectedDelivery === 'noBall' && selectedBye) {
      recordDelivery({ delivery: 'noBall', [selectedBye === 'bye' ? 'byeRuns' : 'legByeRuns']: runs })
    } else if (selectedDelivery === 'noBall') {
      recordDelivery({ delivery: 'noBall', batRuns: runs })
    } else if (selectedBye === 'bye') {
      recordDelivery({ delivery: 'legal', byeRuns: runs })
    } else if (selectedBye === 'legBye') {
      recordDelivery({ delivery: 'legal', legByeRuns: runs })
    }
    setSelectedDelivery(null)
    setSelectedBye(null)
  }

  const handleExtra = (type: ExtraType) => {
    if (!current?.currentBowlerId || current?.pendingBowlerSelection || current?.pendingBatsmanSelection) {
      changeBowlerRequest()
      return
    }
    vibrate()
    if (type === 'wide') {
      setSelectedDelivery((selected) => selected === 'wide' ? null : 'wide')
      setSelectedBye(null)
    } else if (type === 'noBall') {
      setSelectedDelivery((selected) => selected === 'noBall' ? null : 'noBall')
    } else {
      setSelectedBye((selected) => selected === type ? null : type)
      setSelectedDelivery((selected) => selected === 'wide' ? null : selected)
    }
  }

  const clearModifier = () => {
    setSelectedDelivery(null)
    setSelectedBye(null)
  }
  const selectedModifier = selectedDelivery || selectedBye
  const enabledRuns = selectedBye ? [1, 2, 3, 4] : selectedDelivery === 'wide' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 6]
  const modifierCaption = selectedDelivery === 'wide'
    ? 'Wide + extra runs'
    : selectedDelivery === 'noBall' && selectedBye
      ? `No Ball + ${selectedBye === 'bye' ? 'Byes' : 'Leg Byes'}`
      : selectedDelivery === 'noBall'
        ? 'No Ball + runs off the bat'
        : selectedBye === 'bye' ? 'Bye' : selectedBye === 'legBye' ? 'Leg Bye' : ''
  const pendingDelivery = selectedDelivery ?? 'legal'
  const allowedPendingWickets = allowedWicketKinds(pendingDelivery, !!derived?.isFreeHitNext, !!selectedBye)
  const effectiveWicketType = allowedPendingWickets.includes(wicketType) ? wicketType : allowedPendingWickets[0]
  const isStrikerOnlyWicket = ['bowled', 'caught', 'lbw', 'stumped', 'hitWicket', 'hitBallTwice'].includes(effectiveWicketType)
  const wicketRuns = selectedBye && completedRuns === 0 ? 1 : completedRuns
  const wicketModifierCaption = selectedDelivery === 'wide'
    ? 'on a Wide'
    : selectedDelivery === 'noBall' && selectedBye
      ? `on a No Ball + ${selectedBye === 'bye' ? 'Byes' : 'Leg Byes'}`
      : selectedDelivery === 'noBall'
        ? 'on a No Ball'
        : selectedBye === 'bye' ? 'on a Bye' : selectedBye === 'legBye' ? 'on a Leg Bye' : ''

  const openWicket = () => {
    if (!current?.currentBowlerId || current?.pendingBowlerSelection || current?.pendingBatsmanSelection) {
      changeBowlerRequest()
      return
    }
    const allowed = allowedWicketKinds(pendingDelivery, !!derived?.isFreeHitNext, !!selectedBye)
    if (!allowed.includes(wicketType)) setWicketType(allowed[0])
    const defaultOut = strikerId
    const defaultNew = remainingBatsmen[0]?.id ?? ''
    setOutBatsmanId(defaultOut)
    setNewBatsmanId(defaultNew)
    setFielderId('')
    setCompletedRuns(selectedBye ? 1 : 0)
    setWicketOpen(true)
  }

  const confirmWicket = () => {
    const actualNew = newBatsmanId || remainingBatsmen[0]?.id || ''
    const runOpts = effectiveWicketType !== 'runOut' ? {} : pendingDelivery === 'wide'
      ? { wideExtraRuns: wicketRuns }
      : selectedBye === 'bye'
        ? { byeRuns: wicketRuns }
        : selectedBye === 'legBye'
          ? { legByeRuns: wicketRuns }
          : { batRuns: wicketRuns }
    vibrate()
    recordWicket(effectiveWicketType, outBatsmanId || strikerId, actualNew, {
      delivery: pendingDelivery,
      ...runOpts,
      ...(['caught', 'stumped', 'runOut'].includes(effectiveWicketType) && fielderId ? { fielderId } : {}),
    })
    clearModifier()
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

  const openEditNames = () => setEditNamesOpen(true)

  if (matchStatus === 'innings_break') {
    const firstInnings = innings[0]
    const firstInningsSummary = getInningsSummary(match, innings, 0)
    const score = firstInningsSummary.runs
    const wkts = firstInningsSummary.wickets

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
        <Button fullWidth variant="secondary" className="mt-4" onClick={undoLastBall}>Undo last ball</Button>
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
          <div className="flex gap-1">
            <button type="button" onClick={() => { setDeleteConfirmId(null); setDeleteError(''); setBallLogOpen(true) }} className="top-bar-action btn-press">
              Ball log
            </button>
            <button type="button" onClick={() => setShowScorecard(true)} className="top-bar-action btn-press">
              <BarChart3 size={14} /> Scorecard
            </button>
          </div>
        </div>

        {/* Score header */}
        <div className="score-header">
          <p className="score-team">{battingTeam.name}</p>
          <p key={`${totalRuns}-${wickets}`} className="score-line score-update">
            {totalRuns}<span className="wickets"> / {wickets}</span>
          </p>
          <p className="score-overs">{oversDisplay}</p>
          {required && currentInningsIndex === 1 && (
            <div className="flex items-center justify-center gap-2">
              <p className="target-pill">Need {required.runs} in {required.balls} balls</p>
              {derived?.isFreeHitNext && <span className="target-pill">FREE HIT</span>}
            </div>
          )}
          {derived?.isFreeHitNext && currentInningsIndex !== 1 && <p className="target-pill">FREE HIT</p>}
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
          {selectedModifier && (
            <p className="text-center text-xs" style={{ color: '#777' }}>
              {modifierCaption} · Tap the runs to confirm
            </p>
          )}
          <div className="run-buttons">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button key={r} type="button" disabled={!enabledRuns.includes(r)} onClick={() => handleRun(r)} className={`run-button run-${r}`} aria-disabled={!enabledRuns.includes(r)}>{r}</button>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2" style={{ marginTop: '12px' }}>
            {(['wide', 'noBall', 'bye', 'legBye'] as ExtraType[]).map((type) => (
              <button key={type} type="button" onClick={() => handleExtra(type)} aria-pressed={type === 'wide' ? selectedDelivery === 'wide' : type === 'noBall' ? selectedDelivery === 'noBall' : selectedBye === type} className={`extra-button btn-press ${((type === 'wide' && selectedDelivery === 'wide') || (type === 'noBall' && selectedDelivery === 'noBall') || ((type === 'bye' || type === 'legBye') && selectedBye === type)) ? 'selected' : ''}`}>
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
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => { undoLastBall(); clearModifier() }} className="undo-button flex items-center gap-1 py-2 btn-press">
                <Undo2 size={13} /> Undo Ball
              </button>
              <button type="button" disabled={redoStack.length === 0} onClick={() => { redoLastBall(); clearModifier() }} className="undo-button flex items-center gap-1 py-2 btn-press">
                Redo
              </button>
            </div>
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
        onBackToInningsBreak={currentInningsIndex === 1 && !(current.events ?? []).some((event) => event.type === 'ball') ? undoLastBall : undefined}
      />

      {/* Bowler selection sheet */}
      <BottomSheet
        open={!current.pendingBatsmanSelection && !!current.pendingBowlerSelection}
        onClose={cancelBowlerSelection}
        title="Select Bowler"
      >
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {bowlingTeam.players.map((player) => {
            const stats = derived?.bowling[player.id]
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
                  {stats?.oversDisplay ?? '0.0'} ov · {stats?.runs ?? 0}r · {stats?.wickets ?? 0}w
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

      {editNamesOpen && <MatchSettingsSheet open match={match} innings={innings} onClose={() => setEditNamesOpen(false)} />}

      <BottomSheet open={ballLogOpen} onClose={closeBallLog} title="Ball log">
        <button type="button" className="action-btn mb-2" onClick={() => openInsertEditor(null, (current?.events ?? []).findIndex((event) => event.type === 'openers') + 1)}>Insert ball after openers</button>
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 170px)' }}>
          {!(derived?.balls.length) && <p className="text-sm py-2" style={{ color: '#999' }}>No balls yet</p>}
          {orderedLogGroups.map(([over, entries]) => (
            <section key={over} className="mb-3">
              <p className="section-label mb-1">Over {over + 1}</p>
              {entries.map(({ event, ball, index }) => {
                const deletable = event.type === 'ball' || event.type === 'swapEnds' || event.type === 'retiredHurt'
                let rowLabel = ''
                if (event.type === 'openers') {
                  rowLabel = `Openers: ${getPlayerById(battingTeam, event.strikerId)?.name ?? event.strikerId} / ${getPlayerById(battingTeam, event.nonStrikerId)?.name ?? event.nonStrikerId}`
                } else if (event.type === 'swapEnds') {
                  rowLabel = 'Ends swapped'
                } else if (event.type === 'retiredHurt') {
                  rowLabel = `${getPlayerById(battingTeam, event.batterId)?.name ?? event.batterId} retired hurt`
                } else if (event.type === 'endInnings') {
                  rowLabel = 'Innings ended'
                } else if (event.type === 'dismissal') {
                  rowLabel = `${event.kind === 'retiredOut' ? 'Retired out' : 'Timed out'}: ${getPlayerById(battingTeam, event.outId)?.name ?? event.outId}`
                }
                const batterName = ball ? getPlayerById(battingTeam, ball.strikerId)?.name ?? ball.strikerId : ''
                const bowlerName = ball ? getPlayerName(match, current?.bowlingTeamId ?? '', ball.bowlerId) : ''
                const wicketText = ball?.wicket
                  ? `${DISMISSAL_TYPES.find((dismissal) => dismissal.type === ball.wicket?.kind)?.label ?? ball.wicket.kind} - ${getPlayerById(battingTeam, ball.wicket.outId)?.name ?? ball.wicket.outId} ${summary?.batting.find((batter) => batter.id === ball.wicket?.outId)?.dismissalText ?? ''}`.trim()
                  : ''
                return (
                  <div key={event.id} className="border-b border-gray-100 py-2">
                    {ball ? (
                      <div className="flex items-start gap-2 text-xs">
                        <span className="font-semibold text-gray-900">{ball.over + 1}.{ball.ballInOver}</span>
                        <span className="min-w-0 flex-1 text-gray-600">
                          {bowlerName} to {batterName} · {getBallDotText(ball)}{wicketText ? ` · ${wicketText}` : ''}
                        </span>
                        {deletable && <button type="button" onClick={() => confirmDeleteEvent(event.id)} className="text-xs font-medium text-gray-600">{deleteConfirmId === event.id ? 'Confirm delete?' : 'Delete'}</button>}
                        {event.type === 'ball' && <button type="button" onClick={() => { setBallEditor({ mode: 'edit', eventId: event.id, index, initial: event }); closeBallLog() }} className="text-xs font-medium text-gray-600">Edit</button>}
                        {event.type === 'ball' && <button type="button" onClick={() => openInsertEditor(event.id, index + 1)} className="text-xs font-medium text-gray-600">Insert after</button>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[11px] text-gray-400">
                        <span className="flex-1">{rowLabel}</span>
                        {event.type === 'openers' && <button type="button" onClick={() => { closeBallLog(); setEditOpenersOpen(true) }} className="text-xs font-medium text-gray-600">Edit</button>}
                        {deletable && <button type="button" onClick={() => confirmDeleteEvent(event.id)} className="text-xs font-medium text-gray-600">{deleteConfirmId === event.id ? 'Confirm delete?' : 'Delete'}</button>}
                      </div>
                    )}
                    {deleteError && deleteConfirmId === event.id && <p className="mt-1 text-xs text-red-600">{deleteError}</p>}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      </BottomSheet>

      {ballEditor && current && <BallEditorSheet
        key={`${ballEditor.mode}-${ballEditor.eventId ?? 'top'}-${ballEditor.initial.bowlerId}`}
        open
        title={ballEditor.mode === 'edit' ? 'Edit ball' : 'Insert ball'}
        initial={ballEditor.initial}
        bowlingTeam={bowlingTeam}
        battingTeam={battingTeam}
        strikerId={editorPrefixDerived?.strikerId ?? null}
        nonStrikerId={editorPrefixDerived?.nonStrikerId ?? null}
        isFreeHit={editorPrefixDerived?.isFreeHitNext ?? false}
        availableBatters={getAvailableBattersAt(current.events ?? [], getInningsContext(match, innings, currentInningsIndex), ballEditor.index)}
        onClose={() => { setBallEditor(null); setDeleteConfirmId(null); setDeleteError(''); setBallLogOpen(true) }}
        onSave={(ball) => {
          const payload = ball
          const result = ballEditor.mode === 'edit'
            ? editEvent(ballEditor.eventId ?? '', { ...payload, id: ballEditor.eventId ?? '' })
            : insertEvent(ballEditor.eventId ?? null, {
                bowlerId: payload.bowlerId,
                delivery: payload.delivery,
                batRuns: payload.batRuns,
                byeRuns: payload.byeRuns,
                legByeRuns: payload.legByeRuns,
                wideExtraRuns: payload.wideExtraRuns,
                ...(payload.bouncer ? { bouncer: true } : {}),
                ...(payload.wicket ? { wicket: payload.wicket } : {}),
              })
          if (result.ok) { setBallEditor(null); setDeleteConfirmId(null); setDeleteError(''); setBallLogOpen(true) }
          return result
        }}
      />}
      <OpeningBatsmenSheet
        open={editOpenersOpen}
        onClose={() => { setEditOpenersOpen(false); setBallLogOpen(true) }}
        battingTeam={battingTeam}
        initialStrikerId={current?.events?.find((event) => event.type === 'openers')?.type === 'openers'
          ? current.events.find((event) => event.type === 'openers')?.strikerId : undefined}
        initialNonStrikerId={current?.events?.find((event) => event.type === 'openers')?.type === 'openers'
          ? current.events.find((event) => event.type === 'openers')?.nonStrikerId : undefined}
        onConfirm={(s, ns) => {
          const result = editOpeners(s, ns)
          if (result.ok) { setEditOpenersOpen(false); setBallLogOpen(true) }
          return result
        }}
      />

      {/* Wicket modal */}
      <BottomSheet open={wicketOpen} onClose={() => setWicketOpen(false)} title="Wicket">
        {wicketModifierCaption && <p className="text-sm mb-3" style={{ color: '#777' }}>{wicketModifierCaption}</p>}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {DISMISSAL_TYPES.map((d) => (
            <button key={d.type} type="button" disabled={!allowedPendingWickets.includes(d.type)} onClick={() => { setWicketType(d.type); setOutBatsmanId(strikerId); setFielderId('') }}
              className={`toss-btn ${effectiveWicketType === d.type ? 'selected' : ''} ${!allowedPendingWickets.includes(d.type) ? 'disabled' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>
              {d.label}
            </button>
          ))}
        </div>
        <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Out batsman</p>
        <div className="flex gap-2 mb-4">
          {(isStrikerOnlyWicket ? [strikerId] : [strikerId, nonStrikerId]).map((id) => (
            <button key={id} type="button" onClick={() => setOutBatsmanId(id)}
              className={`toss-btn ${outBatsmanId === id ? 'selected' : ''}`} style={{ padding: '10px', fontSize: '13px' }}>
              {getPlayerById(battingTeam, id)?.name}
            </button>
          ))}
        </div>
        {(['caught', 'stumped', 'runOut'].includes(effectiveWicketType)) && (
          <>
            <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>{effectiveWicketType === 'stumped' ? 'Wicketkeeper' : 'Fielder'}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              <button type="button" onClick={() => setFielderId('')} className={`toss-btn ${!fielderId ? 'selected' : ''}`} style={{ padding: '8px 12px', fontSize: '12px' }}>Skip</button>
              {bowlingTeam.players.filter((player) => effectiveWicketType !== 'caught' || player.id !== current.currentBowlerId).map((player) => (
                <button key={player.id} type="button" onClick={() => setFielderId(player.id)} className={`toss-btn ${fielderId === player.id ? 'selected' : ''}`} style={{ padding: '8px 12px', fontSize: '12px' }}>{player.name}</button>
              ))}
              {effectiveWicketType === 'caught' && current.currentBowlerId && (
                <button type="button" onClick={() => setFielderId(current.currentBowlerId)} className={`toss-btn ${fielderId === current.currentBowlerId ? 'selected' : ''}`} style={{ padding: '8px 12px', fontSize: '12px' }}>{getPlayerById(bowlingTeam, current.currentBowlerId)?.name}</button>
              )}
            </div>
          </>
        )}
        {effectiveWicketType === 'runOut' && (
          <>
            <p className="text-sm font-medium mb-2" style={{ color: '#111' }}>Runs completed</p>
            <div className="flex gap-2 mb-4">
              {(selectedBye ? [1, 2, 3] : [0, 1, 2, 3]).map((runs) => (
                <button key={runs} type="button" onClick={() => setCompletedRuns(runs)} className={`toss-btn ${wicketRuns === runs ? 'selected' : ''}`} style={{ padding: '8px 12px', fontSize: '12px' }}>{runs}</button>
              ))}
            </div>
          </>
        )}
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
