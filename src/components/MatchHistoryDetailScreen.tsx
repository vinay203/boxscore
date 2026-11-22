import { useState } from 'react'
import {
  ArrowLeft,
  Award,
  Calendar,
  Share2,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { CompletedMatchSummary, Match, Innings, Ball } from '../types'
import { Card } from './ui/Card'
import { ScorecardScreen } from './ScorecardScreen'
import {
  formatScore,
  getLegalBallCount,
  getPlayerById,
  getTeamById,
  getTotalRuns,
  getWicketCount,
} from '../utils/cricket'

interface MatchHistoryDetailScreenProps {
  summary: CompletedMatchSummary
  onBack: () => void
  onDelete: (id: string) => void
  onLoadDemo?: () => void
}

export function MatchHistoryDetailScreen({
  summary,
  onBack,
  onDelete,
  onLoadDemo,
}: MatchHistoryDetailScreenProps) {
  const [activeInningsTab, setActiveInningsTab] = useState<number>(0)
  const [activeViewMode, setActiveViewMode] = useState<'scorecard' | 'timeline' | 'squads'>('scorecard')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const match = summary.match
  const innings = summary.innings
  const hasFullData = !!(match && innings && innings.length > 0)

  const formattedDate = new Date(summary.date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const handleShare = async () => {
    let text = `${summary.title || 'Box Cricket Match'}\n${summary.resultText}\n${summary.team1Name}: ${summary.team1Score}\n${summary.team2Name}: ${summary.team2Score}\nDate: ${formattedDate}`
    if (summary.potm) {
      text += `\nPlayer of the Match: ${summary.potm.name} (${summary.potm.stat})`
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: summary.title || 'Match Result', text })
      } catch {
        // cancelled
      }
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Match summary copied to clipboard!')
    }
  }

  const handleDelete = () => {
    onDelete(summary.id)
    toast.success('Match deleted from history')
    onBack()
  }

  return (
    <div className="page-transition pb-10">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onBack}
          className="back-button btn-press"
          aria-label="Back to History"
        >
          <ArrowLeft size={16} /> Back to History
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="action-btn btn-press"
            title="Share Match Summary"
          >
            <Share2 size={14} /> Share
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="action-btn action-btn--end btn-press"
            title="Delete Match"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal / Prompt */}
      {showDeleteConfirm && (
        <Card className="mb-4 p-4 border-red-200 bg-red-50/50">
          <p className="font-semibold text-sm text-red-900 mb-1">Delete this match from history?</p>
          <p className="text-xs text-red-700 mb-3">This action cannot be undone.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold btn-press hover:bg-red-700"
            >
              Yes, Delete
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 btn-press"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* Match Title & Date Header */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
          <Calendar size={13} />
          <span>{formattedDate}</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 leading-tight">
          {summary.title || `${summary.team1Name} vs ${summary.team2Name}`}
        </h1>
        {match && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="inline-block text-[11px] font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
              {match.overs} Overs Match
            </span>
            <span className="inline-block text-[11px] font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
              {match.playersPerTeam} Players / side
            </span>
            <span className="inline-block text-[11px] font-medium bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
              Limit: {match.wicketLimit} Wickets
            </span>
          </div>
        )}
      </div>

      {/* Winner Banner */}
      <div className="summary-winner text-center mb-4">
        <Trophy className="w-8 h-8 mx-auto mb-2 text-white/80" />
        <p className="team-label mb-1">
          {summary.winnerName ? `${summary.winnerName}` : 'Final Result'}
        </p>
        <p className="result-title text-xl font-extrabold uppercase">
          {summary.resultText}
        </p>
      </div>

      {/* Player of the Match Card */}
      {summary.potm && (
        <Card className="potm-card mb-4 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
                Player of the Match
              </p>
              <p className="font-bold text-base text-gray-900">{summary.potm.name}</p>
              <p className="text-xs text-gray-500">{summary.potm.teamName}</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 bg-amber-50 text-amber-800 rounded-md border border-amber-200">
                <Award size={13} /> {summary.potm.stat}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Head-to-Head Scores */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="p-3 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
            {summary.team1Name}
          </p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{summary.team1Score}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-gray-100 shadow-sm">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
            {summary.team2Name}
          </p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{summary.team2Score}</p>
        </div>
      </div>

      {/* Full Details or Fallback Notice */}
      {!hasFullData ? (
        <Card className="p-5 text-center my-4">
          <p className="text-sm font-semibold text-gray-800 mb-1">
            Legacy Match Summary
          </p>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            This match was recorded in an earlier version before full ball-by-ball and player scoreboards were stored. All matches scored from now on will save complete player names, batting figures, bowling figures, and ball-by-ball timelines.
          </p>
          {onLoadDemo && (
            <button
              type="button"
              onClick={onLoadDemo}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-gray-900 text-white btn-press"
            >
              Preview Sample Match with Full Scorecard
            </button>
          )}
        </Card>
      ) : (
        <>
          {/* Innings Selector Tabs */}
          {innings.length > 1 && (
            <div className="tab-switcher mb-3">
              {innings.map((inn, idx) => {
                const team = getTeamById(match, inn.battingTeamId)
                const runs = getTotalRuns(inn.balls)
                const wkts = getWicketCount(inn.balls)
                const legalBalls = getLegalBallCount(inn.balls)
                const ovStr = `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveInningsTab(idx)}
                    className={`tab-button ${activeInningsTab === idx ? 'active' : ''}`}
                  >
                    <span className="block font-semibold">{team.name}</span>
                    <span className="text-[11px] opacity-80">
                      {formatScore(runs, wkts)} ({ovStr} ov)
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* View Mode Tabs: Scorecard / Ball by Ball / Squads */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setActiveViewMode('scorecard')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all btn-press ${
                activeViewMode === 'scorecard'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              Scorecard
            </button>
            <button
              type="button"
              onClick={() => setActiveViewMode('timeline')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all btn-press ${
                activeViewMode === 'timeline'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              Ball by Ball
            </button>
            <button
              type="button"
              onClick={() => setActiveViewMode('squads')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all btn-press ${
                activeViewMode === 'squads'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              Squads
            </button>
          </div>

          {/* VIEW: SCORECARD */}
          {activeViewMode === 'scorecard' && (
            <div>
              <ScorecardScreen
                embedded
                inningsIndex={activeInningsTab}
                match={match}
                innings={innings}
              />
            </div>
          )}

          {/* VIEW: BALL BY BALL TIMELINE */}
          {activeViewMode === 'timeline' && (
            <BallByBallTimeline
              match={match}
              innings={innings[activeInningsTab]}
            />
          )}

          {/* VIEW: SQUADS / PLAYER ROSTERS */}
          {activeViewMode === 'squads' && (
            <SquadsView match={match} />
          )}
        </>
      )}
    </div>
  )
}

/**
 * Ball-by-Ball / Over-by-Over breakdown component
 */
function BallByBallTimeline({
  match,
  innings,
}: {
  match?: Match
  innings?: Innings
}) {
  if (!match || !innings) return null

  const bowlingTeam = getTeamById(match, innings.bowlingTeamId)
  const battingTeam = getTeamById(match, innings.battingTeamId)

  // Group balls by over
  const oversMap = new Map<number, Ball[]>()
  for (const b of innings.balls) {
    const list = oversMap.get(b.over) || []
    list.push(b)
    oversMap.set(b.over, list)
  }

  const sortedOverIndices = Array.from(oversMap.keys()).sort((a, b) => a - b)

  if (sortedOverIndices.length === 0) {
    return (
      <Card className="p-4 text-center">
        <p className="text-xs text-gray-500">No balls bowled in this innings.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {sortedOverIndices.map((overIndex) => {
        const balls = oversMap.get(overIndex) || []
        const bowlerId = balls[0]?.bowlerId
        const bowler = bowlerId ? getPlayerById(bowlingTeam, bowlerId) : undefined

        let overRuns = 0
        let overWickets = 0

        for (const b of balls) {
          if (b.extraType === 'wide' || b.extraType === 'noBall') {
            overRuns += 1 + b.runs
          } else {
            overRuns += b.runs
          }
          if (b.isWicket) overWickets++
        }

        return (
          <Card key={overIndex} className="p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-bold text-xs text-gray-900">
                  Over {overIndex + 1}
                </span>
                {bowler && (
                  <span className="text-xs text-gray-500 ml-1.5">
                    • {bowler.name}
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                {overRuns} run{overRuns !== 1 ? 's' : ''}{overWickets > 0 ? ` • ${overWickets} wkt${overWickets > 1 ? 's' : ''}` : ''}
              </span>
            </div>

            {/* Ball dots row */}
            <div className="flex flex-wrap gap-2 pt-1">
              {balls.map((b, bIdx) => {
                const batsman = getPlayerById(battingTeam, b.batsmanId)
                let badgeClass = 'ball-dot runs'
                let label = `${b.runs}`

                if (b.isWicket) {
                  badgeClass = 'ball-dot wicket'
                  label = 'W'
                } else if (b.extraType === 'wide') {
                  badgeClass = 'ball-dot wide'
                  label = b.runs > 0 ? `Wd+${b.runs}` : 'Wd'
                } else if (b.extraType === 'noBall') {
                  badgeClass = 'ball-dot noball'
                  label = b.runs > 0 ? `Nb+${b.runs}` : 'Nb'
                } else if (b.extraType === 'bye') {
                  badgeClass = 'ball-dot'
                  label = `B${b.runs}`
                } else if (b.extraType === 'legBye') {
                  badgeClass = 'ball-dot'
                  label = `Lb${b.runs}`
                } else if (b.runs === 0) {
                  badgeClass = 'ball-dot dot'
                  label = '•'
                } else if (b.runs === 4) {
                  badgeClass = 'ball-dot four'
                  label = '4'
                } else if (b.runs === 6) {
                  badgeClass = 'ball-dot six'
                  label = '6'
                }

                return (
                  <div
                    key={bIdx}
                    className="flex flex-col items-center gap-0.5"
                    title={`${batsman?.name ?? 'Batsman'} faced ${b.isWicket ? `Wicket (${b.wicketType || 'out'})` : `${b.runs} runs`}`}
                  >
                    <div className={badgeClass}>{label}</div>
                    <span className="text-[9px] text-gray-400 truncate max-w-[40px]">
                      {batsman?.name ? batsman.name.split(' ')[0] : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/**
 * Squads and Player Rosters View
 */
function SquadsView({ match }: { match?: Match }) {
  if (!match) return null

  return (
    <div className="space-y-4">
      {/* Team 1 Squad */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
          <Users size={16} className="text-gray-500" />
          <h3 className="font-bold text-sm text-gray-900">{match.team1.name} Squad</h3>
          <span className="text-xs text-gray-400 ml-auto">
            {match.team1.players.length} Players
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {match.team1.players.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-xs font-medium text-gray-800"
            >
              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-bold">
                {idx + 1}
              </span>
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Team 2 Squad */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
          <Users size={16} className="text-gray-500" />
          <h3 className="font-bold text-sm text-gray-900">{match.team2.name} Squad</h3>
          <span className="text-xs text-gray-400 ml-auto">
            {match.team2.players.length} Players
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {match.team2.players.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-xs font-medium text-gray-800"
            >
              <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-bold">
                {idx + 1}
              </span>
              <span className="truncate">{p.name}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
