// Entry point: loads data, then starts the app.
import { loadData } from "./dataLoader.js";
import { initApp } from "./app.js";

await loadData();
initApp();
