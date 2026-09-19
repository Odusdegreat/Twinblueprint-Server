import { readFileSync, writeFileSync } from "node:fs";
import { applyRegionalOpenapi } from "./regional-openapi.mjs";
const file = new URL("../openapi.json", import.meta.url);
const spec = JSON.parse(readFileSync(file, "utf8"));
applyRegionalOpenapi(spec);
writeFileSync(file, JSON.stringify(spec, null, 2) + "\n");
