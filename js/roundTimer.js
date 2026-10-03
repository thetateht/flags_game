// Countdown in timed mode (port of py/ui/round_timer.py).
// A new timer is created for every round, together with the game screen.
import { app } from "./app.js";
import { TIME_LIMIT_SECONDS } from "./gameEngine.js";
import { el } from "./dom.js";

export class RoundTimer {
  constructor(onTimeout) {
    this.onTimeout = onTimeout;
    this.timeRemaining = TIME_LIMIT_SECONDS;
    // Same look as the status card: "Czas: 15" with label and value in separate spans
    this.label = el("p", "timer status-card");
    this.value = el("span", "status-value");
    this.value.textContent = this.timeRemaining;
    this.label.append(el("span", "status-label", "time_left"), this.value);
  }

  // Starts counting down; returns the label to put on the screen.
  render() {
    setTimeout(() => this._tick(), 1000);
    return this.label;
  }

  _tick() {
    // Stop when the round was checked or the screen was replaced (Next / Return).
    if (app.engine.isChecked || !this.label.isConnected) return;
    this.timeRemaining -= 1;
    this.value.textContent = this.timeRemaining;
    if (this.timeRemaining <= 0) {
      this.onTimeout();
    } else {
      setTimeout(() => this._tick(), 1000);
    }
  }

  // After checking: green when a time bonus was given, red when time ran out,
  // no color otherwise (time left, but the round had mistakes).
  updateHighlight() {
    if (this.timeRemaining <= 0) {
      this.label.classList.add("wrong");
    } else if (app.engine.lastTimeBonus > 0) {
      this.label.classList.add("correct");
    }
  }
}
