"use strict";

const scoresheet = document.querySelector("#scoresheet");
const template = document.querySelector("#player-template");
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

scoresheet.addEventListener("submit", (event) => event.preventDefault());
scoresheet.addEventListener("input", (event) => {
  if (event.target.matches(".score")) updateTotals(event.target.closest(".player"));
});

document.querySelector("#reset").addEventListener("click", () => {
  const hasEntries = [...scoresheet.querySelectorAll("input")].some((input) => input.value !== "");
  if (hasEntries && !confirm("Start a new game? All names and scores will be cleared.")) return;
  scoresheet.reset();
  scoresheet.querySelectorAll(".player").forEach(updateTotals);
  scoresheet.querySelector(".player-name").focus();
});