const { test } = require("node:test");
const assert = require("node:assert/strict");
const records = require("../records.js");

function player(name, score) {
  return { name, scores: { landscapes: [score, 0, 0, 0, 0], animals: Array(8).fill(0), extras: Array(4).fill(0) } };
}

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("leagues ignore seating, case, and spacing but distinguish membership", () => {
  const first = records.createGame([player(" Lore ", 100), player("Johan", 90)], "one");
  const reversed = records.createGame([player("JOHAN", 90), player("lore", 100)], "two");
  const three = records.createGame([player("Lore", 100), player("Ale", 80), player("Johan", 90)], "three");
  assert.equal(first.league, reversed.league);
  assert.notEqual(first.league, three.league);
  assert.deepEqual(first.winners, ["lore"]);
});

test("records persist, ties share wins, and best scores survive losses", () => {
  const saved = storage();
  records.save(records.createGame([player("Lore", 111), player("Johan", 122)], "one"), saved);
  records.save(records.createGame([player("Johan", 100), player("Lore", 100)], "two"), saved);
  const data = records.read(saved);
  assert.equal(data.games.length, 2);
  assert.deepEqual(records.standings(data.games).map(({ name, wins, played, best }) => ({ name, wins, played, best })), [
    { name: "Johan", wins: 2, played: 2, best: 122 },
    { name: "Lore", wins: 1, played: 2, best: 111 }
  ]);
  assert.throws(() => records.save(data.games[0], saved), /already saved/);
});

test("invalid players, dates, scores, duplicate names, and corrupt storage are rejected", () => {
  assert.throws(() => records.createGame([player("Lore", 1)], "one"), /2 to 4/);
  assert.throws(() => records.createGame([player("Lore", 1), player(" lore ", 2)], "one"), /different name/);
  for (const score of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => records.createGame([player("Lore", score), player("Johan", 2)], "one"), /whole numbers/);
  }
  assert.throws(() => records.createGame([player("Lore", 1), player("Johan", 2)], "one", "bad date"), /date/);
  const saved = storage();
  saved.setItem(records.storageKey, "broken JSON");
  assert.throws(() => records.read(saved));
  assert.throws(() => records.save(records.createGame([player("Lore", 1), player("Johan", 2)], "one"), saved));
  assert.equal(saved.getItem(records.storageKey), "broken JSON");
});

test("backup merge is repeatable and invalid imports never overwrite saved games", () => {
  const saved = storage();
  const game = records.createGame([player("Lore", 1), player("Johan", 2)], "one");
  records.save(game, saved);
  const backup = records.read(saved);
  assert.equal(records.merge(backup, saved).games.length, 1);
  assert.throws(() => records.merge({ version: 2, games: [] }, saved));
  assert.throws(() => records.merge({ version: 1, games: [game, game] }, saved), /duplicate/);
  const conflict = records.createGame([player("Lore", 99), player("Johan", 2)], "one", game.playedAt);
  assert.throws(() => records.merge({ version: 1, games: [conflict] }, saved), /conflicts/);
  assert.deepEqual(records.read(saved), backup);
});

test("write failures are surfaced instead of reporting a successful save", () => {
  const blocked = { getItem: () => null, setItem: () => { throw new Error("Storage full"); } };
  assert.throws(() => records.save(records.createGame([player("Lore", 1), player("Johan", 2)], "one"), blocked), /Storage full/);
});

test("animal cubes break only first-place score ties and survive storage and backups", () => {
  const saved = storage();
  const players = [
    { ...player("Lore", 100), animalCubes: 10 },
    { ...player("Johan", 100), animalCubes: 12 },
    { ...player("Ale", 90), animalCubes: 20 }
  ];
  const game = records.createGame(players, "cubes");
  assert.deepEqual(game.winners, ["johan"]);
  records.save(game, saved);
  assert.deepEqual(records.read(saved).games[0], game);
  const restored = records.merge(JSON.parse(JSON.stringify(records.read(saved))), storage());
  assert.deepEqual(restored.games[0], game);
  assert.equal(records.standings(restored.games).find((entry) => entry.name === "Lore").wins, 0);
  assert.equal(records.standings(restored.games).find((entry) => entry.name === "Johan").wins, 1);
  assert.deepEqual(records.createGame([players[0], players[2]], "scores-first").winners, ["lore"]);
});

test("players still share victory when both points and animal cubes tie", () => {
  const players = ["Lore", "Johan", "Ale", "Max"].map((name) => ({ ...player(name, 100), animalCubes: 0 }));
  assert.deepEqual(records.createGame(players, "zero-cubes").winners, ["lore", "johan", "ale", "max"]);
  players[0].animalCubes = 12;
  players[1].animalCubes = 12;
  players[2].animalCubes = 10;
  assert.deepEqual(records.createGame(players, "shared").winners, ["lore", "johan"]);
});

test("invalid or incomplete tiebreak counts are rejected without changing stored games", () => {
  const saved = storage();
  const game = records.createGame([player("Lore", 100), player("Johan", 100)], "legacy");
  records.save(game, saved);
  const before = saved.getItem(records.storageKey);
  for (const animalCubes of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "12", null]) {
    assert.throws(() => records.createGame([
      { ...player("Lore", 100), animalCubes }, { ...player("Johan", 100), animalCubes: 12 }
    ], "invalid"), /cube counts/);
  }
  const incomplete = JSON.parse(JSON.stringify(game));
  incomplete.players[0].animalCubes = 12;
  assert.throws(() => records.merge({ version: 1, games: [incomplete] }, saved), /every player tied/);
  assert.equal(saved.getItem(records.storageKey), before);
  assert.deepEqual(records.read(saved).games[0].winners, ["lore", "johan"]);
});

test("deleting a game recalculates wins and personal bests from remaining records", () => {
  const saved = storage();
  records.save(records.createGame([player("Lore", 100), player("Johan", 120)], "one"), saved);
  records.save(records.createGame([player("Lore", 90), player("Johan", 80)], "two"), saved);
  const remaining = records.remove("one", saved);
  assert.equal(remaining.games.length, 1);
  assert.deepEqual(records.standings(remaining.games).map(({ name, wins, best }) => ({ name, wins, best })), [
    { name: "Lore", wins: 1, best: 90 },
    { name: "Johan", wins: 0, best: 80 }
  ]);
  assert.equal(records.remove("two", saved).games.length, 0);
});