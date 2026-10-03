// Small random helpers (JS has no built-in random.shuffle / random.sample).

// Shuffles the array in place (Fisher–Yates) and returns it.
export function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Picks one item with probability proportional to its weight,
// like Python's random.choices(items, weights=weights, k=1)[0].
export function weightedChoice(items, weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1]; // guard against rounding errors
}

// Returns k unique random items, like Python's random.sample().
export function sample(items, k) {
  return shuffle([...items]).slice(0, k);
}
