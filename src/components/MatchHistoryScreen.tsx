import { useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageTransition } from './ui/PageTransition'
import { Card } from './ui/Card'
import { useMatchStore } from '../store/matchStore'
import { MatchHistoryDetailScreen } from './MatchHistoryDetailScreen'
import { getStoredHistorySizeKB } from '../store/persistence'

export function MatchHistoryScreen() {
  const {
    matchHistory,
    setScreen,
    selectedHistoryMatchId,
    setSelectedHistoryMatchId,
    deleteMatchFromHistory,
    clearAllMatchHistory,
    exportHistoryBackup,
    importHistoryBackup,
  } = useMatchStore()

  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const exportBackup = () => {
    const blob = new Blob([exportHistoryBackup()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `boxscore-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importBackup = async (file?: File) => {
    if (!file) return
    try {
      const result = importHistoryBackup(await file.text())
      if (result.ok) {
        const playersMessage = result.playersAdded ? ` and ${result.playersAdded} players` : ''
        toast.success(`Added ${result.added} matches${playersMessage}, skipped ${result.skipped} already in History`)
      } else {
        toast.error(result.error ?? 'Could not import backup')
      }
    } catch {
      toast.error('Could not read backup file')
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const importButton = (
    <button
      type="button"
      onClick={() => fileInput.current?.click()}
      className="text-xs font-medium text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-1 btn-press px-2 py-1"
    >
      Import
    </button>
  )

  // If a specific match is selected, show the full detail screen
  const selectedMatch = matchHistory.find((m) => m.id === selectedHistoryMatchId)
  if (selectedMatch) {
    return (
      <MatchHistoryDetailScreen
        summary={selectedMatch}
        onBack={() => setSelectedHistoryMatchId(null)}
        onDelete={deleteMatchFromHistory}
      />
    )
  }

  return (
    <PageTransition className="pb-10">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => {
            setSelectedHistoryMatchId(null)
            setScreen('home')
          }}
          className="back-button btn-press"
        >
          <ArrowLeft size={16} /> Back
        </button>

        {matchHistory.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="text-xs font-medium text-gray-400 hover:text-red-600 transition-colors flex items-center gap-1 btn-press px-2 py-1"
              title="Clear all match history"
            >
              <Trash2 size={13} /> Clear All
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#111' }}>
            Match History
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {matchHistory.length} matches saved - about {getStoredHistorySizeKB()} KB
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={exportBackup}
            className="text-xs font-medium text-gray-400 hover:text-gray-900 transition-colors flex items-center gap-1 btn-press px-2 py-1"
          >
            Export
          </button>
          {importButton}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => void importBackup(event.target.files?.[0])}
      />

      {/* Clear All Confirmation prompt */}
      {showClearConfirm && (
        <Card className="mb-4 p-4 border-red-200 bg-red-50/60">
          <p className="font-semibold text-xs text-red-900 mb-1">Clear all match history?</p>
          <p className="text-[11px] text-red-700 mb-3">All saved matches and scorecards will be permanently removed.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                clearAllMatchHistory()
                setShowClearConfirm(false)
              }}
              className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold btn-press hover:bg-red-700"
            >
              Confirm Clear
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="px-3 py-1 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 btn-press"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {matchHistory.length === 0 ? (
        <Card className="text-center py-10 px-4">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-xl">
            🏏
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-1">No completed matches yet</p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">
            Finish a match to see its full scoreboard, player names, and ball-by-ball history here.
          </p>
          <div className="mt-3">{importButton}</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {matchHistory.map((m) => {
            const hasFullData = !!(m.match && m.innings)
            const dateStr = new Date(m.date).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedHistoryMatchId(m.id)}
                className="w-full text-left p-0 border-0 bg-transparent block btn-press group"
              >
                <Card className="p-4 transition-all hover:border-gray-300 hover:shadow-sm relative overflow-hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {m.title && (
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 truncate">
                          {m.title}
                        </p>
                      )}
                      <p className="font-bold text-sm text-gray-900 leading-snug">
                        {m.resultText}
                      </p>
                      <p className="text-xs text-gray-600 mt-1 font-medium">
                        <span className="text-gray-900 font-semibold">{m.team1Name}</span> {m.team1Score}{' '}
                        <span className="text-gray-400 font-normal">vs</span>{' '}
                        <span className="text-gray-900 font-semibold">{m.team2Name}</span> {m.team2Score}
                      </p>

                      <div className="flex items-center gap-2 mt-2.5">
                        <span className="text-[10px] text-gray-400">
                          {dateStr}
                        </span>
                        {hasFullData ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Full Scorecard
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            Summary only
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 text-gray-300 group-hover:text-gray-700 group-hover:translate-x-0.5 transition-all">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </Card>
              </button>
            )
          })}
        </div>
      )}
    </PageTransition>
  )
}
