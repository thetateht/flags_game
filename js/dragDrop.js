// Dragging flags and capitals: from the banks onto country cards,
// and from a filled slot onto another country or back to the banks.
// Uses pointer events, so it works with a mouse and on touch screens
// (not the browser's built-in drag and drop, which caused the page freeze).

const DRAG_THRESHOLD_PX = 8; // smaller moves count as a click

// After a real drag the browser may still send a "click"; it must not select anything.
let suppressNextClick = false;
window.addEventListener("click", (event) => {
  if (!suppressNextClick) return;
  suppressNextClick = false;
  event.stopPropagation();
  event.preventDefault();
}, true);

function currentScale() {
  return Number(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
}

// source: element that can be dragged.
// isEnabled(): whether dragging is allowed right now.
// createGhost(): element that follows the pointer while dragging.
// targets: CSS selector of elements it can be dropped on (they get the "drop-target" class).
// onDrop(target): called with the target element it was dropped on.
export function makeDraggable(source, { isEnabled, createGhost, targets, onDrop }) {
  source.addEventListener("pointerdown", (down) => {
    if (down.button !== 0 || !isEnabled()) return;
    const startX = down.clientX;
    const startY = down.clientY;
    let ghost = null;
    let target = null;

    const move = (event) => {
      if (!ghost) {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD_PX) return;
        ghost = createGhost();
        ghost.classList.add("drag-ghost");
        document.body.append(ghost);
        source.classList.add("dragging");
      }
      // The ghost is zoomed like the game, so its position is divided by the scale.
      const scale = currentScale();
      ghost.style.left = `${event.clientX / scale}px`;
      ghost.style.top = `${event.clientY / scale}px`;

      const under = document.elementFromPoint(event.clientX, event.clientY)?.closest(targets) ?? null;
      if (under !== target) {
        target?.classList.remove("drop-target");
        target = under;
        target?.classList.add("drop-target");
      }
    };

    const finish = (dropped) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      if (!ghost) return; // no real move: the normal click handles it
      ghost.remove();
      source.classList.remove("dragging");
      target?.classList.remove("drop-target");
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 0);
      if (dropped && target && isEnabled()) onDrop(target);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  });
}
