"use strict";

const HarmoniesRecords = (() => {
  const storageKey = "harmonies-crescendo-games-v1";
  const empty = () => ({ version: 1, games: [] });
  const cleanName = (name) => name.normalize("NFKC").trim().replace(/\s+/g, " ");
  const playerKey = (name) => cleanName(name).toLowerCase();
  const leagueKey = (players) => JSON.stringify(players.map((player) => playerKey(player.name)).sort());

  function validatePlayer(player) {
    if (!player || typeof player.name !== "string") throw new Error("Each player needs a name.");
    const name = cleanName(player.name);
    if (!name || name.length > 24) throw new Error("Player names must contain 1 to 24 characters.");
    const scores = {};
    for (const [category, length] of [["landscapes", 5], ["animals", 8], ["extras", 4]]) {
      const values = player.scores?.[category];
      if (!Array.isArray(values) || values.length !== length || values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
        throw new Error("Scores must be non-negative whole numbers in the original score boxes.");
      }
      scores[category] = [...values];
    }
    const total = Object.values(scores).flat().reduce((sum, score) => sum + score, 0);
    if (!Number.isSafeInteger(total)) throw new Error("The total score is too large.");
    const validated = { name, scores, total };
    if (player.animalCubes !== undefined) {
      if (!Number.isSafeInteger(player.animalCubes) || player.animalCubes < 0) {
        throw new Error("Animal cube counts must be non-negative whole numbers.");
      }
      validated.animalCubes = player.animalCubes;
    }
    return validated;
  }

  function createGame(players, id = crypto.randomUUID(), playedAt = new Date().toISOString()) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 4) throw new Error("A game needs 2 to 4 named players.");
    const validated = players.map(validatePlayer);
    if (new Set(validated.map((player) => playerKey(player.name))).size !== validated.length) {
      throw new Error("Use a different name for each player.");
    }
    if (typeof id !== "string" || !id.trim() || id.length > 100 || typeof playedAt !== "string" || !Number.isFinite(Date.parse(playedAt))) {
      throw new Error("Invalid game ID or date.");
    }
    const highest = Math.max(...validated.map((player) => player.total));
    let winners = validated.filter((player) => player.total === highest);
    if (winners.length > 1 && winners.some((player) => player.animalCubes !== undefined)) {
      if (winners.some((player) => player.animalCubes === undefined)) {
        throw new Error("Enter animal cube counts for every player tied for first place.");
      }
      const mostCubes = Math.max(...winners.map((player) => player.animalCubes));
      winners = winners.filter((player) => player.animalCubes === mostCubes);
    }
    return {
      id, playedAt, players: validated,
      league: leagueKey(validated),
      winners: winners.map((player) => playerKey(player.name))
    };
  }

  function validateRecords(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.games)) throw new Error("This is not a valid Harmonies backup.");
    const games = data.games.map((game) => {
      if (!game || typeof game.id !== "string" || typeof game.playedAt !== "string") throw new Error("Invalid game record.");
      return createGame(game.players, game.id, game.playedAt);
    });
    if (new Set(games.map((game) => game.id)).size !== games.length) throw new Error("The backup contains duplicate game IDs.");
    return { version: 1, games };
  }

  function read(storage = localStorage) {
    const saved = storage.getItem(storageKey);
    return saved === null ? empty() : validateRecords(JSON.parse(saved));
  }

  function write(data, storage = localStorage) {
    const validated = validateRecords(data);
    storage.setItem(storageKey, JSON.stringify(validated));
    return validated;
  }

  function save(game, storage = localStorage) {
    const data = read(storage);
    if (data.games.some((saved) => saved.id === game.id)) throw new Error("This game is already saved.");
    return write({ version: 1, games: [...data.games, game] }, storage);
  }

  function merge(imported, storage = localStorage) {
    const incoming = validateRecords(imported);
    const current = read(storage);
    const games = new Map(current.games.map((game) => [game.id, game]));
    for (const game of incoming.games) {
      if (games.has(game.id) && JSON.stringify(games.get(game.id)) !== JSON.stringify(game)) {
        throw new Error("A backup game conflicts with a saved game. No changes were made.");
      }
      games.set(game.id, game);
    }
    return write({ version: 1, games: [...games.values()] }, storage);
  }

  function remove(id, storage = localStorage) {
    const data = read(storage);
    return write({ version: 1, games: data.games.filter((game) => game.id !== id) }, storage);
  }

  function standings(games) {
    const players = new Map();
    for (const game of games) {
      for (const player of game.players) {
        const key = playerKey(player.name);
        const entry = players.get(key) || { key, name: player.name, wins: 0, played: 0, best: 0 };
        entry.played += 1;
        entry.wins += Number(game.winners.includes(key));
        entry.best = Math.max(entry.best, player.total);
        players.set(key, entry);
      }
    }
    return [...players.values()].sort((first, second) => second.wins - first.wins || first.name.localeCompare(second.name));
  }

  return { storageKey, cleanName, playerKey, leagueKey, createGame, validateRecords, read, save, merge, remove, standings };
})();

if (typeof module !== "undefined" && module.exports) module.exports = HarmoniesRecords;