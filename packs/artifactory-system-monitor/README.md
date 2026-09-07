# System Monitor — an example artifactory

The second Phase 4 pilot (doc 45 §8): the reference
`@modelcontextprotocol/server-system-monitor` from modelcontextprotocol/ext-apps,
byte-for-byte, packaged as a Dimension plugin. Beyond the three.js pilot it
proves two more spec paths live: an APP-ONLY tool (`poll-system-stats`,
`visibility: ["app"]`) the model never sees, and a View that calls it —
which is the call the engine's consent gate decides. What it decides depends on
WHICH SHELF installed the pack, not who wrote it (`plugin-servers.ts`
`FIRST_PARTY_MARKETPLACES`): installed from this marketplace or dev-linked from
a first-party checkout, `poll-system-stats` is pre-approved and never prompts
(the ruled policy: first-party packs are approved on install); the same pack
served from any other shelf prompts once per session ("Allow this app to run
Poll System Stats?"). The live proof of the prompt ran the pack as third-party.

Packaging only: `.mcp.json` names the server, `dimension.plugin.json` names it
as an artifactory, `server.mjs` starts the reference CLI over stdio.
