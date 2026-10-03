// Popups on the game screen (port of py/ui/popups.py).
// Instead of separate windows, they are layers on top of the page.
import { COUNTRIES_BY_CODE } from "./dataLoader.js";
import { app, translate, getCountryName, inCurrentLang } from "./app.js";
import { el } from "./dom.js";

// Statistics summary; the game stays visible underneath.
export function showStatsPopup() {
  const engine = app.engine;
  const counts = engine.answerCounts;

  const overlay = el("div", "overlay");
  const popup = el("div", "popup");

  const lines = [
    statsLine("flags", counts.flag),
    // "Hidden flags" mode: capitals are not played, so no capitals line
    ...(engine.flagsOnly ? [] : [statsLine("capitals", counts.capital)]),
    `${translate("max_streak")}: ${engine.maxStreak}`,
  ];
  for (const text of lines) {
    const p = el("p", "popup-line");
    p.textContent = text;
    popup.append(p);
  }

  // Top 3 countries with most mistakes (sort keeps insertion order for ties, like Python).
  const top = Object.entries(engine.mistakesByCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (top.length > 0) {
    const names = top.map(([code]) => getCountryName(COUNTRIES_BY_CODE[code])).join(", ");
    const p = el("p", "popup-mistakes");
    p.textContent = `${translate("top_mistakes")}: ${names}`;
    popup.append(p);
  }

  const ok = el("button", "btn btn-bottom");
  ok.textContent = "OK";
  ok.addEventListener("click", () => overlay.remove());
  popup.append(ok);

  overlay.append(popup);
  document.body.append(overlay);
  ok.focus();
}

function statsLine(key, counts) {
  return (
    `${translate(key)}: ` +
    `${translate("correct")} ${counts.correct}, ` +
    `${translate("wrong")} ${counts.wrong}, ` +
    `${translate("empty")} ${counts.empty}`
  );
}

// Tooltip with info about a country (continent, languages, currency, ...),
// shown on hover over a country card, only after the round is checked.
// One object lives for the whole game; reset() cleans it up at each new round.
export class CountryHoverPopup {
  static SHOW_DELAY_MS = 450;
  static HIDE_DELAY_MS = 150;

  constructor() {
    this.showJob = null;
    this.hideJob = null;
    this.popup = null;
    this.code = null;
    this.mouseX = 0;
    this.mouseY = 0;
  }

  // mouseenter/mouseleave on the card are not fired when moving between
  // its inner elements, so there is no flicker inside one card.
  bind(code, card) {
    card.addEventListener("mouseenter", () => this._onEnter(code));
    card.addEventListener("mouseleave", () => this._onLeave());
    card.addEventListener("mousemove", (event) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    });
  }

  reset() {
    clearTimeout(this.showJob);
    clearTimeout(this.hideJob);
    this.popup?.remove();
    this.showJob = null;
    this.hideJob = null;
    this.popup = null;
    this.code = null;
  }

  _onEnter(code) {
    if (!app.engine.isChecked) return;
    clearTimeout(this.hideJob);
    this.hideJob = null;
    if (this.popup && this.code === code) return; // already shown for this card
    clearTimeout(this.showJob);
    this.code = code;
    this.showJob = setTimeout(() => this._show(code), CountryHoverPopup.SHOW_DELAY_MS);
  }

  _onLeave() {
    clearTimeout(this.showJob);
    this.showJob = null;
    clearTimeout(this.hideJob);
    this.hideJob = setTimeout(() => this._hide(), CountryHoverPopup.HIDE_DELAY_MS);
  }

  _show(code) {
    this.showJob = null;
    this.popup?.remove();

    const popup = el("div", "hover-popup");
    popup.textContent = this._text(COUNTRIES_BY_CODE[code]);
    // The popup is zoomed like the game (CSS), and zoom also scales its position,
    // so the mouse position is divided by the scale.
    const scale = Number(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
    popup.style.left = `${(this.mouseX + 15) / scale}px`;
    popup.style.top = `${(this.mouseY + 15) / scale}px`;
    document.body.append(popup);
    this.popup = popup;
  }

  _hide() {
    this.hideJob = null;
    this.popup?.remove();
    this.popup = null;
    this.code = null;
  }

  _text(country) {
    const continents = (country.continents ?? []).map((c) => translate(`continent_${c}`)).join(", ");
    let languages = (country.languages ?? []).map((l) => translate(`lang_${l}`)).join(", ");
    if (country.languages_note) {
      languages = `${languages} (${inCurrentLang(country.languages_note)})`;
    }

    const lines = [
      `${translate("continent")}: ${continents}`,
      `${translate("spoken_languages")}: ${languages}`,
    ];
    if (country.currency?.length) {
      const names = country.currency.map((c) => translate(`curr_${c}`)).join(", ");
      lines.push(`${translate("currency_label")}: ${names}`);
    }
    if (country.sovereign) {
      const sovereignName = getCountryName(COUNTRIES_BY_CODE[country.sovereign]);
      lines.push(`${translate("sovereign_label")}: ${sovereignName}`);
    }
    if (country.endonym) {
      lines.push(`${translate("endonym_label")}: ${country.endonym}`);
    }
    return lines.join("\n");
  }
}
