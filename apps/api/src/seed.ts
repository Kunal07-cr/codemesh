import { loadConfig } from "./config.js";
import { createStore } from "./db/store.js";

const config = loadConfig();
const store = await createStore(config.dataPath);
await store.resetWithSeed();
console.log(`Seeded CodeMesh demo data at ${config.dataPath}`);
