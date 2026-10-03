// Loads game data from data/ (port of py/data_loader.py).

export const DATA_DIR = "data";

// Filled in by loadData(); other modules read them after it resolves.
export let LANG = {};
export let COUNTRIES = [];
export let COUNTRIES_BY_CODE = {};
export let SHAPES = {};
export let COUNTRY_WEIGHTS = {};
export let AVAILABLE_LANGUAGES = [];

async function loadJson(name) {
  const response = await fetch(`${DATA_DIR}/${name}`);
  if (!response.ok) {
    throw new Error(`Cannot load ${name}: ${response.status}`);
  }
  return response.json();
}

// Adds "code" to each country; returns a list and a {code: country} lookup.
export function prepareCountries(raw) {
  const countries = [];
  const byCode = {};
  for (const [code, country] of Object.entries(raw)) {
    country.code = code;
    countries.push(country);
    byCode[code] = country;
  }
  return [countries, byCode];
}

// Strength of the country weighting (see computeCountryWeights):
// 1 = a country in n groups gets 1/n of the chance in each (all even in total),
// higher = rare countries are favored even more.
export const WEIGHT_EXPONENT = 1.4;

// Draw weight of each country inside its group: 1 / n^WEIGHT_EXPONENT,
// where n = in how many places it is listed in flags_by_shape.json (easy, hard and extr).
// Countries/territories listed in many groups have more chances, so they get a lower weight.
// (Python used maxN + 1 - n, counting only easy and hard.)
export function computeCountryWeights(shapes) {
  const occurrences = {};
  for (const group of Object.values(shapes)) {
    for (const code of [...group.easy, ...group.hard, ...(group.extr ?? [])]) {
      occurrences[code] = (occurrences[code] ?? 0) + 1;
    }
  }

  const weights = {};
  for (const [code, n] of Object.entries(occurrences)) {
    weights[code] = 1 / n ** WEIGHT_EXPONENT;
  }
  return weights;
}

// Loads all files in parallel; call once at startup.
export async function loadData() {
  const [language, langLabels, currencyLabels, rawCountries, shapes] = await Promise.all([
    loadJson("language.json"),
    loadJson("lang_labels.json"),
    loadJson("currency_labels.json"),
    loadJson("countries.json"),
    loadJson("flags_by_shape.json"),
  ]);

  LANG = { ...language, ...langLabels, ...currencyLabels };
  [COUNTRIES, COUNTRIES_BY_CODE] = prepareCountries(rawCountries);
  SHAPES = shapes;
  COUNTRY_WEIGHTS = computeCountryWeights(shapes);
  // Language codes taken from the data itself, e.g. ["pl", "en"]
  AVAILABLE_LANGUAGES = Object.keys(Object.values(LANG)[0]);
}
