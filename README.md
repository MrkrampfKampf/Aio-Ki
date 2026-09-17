# AIO KI

A personal AI operating system — one interface over several models, with a shared
memory layer and a router that hands the conversation over when a model runs out
of budget.

**This is a frontend demo.** There is no backend, no API key, no request ever
leaves the browser. Every model reply, token figure, memory and handoff is
simulated from mock data held in `localStorage`, so the whole interface can be
used and judged before real providers are wired up.

---

## What is in it

| Section  | What it does |
| -------- | ------------ |
| Home     | System status, live counters, and the last conversation ready to resume |
| Chat     | The main surface: model masthead, token budget, transcript, composer, and a context rail showing which memories are in play |
| Memory   | 247 seeded memories across 32 entities as a force-directed graph, a tree, or a searchable list — each one openable, editable and forgettable |
| Models   | Model plates with budgets and capabilities, plus the AI Router with a drag-and-drop priority order |
| Projects | Twelve workspaces grouping conversations, memories and the models that worked on them |
| Activity | An elegant timeline of everything the system did: responses, memory writes, limits, routing decisions, syncs |
| Settings | Models, simulated API connections, routing, memory, appearance, notifications, privacy and data |

### The routing model

The router decides **per message**, not per conversation. In auto mode it walks
the priority list from the top and takes the first model that is connected and
still above its reserve. Two things can then happen, and both are visible in the
transcript rather than hidden:

- **Pre-flight handoff** — the model that answered last has since run out. A
  handoff row names the model that dropped out, the reason, and the one taking
  over, then the answer comes from the new model.
- **Mid-answer handoff** — the budget runs out while the answer is being
  written. The partial answer is kept and marked as cut off, the model is
  drained to zero, and the next model continues from the same context.

Every memory the router injected is listed under the answer with its id, so an
assumption can always be traced back to its source.

### Trying the fallback

The demo menu in the chat masthead (and the simulation panel on the Models page)
drives the token budgets directly:

- **Simulate token exhaustion** — drains the active model to zero. The next
  message shows a pre-flight handoff.
- **Run out mid-answer** — leaves exactly enough budget to start an answer but
  not to finish it, which produces the mid-stream handoff.
- **Restore token budgets** — puts everything back.

The command palette (`⌘K` / `Ctrl+K`) carries the same actions.

### Keyboard

| Keys | Action |
| ---- | ------ |
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘N` / `Ctrl+N` | New conversation |
| `G` then `H C M D P A S` | Home, Chat, Memory, Models, Projects, Activity, Settings |
| `/` | Jump to the composer |
| `?` | Shortcut sheet |
| `Esc` | Close whatever is open |

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build
```

Dependencies are React and React DOM. Everything else — routing, state,
animation, the graph layout, the drag-and-drop — is written against the platform.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes on every push to `main` (and
to the development branch). Enable it once, under **Settings → Pages → Build and
deployment → Source: GitHub Actions**. After that `git push` is the whole
deployment step.

Three things make the static hosting work:

- **Base path.** `actions/configure-pages` reports the repository path and the
  build reads it from `BASE_PATH`, so the bundle works at
  `https://<user>.github.io/<repo>/` and at a custom domain without changes.
- **Deep links.** Pages has no server to rewrite `/<repo>/memory/183`, so the
  build writes `dist/404.html` as a byte-identical copy of `index.html`. Pages
  falls back to it and the app boots with the URL intact — no redirect hop and no
  hash fragment.
- **No server.** There are no API routes, no server-side rendering and no
  runtime configuration. The output in `dist/` is the whole application.

To build for a fork with a different repository name:

```bash
BASE_PATH="/your-repo-name/" npm run build
```

---

## How it is put together

```
src/
├── lib/
│   ├── types.ts      shared shapes
│   ├── mockData.ts   the seeded corpus: models, 247 memories, 12 projects, 42 threads
│   ├── store.ts      observable store, localStorage persistence, event bus
│   ├── engine.ts     routing, token accounting, response synthesis, memory capture
│   ├── router.ts     history-based view router
│   ├── hooks.ts      spring counters, clocks, click-outside
│   └── format.ts     numbers, clocks, relative time
├── components/       shell, rail, status bar, palette, graph, primitives
├── views/            one file per section
└── styles/           tokens → base → components → shell → chat → views
```

**State.** One observable store with explicit actions, persisted to
`localStorage` under `aio.state.v1`. Seeded timestamps are rolled forward when
the tab is opened much later, so the demo never looks abandoned. A half-streamed
answer is never persisted.

**Simulated inference.** `engine.ts` scores the prompt against the memory corpus,
picks the memories the router would inject, and composes an answer whose
substance depends on the detected intent and language (German or English) and
whose shape depends on the model — Claude writes prose, ChatGPT structures,
Gemini adds an angle, the local model is terse and says so. Answers stream word
by word and cost tokens proportional to the system prompt, the whole transcript,
the injected memories and the output.

**Materials.** Two material sets, graphite and daylight, defined entirely as
custom properties in `styles/tokens.css`. Depth comes from hairlines, inset
highlights and shadow rather than from rounding; a grain layer keeps the large
dark areas from banding. Note that a `backdrop-filter` nested inside another one
samples nothing in Chromium, so surfaces that float over app content carry their
own body and only root-level overlays rely on blur.

---

## What is not real

Everything a real build would put behind a network call: model responses, token
counts, latency figures, memory extraction, synchronisation, API connections and
the connection test. The Settings → Data section shows exactly what is stored and
resets it.
