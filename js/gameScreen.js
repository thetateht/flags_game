// Game screen: country cards, flag and capital banks, bottom buttons
// (port of py/ui/game_screen.py). All game logic lives in app.engine.
import { COUNTRIES_BY_CODE, DATA_DIR } from "./dataLoader.js";
import { app, translate, getCountryName, getCapitalName, startGame, nextRound, returnToStart } from "./app.js";
import { RoundTimer } from "./roundTimer.js";
import { TIME_LIMIT_SECONDS } from "./gameEngine.js";
import { showStatsPopup, CountryHoverPopup } from "./popups.js";
import { makeDraggable } from "./dragDrop.js";
import { el, clearScreen, fitFontSize } from "./dom.js";

// Widgets of the current round, looked up by country code (Map: code -> element).
let countryButtons, flagButtons, capitalButtons, flagSlots, capSlots;
// Currently selected items: {button, code} or null for each group.
let selected;
// Labels and buttons updated after checking.
let titleLabel, statusColumn, statusCard, levelLabel, scoresBlock, roundScoreLabel, totalScoreLabel, checkButton, returnButton;
// Countdown of the current round (timed mode only), otherwise null.
let roundTimer;
// Country info tooltip; one for the whole game, reset each round.
const hoverPopup = new CountryHoverPopup();
let countriesRow;
let screenElement; // gets the "checked" class after checking (no more clickable slots)

// Text areas for capital names (px), used to shrink the font of long names.
const CAPITAL_BUTTON_TEXT_WIDTH = 158; // .btn-capital min-width minus padding and border
const CAPITAL_SLOT_TEXT_WIDTH = 153; // .country-card width minus slot border and padding

// Protection against clicking "Next" by accident right after checking:
// after the Check click, clicks are silently ignored (catches double clicks);
// after time ran out, Next and End game are greyed out (a late click aimed at Check).
const NEXT_LOCK_AFTER_CHECK_MS = 300;
const NEXT_LOCK_AFTER_TIMEOUT_MS = 1500;
const REVEAL_DONE_BEFORE_END_S = 2; // "Hidden flags": flags fully visible 2 s before time is up
const MESSAGE_LOCK_MS = 3000; // after level-up / win / loss, so the message is not missed
let nextAllowedAt; // time (ms) from which a click on Next is accepted
let buttonsLockedUntil; // end (ms) of the longest running grey-out lock

export function showGameScreen() {
  const root = clearScreen();
  hoverPopup.reset();
  countryButtons = new Map();
  flagButtons = new Map();
  capitalButtons = new Map();
  flagSlots = new Map();
  capSlots = new Map();
  selected = { country: null, flag: null, capital: null };
  nextAllowedAt = 0;
  buttonsLockedUntil = 0;

  const screen = el("div", "game");
  screenElement = screen;
  startHiddenFlags();
  screen.append(
    renderHeader(),
    renderCountriesRow(),
    renderBanks(),
    renderBottomBar(),
  );
  root.append(screen);
}

// "Hidden flags" mode: flags only (capitals hidden), revealed from left to right –
// from 10%, fully visible REVEAL_DONE_BEFORE_END_S before time is up (CSS animation,
// restarted every round).
function startHiddenFlags() {
  const body = document.body;
  body.classList.remove("hidden-flags", "reveal-paused");
  if (!app.hiddenFlagsMode) return;
  screenElement.classList.add("flags-only");
  void body.offsetWidth; // restart the CSS animation
  body.classList.add("hidden-flags");
  body.style.animationDuration = `${TIME_LIMIT_SECONDS - REVEAL_DONE_BEFORE_END_S}s`;
}

// ---------- Clicking ----------

// group: "country", "flag" or "capital".
function selectItem(group, button, code) {
  // A flag or capital can be picked only after picking a country.
  if (group !== "country" && !selected.country) return;

  selected[group]?.button.classList.remove("selected");
  selected[group] = { button, code };
  button.classList.add("selected");

  if (selected.country && selected.flag) {
    assignFlag();
    clearSelectionExceptCountry();
  } else if (selected.country && selected.capital) {
    assignCapital();
    clearSelectionExceptCountry();
  }
}

// After an assignment the country stays selected, so its capital can be picked next.
function clearSelectionExceptCountry() {
  for (const group of ["flag", "capital"]) {
    selected[group]?.button.classList.remove("selected");
    selected[group] = null;
  }
}

// Assigns the selected flag to the selected country.
// A flag already used by another country is moved from there (its slot becomes empty).
function assignFlag() {
  const countryCode = selected.country.code;
  const flagCode = selected.flag.code;

  const owner = app.engine.ownerOf("flag", flagCode);
  if (owner === countryCode) return; // already there
  if (owner !== null) {
    app.engine.unassignFlag(owner);
    clearFlagSlot(owner);
  }

  // The previous flag of this country goes back to the bank.
  const previous = app.engine.assignFlag(countryCode, flagCode);
  if (previous !== null) flagButtons.get(previous).classList.remove("used");

  const slot = flagSlots.get(countryCode);
  slot.replaceChildren(flagImage(flagCode));
  slot.classList.add("filled");
  slot.dataset.item = flagCode; // what lies in the slot (for dragging it out)
  flagButtons.get(flagCode).classList.add("used");
}

// Same as assignFlag, for capitals.
function assignCapital() {
  const countryCode = selected.country.code;
  const capitalCode = selected.capital.code;

  const owner = app.engine.ownerOf("capital", capitalCode);
  if (owner === countryCode) return;
  if (owner !== null) {
    app.engine.unassignCapital(owner);
    clearCapSlot(owner);
  }

  const previous = app.engine.assignCapital(countryCode, capitalCode);
  if (previous !== null) capitalButtons.get(previous).classList.remove("used");

  const slot = capSlots.get(countryCode);
  const name = getCapitalName(COUNTRIES_BY_CODE[capitalCode]);
  slot.textContent = name;
  slot.classList.add("filled");
  slot.dataset.item = capitalCode;
  // 14pt bold; smaller only if the name does not fit in 2 lines
  const size = fitFontSize(name, {
    family: "Arial, sans-serif", weight: "bold", maxPt: 14, minPt: 8,
    maxWidth: CAPITAL_SLOT_TEXT_WIDTH, maxLines: 2,
  });
  slot.style.fontSize = `${size}pt`;
  capitalButtons.get(capitalCode).classList.add("used");
}

// Click on a slot (ignored once the round is checked):
// filled – the flag goes back to the bank; in both cases the country gets selected.
function onFlagSlotClick(countryCode) {
  if (app.engine.isChecked) return;
  const previous = app.engine.unassignFlag(countryCode);
  if (previous !== null) {
    flagButtons.get(previous).classList.remove("used");
    clearFlagSlot(countryCode);
  }
  selectItem("country", countryButtons.get(countryCode), countryCode);
}

function onCapSlotClick(countryCode) {
  if (app.engine.isChecked) return;
  const previous = app.engine.unassignCapital(countryCode);
  if (previous !== null) {
    capitalButtons.get(previous).classList.remove("used");
    clearCapSlot(countryCode);
  }
  selectItem("country", countryButtons.get(countryCode), countryCode);
}

// Empty-slot look (the engine is updated separately).
function clearFlagSlot(countryCode) {
  const slot = flagSlots.get(countryCode);
  slot.textContent = translate("flag");
  slot.classList.remove("filled");
  delete slot.dataset.item;
}

function clearCapSlot(countryCode) {
  const slot = capSlots.get(countryCode);
  slot.textContent = translate("capital");
  slot.classList.remove("filled");
  slot.style.fontSize = "";
  delete slot.dataset.item;
}

// ---------- Checking ----------

// First click: check the round. Second click (already checked): next round.
// After losing: new game right away (same mode and language).
function onCheckNext() {
  if (app.engine.hasLost) {
    if (Date.now() < nextAllowedAt) return; // too soon after checking
    startGame();
  } else if (app.engine.isChecked) {
    if (Date.now() < nextAllowedAt) return; // too soon after checking
    nextRound();
  } else {
    performCheck();
  }
}

// Called by the Check button, or by the timer when time runs out
// (then timeRemaining is 0, so the time bonus is 0 anyway).
function performCheck() {
  const engine = app.engine;
  const levelBefore = engine.level;
  const wonBefore = engine.hasWon;

  const secondsRemaining = roundTimer ? roundTimer.timeRemaining : null;
  const timedOut = secondsRemaining !== null && secondsRemaining <= 0;
  const results = engine.checkAnswers(secondsRemaining);

  // Color filled slots green/red; empty ones stay as they are.
  for (const [code, result] of Object.entries(results)) {
    colorSlot(flagSlots.get(code), result.flag);
    colorSlot(capSlots.get(code), result.capital);
  }

  // After winning, points are no longer counted, so scores are not updated.
  if (!engine.hasWon) {
    setStatus(roundScoreLabel, "score", roundScoreValue());
    setStatus(totalScoreLabel, "points", app.engine.totalScore);
    roundTimer?.updateHighlight();
  }
  lockInputs();

  if (!app.hoverHintShown) {
    app.hoverHintShown = true;
    showHoverHint();
  }

  if (timedOut) {
    temporarilyDisableButtons(NEXT_LOCK_AFTER_TIMEOUT_MS);
  } else {
    nextAllowedAt = Date.now() + NEXT_LOCK_AFTER_CHECK_MS;
  }

  if (!engine.hasWon && engine.level > levelBefore) {
    showLevelUpMessage();
    temporarilyDisableButtons(MESSAGE_LOCK_MS);
  } else if (!engine.hasWon) {
    setStatus(levelLabel, "level", engine.level);
  }

  if (engine.hasWon && !wonBefore) {
    showWinMessage();
    replaceScoresWithStatsButton();
    temporarilyDisableButtons(MESSAGE_LOCK_MS);
  }

  if (engine.hasLost) {
    handleGameOver();
  } else {
    checkButton.textContent = translate(engine.hasWon ? "next_bonus" : "next");
    checkButton.classList.add("next"); // different color than Check
  }
}

// One-time (per session) hint about the country tooltip, above the cards; disappears after 4 s.
function showHoverHint() {
  const hint = el("div", "hover-hint", "hover_hint");
  countriesRow.append(hint);
  setTimeout(() => hint.remove(), 4000);
}

// Green message in place of "Level: N", until the 3 s lock ends.
function showLevelUpMessage() {
  levelLabel.textContent = translate("level_up");
  levelLabel.classList.add("correct");
}

// Green win message; stays until the end of the game.
// The whole card turns green (not only the text), so no white edge is left around it.
function showWinMessage() {
  levelLabel.textContent = translate("win");
  statusCard.classList.add("won", "correct");
}

// Scores leave the card; Stats button goes right below it (above Return).
function replaceScoresWithStatsButton() {
  scoresBlock.remove();
  statusCard.after(renderStatsButton());
  statusColumn.classList.add("won");
}

// Greys out Next and End game for `ms`. Several locks may overlap
// (time out + level-up): the buttons come back when the longest one ends.
function temporarilyDisableButtons(ms) {
  checkButton.disabled = true;
  returnButton.disabled = true;
  buttonsLockedUntil = Math.max(buttonsLockedUntil, Date.now() + ms);
  setTimeout(reenableButtons, ms);
}

function reenableButtons() {
  if (!checkButton.isConnected) return; // screen already replaced
  if (Date.now() + 10 < buttonsLockedUntil) return; // a longer lock is still running
  if (!app.engine.hasWon) {
    setStatus(levelLabel, "level", app.engine.level);
    levelLabel.classList.remove("correct");
  }
  returnButton.disabled = false;
  checkButton.disabled = false; // after losing it is the "New game" button
}

// After losing: red title, the big button becomes "New game", Stats button below the card.
function handleGameOver() {
  titleLabel.textContent = translate("loss");
  titleLabel.classList.add("wrong");
  checkButton.textContent = translate("new_game");
  checkButton.classList.add("next"); // same color as "Next"
  statusCard.after(renderStatsButton()); // stats only on request, like after winning
  temporarilyDisableButtons(MESSAGE_LOCK_MS); // so the message is not skipped by accident
}

// correct: true / false, or null for an empty slot.
function colorSlot(slot, correct) {
  if (correct === null) return;
  slot.classList.add(correct ? "correct" : "wrong");
}

// No more changes after checking: all bank and country buttons disabled, slots not clickable.
function lockInputs() {
  screenElement.classList.add("checked");
  // "Hidden flags": the reveal stops in the bank (shows how much was visible when answering)
  document.body.classList.add("reveal-paused");
  clearSelectionExceptCountry();
  selected.country?.button.classList.remove("selected");
  selected.country = null;
  for (const buttons of [countryButtons, flagButtons, capitalButtons]) {
    for (const button of buttons.values()) button.disabled = true;
  }
}

// Status line = label + value in separate spans, so CSS can style them apart.
function setStatus(line, key, value) {
  const label = el("span", "status-label", key);
  const valueSpan = el("span", "status-value");
  valueSpan.textContent = value;
  line.replaceChildren(label, valueSpan);
}

// Round score shows "—" until the round is checked, then e.g. "+8" or "-3".
function roundScoreValue() {
  const engine = app.engine;
  const score = engine.roundScore;
  return engine.isChecked ? `${score >= 0 ? "+" : ""}${score}` : "—";
}

function flagImage(code) {
  const img = el("img");
  img.src = `${DATA_DIR}/${COUNTRIES_BY_CODE[code].flag}`;
  img.alt = "";
  // No browser image dragging: a quick click with a small mouse move started a drag,
  // which got stuck when the button was disabled at time-out (page stopped reacting)
  img.draggable = false;
  return img;
}

// ---------- Layout ----------

// Three columns: level + scores | title | timer (timed mode only).
function renderHeader() {
  const header = el("div", "game-header");

  // Left column: status card; after winning: win message in the card, Stats button below it.
  statusColumn = el("div", "game-status");
  statusCard = el("div", "status-card");
  statusColumn.append(statusCard);
  if (app.engine.hasWon) {
    statusColumn.classList.add("won");
    statusCard.classList.add("won");
    statusCard.append(renderLevelLabel("win"));
    statusColumn.append(renderStatsButton());
  } else {
    statusCard.append(renderLevelLabel(), renderScores());
  }
  statusColumn.append(renderReturnButton());
  titleLabel = el("h1", "title", "game_title");
  header.append(statusColumn, titleLabel);

  // Right column: timer (timed mode; not after winning – points are not counted any more).
  const tools = el("div", "game-tools");
  roundTimer = null;
  if (app.timedMode && !app.engine.hasWon) {
    roundTimer = new RoundTimer(performCheck);
    tools.append(roundTimer.render());
  }
  header.append(tools);
  return header;
}

// Dragging works (together with clicking) until the round is checked.
function canDrag(button) {
  return !app.engine.isChecked && !button.disabled;
}

// Drop = the same as clicking the country and then the flag/capital.
function dropOnCountry(group, button, code, countryCode) {
  selectItem("country", countryButtons.get(countryCode), countryCode);
  selectItem(group, button, code);
}

// Dragging out of a filled slot: onto another country = move it there,
// onto the banks = put it back (unassign).
function makeSlotDraggable(slot, group, countryCode) {
  const buttons = group === "flag" ? flagButtons : capitalButtons;
  makeDraggable(slot, {
    isEnabled: () => !app.engine.isChecked && slot.classList.contains("filled"),
    createGhost: () => {
      const code = slot.dataset.item;
      if (group === "flag") {
        const ghost = el("div", "drag-ghost-flag");
        ghost.append(flagImage(code));
        return ghost;
      }
      const ghost = el("div", "drag-ghost-capital");
      ghost.textContent = getCapitalName(COUNTRIES_BY_CODE[code]);
      ghost.style.fontSize = buttons.get(code).style.fontSize;
      return ghost;
    },
    targets: ".country-card, .banks",
    onDrop: (target) => {
      const code = slot.dataset.item;
      if (target.classList.contains("banks")) {
        unassignToBank(group, countryCode);
      } else if (target.dataset.code !== countryCode) {
        dropOnCountry(group, buttons.get(code), code, target.dataset.code);
      }
    },
  });
}

// Puts the flag/capital of a country back to the bank (no country gets selected).
function unassignToBank(group, countryCode) {
  if (group === "flag") {
    const previous = app.engine.unassignFlag(countryCode);
    if (previous !== null) flagButtons.get(previous).classList.remove("used");
    clearFlagSlot(countryCode);
  } else {
    const previous = app.engine.unassignCapital(countryCode);
    if (previous !== null) capitalButtons.get(previous).classList.remove("used");
    clearCapSlot(countryCode);
  }
}

// key: optional text key shown instead of "Level: N" (used for the win message).
function renderLevelLabel(key) {
  levelLabel = el("p", "level-label status-line", key);
  if (!key) setStatus(levelLabel, "level", app.engine.level);
  return levelLabel;
}

function renderStatsButton() {
  const button = el("button", "btn btn-bottom btn-stats", "stats");
  button.addEventListener("click", showStatsPopup);
  return button;
}

function renderCountriesRow() {
  const row = el("div", "countries-row");
  countriesRow = row;
  for (const code of app.engine.countries) {
    row.append(renderCountryCard(code));
  }
  return row;
}

function renderScores() {
  const scores = el("div", "scores");
  scoresBlock = scores;
  roundScoreLabel = el("p", "score-label status-line");
  setStatus(roundScoreLabel, "score", roundScoreValue());
  totalScoreLabel = el("p", "score-label status-line");
  setStatus(totalScoreLabel, "points", app.engine.totalScore);
  scores.append(roundScoreLabel, totalScoreLabel);
  return scores;
}

// Country name button, empty flag slot and empty capital slot.
function renderCountryCard(code) {
  const country = COUNTRIES_BY_CODE[code];
  const card = el("div", "country-card");
  card.dataset.code = code; // drop target for dragging

  const nameArea = el("div", "name-area");
  const button = el("button", "btn btn-country");
  button.textContent = getCountryName(country);
  button.addEventListener("click", () => selectItem("country", button, code));
  nameArea.append(button);
  countryButtons.set(code, button);

  const flagSlot = el("div", "slot flag-slot", "flag");
  flagSlot.addEventListener("click", () => onFlagSlotClick(code));
  makeSlotDraggable(flagSlot, "flag", code);
  flagSlots.set(code, flagSlot);

  const capSlot = el("div", "slot cap-slot", "capital");
  capSlot.addEventListener("click", () => onCapSlotClick(code));
  makeSlotDraggable(capSlot, "capital", code);
  capSlots.set(code, capSlot);

  card.append(nameArea, flagSlot, capSlot);
  hoverPopup.bind(code, card);
  return card;
}

function renderBanks() {
  const banks = el("div", "banks");
  banks.append(renderFlagsBank(), renderCapitalsBank());
  return banks;
}

function renderFlagsBank() {
  const section = el("div", "bank flags-bank");
  const grid = el("div", "bank-grid");
  // 4 flags (level 1) -> 2 columns; 5 or 6 (levels 2/3) -> 3 columns
  const columns = app.engine.flagsBank.length <= 4 ? 2 : 3;
  grid.style.gridTemplateColumns = `repeat(${columns}, auto)`;

  for (const code of app.engine.flagsBank) {
    const button = el("button", "btn btn-flag");
    // Box around the image: in "Hidden flags" it shows the striped curtain behind the hidden part
    const box = el("span", "flag-box");
    box.append(flagImage(code));
    button.append(box);
    button.addEventListener("click", () => selectItem("flag", button, code));
    makeDraggable(button, {
      isEnabled: () => canDrag(button),
      createGhost: () => {
        const ghost = el("div", "drag-ghost-flag");
        ghost.append(flagImage(code));
        return ghost;
      },
      targets: ".country-card",
      onDrop: (card) => dropOnCountry("flag", button, code, card.dataset.code),
    });
    grid.append(button);
    flagButtons.set(code, button);
  }

  section.append(el("p", "bank-label", "flags"), grid);
  return section;
}

function renderCapitalsBank() {
  const section = el("div", "bank capitals-bank");
  const grid = el("div", "bank-grid");
  // 4 or 5 capitals (levels 1/2) -> 1 column; 6 (level 3) -> 2 columns
  const columns = app.engine.capitalsBank.length <= 5 ? 1 : 2;
  grid.style.gridTemplateColumns = `repeat(${columns}, auto)`;
  section.classList.toggle("two-columns", columns === 2);

  for (const code of app.engine.capitalsBank) {
    const button = el("button", "btn btn-capital");
    const name = getCapitalName(COUNTRIES_BY_CODE[code]);
    button.textContent = name;
    // Long names get a smaller font, so all buttons keep the same width
    const size = fitFontSize(name, {
      family: "Arial, sans-serif", maxPt: 14, minPt: 8, maxWidth: CAPITAL_BUTTON_TEXT_WIDTH,
    });
    button.style.fontSize = `${size}pt`;
    button.addEventListener("click", () => selectItem("capital", button, code));
    makeDraggable(button, {
      isEnabled: () => canDrag(button),
      createGhost: () => {
        const ghost = el("div", "drag-ghost-capital");
        ghost.textContent = name;
        ghost.style.fontSize = button.style.fontSize;
        return ghost;
      },
      targets: ".country-card",
      onDrop: (card) => dropOnCountry("capital", button, code, card.dataset.code),
    });
    grid.append(button);
    capitalButtons.set(code, button);
  }

  section.append(el("p", "bank-label", "capitals"), grid);
  return section;
}

function renderBottomBar() {
  const bar = el("div", "bottom-bar");
  checkButton = el("button", "btn btn-check", "check");
  checkButton.addEventListener("click", onCheckNext);
  bar.append(checkButton);
  return bar;
}

// "End game": secondary button in the top left corner, below the status card (and Stats after winning).
function renderReturnButton() {
  returnButton = el("button", "btn btn-bottom btn-return", "return");
  returnButton.addEventListener("click", () => {
    hoverPopup.reset();
    returnToStart();
  });
  return returnButton;
}
