import { useState } from 'react'
import { X } from 'lucide-react'
import { Card } from './ui/Card'
import { useMatchStore } from '../store/matchStore'
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
}

export function ScorecardScreen({ onClose, embedded, inningsIndex: propInningsIndex }: ScorecardScreenProps) {
  const { match, innings, currentInningsIndex } = useMatchStore()
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

  const content = (
    <div className={embedded ? '' : 'fixed inset-0 z-50 bg-[#f5f5f7] max-w-[430px] mx-auto overflow-y-auto'}>
      <div className="p-5">
        {!embedded && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-5 p-2 text-secondary btn-press"
          >
            <X size={22} />
          </button>
        )}

        <h2 className="text-xl font-bold text-heading mb-1">Scorecard</h2>
        <p className="text-sm text-secondary mb-4">
          {getTotalRuns(inningsData.balls)} / {getWicketCount(inningsData.balls)} ({inningsTab + 1}st innings)
        </p>

        {innings.length > 1 && propInningsIndex === undefined && (
          <div className="tab-switcher">
            {innings.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInternalInningsTab(i)}
                className={`tab-button ${inningsTab === i ? 'active' : ''}`}
              >
                Innings {i + 1}
              </button>
            ))}
          </div>
        )}

        <div className="tab-switcher">
          <button
            type="button"
            onClick={() => setTab('batting')}
            className={`tab-button ${tab === 'batting' ? 'active' : ''}`}
          >
            Batting
          </button>
          <button
            type="button"
            onClick={() => setTab('bowling')}
            className={`tab-button ${tab === 'bowling' ? 'active' : ''}`}
          >
            Bowling
          </button>
        </div>

        {tab === 'batting' && (
          <Card className="p-0 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="score-table w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-secondary uppercase">
                    <th className="text-left px-3 py-2 font-medium">Player</th>
                    <th className="px-2 py-2 font-medium">R</th>
                    <th className="px-2 py-2 font-medium">B</th>
                    <th className="px-2 py-2 font-medium">4s</th>
                    <th className="px-2 py-2 font-medium">6s</th>
                    <th className="px-2 py-2 font-medium">SR</th>
                  </tr>
                </thead>
                <tbody>
                  {battingTeam.players.map((player) => {
                    const stats = getBattingStats(
                      inningsData.balls,
                      player.id,
                      battingTeam.players,
                    )
                    const isCurrent = currentIds.includes(player.id)
                    const hasBatted = battedIds.has(player.id) || stats.isOut

                    if (!hasBatted && !stats.isOut) return null

                    return (
                      <tr
                        key={player.id}
                        className={`${
                          isCurrent && inningsData.status === 'live'
                            ? 'bg-[#f8f8f8] font-semibold'
                            : ''
                        } ${stats.isOut ? 'opacity-45' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <span className={isCurrent ? 'font-bold' : ''}>
                            {player.name}
                          </span>
                          {stats.dismissal && (
                            <p className="text-[10px] text-secondary">{stats.dismissal}</p>
                          )}
                        </td>
                        <td className="text-center px-2 py-2">{stats.runs}</td>
                        <td className="text-center px-2 py-2">{stats.ballsFaced}</td>
                        <td className="text-center px-2 py-2">{stats.fours}</td>
                        <td className="text-center px-2 py-2">{stats.sixes}</td>
                        <td className="text-center px-2 py-2">
                          {stats.strikeRate.toFixed(0)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {didNotBat.length > 0 && (
              <p className="px-3 py-2 text-xs italic text-[#a1a1aa] border-t border-slate-50">
                Did not bat: {didNotBat.map((p) => p.name).join(', ')}
              </p>
            )}
            <p className="px-3 py-2 text-xs text-secondary border-t border-slate-50">
              Extras: {extras.total} (w {extras.wides}, nb {extras.noBalls}, b {extras.byes}, lb {extras.legByes})
            </p>
            {fow.length > 0 && (
              <p className="px-3 py-2 text-xs text-secondary border-t border-slate-50">
                FOW: {fow.map((f) => `${f.wicket}-${f.score} (${f.playerName}, ${f.overDisplay} ov)`).join(', ')}
              </p>
            )}
          </Card>
        )}

        {tab === 'bowling' && (
          <Card className="p-0 overflow-hidden">
            <table className="score-table w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-secondary uppercase">
                  <th className="text-left px-3 py-2 font-medium">Bowler</th>
                  <th className="px-2 py-2 font-medium">O</th>
                  <th className="px-2 py-2 font-medium">M</th>
                  <th className="px-2 py-2 font-medium">R</th>
                  <th className="px-2 py-2 font-medium">W</th>
                  <th className="px-2 py-2 font-medium">Eco</th>
                </tr>
              </thead>
              <tbody>
                {bowlingTeam.players.map((player) => {
                  const stats = getBowlingStats(inningsData.balls, player.id)
                  if (stats.legalBalls === 0 && stats.runs === 0) return null
                  return (
                    <tr key={player.id} className="border-t border-slate-50">
                      <td className="px-3 py-2 font-medium">{player.name}</td>
                      <td className="text-center px-2 py-2">{stats.oversDisplay}</td>
                      <td className="text-center px-2 py-2">{stats.maidens}</td>
                      <td className="text-center px-2 py-2">{stats.runs}</td>
                      <td className="text-center px-2 py-2">{stats.wickets}</td>
                      <td className="text-center px-2 py-2">{stats.economy.toFixed(1)}</td>
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

  return content
}
