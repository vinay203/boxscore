import { useState } from 'react'
import { BarChart3, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from './ui/Button'
import { BottomSheet } from './ui/BottomSheet'
import { Card } from './ui/Card'
import { PageTransition } from './ui/PageTransition'
import { ScorecardScreen } from './ScorecardScreen'
import { useMatchStore } from '../store/matchStore'
import type { Ball, ExtraType, WicketType } from '../types'
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
  if (ball.isWicket) {
    return (
      <span className="ball-dot wicket">
        W
      </span>
    )
  }
  if (ball.extraType === 'wide') {
    return (
      <span className="ball-dot extra">
        Wd
      </span>
    )
  }
  if (ball.extraType === 'noBall') {
    return (
      <span className="ball-dot extra">
        Nb
      </span>
    )
  }
  const runs = ball.extraType ? ball.runs : ball.runs
  if (runs === 0) {
    return (
      <span className="ball-dot dot">
        ·
      </span>
    )
  }
  return (
    <span className={`ball-dot ${runs === 4 ? 'four' : runs === 6 ? 'six' : 'runs'}`}>
      {ball.extraType === 'bye' || ball.extraType === 'legBye' ? `B${runs}` : runs}
    </span>
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
    undoLastBall,
    startSecondInnings,
  } = useMatchStore()

  const [wicketOpen, setWicketOpen] = useState(false)
  const [wicketType, setWicketType] = useState<WicketType>('bowled')
  const [outBatsmanId, setOutBatsmanId] = useState('')
  const [newBatsmanId, setNewBatsmanId] = useState('')
  const [byePickerOpen, setByePickerOpen] = useState<ExtraType | null>(null)

  if (!match) return null

  const current = innings[currentInningsIndex]
  if (!current && matchStatus !== 'innings_break') return null

  const battingTeam = getTeamById(match, current?.battingTeamId ?? match.battingFirstId)
  const bowlingTeam = getTeamById(match, current?.bowlingTeamId ?? '')

  const totalRuns = current ? getTotalRuns(current.balls) : 0
  const wickets = current ? getWicketCount(current.balls) : 0
  const oversDisplay = current
    ? getOversDisplay(current.balls, match.overs)
    : ''
  const overBalls = current ? getCurrentOverBalls(current.balls) : []
  const required = getRequiredRunsInfo(innings, currentInningsIndex, match.overs)

  const strikerId = current?.currentBatsmanIds[0] ?? ''
  const nonStrikerId = current?.currentBatsmanIds[1] ?? ''
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
    if (current?.pendingBowlerSelection) {
      toast.error('Select a bowler first')
      return
    }
    vibrate()
    recordRun(runs)
    toast.success(runs === 0 ? 'Dot ball' : `${runs} run${runs > 1 ? 's' : ''}!`)
  }

  const handleExtra = (type: ExtraType) => {
    if (current?.pendingBowlerSelection) {
      toast.error('Select a bowler first')
      return
    }
    if (type === 'bye' || type === 'legBye') {
      setByePickerOpen(type)
      return
    }
    vibrate()
    recordExtra(type)
    toast.success(type === 'wide' ? 'Wide! +1 run' : 'No ball! +1 run')
  }

  const confirmBye = (runs: number) => {
    vibrate()
    recordExtra(byePickerOpen!, runs)
    toast.success(`${byePickerOpen === 'legBye' ? 'Leg bye' : 'Bye'}! +${runs}`)
    setByePickerOpen(null)
  }

  const openWicket = () => {
    if (current?.pendingBowlerSelection) {
      toast.error('Select a bowler first')
      return
    }
    setOutBatsmanId(strikerId)
    setNewBatsmanId(remainingBatsmen[0]?.id ?? '')
    setWicketOpen(true)
  }

  const confirmWicket = () => {
    if (!newBatsmanId && remainingBatsmen.length > 0) {
      toast.error('Select new batsman')
      return
    }
    vibrate()
    recordWicket(wicketType, outBatsmanId, newBatsmanId)
    toast.success('WICKET!')
    setWicketOpen(false)
  }

  const handleUndo = () => {
    undoLastBall()
    toast('Undone', { icon: '↩️' })
  }

  if (matchStatus === 'innings_break') {
    const firstInnings = innings[0]
    const score = getTotalRuns(firstInnings.balls)
    const wkts = getWicketCount(firstInnings.balls)

    return (
      <PageTransition>
        <h2 className="text-xl font-bold text-heading mb-4">Innings Break</h2>
        <Card className="mb-4">
          <p className="text-secondary text-sm mb-2">1st Innings Complete</p>
          <p className="text-2xl font-bold text-heading">
            {getTeamById(match, firstInnings.battingTeamId).name}{' '}
            {score} / {wkts}
          </p>
          <p className="text-sm text-secondary mt-1">
            Target: {score + 1} runs
          </p>
        </Card>
        <ScorecardScreen embedded />
        <Button fullWidth className="mt-4" onClick={startSecondInnings}>
          Start 2nd Innings
        </Button>
      </PageTransition>
    )
  }

  return (
    <>
      <PageTransition className="pb-28">
        <div className="flex justify-between items-center mb-3">
          <p className="text-xs font-medium text-secondary uppercase tracking-wide">
            {match.title || 'Live Match'}
          </p>
          <button
            type="button"
            onClick={() => setShowScorecard(true)}
            className="flex items-center gap-1 text-primary text-sm font-medium btn-press"
          >
            <BarChart3 size={16} />
            Scorecard
          </button>
        </div>

        {/* Score header */}
        <div className="score-header">
          <p className="score-team">{battingTeam.name}</p>
          <p key={`${totalRuns}-${wickets}`} className="score-line score-update"><span>{totalRuns}</span><span className="wickets"> / {wickets}</span></p>
          <p className="score-overs">{oversDisplay}</p>
          {required && currentInningsIndex === 1 && (
            <p className="target-pill">
              Need {required.runs} runs in {required.balls} balls
            </p>
          )}
        </div>

        {/* This over */}
        <div className="mb-3">
          <p className="section-label">This over</p>
          <div className="over-strip min-h-[34px]">
            {overBalls.length === 0 ? (
              <span className="text-xs text-slate-300">—</span>
            ) : (
              overBalls.map((b, i) => <BallDot key={i} ball={b} />)
            )}
          </div>
        </div>

        {/* Batsmen */}
        <Card className="stats-card mb-3 overflow-hidden">
          <p className="section-label">Batting</p>
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
              <div
                key={id}
                className={`stats-row grid-cols-7 ${idx === 0 ? 'striker' : ''}`}
              >
                <span className="col-span-2 truncate flex items-center gap-1">
                  {idx === 0 && '🏏 '}
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

        {/* Bowler */}
        <Card className="stats-card mb-4 overflow-hidden">
          <p className="section-label">Bowling</p>
          <div className="stats-header grid-cols-6 px-3">
            <span className="col-span-2">Bowler</span>
            <span className="text-center">O</span>
            <span className="text-center">R</span>
            <span className="text-center">W</span>
            <span className="text-center">Eco</span>
          </div>
          <div className="stats-row grid-cols-6 px-3">
            <span className="col-span-2 truncate font-medium">
              {current.currentBowlerId
                ? getPlayerName(match, current.bowlingTeamId, current.currentBowlerId)
                : '—'}
            </span>
            <span className="text-center">{bowlerStats?.oversDisplay ?? '0.0'}</span>
            <span className="text-center">{bowlerStats?.runs ?? 0}</span>
            <span className="text-center">{bowlerStats?.wickets ?? 0}</span>
            <span className={`economy text-center ${!bowlerStats || bowlerStats.economy < 6 ? 'good' : bowlerStats.economy <= 9 ? 'average' : 'expensive'}`}>{bowlerStats?.economy.toFixed(1) ?? '0.0'}</span>
          </div>
        </Card>

        {/* Scoring buttons */}
        <div className="space-y-3">
          <div className="run-buttons">
            {[0, 1, 2, 3, 4, 6].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleRun(r)}
                className={`run-button run-${r}`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {(['wide', 'noBall', 'bye', 'legBye'] as ExtraType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleExtra(type)}
                className="extra-button btn-press"
              >
                {type === 'wide'
                  ? 'Wide'
                  : type === 'noBall'
                    ? 'No Ball'
                    : type === 'bye'
                      ? 'Bye'
                      : 'Leg Bye'}
              </button>
            ))}
          </div>

          <Button fullWidth variant="danger" onClick={openWicket}>
            WICKET
          </Button>

          <button
            type="button"
            onClick={handleUndo}
            className="undo-button w-full flex items-center justify-center gap-1 py-2 btn-press"
          >
            <Undo2 size={16} />
            Undo
          </button>
        </div>
      </PageTransition>

      {/* Bowler selection */}
      <BottomSheet
        open={!!current.pendingBowlerSelection}
        onClose={() => {}}
        title="Select bowler for next over"
      >
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {bowlingTeam.players.map((player) => {
            const stats = getBowlingStats(current.balls, player.id)
            const disabled = player.id === lastBowlerId
            return (
              <button
                key={player.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  selectBowler(player.id)
                  toast.success(`${player.name} bowling`)
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors ${
                  disabled
                    ? 'opacity-40 cursor-not-allowed bg-slate-50'
                    : 'bg-white border border-zinc-200 hover:bg-zinc-100 btn-press'
                }`}
              >
                <span className="font-medium text-heading">{player.name}</span>
                <span className="text-xs text-secondary">
                  {stats.oversDisplay} ov · {stats.runs}r · {stats.wickets}w
                </span>
              </button>
            )
          })}
        </div>
      </BottomSheet>

      {/* Wicket modal */}
      <BottomSheet
        open={wicketOpen}
        onClose={() => setWicketOpen(false)}
        title="Wicket — Dismissal"
      >
        <div className="grid grid-cols-2 gap-2 mb-4">
          {DISMISSAL_TYPES.map((d) => (
            <button
              key={d.type}
              type="button"
              onClick={() => setWicketType(d.type)}
              className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                wicketType === d.type
                  ? 'border-zinc-950 bg-zinc-100 text-zinc-950'
                  : 'border-slate-200 text-secondary'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <p className="text-sm font-medium text-heading mb-2">Out batsman</p>
        <div className="flex gap-2 mb-4">
          {[strikerId, nonStrikerId].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setOutBatsmanId(id)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 ${
                outBatsmanId === id
                  ? 'border-zinc-950 bg-zinc-100'
                  : 'border-slate-200'
              }`}
            >
              {getPlayerById(battingTeam, id)?.name}
            </button>
          ))}
        </div>

        {remainingBatsmen.length > 0 && (
          <>
            <p className="text-sm font-medium text-heading mb-2">New batsman</p>
            <select
              value={newBatsmanId}
              onChange={(e) => setNewBatsmanId(e.target.value)}
              className="w-full border border-slate-200 rounded-xl py-3 px-4 mb-4 focus:ring-2 focus:ring-primary/40 focus:outline-none"
            >
              {remainingBatsmen.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}

        <Button fullWidth variant="danger" onClick={confirmWicket}>
          Confirm Wicket
        </Button>
      </BottomSheet>

      {/* Bye/Leg bye picker */}
      <BottomSheet
        open={!!byePickerOpen}
        onClose={() => setByePickerOpen(null)}
        title={`${byePickerOpen === 'legBye' ? 'Leg Bye' : 'Bye'} — Runs`}
      >
        <div className="flex justify-center gap-3">
          {[1, 2, 3, 4].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => confirmBye(r)}
              className="run-button run-1 btn-press"
            >
              {r}
            </button>
          ))}
        </div>
      </BottomSheet>

      {showScorecard && (
        <ScorecardScreen onClose={() => setShowScorecard(false)} />
      )}
    </>
  )
}
