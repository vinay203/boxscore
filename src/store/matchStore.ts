import { create } from 'zustand'
import {
  deriveForInnings,
  validateBallInput,
  formatScore,
  getInningsSummary,
  getMatchResultFromState,
  getPlayerOfTheMatch,
  isPlayerInvolved,
  syncInnings,
} from '../engine'
import type { BallInput, BallValidationContext } from '../engine/validation'
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

type DeliveryInput = BallInput
type BallEvent = Extract<InningsEvent, { type: 'ball' }>
type NewBallEvent = Omit<BallEvent, 'id' | 'type'>

interface EventActionResult {
  ok: boolean
  error?: string
}

function sparseBallInput(ball: Omit<BallEvent, 'type'>): BallInput {
  return {
    delivery: ball.delivery,
    ...(ball.batRuns !== 0 ? { batRuns: ball.batRuns } : {}),
    ...(ball.byeRuns !== 0 ? { byeRuns: ball.byeRuns } : {}),
    ...(ball.legByeRuns !== 0 ? { legByeRuns: ball.legByeRuns } : {}),
    ...(ball.wideExtraRuns !== 0 ? { wideExtraRuns: ball.wideExtraRuns } : {}),
    ...(ball.wicket ? { wicket: ball.wicket } : {}),
  }
}

interface AppStore extends MatchState {
  redoStack: InningsEvent[]
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
    opts?: {
      fielderId?: string
      delivery?: DeliveryKind
      batRuns?: number
      byeRuns?: number
      legByeRuns?: number
      wideExtraRuns?: number
    },
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
  redoLastBall: () => void
  deleteEvent: (eventId: string) => { ok: boolean; error?: string }
  reopenFinishedMatch: (historyId: string) => EventActionResult
  editEvent: (eventId: string, replacement: Omit<BallEvent, 'type'>) => EventActionResult
  insertEvent: (afterEventId: string | null, ball: NewBallEvent) => EventActionResult
  editOpeners: (strikerId: string, nonStrikerId: string) => EventActionResult
  startSecondInnings: () => void
  finishMatch: () => void
  swapBatsmen: () => void
  endInningsEarly: () => void
  changeBowlerRequest: () => void
  addPlayer: (teamId: string, name: string) => EventActionResult
  removePlayer: (teamId: string, playerId: string) => EventActionResult
  updateMatchSettings: (settings: { overs?: number; wicketLimit?: number }) => EventActionResult
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

function recomputeEventChange(
  match: Match,
  innings: Innings[],
  currentInningsIndex: number,
  events: InningsEvent[],
  restoreBowlerFromLastBall = true,
): { innings: Innings[]; matchStatus: MatchStatus } {
  const current = innings[currentInningsIndex]
  const interim: Innings = { ...current, events, status: 'live' }
  const synced = syncInnings(interim, match, innings, currentInningsIndex)
  const nextInnings = [...innings]
  nextInnings[currentInningsIndex] = synced
  const derived = deriveForInnings(match, nextInnings, currentInningsIndex)
  const lastBall = derived.balls.at(-1)
  nextInnings[currentInningsIndex] = restoreBowlerFromLastBall
    ? {
        ...synced,
        currentBowlerId: lastBall?.bowlerId ?? '',
        pendingBowlerSelection: derived.needsNewBowler || derived.balls.length === 0,
        status: derived.isComplete ? 'complete' : 'live',
      }
    : synced
  return {
    innings: nextInnings,
    matchStatus: derived.isComplete
      ? currentInningsIndex === 0 ? 'innings_break' : 'complete'
      : 'live',
  }
}

function firstNewEngineError(
  match: Match,
  innings: Innings[],
  currentInningsIndex: number,
  candidateEvents: InningsEvent[],
): string | undefined {
  const currentErrors = deriveForInnings(match, innings, currentInningsIndex).errors
  const candidateInnings = [...innings]
  candidateInnings[currentInningsIndex] = {
    ...candidateInnings[currentInningsIndex],
    events: candidateEvents,
  }
  const candidateErrors = deriveForInnings(match, candidateInnings, currentInningsIndex).errors
  if (candidateErrors.length <= currentErrors.length) return undefined
  return candidateErrors.find((message, index) => !currentErrors.includes(message) || index >= currentErrors.length)
    ?? candidateErrors[currentErrors.length]
    ?? 'This edit makes the innings invalid'
}

function getBallContextBefore(
  match: Match,
  innings: Innings[],
  currentInningsIndex: number,
  eventsBefore: InningsEvent[],
): BallValidationContext {
  const prefixInnings = [...innings]
  prefixInnings[currentInningsIndex] = {
    ...prefixInnings[currentInningsIndex],
    events: eventsBefore,
  }
  const derived = deriveForInnings(match, prefixInnings, currentInningsIndex)
  return {
    strikerId: derived.strikerId,
    nonStrikerId: derived.nonStrikerId,
    isFreeHit: derived.isFreeHitNext,
  }
}

export const useMatchStore = create<AppStore>((set, get) => ({
  redoStack: [],
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
        redoStack: [],
        showResumePrompt: true,
        matchHistory: history,
      })
    } else {
      set({ matchHistory: history, redoStack: [] })
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
      redoStack: [],
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
      redoStack: [],
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
    set({ ...newState, screen: 'live', redoStack: [] })
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

    const current = innings[currentInningsIndex]
    if (
      current.pendingBowlerSelection ||
      current.pendingBatsmanSelection ||
      !current.currentBowlerId
    )
      return
    if (current.status === 'complete') return

    const before = deriveForInnings(match, innings, currentInningsIndex)
    const validationError = validateBallInput(input, {
      strikerId: before.strikerId,
      nonStrikerId: before.nonStrikerId,
      isFreeHit: before.isFreeHitNext,
    })
    if (validationError) return

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
    set({ ...newState, redoStack: [] })
    if (matchStatus === 'complete') {
      get().finishMatch()
    }
  },

  recordWicket: (wicketType, outBatsmanId, newBatsmanId, opts = {}) => {
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

    const deliveryInput: DeliveryInput = {
      delivery: opts.delivery ?? 'legal',
      ...(opts.batRuns !== undefined ? { batRuns: opts.batRuns } : {}),
      ...(opts.byeRuns !== undefined ? { byeRuns: opts.byeRuns } : {}),
      ...(opts.legByeRuns !== undefined ? { legByeRuns: opts.legByeRuns } : {}),
      ...(opts.wideExtraRuns !== undefined ? { wideExtraRuns: opts.wideExtraRuns } : {}),
    }
    const currentDerived = deriveForInnings(match, innings, currentInningsIndex)
    const wicket = {
      kind: wicketType,
      outId: outBatsmanId,
      newBatterId: newBatsmanId || undefined,
      fielderId: opts.fielderId,
    }
    const validationError = validateBallInput({ ...deliveryInput, wicket }, {
      strikerId: currentDerived.strikerId,
      nonStrikerId: currentDerived.nonStrikerId,
      isFreeHit: currentDerived.isFreeHitNext,
    })
    if (validationError) return

    const ballEvent: InningsEvent = {
      id: generateId(),
      type: 'ball',
      bowlerId: current.currentBowlerId,
      delivery: deliveryInput.delivery,
      batRuns: deliveryInput.batRuns ?? 0,
      byeRuns: deliveryInput.byeRuns ?? 0,
      legByeRuns: deliveryInput.legByeRuns ?? 0,
      wideExtraRuns: deliveryInput.wideExtraRuns ?? 0,
      wicket,
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
    set({ ...newState, redoStack: [] })
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
    set({ ...newState, redoStack: [] })
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
    set({ ...newState, redoStack: [] })
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
    set({ ...newState, screen: 'live', redoStack: [] })
  },

  addPlayer: (teamId, name) => {
    const state = get()
    const { match } = state
    if (!match) return { ok: false, error: 'No active match' }
    const trimmedName = name.trim()
    if (!trimmedName) return { ok: false, error: 'Player name cannot be empty' }
    const team = match.team1.id === teamId ? match.team1 : match.team2.id === teamId ? match.team2 : null
    if (!team) return { ok: false, error: 'Team not found' }
    if (team.players.some((player) => player.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      return { ok: false, error: 'A player with that name is already on the team' }
    }
    const updatedTeam: Team = { ...team, players: [...team.players, { id: generateId(), name: trimmedName }] }
    const team1 = teamId === match.team1.id ? updatedTeam : match.team1
    const team2 = teamId === match.team2.id ? updatedTeam : match.team2
    const updatedMatch: Match = {
      ...match,
      team1,
      team2,
      playersPerTeam: Math.max(team1.players.length, team2.players.length),
    }
    const newState: MatchState = {
      match: updatedMatch,
      innings: state.innings,
      currentInningsIndex: state.currentInningsIndex,
      matchStatus: state.matchStatus,
    }
    persist(newState)
    set({ ...newState, redoStack: [] })
    return { ok: true }
  },

  removePlayer: (teamId, playerId) => {
    const state = get()
    const { match, innings } = state
    if (!match) return { ok: false, error: 'No active match' }
    const team = match.team1.id === teamId ? match.team1 : match.team2.id === teamId ? match.team2 : null
    if (!team) return { ok: false, error: 'Team not found' }
    if (!team.players.some((player) => player.id === playerId)) return { ok: false, error: 'Player not found' }
    if (isPlayerInvolved(innings, playerId)) return { ok: false, error: 'Already batted, bowled or fielded' }
    if (team.players.length <= 2) return { ok: false, error: 'Each team must have at least 2 players' }
    const updatedTeam: Team = { ...team, players: team.players.filter((player) => player.id !== playerId) }
    const team1 = teamId === match.team1.id ? updatedTeam : match.team1
    const team2 = teamId === match.team2.id ? updatedTeam : match.team2
    const updatedMatch: Match = {
      ...match,
      team1,
      team2,
      playersPerTeam: Math.max(team1.players.length, team2.players.length),
    }
    const newState: MatchState = {
      match: updatedMatch,
      innings: state.innings,
      currentInningsIndex: state.currentInningsIndex,
      matchStatus: state.matchStatus,
    }
    persist(newState)
    set({ ...newState, redoStack: [] })
    return { ok: true }
  },

  updateMatchSettings: ({ overs, wicketLimit }) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match) return { ok: false, error: 'No active match' }
    if (overs !== undefined && (!Number.isInteger(overs) || overs < 1 || overs > 20)) {
      return { ok: false, error: 'Overs must be between 1 and 20' }
    }
    if (wicketLimit !== undefined && (!Number.isInteger(wicketLimit) || wicketLimit < 1 || wicketLimit > 10)) {
      return { ok: false, error: 'Wickets must be between 1 and 10' }
    }
    const candidateMatch: Match = {
      ...match,
      ...(overs !== undefined ? { overs } : {}),
      ...(wicketLimit !== undefined ? { wicketLimit } : {}),
    }
    for (let index = 0; index < innings.length; index++) {
      const inn = innings[index]
      if (!(inn.events?.length)) continue
      const currentDerived = deriveForInnings(match, innings, index)
      const candidateDerived = deriveForInnings(candidateMatch, innings, index)
      if (candidateDerived.errors.length > currentDerived.errors.length) {
        return { ok: false, error: 'That setting would make an innings invalid' }
      }
      const isFinished = index < currentInningsIndex || inn.status === 'complete'
      if (isFinished && (!currentDerived.isComplete || !candidateDerived.isComplete ||
        candidateDerived.completeReason !== currentDerived.completeReason)) {
        return { ok: false, error: 'That would change an innings that is already finished' }
      }
    }

    const nextInnings = [...innings]
    if (nextInnings[currentInningsIndex]) {
      nextInnings[currentInningsIndex] = syncInnings(
        nextInnings[currentInningsIndex], candidateMatch, nextInnings, currentInningsIndex,
      )
    }
    const liveDerived = deriveForInnings(candidateMatch, nextInnings, currentInningsIndex)
    const nextMatchStatus: MatchStatus = liveDerived.isComplete
      ? currentInningsIndex === 0 ? 'innings_break' : 'complete'
      : state.matchStatus
    const newState: MatchState = {
      match: candidateMatch,
      innings: nextInnings,
      currentInningsIndex,
      matchStatus: nextMatchStatus,
    }
    persist(newState)
    set({ ...newState, redoStack: [] })
    if (state.matchStatus === 'live' && nextMatchStatus === 'complete') get().finishMatch()
    return { ok: true }
  },

  undoLastBall: () => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match) return

    if (state.matchStatus === 'innings_break') {
      const firstInnings = innings[0]
      const events = firstInnings?.events ?? []
      let lastIndex = -1
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type !== 'openers') {
          lastIndex = i
          break
        }
      }
      if (lastIndex < 0) return
      const removedEvent = events[lastIndex]
      const recomputed = recomputeEventChange(match, innings, 0, events.filter((_, index) => index !== lastIndex))
      const newState: MatchState = {
        match,
        innings: recomputed.innings,
        currentInningsIndex: 0,
        matchStatus: 'live',
      }
      persist(newState)
      set({ ...newState, screen: 'live', redoStack: [...state.redoStack, removedEvent] })
      return
    }

    if (currentInningsIndex === 1 && !(innings[1]?.events ?? []).some((event) => event.type === 'ball')) {
      const newState: MatchState = {
        match,
        innings: innings.slice(0, 1),
        currentInningsIndex: 0,
        matchStatus: 'innings_break',
      }
      persist(newState)
      set({ ...newState, screen: 'live' })
      return
    }

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
    const removedEvent = events[lastIndex]
    const eventsWithoutLast = events.filter((_, index) => index !== lastIndex)
    const recomputed = recomputeEventChange(match, innings, currentInningsIndex, eventsWithoutLast)
    const newState: MatchState = {
      match,
      innings: recomputed.innings,
      currentInningsIndex,
      matchStatus: recomputed.matchStatus,
    }

    persist(newState)
    set({ ...newState, redoStack: [...state.redoStack, removedEvent] })
  },

  redoLastBall: () => {
    const state = get()
    const { match, innings, currentInningsIndex, redoStack } = state
    const event = redoStack.at(-1)
    if (!match || !event) return
    const current = innings[currentInningsIndex]
    const recomputed = recomputeEventChange(match, innings, currentInningsIndex, [...(current.events ?? []), event], false)
    const newState: MatchState = {
      match,
      innings: recomputed.innings,
      currentInningsIndex,
      matchStatus: recomputed.matchStatus,
    }
    persist(newState)
    set({ ...newState, redoStack: redoStack.slice(0, -1) })
    if (recomputed.matchStatus === 'complete') get().finishMatch()
  },

  deleteEvent: (eventId) => {
    const state = get()
    const { match, innings, currentInningsIndex } = state
    if (!match) return { ok: false, error: 'No active match' }
    const current = innings[currentInningsIndex]
    const events = current.events ?? []
    const eventIndex = events.findIndex((event) => event.id === eventId)
    if (eventIndex < 0) return { ok: false, error: 'Event not found in this innings' }
    const event = events[eventIndex]
    if (event.type === 'openers') return { ok: false, error: 'Openers cannot be deleted' }
    if (event.type === 'endInnings') return { ok: false, error: 'Innings end cannot be deleted' }
    if (event.type !== 'ball' && event.type !== 'swapEnds' && event.type !== 'retiredHurt') {
      return { ok: false, error: 'This event cannot be deleted' }
    }

    const currentErrors = deriveForInnings(match, innings, currentInningsIndex).errors
    const eventsAfterDelete = events.filter((_, index) => index !== eventIndex)
    const candidateInnings = [...innings]
    candidateInnings[currentInningsIndex] = { ...current, events: eventsAfterDelete }
    const candidateErrors = deriveForInnings(match, candidateInnings, currentInningsIndex).errors
    if (candidateErrors.length > currentErrors.length) {
      const error = candidateErrors.find((message, index) => !currentErrors.includes(message) || index >= currentErrors.length)
      return { ok: false, error: error ?? candidateErrors[currentErrors.length] ?? 'Deleting this event makes the innings invalid' }
    }

    const recomputed = recomputeEventChange(match, innings, currentInningsIndex, eventsAfterDelete)
    const newState: MatchState = {
      match,
      innings: recomputed.innings,
      currentInningsIndex,
      matchStatus: recomputed.matchStatus,
    }
    persist(newState)
    set({ ...newState, redoStack: [] })
    if (recomputed.matchStatus === 'complete') get().finishMatch()
    return { ok: true }
  },

  reopenFinishedMatch: (historyId) => {
    const state = get()
    const historyEntry = loadMatchHistory().find((entry) => entry.id === historyId)
    if (!historyEntry) return { ok: false, error: 'Match not found in History' }
    if (hasResumableMatch() || (state.match && state.matchStatus !== 'complete' && state.matchStatus !== 'setup')) {
      return { ok: false, error: 'Finish or discard the match in progress first' }
    }
    if (!historyEntry.match || !historyEntry.innings || historyEntry.innings.length < 2 ||
      !Array.isArray(historyEntry.innings[0]?.events) || !Array.isArray(historyEntry.innings[1]?.events)) {
      return { ok: false, error: 'This History entry cannot be reopened' }
    }

    const match = JSON.parse(JSON.stringify(historyEntry.match)) as Match
    const innings = JSON.parse(JSON.stringify(historyEntry.innings)) as Innings[]
    const secondEvents = innings[1]!.events ?? []
    let lastIndex = -1
    for (let i = secondEvents.length - 1; i >= 0; i--) {
      if (secondEvents[i].type !== 'openers') {
        lastIndex = i
        break
      }
    }
    if (lastIndex < 0) return { ok: false, error: 'There is no second-innings ball to undo' }

    const removedEvent = secondEvents[lastIndex]!
    innings[1] = { ...innings[1]!, events: secondEvents.filter((_, index) => index !== lastIndex) }
    const recomputed = recomputeEventChange(match, innings, 1, innings[1]!.events ?? [])
    const newState: MatchState = {
      match,
      innings: recomputed.innings,
      currentInningsIndex: 1,
      matchStatus: 'live',
    }

    deleteFromHistory(historyId)
    persist(newState)
    set({
      ...newState,
      screen: 'live',
      showScorecard: false,
      selectedHistoryMatchId: null,
      matchHistory: loadMatchHistory(),
      redoStack: [...state.redoStack, removedEvent],
    })
    return { ok: true }
  },

  editEvent: (eventId, replacement) => {
    const { match, innings, currentInningsIndex } = get()
    if (!match) return { ok: false, error: 'No active match' }
    const current = innings[currentInningsIndex]
    const events = current.events ?? []
    const index = events.findIndex((event) => event.id === eventId)
    if (index < 0 || events[index].type !== 'ball') {
      return { ok: false, error: 'Ball not found in this innings' }
    }
    const bowlingTeam = current.bowlingTeamId === match.team1.id ? match.team1 : match.team2
    if (!bowlingTeam.players.some((player) => player.id === replacement.bowlerId)) {
      return { ok: false, error: 'Bowler must be from the bowling team' }
    }
    const context = getBallContextBefore(match, innings, currentInningsIndex, events.slice(0, index))
    const validationError = validateBallInput(sparseBallInput(replacement), context)
    if (validationError) return { ok: false, error: validationError }
    const updatedEvents = [...events]
    updatedEvents[index] = { ...replacement, type: 'ball', id: eventId }
    const engineError = firstNewEngineError(match, innings, currentInningsIndex, updatedEvents)
    if (engineError) return { ok: false, error: engineError }
    const recomputed = recomputeEventChange(match, innings, currentInningsIndex, updatedEvents)
    const newState: MatchState = { match, innings: recomputed.innings, currentInningsIndex, matchStatus: recomputed.matchStatus }
    persist(newState)
    set({ ...newState, redoStack: [] })
    if (recomputed.matchStatus === 'complete') get().finishMatch()
    return { ok: true }
  },

  insertEvent: (afterEventId, ball) => {
    const { match, innings, currentInningsIndex } = get()
    if (!match) return { ok: false, error: 'No active match' }
    const current = innings[currentInningsIndex]
    const events = current.events ?? []
    const bowlingTeam = current.bowlingTeamId === match.team1.id ? match.team1 : match.team2
    if (!bowlingTeam.players.some((player) => player.id === ball.bowlerId)) {
      return { ok: false, error: 'Bowler must be from the bowling team' }
    }
    const openerIndex = events.findIndex((event) => event.type === 'openers')
    const anchorIndex = afterEventId === null
      ? openerIndex
      : events.findIndex((event) => event.id === afterEventId)
    if (anchorIndex < 0) return { ok: false, error: 'Insertion point not found in this innings' }
    const index = anchorIndex + 1
    const inserted: BallEvent = { ...ball, type: 'ball', id: generateId() }
    const context = getBallContextBefore(match, innings, currentInningsIndex, events.slice(0, index))
    const validationError = validateBallInput(sparseBallInput(inserted), context)
    if (validationError) return { ok: false, error: validationError }
    const updatedEvents = [...events]
    updatedEvents.splice(index, 0, inserted)
    const engineError = firstNewEngineError(match, innings, currentInningsIndex, updatedEvents)
    if (engineError) return { ok: false, error: engineError }
    const recomputed = recomputeEventChange(match, innings, currentInningsIndex, updatedEvents)
    const newState: MatchState = { match, innings: recomputed.innings, currentInningsIndex, matchStatus: recomputed.matchStatus }
    persist(newState)
    set({ ...newState, redoStack: [] })
    if (recomputed.matchStatus === 'complete') get().finishMatch()
    return { ok: true }
  },

  editOpeners: (strikerId, nonStrikerId) => {
    const { match, innings, currentInningsIndex } = get()
    if (!match) return { ok: false, error: 'No active match' }
    if (!strikerId || !nonStrikerId || strikerId === nonStrikerId) {
      return { ok: false, error: 'Choose two different opening batters' }
    }
    const current = innings[currentInningsIndex]
    const events = current.events ?? []
    const index = events.findIndex((event) => event.type === 'openers')
    if (index < 0) return { ok: false, error: 'Opening batters have not been selected' }
    const updatedEvents = [...events]
    const opener = events[index]
    if (opener.type !== 'openers') return { ok: false, error: 'Opening batters have not been selected' }
    updatedEvents[index] = { ...opener, strikerId, nonStrikerId }
    const engineError = firstNewEngineError(match, innings, currentInningsIndex, updatedEvents)
    if (engineError) return { ok: false, error: engineError }
    const recomputed = recomputeEventChange(match, innings, currentInningsIndex, updatedEvents)
    const newState: MatchState = { match, innings: recomputed.innings, currentInningsIndex, matchStatus: recomputed.matchStatus }
    persist(newState)
    set({ ...newState, redoStack: [] })
    if (recomputed.matchStatus === 'complete') get().finishMatch()
    return { ok: true }
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
      redoStack: [],
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
    set({ ...newState, redoStack: [] })
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
    set({ ...newState, redoStack: [] })
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
