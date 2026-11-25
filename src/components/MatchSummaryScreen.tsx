import { useState } from 'react'
import { ChevronDown, ChevronUp, Share2, Trophy } from 'lucide-react'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { PageTransition } from './ui/PageTransition'
import { ScorecardScreen } from './ScorecardScreen'
import { useMatchStore } from '../store/matchStore'
import {
  getInningsSummary,
  getMatchResultFromState,
  getPlayerOfTheMatch,
} from '../engine'
import { getTeamById } from '../utils/cricket'

export function MatchSummaryScreen() {
  const { match, innings, resetToHome } = useMatchStore()
  const [expandedInnings, setExpandedInnings] = useState<number | null>(null)

  if (!match) return null

  const result = getMatchResultFromState(match, innings)
  const potm = getPlayerOfTheMatch(match, innings)

  const shareScore = async () => {
    const team1Idx = innings.findIndex((i) => i.battingTeamId === match.team1.id)
    const team2Idx = innings.findIndex((i) => i.battingTeamId === match.team2.id)
    const team1Summary = team1Idx >= 0 ? getInningsSummary(match, innings, team1Idx) : null
    const team2Summary = team2Idx >= 0 ? getInningsSummary(match, innings, team2Idx) : null

    const text = [
      match.title || 'Box Cricket Match',
      `${match.team1.name}: ${team1Summary ? `${team1Summary.runs}/${team1Summary.wickets}` : '-'}`,
      `${match.team2.name}: ${team2Summary ? `${team2Summary.runs}/${team2Summary.wickets}` : '-'}`,
      result.text,
      `Player of the Match: ${potm.name} (${potm.stat})`,
    ].join('\n')

    if (navigator.share) {
      try {
        await navigator.share({ title: 'BoxScore', text })
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(text)
    }
  }

  return (
    <PageTransition>
      <div className="summary-winner text-center mb-6">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <i
              key={i}
              style={{ left: `${7 + i * 8}%`, animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <Trophy
          className="w-9 h-9 mx-auto mb-3"
          style={{ color: '#fff', opacity: 0.8 }}
        />
        <p className="team-label mb-2">
          {result.winnerName ? result.winnerName : 'Final result'}
        </p>
        <p className="result-title">{result.text.toUpperCase()}</p>
      </div>

      <Card className="potm-card mb-4">
        <p
          className="text-xs font-medium uppercase mb-2"
          style={{ color: '#BBB' }}
        >
          Player of the Match
        </p>
        <p className="font-bold text-lg" style={{ color: '#111' }}>
          {potm.name}
        </p>
        <p className="text-sm" style={{ color: '#888' }}>
          {potm.teamName}
        </p>
        <p className="font-semibold text-sm mt-1" style={{ color: '#111' }}>
          {potm.stat}
        </p>
      </Card>

      {innings.map((inn, i) => {
        const team = getTeamById(match, inn.battingTeamId)
        const summary = getInningsSummary(match, innings, i)
        const expanded = expandedInnings === i
        return (
          <Card key={i} className="mb-3 p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedInnings(expanded ? null : i)}
              className="w-full flex items-center justify-between p-4 text-left btn-press"
            >
              <div>
                <p className="font-semibold" style={{ color: '#111' }}>
                  {team.name}
                </p>
                <p className="text-sm" style={{ color: '#888' }}>
                  {summary.runs} / {summary.wickets} — Innings {i + 1}
                </p>
              </div>
              {expanded ? (
                <ChevronUp size={18} style={{ color: '#BBB' }} />
              ) : (
                <ChevronDown size={18} style={{ color: '#BBB' }} />
              )}
            </button>
            {expanded && (
              <div style={{ borderTop: '1px solid #F0F0F0' }}>
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
          <Share2 size={16} /> Share Score
        </Button>
      </div>
    </PageTransition>
  )
}
