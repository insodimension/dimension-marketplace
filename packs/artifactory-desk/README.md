# Desk — a layout that seats an App at boot

The Phase 4 slice D proof (doc 45 §8). A `layout` plugin like `three-lane`,
with one difference: its `artifact-view` slot declares

```json
{ "id": "monitor", "contract": "artifact-view",
  "app": { "server": "artifactory-system-monitor/system-monitor", "tool": "get-system-info" } }
```

`server` is the engine's composite id — the `.mcp.json` key under the plugin
that ships the App — so a layout may seat a stranger's App. When a session opens
in the Desk space, the host issues that `tools/call` itself (through the same
consent gate a View's call gets: first-party allowed, third-party prompted) and
the View lands in the seat with no agent turn. Close the tab and it stays closed;
reload the window and every live View is rebuilt from the engine's own
`artifactory/list`.

Requires `artifactory-system-monitor` (the App), `classic-rail` and
`mochi-mark` (the rail and the mark, like Demo Lane).
