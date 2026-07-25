import { ArrowLeft } from 'lucide-react'
import { PageTransition } from './ui/PageTransition'
import { Card } from './ui/Card'
import { useMatchStore } from '../store/matchStore'

export function MatchHistoryScreen() {
  const { matchHistory, setScreen } = useMatchStore()

  return (
    <PageTransition>
      <button type="button" onClick={() => setScreen('home')} className="back-button mb-4 btn-press">
        <ArrowLeft size={16} /> Back
      </button>
      <h1 className="text-2xl font-bold mb-4" style={{ color: '#111' }}>Match History</h1>
      {matchHistory.length === 0 ? (
        <Card>
          <p className="text-sm text-center py-8" style={{ color: '#999' }}>No completed matches yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {matchHistory.map((m) => (
            <Card key={m.id} className="text-left">
              <p className="font-semibold text-sm" style={{ color: '#111' }}>{m.resultText}</p>
              <p className="text-xs mt-1" style={{ color: '#888' }}>{m.team1Name} {m.team1Score} vs {m.team2Name} {m.team2Score}</p>
              <p className="text-[10px] mt-2" style={{ color: '#CCC' }}>
                {new Date(m.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  )
}
