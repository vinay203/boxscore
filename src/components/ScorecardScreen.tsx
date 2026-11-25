import { useState } from 'react'
import { X } from 'lucide-react'
import { Card } from './ui/Card'
import { useMatchStore } from '../store/matchStore'
import { getInningsSummary } from '../engine'
import { migrateLegacyInnings } from '../store/persistence'
import type { Match, Innings } from '../types'

interface ScorecardScreenProps {
  onClose?: () => void
  embedded?: boolean
  inningsIndex?: number
  match?: Match
  innings?: Innings[]
}

export function ScorecardScreen({
  onClose,
  embedded,
  inningsIndex: propInningsIndex,
  match: propMatch,
  innings: propInnings,
}: ScorecardScreenProps) {
  const store = useMatchStore()
  const match = propMatch ?? store.match
  const rawInnings = propInnings ?? store.innings
  const currentInningsIndex = propInnings ? 0 : store.currentInningsIndex
  const [tab, setTab] = useState<'batting' | 'bowling'>('batting')
  const [internalInningsTab, setInternalInningsTab] = useState(currentInningsIndex)
  const inningsTab = propInningsIndex ?? internalInningsTab

  if (!match) return null
  const innings = rawInnings.map((inn, idx) =>
    migrateLegacyInnings(inn, match, rawInnings, idx),
  )
  const inningsData = innings[inningsTab]
  if (!inningsData) return null

  const summary = getInningsSummary(match, innings, inningsTab)
  const currentIds = inningsData.currentBatsmanIds

  return (
    <div className={embedded ? '' : 'fixed inset-0 z-50 max-w-[430px] mx-auto overflow-y-auto'} style={embedded ? {} : { background: '#FAFAFA' }}>
      <div className="p-5">
        {!embedded && onClose && (
          <button type="button" onClick={onClose} className="absolute top-4 right-5 p-2 btn-press" style={{ color: '#BBB' }}>
            <X size={20} />
          </button>
        )}
        <h2 className="text-xl font-bold mb-1" style={{ color: '#111' }}>Scorecard</h2>
        <p className="text-sm mb-4" style={{ color: '#999' }}>
          {summary.runs} / {summary.wickets} ({inningsTab === 0 ? '1st' : '2nd'} innings)
        </p>

        {innings.length > 1 && propInningsIndex === undefined && (
          <div className="tab-switcher">
            {innings.map((_, i) => (
              <button key={i} type="button" onClick={() => setInternalInningsTab(i)} className={`tab-button ${inningsTab === i ? 'active' : ''}`}>
                Innings {i + 1}
              </button>
            ))}
          </div>
        )}

        <div className="tab-switcher">
          <button type="button" onClick={() => setTab('batting')} className={`tab-button ${tab === 'batting' ? 'active' : ''}`}>Batting</button>
          <button type="button" onClick={() => setTab('bowling')} className={`tab-button ${tab === 'bowling' ? 'active' : ''}`}>Bowling</button>
        </div>

        {tab === 'batting' && (
          <Card className="p-0 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="score-table w-full text-xs">
                <thead>
                  <tr style={{ background: '#F5F5F5' }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: '#BBB' }}>Player</th>
                    <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>R</th>
                    <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>B</th>
                    <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>4s</th>
                    <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>6s</th>
                    <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>SR</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.batting.map((player) => {
                    if (player.status === 'didNotBat') return null
                    const isCurrent = currentIds.includes(player.id)
                    const isOut = player.status === 'out'
                    return (
                      <tr key={player.id} className={`${isCurrent && inningsData.status === 'live' ? 'current-batsman' : ''} ${isOut ? 'out-batsman' : ''}`}>
                        <td className="px-3 py-2">
                          <span className={isCurrent ? 'font-bold' : ''}>{player.name}</span>
                          {player.dismissalText && <p className="text-[10px]" style={{ color: '#BBB' }}>{player.dismissalText}</p>}
                        </td>
                        <td className="text-center px-2 py-2 font-semibold">{player.runs}</td>
                        <td className="text-center px-2 py-2">{player.ballsFaced}</td>
                        <td className="text-center px-2 py-2">{player.fours}</td>
                        <td className="text-center px-2 py-2">{player.sixes}</td>
                        <td className="text-center px-2 py-2">{player.strikeRate.toFixed(0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {summary.didNotBat.length > 0 && (
              <p className="px-3 py-2 text-xs italic" style={{ color: '#CCC', borderTop: '1px solid #F0F0F0' }}>
                Did not bat: {summary.didNotBat.join(', ')}
              </p>
            )}
            <p className="px-3 py-2 text-xs" style={{ color: '#999', borderTop: '1px solid #F0F0F0' }}>
              Extras: {summary.extras.total} (w {summary.extras.wides}, nb {summary.extras.noBalls}, b {summary.extras.byes}, lb {summary.extras.legByes})
            </p>
            {summary.fallOfWickets.length > 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: '#999', borderTop: '1px solid #F0F0F0' }}>
                FOW: {summary.fallOfWickets.map((f) => `${f.wicket}-${f.score} (${f.playerName}, ${f.oversDisplay} ov)`).join(', ')}
              </p>
            )}
          </Card>
        )}

        {tab === 'bowling' && (
          <Card className="p-0 overflow-hidden">
            <table className="score-table w-full text-xs">
              <thead>
                <tr style={{ background: '#F5F5F5' }}>
                  <th className="text-left px-3 py-2 font-medium" style={{ color: '#BBB' }}>Bowler</th>
                  <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>O</th>
                  <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>M</th>
                  <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>R</th>
                  <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>W</th>
                  <th className="px-2 py-2 font-medium" style={{ color: '#BBB' }}>Eco</th>
                </tr>
              </thead>
              <tbody>
                {summary.bowling.map((bowler) => (
                  <tr key={bowler.id} style={{ borderTop: '1px solid #F0F0F0' }}>
                    <td className="px-3 py-2 font-medium">{bowler.name}</td>
                    <td className="text-center px-2 py-2">{bowler.oversDisplay}</td>
                    <td className="text-center px-2 py-2">{bowler.maidens}</td>
                    <td className="text-center px-2 py-2">{bowler.runs}</td>
                    <td className="text-center px-2 py-2">{bowler.wickets}</td>
                    <td className={`text-center px-2 py-2 ${bowler.economy < 6 ? 'economy good' : bowler.economy <= 9 ? 'economy average' : 'economy expensive'}`}>
                      {bowler.economy.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}
