export function getResultText(
  firstInningsTeamName: string,
  secondInningsTeamName: string,
  firstInningsRuns: number,
  secondInningsRuns: number,
  secondInningsWicketsLost: number,
  wicketLimit: number,
  legalBallsLeft: number,
): string {
  if (secondInningsRuns > firstInningsRuns) {
    const wicketsLeft = Math.max(0, wicketLimit - secondInningsWicketsLost)
    const wicketsText = wicketsLeft === 1 ? '1 wicket' : `${wicketsLeft} wickets`
    const ballsText = legalBallsLeft === 1 ? '1 ball left' : `${legalBallsLeft} balls left`
    return `${secondInningsTeamName} won by ${wicketsText} (${ballsText})`
  }

  if (firstInningsRuns > secondInningsRuns) {
    const margin = firstInningsRuns - secondInningsRuns
    const runsText = margin === 1 ? '1 run' : `${margin} runs`
    return `${firstInningsTeamName} won by ${runsText}`
  }

  return 'Match tied'
}
