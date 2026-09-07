# System Monitor — an example artifactory

The second Phase 4 pilot (doc 45 §8): the reference
`@modelcontextprotocol/server-system-monitor` from modelcontextprotocol/ext-apps,
byte-for-byte, packaged as a Dimension plugin. Beyond the three.js pilot it
proves two more spec paths live: an APP-ONLY tool (`poll-system-stats`,
`visibility: ["app"]`) the model never sees, and a View that calls it —
which is exactly the call the engine's consent gate decides.

Packaging only: `.mcp.json` names the server, `dimension.plugin.json` names it
as an artifactory, `server.mjs` starts the reference CLI over stdio.
