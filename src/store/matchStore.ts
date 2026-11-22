import { create } from 'zustand'
import type {
  Ball,
  CompletedMatchSummary,
  ExtraType,
  Innings,
  Match,
  MatchState,
  MatchStatus,
  Screen,
  Team,
  WicketType,
} from '../types'
import {
  clearCurrentMatch,
  clearMatchHistory,
  deleteFromHistory,
  hasResumableMatch,
  loadCurrentMatch,
  loadMatchHistory,
  saveCurrentMatch,
  saveToHistory,
} from './persistence'
import {
  generateId,
  getBallRuns,
  getLegalBallCount,
  getMatchResult,
  getOutPlayerIds,
  getOverBallNumbers,
  getPlayerOfTheMatch,
  getTotalRuns,
  getWicketCount,
  isInningsComplete,
  isSecondInningsComplete,
  formatScore,
  getTeamById,
} from '../utils/cricket'

interface SetupDraft {
  title: string
  overs: number
  wicketLimit: number
  playersPerTeam: number
  team1Name: string
  team1Players: string[]
  team2Name: string
  team2Players: string[]
  tossWinnerTeam: 1 | 2 | null
  tossChoice: 'bat' | 'field'
}

interface AppStore extends MatchState {
  screen: Screen
  setupStep: 1 | 2 | 3
  setupDraft: SetupDraft
  showScorecard: boolean
  showResumePrompt: boolean
  matchHistory: CompletedMatchSummary[]
  selectedHistoryMatchId: string | null

  setScreen: (screen: Screen) => void
  setSelectedHistoryMatchId: (id: string | null) => void
  deleteMatchFromHistory: (id: string) => void
  clearAllMatchHistory: () => void
  setSetupStep: (step: 1 | 2 | 3) => void
  setShowScorecard: (show: boolean) => void
  initApp: () => void
  dismissResumePrompt: () => void
  resumeMatch: () => void
  resetToHome: () => void
  discardCurrentMatch: () => void
  hasResumableMatch: () => boolean
  updateSetupDraft: (partial: Partial<SetupDraft>) => void
  startNewMatch: () => void
  startMatch: () => void
  recordRun: (runs: number) => void
  recordExtra: (type: ExtraType, runs?: number) => void
  recordWicket: (
    wicketType: WicketType,
    outBatsmanId: string,
    newBatsmanId: string,
  ) => void
  selectBowler: (bowlerId: string) => void
  cancelBowlerSelection: () => void
  selectOpeningBatsmen: (strikerId: string, nonStrikerId: string) => void
  cancelBatsmanSelection: () => void
  retireBatsman: (isStriker: boolean, newBatsmanId: string) => void
  updateLiveMatchNames: (
    team1Name: string,
    team1Players: string[],
    team2Name: string,
    team2Players: string[],
  ) => void
  undoLastBall: () => void
  startSecondInnings: () => void
  finishMatch: () => void
  swapBatsmen: () => void
  endInningsEarly: () => void
  changeBowlerRequest: () => void
}

const defaultDraft = (): SetupDraft => ({
  title: '',
  overs: 6,
  wicketLimit: 3,
  playersPerTeam: 6,
  team1Name: '',
  team1Players: Array(6).fill(''),
  team2Name: '',
  team2Players: Array(6).fill(''),
  tossWinnerTeam: null,
  tossChoice: 'bat',
})

function createTeam(name: string, playerNames: string[]): Team {
  return {
    id: generateId(),
    name: name.trim() || 'Team',
    players: playerNames.map((n, i) => ({
      id: generateId(),
      name: n.trim() || `Player ${i + 1}`,
    })),
  }
}

function createInitialInnings(
  battingTeamId: string,
  bowlingTeamId: string,
  battingTeam: Team,
): Innings {
  return {
    battingTeamId,
    bowlingTeamId,
    balls: [],
    currentBatsmanIds: [
      battingTeam.players[0]?.id || '',
      battingTeam.players[1]?.id || '',
    ],
    currentBowlerId: '',
    status: 'live',
    pendingBowlerSelection: true,
    pendingBatsmanSelection: true,
  }
}

function persist(state: MatchState): void {
  saveCurrentMatch(state)
}

function rotateStrike(ids: [string, string]): [string, string] {
  return [ids[1], ids[0]]
}

function checkInningsEnd(
  innings: Innings,
  match: Match,
  inningsIndex: number,
  allInnings: Innings[],
): MatchStatus {
  const target =
    inningsIndex === 1 ? getTotalRuns(allInnings[0].balls) + 1 : null

  const done =
    inningsIndex === 1 && target !== null
      ? isSecondInningsComplete(innings, match, target)
      : isInningsComplete(innings, match)

  if (!done) return 'live'
  return inningsIndex === 0 ? 'innings_break' : 'complete'
}

function applyDelivery(
  current: Innings,
  ball: Ball,
  match: Match,
  inningsIndex: number,
  allInnings: Innings[],
): { innings: Innings; matchStatus: MatchStatus } {
  const newBalls = [...current.balls, ball]
  let batsmanIds: [string, string] = [...current.currentBatsmanIds]
  let pendingBowler = current.pendingBowlerSelection

  const runs = getBallRuns(ball)
  const legalAfter = getLegalBallCount(newBalls)

  let bowlerId = current.currentBowlerId

  if (ball.isLegalDelivery && runs % 2 === 1) {
    batsmanIds = rotateStrike(batsmanIds)
  }

  if (ball.isLegalDelivery && legalAfter > 0 && legalAfter % 6 === 0) {
    batsmanIds = rotateStrike(batsmanIds)
    pendingBowler = true
    bowlerId = ''
  }

  const innings: Innings = {
    ...current,
    balls: newBalls,
    currentBatsmanIds: batsmanIds,
    currentBowlerId: bowlerId,
    pendingBowlerSelection: pendingBowler,
    status: 'live',
  }

  const matchStatus = checkInningsEnd(innings, match, inningsIndex, allInnings)
  if (matchStatus !== 'live') {
    innings.status = 'complete'
  }

  return { innings, matchStatus }
}

function rebuildBatsmenFromBalls(
  balls: Ball[],
  match: Match,
  battingTeamId: string,
): [string, string] {
  const team = battingTeamId === match.team1.id ? match.team1 : match.team2
  let ids: [string, string] = [
    team.players[0]?.id || '',
    team.players[1]?.id || '',
  ]
  let legalCount = 0

  for (let i = 0; i < balls.length; i++) {
    const b = balls[i]
    const runs = getBallRuns(b)

    if (b.isLegalDelivery) {
      legalCount++
      if (runs % 2 === 1) ids = rotateStrike(ids)
      if (legalCount % 6 === 0) ids = rotateStrike(ids)
    }

    if (b.isWicket && b.outBatsmanId) {
      const outSoFar = getOutPlayerIds(balls.slice(0, i + 1))
      const available = team.players.filter(
        (p) => !outSoFar.has(p.id) && p.id !== ids[0] && p.id !== ids[1],
      )
      if (b.outBatsmanId === ids[0] && available[0]) {
        ids = [available[0].id, ids[1]]
      } else if (b.outBatsmanId === ids[1] && available[0]) {
        ids = [ids[0], available[0].id]
      }
    }
  }

  return ids
}

export const useMatchStore = create<AppStore>((set, get) => ({
  match: null,
  innings: [],
  currentInningsIndex: 0,
  matchStatus: 'setup',
  screen: 'home',
  setupStep: 1,
  setupDraft: defaultDraft(),
  showScorecard: false,
  showResumePrompt: false,
  matchHistory: [],
  selectedHistoryMatchId: null,

  setScreen: (screen) => set({ screen }),
  setSelectedHistoryMatchId: (id) => set({ selectedHistoryMatchId: id }),
  setSetupStep: (setupStep) => set({ setupStep }),
  setShowScorecard: (showScorecard) => set({ showScorecard }),

  deleteMatchFromHistory: (id) => {
    deleteFromHistory(id)
    set((state) => ({
      matchHistory: loadMatchHistory(),
      selectedHistoryMatchId: state.selectedHistoryMatchId === id ? null : state.selectedHistoryMatchId,
    }))
  },

  clearAllMatchHistory: () => {
    clearMatchHistory()
    set({
      matchHistory: [],
      selectedHistoryMatchId: null,
    })
  },

  initApp: () => {
    const history = loadMatchHistory()
    const saved = loadCurrentMatch()
    set({
      matchHistory: history,
      showResumePrompt:
        !!saved &&
        !!saved.match &&
        saved.matchStatus !== 'complete' &&
        saved.matchStatus !== 'setup',
    })
  },

  dismissResumePrompt: () => set({ showResumePrompt: false }),

  resumeMatch: () => {
    const saved = loadCurrentMatch()
    if (!saved?.match) return

    let screen: Screen = 'live'
    if (saved.matchStatus === 'complete') screen = 'summary'
    else if (saved.matchStatus === 'innings_break') screen = 'live'

    set({
      ...saved,
      screen,
      showResumePrompt: false,
      setupDraft: defaultDraft(),
      setupStep: 1,
      showScorecard: false,
      matchHistory: loadMatchHistory(),
    })
  },

  resetToHome: () => {
    set({
      match: null,
      innings: [],
      currentInningsIndex: 0,
      matchStatus: 'setup',
      screen: 'home',
      setupStep: 1,
      setupDraft: defaultDraft(),
      showScorecard: false,
      showResumePrompt: hasResumableMatch(),
      matchHistory: loadMatchHistory(),
    })
  },

  discardCurrentMatch: () => {
    clearCurrentMatch()
    set({
      match: null,
      innings: [],
      currentInningsIndex: 0,
      matchStatus: 'setup',
      showResumePrompt: false,
      showScorecard: false,
    })
  },

  hasResumableMatch: () => hasResumableMatch(),

  updateSetupDraft: (partial) =>
    set((s) => ({ setupDraft: { ...s.setupDraft, ...partial } })),

  startNewMatch: () => {
    set({
      screen: 'setup',
      setupStep: 1,
      setupDraft: defaultDraft(),
      match: null,
      innings: [],
      currentInningsIndex: 0,
      matchStatus: 'setup',
      showScorecard: false,
    })
  },

  startMatch: () => {
    const { setupDraft } = get()
    if (!setupDraft.tossWinnerTeam) return

    const team1 = createTeam(setupDraft.team1Name, setupDraft.team1Players)
    const team2 = createTeam(setupDraft.team2Name, setupDraft.team2Players)
    const tossWinnerId =
      setupDraft.tossWinnerTeam === 1 ? team1.id : team2.id
    const otherTeamId = tossWinnerId === team1.id ? team2.id : team1.id
    const battingFirstId =
      setupDraft.tossChoice === 'bat' ? tossWinnerId : otherTeamId

    const match: Match = {
      title: setupDraft.title || undefined,
      overs: setupDraft.overs,
      wicketLimit: setupDraft.wicketLimit,
      playersPerTeam: setupDraft.playersPerTeam,
      team1,
      team2,
      tossWinnerId,
      battingFirstId,
    }

    const battingTeam =
      battingFirstId === team1.id ? team1 : team2
    const bowlingTeam =
      battingFirstId === team1.id ? team2 : team1

    const innings = createInitialInnings(
      battingTeam.id,
      bowlingTeam.id,
      battingTeam,
    )

    const newState: MatchState = {
      match,
      innings: [innings],
      currentInningsIndex: 0,
      matchStatus: 'live',
    }

    persist(newState)
    set({ ...newState, screen: 'live' })
  },

  recordRun: (runs) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const current = innings[currentInningsIndex]
    if (
      current.pendingBowlerSelection ||
      current.pendingBatsmanSelection ||
      !current.currentBowlerId
    )
      return
    if (current.status === 'complete') return

    const { over, ball } = getOverBallNumbers(current.balls)
    const ballRecord: Ball = {
      over,
      ball,
      batsmanId: current.currentBatsmanIds[0],
      bowlerId: current.currentBowlerId,
      runs,
      isWicket: false,
      isLegalDelivery: true,
    }

    const result = applyDelivery(
      current,
      ballRecord,
      match,
      currentInningsIndex,
      innings,
    )

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = result.innings

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: result.matchStatus,
    }

    persist(newState)
    set(newState)
    if (result.matchStatus === 'complete') {
      get().finishMatch()
    }
  },

  recordExtra: (type, runs = 1) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const current = innings[currentInningsIndex]
    if (
      current.pendingBowlerSelection ||
      current.pendingBatsmanSelection ||
      !current.currentBowlerId
    )
      return
    if (current.status === 'complete') return

    const isLegal = type === 'bye' || type === 'legBye'
    const { over, ball } = getOverBallNumbers(current.balls)

    const ballRecord: Ball = {
      over,
      ball,
      batsmanId: current.currentBatsmanIds[0],
      bowlerId: current.currentBowlerId,
      runs: isLegal ? runs : 0,
      extraType: type,
      isWicket: false,
      isLegalDelivery: isLegal,
    }

    const result = applyDelivery(
      current,
      ballRecord,
      match,
      currentInningsIndex,
      innings,
    )

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = result.innings

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: result.matchStatus,
    }

    persist(newState)
    set(newState)
    if (result.matchStatus === 'complete') {
      get().finishMatch()
    }
  },

  recordWicket: (wicketType, outBatsmanId, newBatsmanId) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const current = innings[currentInningsIndex]
    if (
      current.pendingBowlerSelection ||
      current.pendingBatsmanSelection ||
      !current.currentBowlerId
    )
      return
    if (current.status === 'complete') return

    const { over, ball } = getOverBallNumbers(current.balls)
    const strikerWasOut = outBatsmanId === current.currentBatsmanIds[0]

    const ballRecord: Ball = {
      over,
      ball,
      batsmanId: current.currentBatsmanIds[0],
      bowlerId: current.currentBowlerId,
      runs: 0,
      isWicket: true,
      wicketType,
      outBatsmanId,
      isLegalDelivery: true,
    }

    const wicketsAfter = getWicketCount([...current.balls, ballRecord])
    const allOut = wicketsAfter >= match.wicketLimit

    let batsmanIds: [string, string] = [...current.currentBatsmanIds]

    if (!allOut) {
      const battingTeam = getTeamById(match, current.battingTeamId)
      const outSoFar = getOutPlayerIds([...current.balls, ballRecord])
      const available = battingTeam.players.filter(
        (p) => !outSoFar.has(p.id) && !current.currentBatsmanIds.includes(p.id),
      )
      const actualNewId =
        newBatsmanId || available[0]?.id || current.currentBatsmanIds[0]

      if (strikerWasOut) {
        batsmanIds = [actualNewId, current.currentBatsmanIds[1]]
      } else {
        batsmanIds = [current.currentBatsmanIds[0], actualNewId]
      }
    }

    const interim: Innings = { ...current, currentBatsmanIds: batsmanIds }
    const result = applyDelivery(
      interim,
      ballRecord,
      match,
      currentInningsIndex,
      innings,
    )

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = result.innings

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: result.matchStatus,
    }

    persist(newState)
    set(newState)
    if (result.matchStatus === 'complete') {
      get().finishMatch()
    }
  },

  selectBowler: (bowlerId) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match) return

    const current = innings[currentInningsIndex]
    const updated: Innings = {
      ...current,
      currentBowlerId: bowlerId,
      pendingBowlerSelection: false,
    }

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = updated

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: state.matchStatus,
    }

    persist(newState)
    set(newState)
  },

  cancelBowlerSelection: () => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match) return
    const current = innings[currentInningsIndex]
    if (!current) return
    const updated: Innings = {
      ...current,
      pendingBowlerSelection: false,
    }
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = updated
    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: state.matchStatus,
    }
    persist(newState)
    set(newState)
  },

  selectOpeningBatsmen: (strikerId, nonStrikerId) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match) return

    const current = innings[currentInningsIndex]
    const updated: Innings = {
      ...current,
      currentBatsmanIds: [strikerId, nonStrikerId],
      pendingBatsmanSelection: false,
    }

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = updated

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: state.matchStatus,
    }

    persist(newState)
    set(newState)
  },

  cancelBatsmanSelection: () => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match) return
    const current = innings[currentInningsIndex]
    if (!current) return
    const updated: Innings = {
      ...current,
      pendingBatsmanSelection: false,
    }
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = updated
    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: state.matchStatus,
    }
    persist(newState)
    set(newState)
  },

  retireBatsman: (isStriker, newBatsmanId) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const current = innings[currentInningsIndex]
    const updatedIds: [string, string] = isStriker
      ? [newBatsmanId, current.currentBatsmanIds[1]]
      : [current.currentBatsmanIds[0], newBatsmanId]

    const updated: Innings = {
      ...current,
      currentBatsmanIds: updatedIds,
    }

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = updated

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: state.matchStatus,
    }

    persist(newState)
    set(newState)
  },

  updateLiveMatchNames: (t1Name, t1Players, t2Name, t2Players) => {
    const state = get()
    const { match } = state
    if (!match) return

    const newTeam1: Team = {
      ...match.team1,
      name: t1Name.trim() || match.team1.name,
      players: match.team1.players.map((p, i) => ({
        ...p,
        name: t1Players[i]?.trim() || p.name,
      })),
    }

    const newTeam2: Team = {
      ...match.team2,
      name: t2Name.trim() || match.team2.name,
      players: match.team2.players.map((p, i) => ({
        ...p,
        name: t2Players[i]?.trim() || p.name,
      })),
    }

    const updatedMatch: Match = {
      ...match,
      team1: newTeam1,
      team2: newTeam2,
    }

    const newState: MatchState = {
      match: updatedMatch,
      innings: state.innings,
      currentInningsIndex: state.currentInningsIndex,
      matchStatus: state.matchStatus,
    }

    persist(newState)
    set({ ...newState, screen: 'live' })
  },

  undoLastBall: () => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match) return

    const current = innings[currentInningsIndex]
    if (current.balls.length === 0) return

    const newBalls = current.balls.slice(0, -1)
    const legal = getLegalBallCount(newBalls)
    const pendingBowler = legal > 0 && legal % 6 === 0

    const restored: Innings = {
      ...current,
      balls: newBalls,
      status: 'live',
      currentBatsmanIds: rebuildBatsmenFromBalls(
        newBalls,
        match,
        current.battingTeamId,
      ),
      currentBowlerId:
        newBalls.length > 0
          ? newBalls.filter((b) => b.isLegalDelivery).at(-1)?.bowlerId ??
            newBalls[newBalls.length - 1].bowlerId
          : '',
      pendingBowlerSelection: pendingBowler || newBalls.length === 0,
    }

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = restored

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: 'live',
    }

    persist(newState)
    set(newState)
  },

  startSecondInnings: () => {
    const state = get()
    const { match, innings } = state
    if (!match || state.matchStatus !== 'innings_break') return

    const firstInnings = innings[0]
    const battingTeamId = firstInnings.bowlingTeamId
    const bowlingTeamId = firstInnings.battingTeamId
    const battingTeam =
      battingTeamId === match.team1.id ? match.team1 : match.team2

    const secondInnings = createInitialInnings(
      battingTeamId,
      bowlingTeamId,
      battingTeam,
    )

    const newState: MatchState = {
      match,
      innings: [...innings, secondInnings],
      currentInningsIndex: 1,
      matchStatus: 'live',
    }

    persist(newState)
    set({ ...newState, screen: 'live' })
  },

  finishMatch: () => {
    const state = get()
    const { match, innings } = state
    if (!match) return

    const result = getMatchResult(match, innings)
    const team1Inn = innings.find((i) => i.battingTeamId === match.team1.id)
    const team2Inn = innings.find((i) => i.battingTeamId === match.team2.id)
    const potm = getPlayerOfTheMatch(match, innings)

    const summary: CompletedMatchSummary = {
      id: generateId(),
      date: new Date().toISOString(),
      title: match.title,
      winnerName:
        result.winnerId === match.team1.id
          ? match.team1.name
          : result.winnerId === match.team2.id
            ? match.team2.name
            : 'Tie',
      resultText: result.text,
      team1Name: match.team1.name,
      team1Score: team1Inn
        ? formatScore(
            getTotalRuns(team1Inn.balls),
            getWicketCount(team1Inn.balls),
          )
        : '-',
      team2Name: match.team2.name,
      team2Score: team2Inn
        ? formatScore(
            getTotalRuns(team2Inn.balls),
            getWicketCount(team2Inn.balls),
          )
        : '-',
      match: JSON.parse(JSON.stringify(match)),
      innings: JSON.parse(JSON.stringify(innings)),
      potm,
    }

    saveToHistory(summary)
    clearCurrentMatch()

    set({
      matchStatus: 'complete',
      screen: 'summary',
      matchHistory: loadMatchHistory(),
    })
  },

  swapBatsmen: () => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const current = innings[currentInningsIndex]
    const swapped: Innings = {
      ...current,
      currentBatsmanIds: [
        current.currentBatsmanIds[1],
        current.currentBatsmanIds[0],
      ],
    }

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = swapped

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: state.matchStatus,
    }

    persist(newState)
    set(newState)
  },

  endInningsEarly: () => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const current = innings[currentInningsIndex]
    const ended: Innings = {
      ...current,
      status: 'complete',
    }

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = ended

    if (currentInningsIndex === 0) {
      const newState: MatchState = {
        match,
        innings: newInnings,
        currentInningsIndex,
        matchStatus: 'innings_break',
      }
      persist(newState)
      set(newState)
    } else {
      const newState: MatchState = {
        match,
        innings: newInnings,
        currentInningsIndex,
        matchStatus: 'complete',
      }
      persist(newState)
      set(newState)
      get().finishMatch()
    }
  },

  changeBowlerRequest: () => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const current = innings[currentInningsIndex]
    const updated: Innings = {
      ...current,
      pendingBowlerSelection: true,
    }

    const newInnings = [...innings]
    newInnings[currentInningsIndex] = updated

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus: state.matchStatus,
    }

    persist(newState)
    set(newState)
  },
}))
