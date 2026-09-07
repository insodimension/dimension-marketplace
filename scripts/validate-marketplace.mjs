// Standalone catalog validator - no dependencies, runs on bare node/bun.
// The monorepo runs each pack's tests; THIS repo's CI can only see itself,
// so it validates what is checkable standalone: the catalog and pack layout.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, ".dimension-plugin", "marketplace.json");
/** One-release compatibility copy for clients that only know `.omp-plugin`. */
const legacyCatalogPath = join(root, ".omp-plugin", "marketplace.json");
const errors = [];

const catalogRaw = readFileSync(catalogPath, "utf8");
const catalog = JSON.parse(catalogRaw);

// The copy is what every pre-#158 client actually fetches. A shelf whose two
// catalogs disagree serves two different marketplaces depending on the client's
// build date, which is worse than either being wrong on its own.
if (!existsSync(legacyCatalogPath)) {
	errors.push(".omp-plugin/marketplace.json is missing — pre-#158 clients read only that path (run scripts/sync-catalog.mjs)");
} else if (readFileSync(legacyCatalogPath, "utf8") !== catalogRaw) {
	errors.push(".omp-plugin/marketplace.json differs from .dimension-plugin/marketplace.json (run scripts/sync-catalog.mjs)");
}

if (typeof catalog.name !== "string" || !/^[a-z0-9-]+$/.test(catalog.name)) {
	errors.push("catalog.name must be a kebab-case string");
}
if (typeof catalog.owner?.name !== "string" || catalog.owner.name.length === 0) {
	errors.push("catalog.owner.name is required");
}
if (!Array.isArray(catalog.plugins) || catalog.plugins.length === 0) {
	errors.push("catalog.plugins must be a non-empty array");
}

const seen = new Set();
for (const plugin of catalog.plugins ?? []) {
	const label = plugin?.name ?? "<unnamed>";
	if (typeof plugin.name !== "string" || !/^[a-z0-9-]+$/.test(plugin.name)) {
		errors.push(`plugin "${label}": name must be kebab-case`);
	}
	if (seen.has(plugin.name)) errors.push(`plugin "${label}": duplicate name`);
	seen.add(plugin.name);
	if (typeof plugin.source === "string") {
		if (!plugin.source.startsWith("./")) {
			errors.push(`plugin "${label}": relative source must start with ./`);
		} else {
			const packDir = join(root, plugin.source);
			if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
				errors.push(`plugin "${label}": source directory ${plugin.source} does not exist`);
			} else if (!existsSync(join(packDir, "package.json"))) {
				errors.push(`plugin "${label}": ${plugin.source}/package.json is missing`);
			}
			// A declared bundle entry is a shipping commitment: dist/ is the ONLY
			// delivery path (the app holds no static pack imports), so a missing
			// or empty committed bundle must fail HERE, not as a dropped
			// component at runtime.
			const manifestPath = join(packDir, "dimension.plugin.json");
			if (existsSync(manifestPath)) {
				try {
					const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
					if (manifest.entry !== undefined) {
						if (typeof manifest.entry !== "string" || manifest.entry.length === 0) {
							errors.push(`plugin "${label}": entry must be a non-empty relative path`);
						} else if (manifest.entry.startsWith("/") || manifest.entry.split(/[\\/]/).includes("..")) {
							errors.push(`plugin "${label}": entry must be relative with no ".." segment`);
						} else {
							const bundlePath = join(packDir, manifest.entry);
							if (!existsSync(bundlePath) || !statSync(bundlePath).isFile()) {
								errors.push(`plugin "${label}": declared entry ${manifest.entry} does not exist — run \`bun run build\` in ${plugin.source} and commit dist/`);
							} else if (statSync(bundlePath).size === 0) {
								errors.push(`plugin "${label}": declared entry ${manifest.entry} is empty`);
							}
						}
					}
				} catch {
					errors.push(`plugin "${label}": dimension.plugin.json is not parseable JSON`);
				}
			}
		}
	} else if (typeof plugin.source !== "object" || plugin.source === null) {
		errors.push(`plugin "${label}": source must be a relative path or a source object`);
	}
	if (typeof plugin.description !== "string" || plugin.description.length < 10) {
		errors.push(`plugin "${label}": a real description is required`);
	}
	if (typeof plugin.license !== "string" || plugin.license.length === 0) {
		errors.push(`plugin "${label}": license is required`);
	}
}

// A pack that exists but is not listed is invisible to the store: it can only
// ever be dev-linked, and the engine's provenance (`<name>@<marketplace>`) is
// never minted for it. Two artifactory pilots shipped that way (review of #32),
// with CI green because this loop only ever walked `catalog.plugins`.
const packsDir = join(root, "packs");
if (existsSync(packsDir)) {
	const listed = new Set((catalog.plugins ?? []).map(plugin => plugin.source));
	for (const dir of readdirSync(packsDir).sort()) {
		const packDir = join(packsDir, dir);
		if (!statSync(packDir).isDirectory() || !existsSync(join(packDir, "package.json"))) continue;
		if (!listed.has(`./packs/${dir}`)) errors.push(`packs/${dir} exists but has no catalog entry (CONTRIBUTING.md step 5)`);
	}
}

if (errors.length > 0) {
	console.error(`marketplace.json: ${errors.length} problem(s)`);
	for (const error of errors) console.error(`  - ${error}`);
	process.exit(1);
}
console.log(`marketplace.json OK - ${catalog.plugins.length} pack(s) validated`);
