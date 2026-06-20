import { useState } from 'react'
import { ChevronDown, ChevronUp, Share2, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { PageTransition } from './ui/PageTransition'
import { ScorecardScreen } from './ScorecardScreen'
import { useMatchStore } from '../store/matchStore'
import {
  getMatchResult,
  getPlayerOfTheMatch,
  getTeamById,
  getTotalRuns,
  getWicketCount,
} from '../utils/cricket'

export function MatchSummaryScreen() {
  const { match, innings, resetToHome } = useMatchStore()
  const [expandedInnings, setExpandedInnings] = useState<number | null>(null)

  if (!match) return null

  const result = getMatchResult(match, innings)
  const potm = getPlayerOfTheMatch(match, innings)

  const shareScore = async () => {
    const team1Inn = innings.find((i) => i.battingTeamId === match.team1.id)
    const team2Inn = innings.find((i) => i.battingTeamId === match.team2.id)
    const text = [
      match.title || 'Box Cricket Match',
      `${match.team1.name}: ${team1Inn ? `${getTotalRuns(team1Inn.balls)}/${getWicketCount(team1Inn.balls)}` : '-'}`,
      `${match.team2.name}: ${team2Inn ? `${getTotalRuns(team2Inn.balls)}/${getWicketCount(team2Inn.balls)}` : '-'}`,
      result.text,
      `Player of the Match: ${potm.name} (${potm.stat})`,
    ].join('\n')

    if (navigator.share) {
      try {
        await navigator.share({ title: 'BoxScore', text })
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(text)
      toast.success('Score copied to clipboard!')
    }
  }

  return (
    <PageTransition>
      <div className="summary-winner text-center mb-6 shadow-card">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => <i key={i} style={{ left: `${7 + i * 8}%`, animationDelay: `${i * 0.1}s` }} />)}
        </div>
        <Trophy className="w-10 h-10 mx-auto mb-3" />
        <p className="team-label mb-2">{result.winnerId ? getTeamById(match, result.winnerId).name : 'Final result'}</p>
        <p className="result-title">{result.text.toUpperCase()}</p>
      </div>

      <Card className="potm-card mb-4">
        <p className="text-xs font-medium text-secondary uppercase mb-2">
          Player of the Match
        </p>
        <p className="font-bold text-heading text-lg">{potm.name}</p>
        <p className="text-sm text-secondary">{potm.teamName}</p>
        <p className="text-heading font-semibold text-sm mt-1">{potm.stat}</p>
      </Card>

      {innings.map((inn, i) => {
        const team = getTeamById(match, inn.battingTeamId)
        const runs = getTotalRuns(inn.balls)
        const wkts = getWicketCount(inn.balls)
        const expanded = expandedInnings === i

        return (
          <Card key={i} className="mb-3 p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedInnings(expanded ? null : i)}
              className="w-full flex items-center justify-between p-4 text-left btn-press"
            >
              <div>
                <p className="font-semibold text-heading">{team.name}</p>
                <p className="text-sm text-secondary">
                  {runs} / {wkts} — Innings {i + 1}
                </p>
              </div>
              {expanded ? (
                <ChevronUp className="text-secondary" size={20} />
              ) : (
                <ChevronDown className="text-secondary" size={20} />
              )}
            </button>
            {expanded && (
              <div className="border-t border-slate-100">
                <ScorecardScreen embedded inningsIndex={i} />
              </div>
            )}
          </Card>
        )
      })}

      <div className="flex flex-col gap-3 mt-4 pb-4">
        <Button fullWidth onClick={resetToHome}>
          New Match
        </Button>
        <Button
          fullWidth
          variant="secondary"
          onClick={shareScore}
          className="flex items-center justify-center gap-2"
        >
          <Share2 size={18} />
          Share Score
        </Button>
      </div>
    </PageTransition>
  )
}
