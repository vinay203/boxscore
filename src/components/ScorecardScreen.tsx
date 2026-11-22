import { useState } from 'react'
import { X } from 'lucide-react'
import { Card } from './ui/Card'
import { useMatchStore } from '../store/matchStore'
import type { Match, Innings } from '../types'
import {
  getBattingStats,
  getBowlingStats,
  getExtrasBreakdown,
  getFallOfWickets,
  getTeamById,
  getTotalRuns,
  getWicketCount,
} from '../utils/cricket'

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
  const innings = propInnings ?? store.innings
  const currentInningsIndex = propInnings ? 0 : store.currentInningsIndex
  const [tab, setTab] = useState<'batting' | 'bowling'>('batting')
  const [internalInningsTab, setInternalInningsTab] = useState(currentInningsIndex)
  const inningsTab = propInningsIndex ?? internalInningsTab

  if (!match) return null
  const inningsData = innings[inningsTab]
  if (!inningsData) return null

  const battingTeam = getTeamById(match, inningsData.battingTeamId)
  const bowlingTeam = getTeamById(match, inningsData.bowlingTeamId)
  const extras = getExtrasBreakdown(inningsData.balls)
  const fow = getFallOfWickets(inningsData.balls, battingTeam)
  const currentIds = inningsData.currentBatsmanIds

  const battedIds = new Set<string>()
  for (const b of inningsData.balls) {
    if (!b.extraType || b.extraType === 'noBall') battedIds.add(b.batsmanId)
  }
  const didNotBat = battingTeam.players.filter((p) => !battedIds.has(p.id))

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
          {getTotalRuns(inningsData.balls)} / {getWicketCount(inningsData.balls)} ({inningsTab === 0 ? '1st' : '2nd'} innings)
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
                  {battingTeam.players.map((player) => {
                    const stats = getBattingStats(inningsData.balls, player.id, battingTeam.players)
                    const isCurrent = currentIds.includes(player.id)
                    const hasBatted = battedIds.has(player.id) || stats.isOut
                    if (!hasBatted && !stats.isOut) return null
                    return (
                      <tr key={player.id} className={`${isCurrent && inningsData.status === 'live' ? 'current-batsman' : ''} ${stats.isOut ? 'out-batsman' : ''}`}>
                        <td className="px-3 py-2">
                          <span className={isCurrent ? 'font-bold' : ''}>{player.name}</span>
                          {stats.dismissal && <p className="text-[10px]" style={{ color: '#BBB' }}>{stats.dismissal}</p>}
                        </td>
                        <td className="text-center px-2 py-2 font-semibold">{stats.runs}</td>
                        <td className="text-center px-2 py-2">{stats.ballsFaced}</td>
                        <td className="text-center px-2 py-2">{stats.fours}</td>
                        <td className="text-center px-2 py-2">{stats.sixes}</td>
                        <td className="text-center px-2 py-2">{stats.strikeRate.toFixed(0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {didNotBat.length > 0 && (
              <p className="px-3 py-2 text-xs italic" style={{ color: '#CCC', borderTop: '1px solid #F0F0F0' }}>
                Did not bat: {didNotBat.map((p) => p.name).join(', ')}
              </p>
            )}
            <p className="px-3 py-2 text-xs" style={{ color: '#999', borderTop: '1px solid #F0F0F0' }}>
              Extras: {extras.total} (w {extras.wides}, nb {extras.noBalls}, b {extras.byes}, lb {extras.legByes})
            </p>
            {fow.length > 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: '#999', borderTop: '1px solid #F0F0F0' }}>
                FOW: {fow.map((f) => `${f.wicket}-${f.score} (${f.playerName}, ${f.overDisplay} ov)`).join(', ')}
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
                {bowlingTeam.players.map((player) => {
                  const stats = getBowlingStats(inningsData.balls, player.id)
                  if (stats.legalBalls === 0 && stats.runs === 0) return null
                  return (
                    <tr key={player.id} style={{ borderTop: '1px solid #F0F0F0' }}>
                      <td className="px-3 py-2 font-medium">{player.name}</td>
                      <td className="text-center px-2 py-2">{stats.oversDisplay}</td>
                      <td className="text-center px-2 py-2">{stats.maidens}</td>
                      <td className="text-center px-2 py-2">{stats.runs}</td>
                      <td className="text-center px-2 py-2">{stats.wickets}</td>
                      <td className={`text-center px-2 py-2 ${stats.economy < 6 ? 'economy good' : stats.economy <= 9 ? 'economy average' : 'economy expensive'}`}>
                        {stats.economy.toFixed(1)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}
