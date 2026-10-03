// Start screen: title, language switcher, flag wallpaper, rules, mode and Play
// (port of py/ui/start_screen.py).
import { COUNTRIES, AVAILABLE_LANGUAGES, DATA_DIR, LANG } from "./dataLoader.js";
import { app, translate, startGame } from "./app.js";
import { el, clearScreen } from "./dom.js";
import { sample } from "./random.js";

const WALLPAPER_COLUMNS = 23;
const WALLPAPER_ROWS = 7;
const WALLPAPER_EXCLUDED_CODES = new Set(["np"]);
const FIRST_TERRITORY_CODE = "ai"; // countries.json lists territories from here on

// Buttons and elements that change after the screen is built.
let languageButtons; // Map: lang -> button
let modeButtons; // Map: timed (true/false) -> button
let rulesTimedTexts; // timed-mode paragraph in each language layer
let rulesHiddenTexts; // "hidden flags" paragraph in each language layer
let rulesLayers; // Map: lang -> layer with the rules in that language

// Marks the button for `selectedKey` as selected, unmarks the others.
function highlightSelected(buttons, selectedKey) {
  for (const [key, button] of buttons) {
    button.classList.toggle("selected", key === selectedKey);
  }
}

// Swaps texts of all translated elements without rebuilding the screen.
function refreshLanguage() {
  document.documentElement.lang = app.currentLang;
  for (const element of document.querySelectorAll("[data-key]")) {
    element.textContent = translate(element.dataset.key);
  }
  showRulesLayer();
}

function selectLanguage(lang) {
  app.currentLang = lang;
  highlightSelected(languageButtons, lang);
  refreshLanguage();
}

// mode: "normal", "timed" or "hidden" (hidden flags always use the timer too).
function selectMode(mode) {
  app.timedMode = mode !== "normal";
  app.hiddenFlagsMode = mode === "hidden";
  highlightSelected(modeButtons, mode);
  for (const text of rulesTimedTexts) text.classList.toggle("highlight", app.timedMode);
  for (const text of rulesHiddenTexts) text.classList.toggle("highlight", app.hiddenFlagsMode);
}

function currentMode() {
  if (app.hiddenFlagsMode) return "hidden";
  return app.timedMode ? "timed" : "normal";
}

export function showStartScreen() {
  const root = clearScreen();

  const outer = el("div", "start");
  outer.append(
    el("h1", "title", "game_title"),
    renderLanguageSwitcher(),
    renderFlagWallpaper(),
    renderBottomRow(),
  );
  root.append(outer);
}

function renderLanguageSwitcher() {
  const row = el("div", "lang-switcher");
  languageButtons = new Map();
  for (const lang of AVAILABLE_LANGUAGES) {
    const button = el("button", "btn btn-lang");
    button.textContent = lang.toUpperCase();
    button.addEventListener("click", () => selectLanguage(lang));
    row.append(button);
    languageButtons.set(lang, button);
  }
  highlightSelected(languageButtons, app.currentLang);
  return row;
}

// Countries allowed on the wallpaper: no territories, no excluded codes.
function wallpaperEligibleCountries() {
  let cutoff = COUNTRIES.findIndex((c) => c.code === FIRST_TERRITORY_CODE);
  if (cutoff === -1) cutoff = COUNTRIES.length;
  return COUNTRIES.slice(0, cutoff).filter((c) => !WALLPAPER_EXCLUDED_CODES.has(c.code));
}

function renderFlagWallpaper() {
  // Drawn once per session, so returning from a game shows the same wallpaper.
  if (!app.wallpaperCountries) {
    app.wallpaperCountries = sample(wallpaperEligibleCountries(), WALLPAPER_COLUMNS * WALLPAPER_ROWS);
  }

  const grid = el("div", "wallpaper");
  grid.style.gridTemplateColumns = `repeat(${WALLPAPER_COLUMNS}, auto)`;
  for (const country of app.wallpaperCountries) {
    const img = el("img");
    img.src = `${DATA_DIR}/${country.flag}`;
    img.alt = "";
    img.draggable = false; // no browser image dragging (see flagImage in gameScreen.js)
    grid.append(img);
  }
  return grid;
}

function renderBottomRow() {
  const row = el("div", "bottom-row");

  const right = el("div", "start-right");
  const playButton = el("button", "btn btn-play", "play");
  playButton.addEventListener("click", startGame);
  right.append(el("p", "mode-label", "sel_mode"), renderModeButtons(), playButton);

  row.append(renderRulesPanel(), right);
  return row;
}

function renderModeButtons() {
  const row = el("div", "mode-buttons");
  modeButtons = new Map();
  for (const [mode, key] of [["normal", "mode_normal"], ["timed", "mode_timed"], ["hidden", "mode_hidden"]]) {
    // Name and a one-line description
    const button = el("button", "btn btn-choice");
    button.append(el("span", "mode-name", key), el("span", "mode-desc", `${key}_desc`));
    button.addEventListener("click", () => selectMode(mode));
    row.append(button);
    modeButtons.set(mode, button);
  }
  highlightSelected(modeButtons, currentMode());
  return row;
}

// The rules in all languages are stacked on top of each other and only the current
// one is visible, so the card always has the height of the longest version
// and does not change size when switching languages.
function renderRulesPanel() {
  const card = el("div", "rules-card");
  rulesTimedTexts = [];
  rulesHiddenTexts = [];
  rulesLayers = new Map();
  for (const lang of AVAILABLE_LANGUAGES) {
    const layer = el("div", "rules-layer");
    // Texts set directly in this layer's language (no data-key: not refreshed on switch)
    const text = (tag, className, key) => {
      const p = el(tag, className);
      p.textContent = LANG[key][lang] ?? LANG[key].en;
      return p;
    };
    const timed = text("p", "rules-text", "start_rules_timed");
    timed.classList.toggle("highlight", app.timedMode);
    rulesTimedTexts.push(timed);
    const hidden = text("p", "rules-text", "start_rules_hidden");
    hidden.classList.toggle("highlight", app.hiddenFlagsMode);
    rulesHiddenTexts.push(hidden);
    layer.append(
      text("p", "rules-head", "start_description"),
      text("p", "rules-text", "start_rules"),
      timed,
      hidden,
      text("p", "rules-text", "start_rules_end"),
    );
    card.append(layer);
    rulesLayers.set(lang, layer);
  }
  showRulesLayer();
  return card;
}

function showRulesLayer() {
  for (const [lang, layer] of rulesLayers) {
    layer.classList.toggle("hidden-layer", lang !== app.currentLang);
  }
}
