# Three.js — an example artifactory

The Phase 4 pilot (doc 45 §8, board `mtoo81hz7eu6je`): a THIRD PARTY's MCP App,
byte-for-byte the reference `@modelcontextprotocol/server-threejs` from
modelcontextprotocol/ext-apps, hosted by the Dimension engine and rendered in
the artifact-view seat with zero code of its own.

The whole plugin is packaging: `.mcp.json` names the server (stdio), and
`dimension.plugin.json` says which server the engine hosts as an App
(`artifactories: [{ mcpServer: "threejs" }]`). Nothing else.

Try it: `bun install` here, then link the directory as a plugin in a dev home
(`plugins op:link` / `inso plugins link .`) and ask the agent to show a 3D scene.
