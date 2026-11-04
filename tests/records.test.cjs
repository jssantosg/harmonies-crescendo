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