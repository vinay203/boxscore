# BoxScore spec

Goal: a mobile-first cricket scorer for a Saturday friends group (gully/box cricket). One phone, one scorer. Rules must be customizable.

## Principles
- Simple, minimal, black-and-white, large tap targets, one-hand use
- Never lose data. Leaving a screen must never delete a match
- Everything is editable and undoable
- Don't change styling unless the step asks for it

## Cricket rules to implement
- Wide: 1 run + any extra runs, not a legal ball, batter doesn't face it
- No-ball: 1 run + runs off the bat (or byes), not a legal ball, batter DOES face it, next ball is a free hit
- Free hit: only run-out / obstructing the field can dismiss the batsman
- Bye / leg-bye: batter faces the ball, runs go to extras, NOT charged to the bowler
- Run-out is not credited to the bowler
- Bouncers: limit per bowler per over (default 2); app shows each bowler's bouncer count

## Match rules config (all editable, even mid-match)
overs, wicketsPerInnings, playersPerTeam, freeHitAfterNoBall, freeHitAfterWide (default off), bouncersPerOver (0 = off), bouncerOverLimitIsNoBall, maxOversPerBowler (0 = off), jokerEnabled, jokerCanBat, jokerCanBowl, lastManStands

## Players and teams
- Saved player pool: name + role (batsman, bowler, all-rounder, wicketkeeper)
- Teams built by picking from the pool OR by typing names (typed names auto-save to the pool)
- Captain per team; optional joker (one player on both squads)
- Player names editable any time; players addable mid-match

## History and stats
- Full matches stored (balls, players, rules), no 10-match limit, export/import JSON
- Tapping a past match opens the full scorecard
- Orange Cap (most runs) and Purple Cap (most wickets): per Saturday and all-time

## Architecture rule (from step 2 on)
- The ball-event log is the only source of truth. Score, strike, overs, stats are all derived from it
- Undo/redo/edit = changing the log, then recomputing

## Build steps (do only the step you are asked to)
[x] 1  Safety fixes: hooks crash, stale opener picker, never delete a match by accident, viewport zoom
[x] 2a engine (pure code + tests)
[x] 2b move the app onto the engine
       Fixes: undo restoring wrong batsmen, byes charged to bowler, dismissal text ("c ? b"),
       result text when Team 2 bats first, "1 wickets" grammar, "did not bat" bug, not-out/retired labels
[x] 3a deliveries (no-ball/wide with runs as ONE delivery, free hit banner, block disallowed wickets on free hit)
[x] 3b wicket details (all dismissal types, fielder, run-out with runs, wicket on wide/no-ball, retired out, timed out)
[ ] 3c overthrows, penalty runs, dead ball, short run
[x] 4a redo + ball log + delete any past ball
[x] 4b edit or insert any past ball
[x] 4c change overs/wickets/innings/players mid-match (add, remove, substitute, rename)
[x] 4d reopen a finished match, undo across innings, confirmations
[ ] 5  Storage: full matches (no cap), IndexedDB or localStorage with versioning, JSON export/import,
       history list that opens the full scorecard
[ ] 6  Player pool + teams: roles, captain, pick-from-pool and quick-start (typed names auto-save),
       one-click reuse of previous teams
[ ] 7  Joker (one player on both squads; can bat / can bowl settings; shown in both scorecards)
[ ] 8  Bouncer counter per bowler per over + max overs per bowler
[ ] 9  Orange Cap / Purple Cap per Saturday and all-time, career stats, leaderboards
[ ] 10 Rule presets (standard / gully / custom), Super Over, last-man-stands, retired-hurt return,
       edge case: wickets limit equal to team size
[ ] 11 Live info: current/required run rate, partnership, last 6 balls, projected score, commentary;
       match details (date, venue, umpire, wicketkeeper), better Player of the Match
[ ] 12 Sharing: scorecard as image/PDF, WhatsApp text, live view link (needs a backend; decide first)
[ ] 13 Polish: wake lock, dark mode, charts (Manhattan/worm), PWA icons (192/512 PNG), backup reminder
