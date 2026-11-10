# Harmonies Crescendo Scoresheet

A dependency-free scoresheet for two to four players, with league standings,
game history, and personal bests. Open `index.html` or use the deployed site.

## Save a Game

Enter each participating player's name and points, leaving unused player columns
empty. Blank score boxes count as zero. Select **Save game** to record the date,
player list, individual score boxes, totals, league, and winner or tied winners.
If players tie for the highest score, a popup requires the number of Animal cubes
each tied player placed. The most cubes wins; players still tied share victory.
Cancel leaves the game unsaved. Cube counts are saved with the game and shown in
game history and backups; they do not add points to the score.
Saved games are locked against duplicate saves. **New game** clears the scores
and keeps the player names. An unfinished game is retained in the current tab
when navigating between the scoresheet and leaderboard.

## Leagues and Leaderboard

- A league is the exact set of participating players, independent of seating order.
- Names are matched without case differences or extra whitespace. Use consistent
  names: `Lore` and `Lorena` are different players.
- `Lore vs Johan` and `Lore vs Ale vs Johan` have separate standings.
- Standings rank players by wins. Players sharing victory after the Animal cube
  tiebreaker each receive one win.
- The personal-best tiles show each player's highest score across all leagues.
- Game history shows the selected league. Deleting a game recalculates standings
  and personal bests.

## Persistence and Backups

Completed games are stored as versioned JSON in browser `localStorage`, under
`harmonies-crescendo-games-v1`. Records are loaded on each visit and before writes.
There is no database server, account, or automatic cross-device synchronization.
Older saved games and backups without cube counts retain their original shared
victories; unknown counts are not inferred.

Records belong to this browser profile and site address. A local file, localhost,
and the GitHub Pages site do not share storage. Browser cleanup, private browsing,
or switching devices can remove or hide records. File-URL storage behavior is
browser-dependent; the hosted site is recommended for regular use.

Use **Export backup** on the leaderboard to download a readable `.json` file.
**Import backup** merges a backup with existing records and skips identical game
IDs. Invalid or conflicting backups do not overwrite existing history. Keep a
backup before clearing browser data or moving to a different site address.

GitHub Pages cannot write back to a hosted `.txt` or `.json` file. Browsers also
cannot silently update an arbitrary local file. Export/import is the portable
file-based alternative. For shared records across devices, the recommended next
step is a managed database such as Supabase, with authentication and row-level
security. Never embed privileged database keys or GitHub tokens in this app.

## Tests

With Node.js installed, run:

```sh
node --test tests/records.test.cjs
```