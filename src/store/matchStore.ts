import { create } from 'zustand'
import {
  deriveForInnings,
  formatScore,
  getInningsSummary,
  getMatchResultFromState,
  getPlayerOfTheMatch,
  syncInnings,
} from '../engine'
import type { DeliveryKind, InningsEvent } from '../engine/types'
import type {
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
import { generateId } from '../utils/cricket'

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
  recordDelivery: (input: {
    delivery: DeliveryKind
    batRuns?: number
    byeRuns?: number
    legByeRuns?: number
    wideExtraRuns?: number
  }) => void
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
    currentBatsmanIds: [
      battingTeam.players[0]?.id || '',
      battingTeam.players[1]?.id || '',
    ],
    currentBowlerId: '',
    status: 'live',
    pendingBowlerSelection: true,
    pendingBatsmanSelection: true,
    events: [],
  }
}

function persist(state: MatchState): void {
  saveCurrentMatch(state)
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

  deleteMatchFromHistory: (id) => {
    deleteFromHistory(id)
    set({ matchHistory: loadMatchHistory() })
  },

  clearAllMatchHistory: () => {
    clearMatchHistory()
    set({ matchHistory: [] })
  },

  setSetupStep: (step) => set({ setupStep: step }),
  setShowScorecard: (show) => set({ showScorecard: show }),

  initApp: () => {
    const history = loadMatchHistory()
    const current = loadCurrentMatch()
    const canResume = hasResumableMatch()

    if (current && canResume) {
      set({
        match: current.match,
        innings: current.innings,
        currentInningsIndex: current.currentInningsIndex,
        matchStatus: current.matchStatus,
        showResumePrompt: true,
        matchHistory: history,
      })
    } else {
      set({ matchHistory: history })
    }
  },

  dismissResumePrompt: () => set({ showResumePrompt: false }),

  resumeMatch: () => {
    const state = get()
    if (state.match) {
      set({ screen: 'live', showResumePrompt: false })
    }
  },

  resetToHome: () => {
    set({
      screen: 'home',
      setupStep: 1,
      setupDraft: defaultDraft(),
      showScorecard: false,
      showResumePrompt: hasResumableMatch(),
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
      screen: 'home',
      setupStep: 1,
      setupDraft: defaultDraft(),
      showScorecard: false,
    })
  },

  hasResumableMatch: () => hasResumableMatch(),

  updateSetupDraft: (partial) => {
    set((state) => {
      const next = { ...state.setupDraft, ...partial }
      const diff = next.playersPerTeam - state.setupDraft.playersPerTeam
      if (diff !== 0) {
        const resize = (arr: string[]) => {
          if (arr.length < next.playersPerTeam) {
            return [
              ...arr,
              ...Array(next.playersPerTeam - arr.length).fill(''),
            ]
          }
          return arr.slice(0, next.playersPerTeam)
        }
        next.team1Players = resize(next.team1Players)
        next.team2Players = resize(next.team2Players)
      }
      return { setupDraft: next }
    })
  },

  startNewMatch: () => {
    set({
      setupDraft: defaultDraft(),
      setupStep: 1,
      screen: 'setup',
      showResumePrompt: false,
    })
  },

  startMatch: () => {
    const { setupDraft } = get()

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

    const initialInnings = createInitialInnings(
      battingTeam.id,
      bowlingTeam.id,
      battingTeam,
    )

    const syncedInnings = syncInnings(initialInnings, match, [initialInnings], 0)

    const newState: MatchState = {
      match,
      innings: [syncedInnings],
      currentInningsIndex: 0,
      matchStatus: 'live',
    }

    persist(newState)
    set({ ...newState, screen: 'live' })
  },

  recordRun: (runs) => get().recordDelivery({ delivery: 'legal', batRuns: runs }),

  recordExtra: (type, runs = 0) => {
    if (type === 'wide') get().recordDelivery({ delivery: 'wide', wideExtraRuns: runs })
    else if (type === 'noBall') get().recordDelivery({ delivery: 'noBall', batRuns: runs })
    else if (type === 'bye') get().recordDelivery({ delivery: 'legal', byeRuns: runs })
    else get().recordDelivery({ delivery: 'legal', legByeRuns: runs })
  },

  recordDelivery: (input) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const has = (key: keyof typeof input) => Object.prototype.hasOwnProperty.call(input, key)
    if (input.delivery === 'wide' && (has('batRuns') || has('byeRuns') || has('legByeRuns'))) return
    if (has('byeRuns') && has('legByeRuns')) return
    if (has('batRuns') && (has('byeRuns') || has('legByeRuns'))) return
    if (input.delivery === 'legal' &&
      ((has('byeRuns') && input.byeRuns === 0) || (has('legByeRuns') && input.legByeRuns === 0))) return

    const current = innings[currentInningsIndex]
    if (
      current.pendingBowlerSelection ||
      current.pendingBatsmanSelection ||
      !current.currentBowlerId
    )
      return
    if (current.status === 'complete') return

    const ballEvent: InningsEvent = {
      id: generateId(),
      type: 'ball',
      bowlerId: current.currentBowlerId,
      delivery: input.delivery,
      batRuns: input.batRuns ?? 0,
      byeRuns: input.byeRuns ?? 0,
      legByeRuns: input.legByeRuns ?? 0,
      wideExtraRuns: input.wideExtraRuns ?? 0,
    }

    const updatedCurrent: Innings = {
      ...current,
      events: [...(current.events ?? []), ballEvent],
    }

    const synced = syncInnings(
      updatedCurrent,
      match,
      innings,
      currentInningsIndex,
    )
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = synced

    const derived = deriveForInnings(match, newInnings, currentInningsIndex)
    const matchStatus: MatchStatus = derived.isComplete
      ? currentInningsIndex === 0
        ? 'innings_break'
        : 'complete'
      : 'live'

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus,
    }

    persist(newState)
    set(newState)
    if (matchStatus === 'complete') {
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

    const ballEvent: InningsEvent = {
      id: generateId(),
      type: 'ball',
      bowlerId: current.currentBowlerId,
      delivery: 'legal',
      batRuns: 0,
      byeRuns: 0,
      legByeRuns: 0,
      wideExtraRuns: 0,
      wicket: {
        kind: wicketType,
        outId: outBatsmanId,
        newBatterId: newBatsmanId || undefined,
      },
    }

    const updatedCurrent: Innings = {
      ...current,
      events: [...(current.events ?? []), ballEvent],
    }

    const synced = syncInnings(
      updatedCurrent,
      match,
      innings,
      currentInningsIndex,
    )
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = synced

    const derived = deriveForInnings(match, newInnings, currentInningsIndex)
    const matchStatus: MatchStatus = derived.isComplete
      ? currentInningsIndex === 0
        ? 'innings_break'
        : 'complete'
      : 'live'

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus,
    }

    persist(newState)
    set(newState)
    if (matchStatus === 'complete') {
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
    const events = [...(current.events ?? [])]
    const hasBalls = events.some((e) => e.type === 'ball')
    const openersIdx = events.findIndex((e) => e.type === 'openers')

    const openerEvent: InningsEvent = {
      id: generateId(),
      type: 'openers',
      strikerId,
      nonStrikerId,
    }

    if (!hasBalls && openersIdx >= 0) {
      events[openersIdx] = openerEvent
    } else {
      events.push(openerEvent)
    }

    const updatedInnings: Innings = {
      ...current,
      events,
    }

    const synced = syncInnings(
      updatedInnings,
      match,
      innings,
      currentInningsIndex,
    )
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = synced

    const derived = deriveForInnings(match, newInnings, currentInningsIndex)
    const matchStatus: MatchStatus = derived.isComplete
      ? currentInningsIndex === 0
        ? 'innings_break'
        : 'complete'
      : state.matchStatus

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus,
    }

    persist(newState)
    set(newState)
    if (matchStatus === 'complete') {
      get().finishMatch()
    }
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
    const batterId = isStriker
      ? current.currentBatsmanIds[0]
      : current.currentBatsmanIds[1]

    const retireEvent: InningsEvent = {
      id: generateId(),
      type: 'retiredHurt',
      batterId,
      replacementId: newBatsmanId || undefined,
    }

    const updatedCurrent: Innings = {
      ...current,
      events: [...(current.events ?? []), retireEvent],
    }

    const synced = syncInnings(
      updatedCurrent,
      match,
      innings,
      currentInningsIndex,
    )
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = synced

    const derived = deriveForInnings(match, newInnings, currentInningsIndex)
    const matchStatus: MatchStatus = derived.isComplete
      ? currentInningsIndex === 0
        ? 'innings_break'
        : 'complete'
      : state.matchStatus

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus,
    }

    persist(newState)
    set(newState)
    if (matchStatus === 'complete') {
      get().finishMatch()
    }
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
    const events = current.events ?? []

    let lastIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type !== 'openers') {
        lastIndex = i
        break
      }
    }
    if (lastIndex === -1) {
      return
    }

    const newEvents = [
      ...events.slice(0, lastIndex),
      ...events.slice(lastIndex + 1),
    ]

    const interim: Innings = {
      ...current,
      events: newEvents,
      status: 'live',
    }

    const synced = syncInnings(interim, match, innings, currentInningsIndex)
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = synced

    const derived = deriveForInnings(match, newInnings, currentInningsIndex)

    const remainingBalls = newEvents.filter(
      (e): e is Extract<InningsEvent, { type: 'ball' }> => e.type === 'ball',
    )
    const lastBall = remainingBalls.at(-1)
    const currentBowlerId = lastBall ? lastBall.bowlerId : ''
    const pendingBowlerSelection =
      derived.needsNewBowler || derived.balls.length === 0

    const restored: Innings = {
      ...synced,
      currentBowlerId,
      pendingBowlerSelection,
      status: 'live',
    }

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
    secondInnings.events = []

    const synced = syncInnings(
      secondInnings,
      match,
      [...innings, secondInnings],
      1,
    )

    const newState: MatchState = {
      match,
      innings: [...innings, synced],
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

    const result = getMatchResultFromState(match, innings)
    const team1Idx = innings.findIndex((i) => i.battingTeamId === match.team1.id)
    const team2Idx = innings.findIndex((i) => i.battingTeamId === match.team2.id)
    const team1Summary =
      team1Idx >= 0 ? getInningsSummary(match, innings, team1Idx) : null
    const team2Summary =
      team2Idx >= 0 ? getInningsSummary(match, innings, team2Idx) : null
    const potm = getPlayerOfTheMatch(match, innings)

    const summary: CompletedMatchSummary = {
      id: generateId(),
      date: new Date().toISOString(),
      title: match.title,
      winnerName: result.winnerName ?? 'Tie',
      resultText: result.text,
      team1Name: match.team1.name,
      team1Score: team1Summary
        ? formatScore(team1Summary.runs, team1Summary.wickets)
        : '-',
      team2Name: match.team2.name,
      team2Score: team2Summary
        ? formatScore(team2Summary.runs, team2Summary.wickets)
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
    const swapEvent: InningsEvent = {
      id: generateId(),
      type: 'swapEnds',
    }

    const updatedCurrent: Innings = {
      ...current,
      events: [...(current.events ?? []), swapEvent],
    }

    const synced = syncInnings(
      updatedCurrent,
      match,
      innings,
      currentInningsIndex,
    )
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = synced

    const derived = deriveForInnings(match, newInnings, currentInningsIndex)
    const matchStatus: MatchStatus = derived.isComplete
      ? currentInningsIndex === 0
        ? 'innings_break'
        : 'complete'
      : state.matchStatus

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus,
    }

    persist(newState)
    set(newState)
    if (matchStatus === 'complete') {
      get().finishMatch()
    }
  },

  endInningsEarly: () => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match || state.matchStatus !== 'live') return

    const current = innings[currentInningsIndex]
    const endEvent: InningsEvent = {
      id: generateId(),
      type: 'endInnings',
    }

    const updatedCurrent: Innings = {
      ...current,
      events: [...(current.events ?? []), endEvent],
    }

    const synced = syncInnings(
      updatedCurrent,
      match,
      innings,
      currentInningsIndex,
    )
    const newInnings = [...innings]
    newInnings[currentInningsIndex] = synced

    const matchStatus: MatchStatus =
      currentInningsIndex === 0 ? 'innings_break' : 'complete'

    const newState: MatchState = {
      match,
      innings: newInnings,
      currentInningsIndex,
      matchStatus,
    }

    persist(newState)
    set(newState)
    if (matchStatus === 'complete') {
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
