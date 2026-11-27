import { describe, expect, it } from 'vitest'
import { buildBackup, mergeBackup, parseBackup } from '../backup'
import type { CompletedMatchSummary, PoolPlayer, SavedTeam } from '../../types'

function matchSummary(id: string, names = ['Ravi', 'Arun', 'Name match', 'No match', 'Player 3', 'NoId local']): CompletedMatchSummary {
  const ids = ['ravi', 'arun', 'named', 'missing', 'placeholder', 'no-id']
  const poolIds: (string | undefined)[] = ['backup-ravi', 'backup-arun', 'not-in-backup', 'not-in-backup', 'not-in-backup', undefined]
  return {
    id,
    date: '2026-06-01T00:00:00.000Z',
    team1Name: 'Alpha',
    team2Name: 'Beta',
    winnerName: 'Alpha',
    resultText: 'Alpha won',
    team1Score: '10 / 1',
    team2Score: '9 / 2',
    match: {
      overs: 2,
      wicketLimit: 3,
      playersPerTeam: 5,
      tossWinnerId: 'team-1',
      battingFirstId: 'team-1',
      team1: {
        id: 'team-1', name: 'Alpha', captainId: 'match-ravi',
        players: names.map((name, index) => ({ id: `match-${ids[index]}`, name, ...(poolIds[index] ? { poolId: poolIds[index] } : {}) })),
      },
      team2: { id: 'team-2', name: 'Beta', players: [{ id: 'b1', name: 'Ravi', poolId: 'backup-ravi' }] },
    },
  }
}

function poolPlayer(id: string, name: string): PoolPlayer {
  return { id, name, createdAt: '2026-01-01T00:00:00.000Z' }
}

function parseMatches(matches: CompletedMatchSummary[], players: PoolPlayer[], teams: SavedTeam[], existing: CompletedMatchSummary[] = []) {
  const parsed = parseBackup(buildBackup(matches, players, teams), existing)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed
}

describe('team backup and relinking', () => {
  it('round-trips teams and accepts old backups without teams', () => {
    const team: SavedTeam = { id: 'team-1', name: 'Alpha', playerIds: ['p1', 'p2'], captainId: 'p1' }
    const parsed = parseBackup(buildBackup([matchSummary('m1')], [poolPlayer('p1', 'Ravi')], [team]), [])
    expect(parsed).toMatchObject({ ok: true, teams: [team] })
    expect(parseBackup(buildBackup([matchSummary('old')]), [])).toMatchObject({ ok: true, teams: [] })
    const damaged = JSON.stringify({ app: 'boxscore', exportVersion: 1, matches: [], teams: [{ id: 'bad', name: 'Bad', playerIds: ['p1', 2] }] })
    expect(parseBackup(damaged, [])).toEqual({ ok: false, error: 'A team has damaged data' })
  })

  it('merges players by name, assigns collision-free ids, relinks matches, and never links placeholders', () => {
    const existingHistory = [matchSummary('old')]
    const existingHistoryCopy = structuredClone(existingHistory)
    const localPool = [
      poolPlayer('local-ravi', 'RAVI'), poolPlayer('collision', 'Local ID'),
      poolPlayer('named-local', 'Name match'), poolPlayer('no-id-local', 'NoId local'),
    ]
    const localPoolCopy = structuredClone(localPool)
    const summary = matchSummary('new')
    const parsed = parseMatches(
      [summary],
      [poolPlayer('backup-ravi', 'Ravi'), poolPlayer('backup-arun', 'Arun'), poolPlayer('collision', 'New Name')],
      [],
      existingHistory,
    )
    const merged = mergeBackup(parsed, localPool, [])
    expect(merged.counts).toEqual({ matches: 1, players: 2, teams: 0 })
    expect(merged.pool.find((player) => player.name === 'RAVI')?.id).toBe('local-ravi')
    expect(merged.pool.find((player) => player.name === 'Arun')?.id).toBe('backup-arun')
    expect(merged.pool.find((player) => player.name === 'New Name')?.id).toBe('collision-import-1')
    const players = merged.matches[0]!.match!.team1.players
    expect(players[0]!.poolId).toBe('local-ravi')
    expect(players[1]!.poolId).toBe('backup-arun')
    expect(players[2]!.poolId).toBe('named-local')
    expect(players[3]!.poolId).toBeUndefined()
    expect(players[4]!.poolId).toBeUndefined()
    expect(players[5]!.poolId).toBe('no-id-local')
    expect(merged.matches[0]!.match!.team1.captainId).toBe('match-ravi')
    expect(existingHistory).toEqual(existingHistoryCopy)
    expect(localPool).toEqual(localPoolCopy)
  })

  it('skips named teams, maps ids, drops unmappable ids, and skips teams with fewer than two players', () => {
    const team: SavedTeam = { id: 'new-team', name: 'New XI', playerIds: ['backup-ravi', 'backup-arun', 'unmapped'], captainId: 'backup-arun' }
    const parsed = parseMatches(
      [],
      [poolPlayer('backup-ravi', 'Ravi'), poolPlayer('backup-arun', 'Arun')],
      [
        { id: 'same', name: 'local club', playerIds: ['local-ravi', 'local-arun'] },
        team,
        { id: 'short', name: 'Short XI', playerIds: ['backup-ravi', 'unmapped'] },
      ],
    )
    const localTeams: SavedTeam[] = [{ id: 'local', name: 'Local Club', playerIds: ['local-ravi', 'local-arun'] }]
    const merged = mergeBackup(parsed, [poolPlayer('local-ravi', 'Ravi')], localTeams)
    expect(merged.teams).toEqual([
      localTeams[0],
      { id: 'new-team', name: 'New XI', playerIds: ['local-ravi', 'backup-arun'], captainId: 'backup-arun' },
    ])
    expect(merged.counts).toEqual({ matches: 0, players: 1, teams: 1 })
    expect(localTeams).toEqual([{ id: 'local', name: 'Local Club', playerIds: ['local-ravi', 'local-arun'] }])
  })
})
