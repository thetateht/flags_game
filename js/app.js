// Shared app state, helpers and game flow used by both screens (port of py/app.py).
import { LANG, SHAPES, COUNTRY_WEIGHTS } from "./dataLoader.js";
import { GameEngine } from "./gameEngine.js";
import { showStartScreen } from "./startScreen.js";
import { showGameScreen } from "./gameScreen.js";
import { setupScaling } from "./scaling.js";

export const app = {
  engine: null, // created in initApp(), after data is loaded
  currentLang: "pl",
  timedMode: false,
  hiddenFlagsMode: false, // "Hidden flags": flags only, revealed gradually (always with the timer)
  wallpaperCountries: null, // drawn once per session
  hoverHintShown: false, // tooltip hint is shown once per session
};

// Call once, after loadData().
export function initApp() {
  app.engine = new GameEngine(SHAPES, COUNTRY_WEIGHTS);
  setupScaling();
  showStartScreen();
}

const FALLBACK_LANG = "en"; // used when a text is missing in the current language

// Picks the current language from a {pl: ..., en: ..., ...} object, or English if missing.
export function inCurrentLang(texts) {
  return texts[app.currentLang] ?? texts[FALLBACK_LANG];
}

// Returns the text for `key` in the current language.
export function translate(key) {
  return inCurrentLang(LANG[key]);
}

export function getCountryName(country) {
  return inCurrentLang(country.name);
}

export function getCapitalName(country) {
  return inCurrentLang(country.capital);
}

// ---------- Game flow ----------

// Resets the game, draws the first round and shows the game screen.
export function startGame() {
  app.engine.reset();
  app.engine.flagsOnly = app.hiddenFlagsMode; // "Hidden flags": only flags count
  app.engine.generateRound(app.engine.level);
  showGameScreen();
}

// Draws the next round at the current (score-based) level.
export function nextRound() {
  app.engine.generateRound(app.engine.level);
  showGameScreen();
}

export function returnToStart() {
  showStartScreen();
}
