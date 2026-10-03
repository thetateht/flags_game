// Game engine: state of the current round and all game logic, independent of the UI
// (port of py/game_engine.py). Works only on two-letter country codes.
import { shuffle, weightedChoice } from "./random.js";

const LEVEL_COMPOSITION = {
  1: { easy: 2, hard: 1, extr: 0 },
  2: { easy: 2, hard: 2, extr: 0 },
  3: { easy: 1, hard: 3, extr: 1 },
};
const POINTS_CORRECT = 2;
const POINTS_WRONG = -2;
const POINTS_EMPTY = -1;
const FLAGS_ONLY_MULTIPLIER = 2; // "Hidden flags": flag points count double (time bonus does not)

const LEVEL_UP_THRESHOLD = 100;
const MAX_LEVEL = 3;
const WIN_THRESHOLD = 400;
const LOSE_THRESHOLD = -20;
export const TIME_LIMIT_SECONDS = 15;
const SHAPE_COOLDOWN_DIVISOR = 3; // cooldown window: number_of_groups / 3

export class GameEngine {
  constructor(shapes, countryWeights) {
    this._shapes = shapes;
    this._countryWeights = countryWeights;

    this._countries = [];
    this._flagsBank = [];
    this._capitalsBank = [];
    this._assignments = {};
    this.isChecked = false;
    // "Hidden flags" mode: only flags count (double points), capitals are ignored.
    // Set before a game starts; reset() does not change it.
    this.flagsOnly = false;
    this.reset();
  }

  // Resets the whole game (score, level, stats) – called when a new game starts.
  reset() {
    this._totalScore = 0;
    this._roundScore = 0;
    this._level = 1;
    this._answerCounts = {
      flag: { correct: 0, wrong: 0, empty: 0 },
      capital: { correct: 0, wrong: 0, empty: 0 },
    };
    this._mistakesByCountry = {};
    this._hasWon = false;
    this._hasLost = false;
    // Recently used shape groups (Python used a deque with maxlen)
    this._recentShapes = [];
    this._recentShapesMax = Math.floor(Object.keys(this._shapes).length / SHAPE_COOLDOWN_DIVISOR);
    this._currentStreak = 0;
    this._maxStreak = 0;
    this._lastTimeBonus = 0;
  }

  // Read-only views of the state
  get countries() { return this._countries; }
  get flagsBank() { return this._flagsBank; }
  get capitalsBank() { return this._capitalsBank; }
  get totalScore() { return this._totalScore; }
  get roundScore() { return this._roundScore; }
  get level() { return this._level; }
  get hasWon() { return this._hasWon; }
  get hasLost() { return this._hasLost; }
  get maxStreak() { return this._maxStreak; }
  get lastTimeBonus() { return this._lastTimeBonus; }
  get answerCounts() { return structuredClone(this._answerCounts); }
  get mistakesByCountry() { return { ...this._mistakesByCountry }; }

  // Level only goes up, never down.
  _updateLevel() {
    const impliedLevel = Math.min(MAX_LEVEL, Math.max(1, 1 + Math.floor(this._totalScore / LEVEL_UP_THRESHOLD)));
    this._level = Math.max(this._level, impliedLevel);
  }

  // Once won/lost, stays so until reset().
  _updateDerivedState() {
    this._updateLevel();
    if (this._totalScore >= WIN_THRESHOLD) this._hasWon = true;
    if (this._totalScore <= LOSE_THRESHOLD) this._hasLost = true;
  }

  // Picks k unique codes from pool; rarer countries have higher weight.
  _weightedSample(pool, k) {
    const remaining = [...pool];
    const chosen = [];
    for (let i = 0; i < k; i++) {
      const weights = remaining.map((code) => this._countryWeights[code]);
      const pick = weightedChoice(remaining, weights);
      chosen.push(pick);
      remaining.splice(remaining.indexOf(pick), 1);
    }
    return chosen;
  }

  // Points for one field: correct = true/false, or null when empty.
  static _pointsFor(correct) {
    if (correct === null) return POINTS_EMPTY;
    return correct ? POINTS_CORRECT : POINTS_WRONG;
  }

  // Updates answer stats, mistakes per country and the streak. field: "flag" or "capital".
  _recordAnswer(code, field, correct) {
    const counts = this._answerCounts[field];
    if (correct === null) {
      counts.empty += 1;
      this._currentStreak = 0;
    } else if (correct) {
      counts.correct += 1;
      this._currentStreak += 1;
      this._maxStreak = Math.max(this._maxStreak, this._currentStreak);
    } else {
      counts.wrong += 1;
      this._mistakesByCountry[code] = (this._mistakesByCountry[code] ?? 0) + 1;
      this._currentStreak = 0;
    }
  }

  // Draws a new round: a shape group, countries by level composition,
  // and flag/capital banks (same countries + one extra, shuffled separately).
  generateRound(level) {
    const shapeNames = Object.keys(this._shapes).filter((name) => !this._recentShapes.includes(name));
    // Group weight: square root of its size (easy + hard), so big groups are drawn
    // a bit more often, but not proportionally more (Python used the size itself).
    const weights = shapeNames.map((name) => Math.sqrt(this._shapes[name].easy.length + this._shapes[name].hard.length));
    const shape = weightedChoice(shapeNames, weights);
    this._recentShapes.push(shape);
    if (this._recentShapes.length > this._recentShapesMax) this._recentShapes.shift();

    const group = this._shapes[shape];
    const easyPool = group.easy;
    const hardPool = group.hard;
    const extrPool = group.extr ?? [];

    const composition = LEVEL_COMPOSITION[level];
    const codes = shuffle([
      ...this._weightedSample(easyPool, composition.easy),
      ...this._weightedSample(hardPool, composition.hard),
      ...this._weightedSample(extrPool, composition.extr),
    ]);

    const extraPool = [...hardPool, ...(composition.extr > 0 ? extrPool : [])]
      .filter((c) => !codes.includes(c));
    const extraCode = this._weightedSample(extraPool, 1)[0];

    this._countries = codes;
    this._flagsBank = shuffle([...codes, extraCode]);
    this._capitalsBank = shuffle([...codes, extraCode]);
    this._assignments = {};
    for (const code of codes) {
      this._assignments[code] = { flag: null, capital: null };
    }
    this.isChecked = false;
    this._roundScore = 0;
    this._lastTimeBonus = 0;
  }

  // Assign/unassign return the previously assigned code (or null),
  // so the UI can re-enable that button in the bank.
  assignFlag(countryCode, flagCode) { return this._set(countryCode, "flag", flagCode); }
  assignCapital(countryCode, capitalCode) { return this._set(countryCode, "capital", capitalCode); }
  unassignFlag(countryCode) { return this._set(countryCode, "flag", null); }
  unassignCapital(countryCode) { return this._set(countryCode, "capital", null); }

  // Country that has `value` assigned as `field` ("flag" or "capital"), or null.
  ownerOf(field, value) {
    for (const [code, assignment] of Object.entries(this._assignments)) {
      if (assignment[field] === value) return code;
    }
    return null;
  }

  _set(countryCode, field, value) {
    const previous = this._assignments[countryCode][field];
    this._assignments[countryCode][field] = value;
    return previous;
  }

  // Checks all assignments and adds points (+2 / -2 / -1 per field).
  // secondsRemaining: in timed mode, added as bonus only for a flawless round.
  // Returns {code: {flag, capital}} with true/false, or null for empty.
  // Points are counted only until the game is won.
  _addPoints(points) {
    if (this._hasWon) return;
    this._roundScore += points;
    this._totalScore += points;
  }

  checkAnswers(secondsRemaining = null) {
    const result = {};
    let flawless = true;
    for (const code of this._countries) {
      const assignment = this._assignments[code];
      const flagCorrect = assignment.flag === null ? null : assignment.flag === code;
      const capitalCorrect = assignment.capital === null ? null : assignment.capital === code;

      if (this.flagsOnly) {
        // Capitals are not shown and not counted at all.
        if (!flagCorrect) flawless = false;
        result[code] = { flag: flagCorrect, capital: null };
        this._addPoints(GameEngine._pointsFor(flagCorrect) * FLAGS_ONLY_MULTIPLIER);
        this._recordAnswer(code, "flag", flagCorrect);
        continue;
      }

      if (!flagCorrect || !capitalCorrect) flawless = false;
      result[code] = { flag: flagCorrect, capital: capitalCorrect };
      this._addPoints(GameEngine._pointsFor(flagCorrect) + GameEngine._pointsFor(capitalCorrect));
      this._recordAnswer(code, "flag", flagCorrect);
      this._recordAnswer(code, "capital", capitalCorrect);
    }

    if (secondsRemaining !== null && flawless && !this._hasWon) {
      this._roundScore += secondsRemaining;
      this._totalScore += secondsRemaining;
      this._lastTimeBonus = secondsRemaining;
    } else {
      this._lastTimeBonus = 0;
    }

    this._updateDerivedState();
    this.isChecked = true;
    return result;
  }
}
