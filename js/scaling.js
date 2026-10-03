// Scales the whole game to the window size (with limits), so on big screens
// everything is larger instead of leaving empty space.

// Size (px) the layout was designed for at scale 1.
const DESIGN_WIDTH = 1250;
const DESIGN_HEIGHT = 915;
const MIN_SCALE = 0.75;
const MAX_SCALE = 1.2;

function updateScale() {
  const width = document.documentElement.clientWidth; // without the scrollbar
  const height = window.innerHeight;
  const fit = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));

  const root = document.documentElement.style;
  root.setProperty("--scale", scale);
  // Window width in the game's own (scaled) pixels, for CSS calculations;
  // the vw unit would not account for the zoom.
  root.setProperty("--viewport-width", `${width / scale}px`);
  root.setProperty("--viewport-height", `${height / scale}px`);
}

// Call once at startup.
export function setupScaling() {
  updateScale();
  window.addEventListener("resize", updateScale);
}
