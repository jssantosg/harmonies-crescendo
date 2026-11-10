"use strict";

const scoresheet = document.querySelector("#scoresheet");
const template = document.querySelector("#player-template");
if (scoresheet) {
const draftKey = "harmonies-crescendo-draft-v1";
const saveButton = document.querySelector("#save-game");
const saveStatus = document.querySelector("#save-status");
const tiebreakDialog = document.querySelector("#tiebreak-dialog");
let savedGameId = null;
const landscapes = [
  ["trees", "Trees"],
  ["mountains", "Mountains"],
  ["fields", "Fields"],
  ["buildings", "Buildings"],
  ["water", "Water"]
];

function createScore(playerNumber, label, category, color = "") {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.className = `paper score ${color}`.trim();
  input.dataset.category = category;
  input.name = `player-${playerNumber}-${label.toLowerCase().replaceAll(" ", "-")}`;
  input.setAttribute("aria-label", `Player ${playerNumber}: ${label}`);
  input.title = label;
  return input;
}

function updateTotals(player) {
  const totals = { landscapes: 0, animals: 0, extras: 0 };

  for (const input of player.querySelectorAll(".score")) {
    const value = input.valueAsNumber;
    const valid = !input.validity.badInput && (input.value === "" || (Number.isSafeInteger(value) && value >= 0));
    input.setCustomValidity(valid ? "" : "Enter a whole number of points, zero or higher.");
    input.setAttribute("aria-invalid", String(!valid));
    if (valid && input.value !== "") totals[input.dataset.category] += value;
  }

  for (const [category, total] of Object.entries(totals)) {
    player.querySelector(`[data-total="${category}"]`).value = String(total);
  }
  player.querySelector('[data-total="all"]').value = String(totals.landscapes + totals.animals + totals.extras);
}

for (let playerNumber = 1; playerNumber <= 4; playerNumber += 1) {
  const player = template.content.firstElementChild.cloneNode(true);
  player.setAttribute("aria-label", `Player ${playerNumber}`);
  const name = player.querySelector(".player-name");
  name.placeholder = `Player ${playerNumber}`;
  name.name = `player-${playerNumber}-name`;
  name.setAttribute("aria-label", `Player ${playerNumber} name`);

  for (const [color, label] of landscapes) {
    const row = document.createElement("div");
    row.className = "landscape";
    const icon = document.createElement("span");
    icon.className = `landscape-icon ${color}`;
    icon.setAttribute("aria-hidden", "true");
    row.append(icon, createScore(playerNumber, label, "landscapes", `${color}-score`));
    player.querySelector(".landscapes").append(row);
  }

  for (let animal = 1; animal <= 8; animal += 1) {
    player.querySelector(".animal-scores").append(createScore(playerNumber, `Animal ${animal}`, "animals"));
  }
  for (let sanctuary = 1; sanctuary <= 3; sanctuary += 1) {
    player.querySelector(".sanctuary-scores").append(createScore(playerNumber, `Sanctuary ${sanctuary}`, "extras"));
  }
  player.querySelector(".whispers").append(createScore(playerNumber, "Whisper bonus", "extras"));

  for (const output of player.querySelectorAll("output")) {
    const category = output.dataset.total;
    output.setAttribute("aria-label", `Player ${playerNumber}: ${category === "all" ? "Total score" : `${category} subtotal`}`);
  }
  scoresheet.append(player);
  updateTotals(player);
}

function rememberDraft() {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({
      values: [...scoresheet.querySelectorAll("input")].map((input) => input.value), savedGameId
    }));
  } catch {}
}

function lockSavedGame() {
  scoresheet.querySelectorAll("input").forEach((input) => { input.disabled = true; });
  saveButton.disabled = true;
}

try {
  const draft = JSON.parse(sessionStorage.getItem(draftKey));
  const inputs = [...scoresheet.querySelectorAll("input")];
  if (draft && Array.isArray(draft.values) && draft.values.length === inputs.length && draft.values.every((value) => typeof value === "string")) {
    inputs.forEach((input, index) => { input.value = draft.values[index]; });
    scoresheet.querySelectorAll(".player").forEach(updateTotals);
    if (draft.savedGameId && HarmoniesRecords.read().games.some((game) => game.id === draft.savedGameId)) {
      savedGameId = draft.savedGameId;
      lockSavedGame();
      saveStatus.textContent = "Game saved.";
    }
  }
} catch {
  savedGameId = null;
}

scoresheet.addEventListener("submit", (event) => event.preventDefault());
scoresheet.addEventListener("input", (event) => {
  if (event.target.matches(".score")) updateTotals(event.target.closest(".player"));
  saveStatus.textContent = "";
  rememberDraft();
});

document.querySelector("#cancel-tiebreak").addEventListener("click", () => tiebreakDialog.close("cancel"));

function requestAnimalCubes(game) {
  const tied = game.players.filter((player) => game.winners.includes(HarmoniesRecords.playerKey(player.name)));
  const fields = document.querySelector("#tiebreak-players");
  fields.replaceChildren();
  const inputs = tied.map((player) => {
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = `${player.name} (${player.total} points)`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = String(Number.MAX_SAFE_INTEGER);
    input.step = "1";
    input.inputMode = "numeric";
    input.required = true;
    input.setAttribute("aria-label", `${player.name}: Animal cubes placed`);
    label.append(name, input);
    fields.append(label);
    return input;
  });
  tiebreakDialog.returnValue = "";
  return new Promise((resolve) => {
    tiebreakDialog.addEventListener("close", () => {
      if (tiebreakDialog.returnValue !== "save") {
        resolve(null);
        return;
      }
      tied.forEach((player, index) => { player.animalCubes = inputs[index].valueAsNumber; });
      resolve(HarmoniesRecords.createGame(game.players, game.id, game.playedAt));
    }, { once: true });
    tiebreakDialog.showModal();
  });
}

saveButton.addEventListener("click", async () => {
  if (savedGameId) return;
  saveButton.disabled = true;
  try {
    const players = [];
    for (const player of scoresheet.querySelectorAll(".player")) {
      updateTotals(player);
      const name = player.querySelector(".player-name").value;
      const inputs = [...player.querySelectorAll(".score")];
      if (!name.trim() && inputs.some((input) => input.value !== "" || input.validity.badInput)) {
        player.querySelector(".player-name").focus();
        throw new Error("Name every player with scores before saving.");
      }
      if (!name.trim()) continue;
      const invalid = inputs.find((input) => !input.checkValidity());
      if (invalid) {
        invalid.reportValidity();
        throw new Error("Correct the highlighted score before saving.");
      }
      const scores = {};
      for (const category of ["landscapes", "animals", "extras"]) {
        scores[category] = inputs.filter((input) => input.dataset.category === category).map((input) => input.value === "" ? 0 : input.valueAsNumber);
      }
      players.push({ name, scores });
    }
    let game = HarmoniesRecords.createGame(players);
    if (game.winners.length > 1) {
      game = await requestAnimalCubes(game);
      if (!game) {
        saveStatus.textContent = "Game not saved.";
        saveStatus.classList.remove("error");
        return;
      }
    }
    HarmoniesRecords.save(game);
    savedGameId = game.id;
    lockSavedGame();
    rememberDraft();
    const winners = game.players.filter((player) => game.winners.includes(HarmoniesRecords.playerKey(player.name))).map((player) => player.name);
    saveStatus.textContent = `Game saved. ${winners.length > 1 ? "Tied winners" : "Winner"}: ${winners.join(" & ")}.`;
    saveStatus.classList.remove("error");
  } catch (error) {
    saveStatus.textContent = `Not saved. ${error.message} Check that browser storage is available if the problem persists.`;
    saveStatus.classList.add("error");
  } finally {
    if (!savedGameId) saveButton.disabled = false;
  }
});

document.querySelector("#reset").addEventListener("click", () => {
  const hasEntries = [...scoresheet.querySelectorAll(".score")].some((input) => input.value !== "" || input.validity.badInput);
  if (!savedGameId && hasEntries && !confirm("Start a new game? Unsaved scores will be cleared.")) return;
  scoresheet.querySelectorAll("input").forEach((input) => { input.disabled = false; });
  scoresheet.querySelectorAll(".score").forEach((input) => { input.value = ""; });
  savedGameId = null;
  saveButton.disabled = false;
  saveStatus.textContent = "";
  saveStatus.classList.remove("error");
  scoresheet.querySelectorAll(".player").forEach(updateTotals);
  rememberDraft();
  scoresheet.querySelector(".player-name").focus();
});
}

if (document.querySelector("#leaderboard")) {
  const leagueSelect = document.querySelector("#league");
  const status = document.querySelector("#records-status");
  const exportButton = document.querySelector("#export-records");
  const fileInput = document.querySelector("#backup-file");

  function element(tag, text, className = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  }

  function renderLeaderboard() {
    try {
      const data = HarmoniesRecords.read();
      const selection = leagueSelect.value;
      const leagues = new Map();
      for (const game of data.games) {
        if (!leagues.has(game.league)) {
          const names = game.players.map((player) => player.name).sort((first, second) => first.localeCompare(second));
          leagues.set(game.league, names.join(" vs "));
        }
      }
      leagueSelect.replaceChildren();
      for (const [key, label] of [...leagues.entries()].sort((first, second) => first[1].localeCompare(second[1]))) {
        const option = element("option", label);
        option.value = key;
        leagueSelect.append(option);
      }
      if (leagues.has(selection)) leagueSelect.value = selection;
      leagueSelect.disabled = leagues.size === 0;
      exportButton.disabled = data.games.length === 0;
      document.querySelector("#empty-records").hidden = data.games.length > 0;
      for (const id of ["league-results", "personal-bests-section", "history-section"]) {
        document.getElementById(id).hidden = data.games.length === 0;
      }
      const games = data.games.filter((game) => game.league === leagueSelect.value);
      document.querySelector("#league-count").textContent = `${games.length} game${games.length === 1 ? "" : "s"}`;
      const rows = HarmoniesRecords.standings(games);
      const body = document.querySelector("#standings-body");
      body.replaceChildren();
      rows.forEach((player) => {
        const rank = rows.findIndex((entry) => entry.wins === player.wins) + 1;
        const row = element("tr", "");
        row.append(element("td", String(rank), "rank-cell"), element("th", player.name), element("td", String(player.wins), "wins-cell"), element("td", String(player.played)), element("td", String(player.best)));
        row.children[1].scope = "row";
        body.append(row);
      });
      const bests = document.querySelector("#personal-bests");
      bests.replaceChildren();
      for (const player of HarmoniesRecords.standings(data.games).sort((first, second) => first.name.localeCompare(second.name))) {
        const tile = element("article", "", "best-tile");
        tile.append(element("h3", player.name), element("strong", String(player.best), "paper"), element("span", "points", "muted"));
        bests.append(tile);
      }
      const history = document.querySelector("#game-history");
      history.replaceChildren();
      for (const game of [...games].sort((first, second) => Date.parse(second.playedAt) - Date.parse(first.playedAt))) {
        const row = element("article", "", "history-row");
        const details = element("div", "", "history-details");
        const date = element("time", new Date(game.playedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }), "muted");
        date.dateTime = game.playedAt;
        const scores = element("ul", "", "history-scores");
        for (const player of game.players) {
          const winner = game.winners.includes(HarmoniesRecords.playerKey(player.name));
          const cubes = player.animalCubes === undefined ? "" : `, ${player.animalCubes} animal cube${player.animalCubes === 1 ? "" : "s"}`;
          scores.append(element("li", `${player.name}: ${player.total}${cubes}${winner ? (game.winners.length > 1 ? " (tied winner)" : " (winner)") : ""}`, winner ? "winner" : ""));
        }
        details.append(date, scores);
        const remove = element("button", "Delete", "delete-game");
        remove.type = "button";
        remove.setAttribute("aria-label", `Delete game from ${new Date(game.playedAt).toLocaleString()}`);
        remove.addEventListener("click", () => {
          if (!confirm("Delete this saved game? League standings and personal bests will be recalculated.")) return;
          try {
            HarmoniesRecords.remove(game.id);
            renderLeaderboard();
            status.textContent = "Game deleted.";
            status.classList.remove("error");
          } catch (error) { showError(error); }
        });
        row.append(details, remove);
        history.append(row);
      }
    } catch (error) {
      leagueSelect.disabled = true;
      exportButton.disabled = true;
      showError(error);
    }
  }

  function showError(error) {
    status.textContent = `Records could not be updated. ${error.message} Existing records have not been replaced.`;
    status.classList.add("error");
  }

  leagueSelect.addEventListener("change", renderLeaderboard);
  window.addEventListener("storage", (event) => {
    if (event.key === HarmoniesRecords.storageKey || event.key === null) renderLeaderboard();
  });
  exportButton.addEventListener("click", () => {
    try {
      const blob = new Blob([JSON.stringify(HarmoniesRecords.read(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `harmonies-games-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Backup exported.";
      status.classList.remove("error");
    } catch (error) { showError(error); }
  });
  document.querySelector("#import-records").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a backup smaller than 5 MB.");
      HarmoniesRecords.merge(JSON.parse(await file.text()));
      renderLeaderboard();
      status.textContent = "Backup imported. Existing games kept; duplicates skipped.";
      status.classList.remove("error");
    } catch (error) { showError(error); }
    fileInput.value = "";
  });
  renderLeaderboard();
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.protocol === "http:")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch((error) => {
      console.warn("Offline support is unavailable.", error);
    });
  });
}