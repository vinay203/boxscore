import type { CompletedMatchSummary, Match, Innings, Ball } from '../types'

export function createDemoMatch(): CompletedMatchSummary {
  const team1Id = 'team-royals-1'
  const team2Id = 'team-strikers-2'

  const t1Players = [
    { id: 'p-1', name: 'Rohit Sharma' },
    { id: 'p-2', name: 'Virat Kohli' },
    { id: 'p-3', name: 'Surya Kumar' },
    { id: 'p-4', name: 'Hardik Pandya' },
    { id: 'p-5', name: 'Rishabh Pant' },
    { id: 'p-6', name: 'Jasprit Bumrah' },
  ]

  const t2Players = [
    { id: 'p-7', name: 'Shubman Gill' },
    { id: 'p-8', name: 'KL Rahul' },
    { id: 'p-9', name: 'MS Dhoni' },
    { id: 'p-10', name: 'Ravindra Jadeja' },
    { id: 'p-11', name: 'Mohammed Shami' },
    { id: 'p-12', name: 'Mohammed Siraj' },
  ]

  const match: Match = {
    title: 'Box Cricket Championship Final',
    overs: 6,
    wicketLimit: 5,
    playersPerTeam: 6,
    team1: { id: team1Id, name: 'Royals', players: t1Players },
    team2: { id: team2Id, name: 'Strikers', players: t2Players },
    tossWinnerId: team1Id,
    battingFirstId: team1Id,
  }

  // Innings 1: Royals bat, Strikers bowl
  // Over 1 (Shami to Rohit & Virat): 1, 4, 0, 1, 6, 2 = 14 runs
  // Over 2 (Siraj to Rohit & Virat): 0, W (Rohit bowled), 1, 4, 1, 0 = 6 runs, 1 wkt
  // Over 3 (Jadeja to Virat & Surya): 1, 2, 4, 1, 1, 1 = 10 runs
  // Over 4 (Shami to Virat & Surya): 6, 1, 0, W (Surya caught), 2, 1 = 10 runs, 1 wkt
  // Over 5 (Siraj to Virat & Hardik): 1, Wd, 1, 4, 0, 1, 1 = 9 runs
  // Over 6 (Jadeja to Virat & Hardik): 2, 1, W (Virat run out), 1, 1, 0 = 5 runs, 1 wkt
  // Total Innings 1: 54/3 in 6.0 overs
  const inn1Balls: Ball[] = [
    // Over 1 - Bowler Shami (p-11)
    { over: 0, ball: 1, batsmanId: 'p-1', bowlerId: 'p-11', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 2, batsmanId: 'p-2', bowlerId: 'p-11', runs: 4, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 3, batsmanId: 'p-2', bowlerId: 'p-11', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 4, batsmanId: 'p-2', bowlerId: 'p-11', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 5, batsmanId: 'p-1', bowlerId: 'p-11', runs: 6, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 6, batsmanId: 'p-1', bowlerId: 'p-11', runs: 2, isWicket: false, isLegalDelivery: true },

    // Over 2 - Bowler Siraj (p-12)
    { over: 1, ball: 1, batsmanId: 'p-1', bowlerId: 'p-12', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 2, batsmanId: 'p-1', bowlerId: 'p-12', runs: 0, isWicket: true, wicketType: 'bowled', outBatsmanId: 'p-1', isLegalDelivery: true },
    { over: 1, ball: 3, batsmanId: 'p-3', bowlerId: 'p-12', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 4, batsmanId: 'p-2', bowlerId: 'p-12', runs: 4, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 5, batsmanId: 'p-2', bowlerId: 'p-12', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 6, batsmanId: 'p-3', bowlerId: 'p-12', runs: 0, isWicket: false, isLegalDelivery: true },

    // Over 3 - Bowler Jadeja (p-10)
    { over: 2, ball: 1, batsmanId: 'p-2', bowlerId: 'p-10', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 2, batsmanId: 'p-3', bowlerId: 'p-10', runs: 2, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 3, batsmanId: 'p-3', bowlerId: 'p-10', runs: 4, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 4, batsmanId: 'p-3', bowlerId: 'p-10', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 5, batsmanId: 'p-2', bowlerId: 'p-10', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 6, batsmanId: 'p-3', bowlerId: 'p-10', runs: 1, isWicket: false, isLegalDelivery: true },

    // Over 4 - Bowler Shami (p-11)
    { over: 3, ball: 1, batsmanId: 'p-3', bowlerId: 'p-11', runs: 6, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 2, batsmanId: 'p-3', bowlerId: 'p-11', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 3, batsmanId: 'p-2', bowlerId: 'p-11', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 4, batsmanId: 'p-2', bowlerId: 'p-11', runs: 0, isWicket: true, wicketType: 'caught', outBatsmanId: 'p-2', isLegalDelivery: true },
    { over: 3, ball: 5, batsmanId: 'p-4', bowlerId: 'p-11', runs: 2, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 6, batsmanId: 'p-4', bowlerId: 'p-11', runs: 1, isWicket: false, isLegalDelivery: true },

    // Over 5 - Bowler Siraj (p-12)
    { over: 4, ball: 1, batsmanId: 'p-4', bowlerId: 'p-12', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 2, batsmanId: 'p-3', bowlerId: 'p-12', runs: 0, extraType: 'wide', isWicket: false, isLegalDelivery: false },
    { over: 4, ball: 2, batsmanId: 'p-3', bowlerId: 'p-12', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 3, batsmanId: 'p-4', bowlerId: 'p-12', runs: 4, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 4, batsmanId: 'p-4', bowlerId: 'p-12', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 5, batsmanId: 'p-4', bowlerId: 'p-12', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 6, batsmanId: 'p-3', bowlerId: 'p-12', runs: 1, isWicket: false, isLegalDelivery: true },

    // Over 6 - Bowler Jadeja (p-10)
    { over: 5, ball: 1, batsmanId: 'p-3', bowlerId: 'p-10', runs: 2, isWicket: false, isLegalDelivery: true },
    { over: 5, ball: 2, batsmanId: 'p-3', bowlerId: 'p-10', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 5, ball: 3, batsmanId: 'p-4', bowlerId: 'p-10', runs: 0, isWicket: true, wicketType: 'runOut', outBatsmanId: 'p-4', isLegalDelivery: true },
    { over: 5, ball: 4, batsmanId: 'p-5', bowlerId: 'p-10', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 5, ball: 5, batsmanId: 'p-3', bowlerId: 'p-10', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 5, ball: 6, batsmanId: 'p-5', bowlerId: 'p-10', runs: 0, isWicket: false, isLegalDelivery: true },
  ]

  // Innings 2: Strikers chase target 55
  // Over 1 (Bumrah to Gill & Rahul): 1, 0, 4, 1, 0, 2 = 8 runs
  // Over 2 (Hardik to Gill & Rahul): 6, 1, 1, 4, 0, 1 = 13 runs
  // Over 3 (Bumrah to Gill & Rahul): 0, W (Gill caught), 1, 1, 0, 1 = 3 runs, 1 wkt
  // Over 4 (Hardik to Rahul & Dhoni): 4, 6, 1, 2, 1, 1 = 15 runs
  // Over 5 (Surya to Rahul & Dhoni): 1, W (Rahul bowled), 4, 1, 6, 1 = 13 runs, 1 wkt
  // Over 6 (Bumrah to Dhoni & Jadeja): 2, 4 (Dhoni finishes match!) = 6 runs
  // Total Innings 2: 58/2 in 5.2 overs (Strikers win)
  const inn2Balls: Ball[] = [
    // Over 1 - Bowler Bumrah (p-6)
    { over: 0, ball: 1, batsmanId: 'p-7', bowlerId: 'p-6', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 2, batsmanId: 'p-8', bowlerId: 'p-6', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 3, batsmanId: 'p-8', bowlerId: 'p-6', runs: 4, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 4, batsmanId: 'p-8', bowlerId: 'p-6', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 5, batsmanId: 'p-7', bowlerId: 'p-6', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 0, ball: 6, batsmanId: 'p-7', bowlerId: 'p-6', runs: 2, isWicket: false, isLegalDelivery: true },

    // Over 2 - Bowler Hardik (p-4)
    { over: 1, ball: 1, batsmanId: 'p-8', bowlerId: 'p-4', runs: 6, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 2, batsmanId: 'p-8', bowlerId: 'p-4', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 3, batsmanId: 'p-7', bowlerId: 'p-4', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 4, batsmanId: 'p-8', bowlerId: 'p-4', runs: 4, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 5, batsmanId: 'p-8', bowlerId: 'p-4', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 1, ball: 6, batsmanId: 'p-8', bowlerId: 'p-4', runs: 1, isWicket: false, isLegalDelivery: true },

    // Over 3 - Bowler Bumrah (p-6)
    { over: 2, ball: 1, batsmanId: 'p-8', bowlerId: 'p-6', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 2, batsmanId: 'p-8', bowlerId: 'p-6', runs: 0, isWicket: true, wicketType: 'caught', outBatsmanId: 'p-8', isLegalDelivery: true },
    { over: 2, ball: 3, batsmanId: 'p-9', bowlerId: 'p-6', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 4, batsmanId: 'p-7', bowlerId: 'p-6', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 5, batsmanId: 'p-9', bowlerId: 'p-6', runs: 0, isWicket: false, isLegalDelivery: true },
    { over: 2, ball: 6, batsmanId: 'p-9', bowlerId: 'p-6', runs: 1, isWicket: false, isLegalDelivery: true },

    // Over 4 - Bowler Hardik (p-4)
    { over: 3, ball: 1, batsmanId: 'p-9', bowlerId: 'p-4', runs: 4, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 2, batsmanId: 'p-9', bowlerId: 'p-4', runs: 6, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 3, batsmanId: 'p-9', bowlerId: 'p-4', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 4, batsmanId: 'p-7', bowlerId: 'p-4', runs: 2, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 5, batsmanId: 'p-7', bowlerId: 'p-4', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 3, ball: 6, batsmanId: 'p-9', bowlerId: 'p-4', runs: 1, isWicket: false, isLegalDelivery: true },

    // Over 5 - Bowler Surya (p-3)
    { over: 4, ball: 1, batsmanId: 'p-9', bowlerId: 'p-3', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 2, batsmanId: 'p-7', bowlerId: 'p-3', runs: 0, isWicket: true, wicketType: 'bowled', outBatsmanId: 'p-7', isLegalDelivery: true },
    { over: 4, ball: 3, batsmanId: 'p-10', bowlerId: 'p-3', runs: 4, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 4, batsmanId: 'p-10', bowlerId: 'p-3', runs: 1, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 5, batsmanId: 'p-9', bowlerId: 'p-3', runs: 6, isWicket: false, isLegalDelivery: true },
    { over: 4, ball: 6, batsmanId: 'p-9', bowlerId: 'p-3', runs: 1, isWicket: false, isLegalDelivery: true },

    // Over 6 - Bowler Bumrah (p-6)
    { over: 5, ball: 1, batsmanId: 'p-9', bowlerId: 'p-6', runs: 2, isWicket: false, isLegalDelivery: true },
    { over: 5, ball: 2, batsmanId: 'p-9', bowlerId: 'p-6', runs: 4, isWicket: false, isLegalDelivery: true },
  ]

  const innings: Innings[] = [
    {
      battingTeamId: team1Id,
      bowlingTeamId: team2Id,
      balls: inn1Balls,
      currentBatsmanIds: ['p-3', 'p-5'],
      currentBowlerId: 'p-10',
      status: 'complete',
      pendingBowlerSelection: false,
    },
    {
      battingTeamId: team2Id,
      bowlingTeamId: team1Id,
      balls: inn2Balls,
      currentBatsmanIds: ['p-9', 'p-10'],
      currentBowlerId: 'p-6',
      status: 'complete',
      pendingBowlerSelection: false,
    },
  ]

  return {
    id: 'demo-match-sample',
    date: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    title: 'Box Cricket Championship Final',
    winnerName: 'Strikers',
    resultText: 'Strikers wins by 3 wickets',
    team1Name: 'Royals',
    team1Score: '54 / 3 (6.0 ov)',
    team2Name: 'Strikers',
    team2Score: '58 / 2 (5.2 ov)',
    match,
    innings,
    potm: {
      name: 'MS Dhoni',
      teamName: 'Strikers',
      stat: '27* runs (11b) • 2x4, 2x6',
    },
  }
}
