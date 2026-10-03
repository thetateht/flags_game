// Small DOM helpers shared by screens.
import { translate } from "./app.js";

// Creates an element with optional CSS class and translated text.
// Elements with data-key get their text refreshed on language change.
export function el(tag, className, key) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (key) {
    element.dataset.key = key;
    element.textContent = translate(key);
  }
  return element;
}

// Clears the main container, so a screen can build itself from scratch.
export function clearScreen() {
  const root = document.getElementById("app");
  root.replaceChildren();
  return root;
}

// Hidden canvas, used only to measure text width.
const measureContext = document.createElement("canvas").getContext("2d");

// Largest font size (in pt, from maxPt down to minPt) at which `text`
// fits in `maxLines` lines of `maxWidth` px (like fit_capital_font_size in Python).
export function fitFontSize(text, { family, weight = "normal", maxPt, minPt, maxWidth, maxLines = 1 }) {
  for (let pt = maxPt; pt > minPt; pt--) {
    measureContext.font = `${weight} ${pt}pt ${family}`;
    if (countLines(text, maxWidth) <= maxLines) return pt;
  }
  return minPt;
}

// Number of lines after wrapping words to maxWidth (Infinity if one word is too long).
function countLines(text, maxWidth) {
  let lines = 1;
  let line = "";
  for (const word of text.split(" ")) {
    if (measureContext.measureText(word).width > maxWidth) return Infinity;
    const candidate = line ? `${line} ${word}` : word;
    if (measureContext.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines += 1;
      line = word;
    }
  }
  return lines;
}
