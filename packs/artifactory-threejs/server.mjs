// The pack's only code: start the reference three.js App server over stdio.
// Resolution goes through Node's own lookup, so the dependency may be hoisted
// (a workspace install) or local (a store install) - either way this runs it
// unmodified. The package exports only its library entry, so its CLI is found
// beside that entry; `--stdio` is what the CLI reads to pick the transport.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
const entry = createRequire(import.meta.url).resolve("@modelcontextprotocol/server-threejs");
process.argv.push("--stdio");
await import(pathToFileURL(join(dirname(entry), "index.js")).href);
