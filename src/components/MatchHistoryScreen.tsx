import { ArrowLeft } from 'lucide-react'
import { PageTransition } from './ui/PageTransition'
import { Card } from './ui/Card'
import { useMatchStore } from '../store/matchStore'

export function MatchHistoryScreen() {
  const { matchHistory, setScreen } = useMatchStore()

  return (
    <PageTransition>
      <button
        type="button"
        onClick={() => setScreen('home')}
        className="flex items-center gap-1 text-secondary text-sm mb-4 btn-press"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <h1 className="text-2xl font-bold text-heading mb-4">Match History</h1>

      {matchHistory.length === 0 ? (
        <Card>
          <p className="text-secondary text-sm text-center py-8">
            No completed matches yet. Play your first match!
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {matchHistory.map((m) => (
            <Card key={m.id} className="text-left">
              <p className="font-semibold text-heading text-sm">{m.resultText}</p>
              <p className="text-xs text-secondary mt-1">
                {m.team1Name} {m.team1Score} vs {m.team2Name} {m.team2Score}
              </p>
              <p className="text-[10px] text-slate-400 mt-2">
                {new Date(m.date).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  )
}
