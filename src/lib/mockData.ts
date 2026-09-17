import type {
  ActivityEvent,
  AppState,
  Conversation,
  Entity,
  Memory,
  MemoryKind,
  Model,
  ModelId,
  Project,
  Settings,
} from './types'

/* ---------------------------------------------------------------- helpers */

/** Deterministic PRNG so the generated half of the corpus is stable across reloads. */
function mulberry32(seed: number) {
  return function rand() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const now = () => Date.now()
const minsAgo = (m: number) => now() - m * MIN
const hoursAgo = (h: number) => now() - h * HOUR
const daysAgo = (d: number) => now() - d * DAY

/* ----------------------------------------------------------------- models */

export const MODELS: Model[] = [
  {
    id: 'claude',
    vendor: 'Anthropic',
    name: 'Claude',
    variant: 'Sonnet 4.5',
    mark: 'CL',
    tokens: 8420,
    tokensTotal: 10000,
    contextWindow: 200000,
    latency: 410,
    connected: true,
    local: false,
    strengths: ['Long-form reasoning', 'Code', 'Nuance'],
    note: 'Preferred for writing, architecture and anything that needs care.',
  },
  {
    id: 'gpt',
    vendor: 'OpenAI',
    name: 'ChatGPT',
    variant: 'GPT-5',
    mark: 'GP',
    tokens: 12740,
    tokensTotal: 20000,
    contextWindow: 128000,
    latency: 360,
    connected: true,
    local: false,
    strengths: ['Speed', 'Tooling', 'Structured output'],
    note: 'First fallback. Fast, dependable, good at lists and plans.',
  },
  {
    id: 'gemini',
    vendor: 'Google',
    name: 'Gemini',
    variant: '2.5 Pro',
    mark: 'GM',
    tokens: 6210,
    tokensTotal: 15000,
    contextWindow: 1000000,
    latency: 520,
    connected: true,
    local: false,
    strengths: ['Huge context', 'Research', 'Multimodal'],
    note: 'Second fallback. Used when a whole archive has to fit in context.',
  },
  {
    id: 'local',
    vendor: 'Local runtime',
    name: 'Local',
    variant: 'Llama 3.3 70B',
    mark: 'LO',
    tokens: 0,
    tokensTotal: 0,
    contextWindow: 32000,
    latency: 940,
    connected: true,
    local: true,
    strengths: ['Offline', 'Private', 'Unmetered'],
    note: 'Runs on the workstation. Slower, but it never runs out and never leaves the room.',
  },
]

/* --------------------------------------------------------------- entities */

export const ENTITIES: Entity[] = [
  { id: 'matteo', label: 'Matteo', parent: null, kind: 'root', note: 'You' },

  { id: 'music', label: 'Music', parent: 'matteo', kind: 'interest' },
  { id: 'juicewrld', label: 'Juice WRLD', parent: 'music', kind: 'person', note: 'Reference artist' },
  { id: 'production', label: 'Production', parent: 'music', kind: 'skill' },
  { id: 'nightshift', label: 'Nightshift EP', parent: 'music', kind: 'project', note: 'Current project' },
  { id: 'mixing', label: 'Mixing', parent: 'music', kind: 'skill' },

  { id: 'hardware', label: 'Hardware', parent: 'matteo', kind: 'interest' },
  { id: 'pcbuild', label: 'PC Build', parent: 'hardware', kind: 'project' },
  { id: 'ryzen', label: 'Ryzen 7800X3D', parent: 'pcbuild', kind: 'fact' },
  { id: 'gpu', label: 'RTX 4070 Ti', parent: 'pcbuild', kind: 'fact' },

  { id: 'places', label: 'Places', parent: 'matteo', kind: 'interest' },
  { id: 'canada', label: 'Canada', parent: 'places', kind: 'event', note: 'Trip, March' },
  { id: 'vancouver', label: 'Vancouver', parent: 'canada', kind: 'fact' },

  { id: 'work', label: 'Work', parent: 'matteo', kind: 'project' },
  { id: 'aioki', label: 'AIO KI', parent: 'work', kind: 'project', note: 'This system' },
  { id: 'design', label: 'Design', parent: 'work', kind: 'skill' },
  { id: 'frontend', label: 'Frontend', parent: 'work', kind: 'skill' },

  { id: 'people', label: 'People', parent: 'matteo', kind: 'person' },
  { id: 'lena', label: 'Lena', parent: 'people', kind: 'person', note: 'Co-producer' },
  { id: 'jonas', label: 'Jonas', parent: 'people', kind: 'person', note: 'Studio' },
  { id: 'sara', label: 'Sara', parent: 'people', kind: 'person', note: 'Mastering' },

  { id: 'prefs', label: 'Preferences', parent: 'matteo', kind: 'preference' },
  { id: 'uitaste', label: 'UI taste', parent: 'prefs', kind: 'preference' },
  { id: 'comms', label: 'Communication', parent: 'prefs', kind: 'preference' },
  { id: 'routine', label: 'Routine', parent: 'prefs', kind: 'preference' },

  { id: 'gear', label: 'Gear', parent: 'music', kind: 'fact' },
  { id: 'releases', label: 'Releases', parent: 'music', kind: 'project' },
  { id: 'studio', label: 'Home studio', parent: 'hardware', kind: 'project' },
  { id: 'backup', label: 'Backups', parent: 'hardware', kind: 'skill' },
  { id: 'whistler', label: 'Whistler', parent: 'canada', kind: 'fact' },
  { id: 'admin', label: 'Admin', parent: 'work', kind: 'fact' },
  { id: 'portfolio', label: 'Portfolio', parent: 'work', kind: 'project' },
]

/* --------------------------------------------------------------- memories */

type Seed = {
  t: string
  d: string
  k: MemoryKind
  e: string
  c: number
  tags?: string[]
}

/** Hand-written memories. These are the ones that surface in the graph and lists. */
const CURATED: Seed[] = [
  { t: 'Prefers subtle, restrained interface design', d: 'Dislikes heavy gradients, oversized type and glassmorphism used as decoration. Responds well to hairlines, monospaced labels and material depth that reads as physical rather than decorative.', k: 'preference', e: 'uitaste', c: 0.94, tags: ['design', 'ui'] },
  { t: 'Working on an EP called Nightshift', d: 'Six tracks, mostly written at night. Target is a cohesive late-night record rather than a set of singles. Two tracks are arranged, one is mixed.', k: 'project', e: 'nightshift', c: 0.97, tags: ['music', 'active'] },
  { t: 'Builds in FL Studio 21', d: 'Uses FL Studio as the main DAW, with Ableton only for live takes. Keeps a personal template with the mix bus already routed.', k: 'skill', e: 'production', c: 0.91, tags: ['music', 'tools'] },
  { t: 'References Juice WRLD for melodic phrasing', d: 'Uses the vocal cadence and minor-key melodic runs as a reference point, not as an imitation target. Mentioned "Legends Never Die" specifically.', k: 'interest', e: 'juicewrld', c: 0.88, tags: ['music', 'reference'] },
  { t: 'Mixes to roughly -14 LUFS for streaming', d: 'Keeps the integrated loudness near -14 LUFS with about 1 dB of true-peak headroom before mastering.', k: 'fact', e: 'mixing', c: 0.86, tags: ['music', 'technical'] },
  { t: 'Runs a Ryzen 7 7800X3D', d: 'Chosen for the 3D V-Cache — matters more for the DAW plugin chains than raw core count.', k: 'fact', e: 'ryzen', c: 0.95, tags: ['hardware'] },
  { t: 'GPU is an RTX 4070 Ti', d: 'Wanted the 16 GB variant but settled on the 4070 Ti for the price. Considering an upgrade in 2027.', k: 'fact', e: 'gpu', c: 0.9, tags: ['hardware'] },
  { t: 'PC build is finished but not cable-managed', d: 'Everything runs; the back panel is still a mess. Wants to redo it with custom-length cables.', k: 'project', e: 'pcbuild', c: 0.79, tags: ['hardware', 'todo'] },
  { t: 'Travelling to Canada in March', d: 'Three weeks, mostly Vancouver with a few days in Whistler. Wants to record field audio while there.', k: 'event', e: 'canada', c: 0.93, tags: ['travel'] },
  { t: 'Has family in Vancouver', d: 'Staying with relatives for part of the trip, which shapes the itinerary.', k: 'person', e: 'vancouver', c: 0.82, tags: ['travel', 'people'] },
  { t: 'Building AIO KI as a personal AI hub', d: 'One interface over several models with a shared memory layer and automatic fallback when a model runs out of budget.', k: 'project', e: 'aioki', c: 0.98, tags: ['work', 'active'] },
  { t: 'Wants the interface to feel like an operating system', d: 'Explicitly not a chat client with a sidebar. The reference points are Teenage Engineering, Nothing and Apple system software.', k: 'preference', e: 'design', c: 0.95, tags: ['design', 'work'] },
  { t: 'Writes frontend in React with TypeScript', d: 'Prefers Vite over heavier toolchains and avoids dependencies that only save a few lines.', k: 'skill', e: 'frontend', c: 0.92, tags: ['work', 'code'] },
  { t: 'Lena co-produces two Nightshift tracks', d: 'Handles topline on the second and fourth track. Works remotely, sends stems on Sundays.', k: 'person', e: 'lena', c: 0.87, tags: ['music', 'people'] },
  { t: 'Jonas owns the studio used for vocal takes', d: 'Books the room in four-hour blocks, usually Thursday evenings.', k: 'person', e: 'jonas', c: 0.84, tags: ['music', 'people'] },
  { t: 'Sara handles mastering', d: 'Has mastered the last two releases. Prefers receiving 24-bit WAVs with no limiter on the bus.', k: 'person', e: 'sara', c: 0.89, tags: ['music', 'people'] },
  { t: 'Answers should skip the preamble', d: 'Wants the substance first. No "great question", no restating the prompt, no summary of what is about to be said.', k: 'preference', e: 'comms', c: 0.96, tags: ['style'] },
  { t: 'Prefers German for casual talk, English for technical work', d: 'Switches to English when discussing code, tooling or design vocabulary.', k: 'preference', e: 'comms', c: 0.9, tags: ['language'] },
  { t: 'Most productive between 22:00 and 03:00', d: 'Schedules deep work at night. Mornings are for admin and email.', k: 'preference', e: 'routine', c: 0.85, tags: ['routine'] },
  { t: 'Keeps Sunday free of screens', d: 'Tries to. Mostly succeeds.', k: 'preference', e: 'routine', c: 0.68, tags: ['routine'] },
  { t: 'Dislikes purple-to-blue gradients', d: 'Considers them the visual signature of unfinished AI products.', k: 'preference', e: 'uitaste', c: 0.93, tags: ['design'] },
  { t: 'Likes monospaced type for numbers and labels', d: 'Wants figures to be tabular so columns do not shift while counters animate.', k: 'preference', e: 'uitaste', c: 0.88, tags: ['design', 'type'] },
  { t: 'Uses a 34" ultrawide as the main display', d: '3440x1440 at 144 Hz. Layouts need to survive very wide viewports without stretching.', k: 'fact', e: 'hardware', c: 0.81, tags: ['hardware', 'design'] },
  { t: 'Sample library lives on a separate NVMe', d: 'Two terabytes, mounted as D:. Backups run weekly to an external drive.', k: 'fact', e: 'pcbuild', c: 0.77, tags: ['hardware', 'music'] },
  { t: 'Wants shared memory across every model', d: 'A fact told to one model should be available to all of them, with visible provenance and the ability to forget.', k: 'preference', e: 'aioki', c: 0.97, tags: ['work', 'memory'] },
  { t: 'Token limits should trigger an automatic handoff', d: 'When a model runs out of budget mid-conversation the next one should continue without the user re-sending anything.', k: 'preference', e: 'aioki', c: 0.96, tags: ['work', 'routing'] },
  { t: 'Records vocals with a Shure SM7B', d: 'Through a Cloudlifter into a Scarlett 4i4. Treated corner of the room, not a booth.', k: 'fact', e: 'production', c: 0.86, tags: ['music', 'gear'] },
  { t: 'Arrangement usually starts from a drum loop', d: 'Builds the beat first, then melody, then topline. Rarely writes to a chord progression.', k: 'skill', e: 'production', c: 0.8, tags: ['music', 'workflow'] },
  { t: 'Nightshift deadline is the end of April', d: 'Wants all six tracks mastered and delivered to distribution by then.', k: 'event', e: 'nightshift', c: 0.91, tags: ['music', 'deadline'] },
  { t: 'Track 3 has been rewritten four times', d: 'Structure keeps collapsing in the second half. Currently parked.', k: 'project', e: 'nightshift', c: 0.74, tags: ['music', 'blocked'] },
  { t: 'Prefers dark interfaces at night, light during the day', d: 'Asked whether the system could follow the time of day rather than the OS setting.', k: 'preference', e: 'uitaste', c: 0.83, tags: ['design'] },
  { t: 'Reads documentation before asking', d: 'Usually arrives with a specific question and context already gathered.', k: 'preference', e: 'comms', c: 0.79, tags: ['style'] },
  { t: 'Uses keyboard shortcuts heavily', d: 'Asked for a command palette on the first day. Expects Escape to close everything.', k: 'preference', e: 'uitaste', c: 0.92, tags: ['ux'] },
  { t: 'German tax year runs to 31 December', d: 'Needs invoices for music work collected before then; last year they were late.', k: 'fact', e: 'work', c: 0.72, tags: ['admin'] },
  { t: 'Wants field recordings from the Canada trip in the EP', d: 'Rain, ferries, room tone. Planning to carry a Zoom H5.', k: 'event', e: 'canada', c: 0.8, tags: ['music', 'travel'] },
  { t: 'Design reference: Teenage Engineering OP-1', d: 'Cited the labelling, the restraint and the physicality of the controls.', k: 'interest', e: 'design', c: 0.87, tags: ['design', 'reference'] },
  { t: 'Design reference: Nothing OS', d: 'Likes the dot matrix, the monochrome discipline and a single signal colour.', k: 'interest', e: 'design', c: 0.85, tags: ['design', 'reference'] },
  { t: 'Avoids animation that delays interaction', d: 'Transitions should be under 300 ms and never block input.', k: 'preference', e: 'uitaste', c: 0.89, tags: ['design', 'motion'] },
  { t: 'Prefers CSS over animation libraries', d: 'Reaches for transitions and keyframes before adding a runtime dependency.', k: 'skill', e: 'frontend', c: 0.84, tags: ['code'] },
  { t: 'Deploys static sites to GitHub Pages', d: 'Wants a push to build and publish without any further steps.', k: 'skill', e: 'frontend', c: 0.9, tags: ['code', 'deploy'] },
  { t: 'Has 42 saved conversations worth keeping', d: 'Asked not to auto-delete threads older than a month.', k: 'fact', e: 'aioki', c: 0.7, tags: ['memory'] },
  { t: 'Finds long bulleted answers harder to read than prose', d: 'Wants lists only where the content is genuinely enumerable.', k: 'preference', e: 'comms', c: 0.81, tags: ['style'] },
  { t: 'Studio monitors are Yamaha HS7s', d: 'Checks mixes on them and on a single phone speaker before signing off.', k: 'fact', e: 'mixing', c: 0.83, tags: ['music', 'gear'] },
  { t: 'Uses reference tracks while mixing', d: 'Loads two references into the project and A/Bs against them at matched loudness.', k: 'skill', e: 'mixing', c: 0.86, tags: ['music', 'workflow'] },
  { t: 'Wants the router order to be editable by hand', d: 'Automatic selection is fine, but the priority list has to be draggable.', k: 'preference', e: 'aioki', c: 0.94, tags: ['routing'] },
  { t: 'Plays guitar, self-taught', d: 'Mostly for writing rather than performance. About six years in.', k: 'skill', e: 'music', c: 0.76, tags: ['music'] },
  { t: 'Considers Vancouver as a place to live', d: 'The March trip is partly a reconnaissance.', k: 'interest', e: 'vancouver', c: 0.64, tags: ['travel', 'life'] },
  { t: 'Does not want conversations used for training', d: 'Asked explicitly during setup. Applies to every connected provider.', k: 'preference', e: 'prefs', c: 0.99, tags: ['privacy'] },
  { t: 'Wants a visible reason whenever a model is switched', d: 'The handoff should be legible in the transcript, not silent.', k: 'preference', e: 'aioki', c: 0.95, tags: ['routing', 'ux'] },
  { t: 'Keeps a running list of sample pack ideas', d: 'Fourteen entries so far, mostly drum one-shots recorded from household objects.', k: 'project', e: 'production', c: 0.71, tags: ['music', 'ideas'] },
  { t: 'Prefers the local model for anything personal', d: 'Financial, medical and family topics should stay on the workstation.', k: 'preference', e: 'prefs', c: 0.93, tags: ['privacy', 'routing'] },
  { t: 'Birthday is in November', d: 'Mentioned in passing when talking about the trip dates.', k: 'fact', e: 'matteo', c: 0.66, tags: ['personal'] },
  { t: 'Drinks coffee only before 16:00', d: 'Otherwise the night sessions do not work.', k: 'preference', e: 'routine', c: 0.62, tags: ['routine'] },
  { t: 'Lena prefers async reviews over calls', d: 'Sends voice notes with timestamps instead of scheduling a session.', k: 'person', e: 'lena', c: 0.78, tags: ['people', 'workflow'] },
  { t: 'Portfolio site is overdue for a rebuild', d: 'Current one is three years old and does not show the recent work.', k: 'project', e: 'work', c: 0.73, tags: ['work', 'todo'] },
]

/** Slot pools for the auto-extracted half of the corpus. */
const GEN_TOPICS: Record<string, string[]> = {
  music: ['sidechain compression', 'vocal doubling', 'tape saturation', 'swing timing', 'key changes', 'stereo width', 'sample clearance', 'drum layering'],
  production: ['bus compression', 'gain staging', 'MIDI humanisation', 'template cleanup', 'bounce settings', 'plugin latency'],
  mixing: ['low-end control', 'de-essing', 'reverb tails', 'parallel compression', 'mono compatibility'],
  nightshift: ['track 2 arrangement', 'the outro on track 5', 'the intro sample', 'the tracklist order', 'artwork direction'],
  hardware: ['case airflow', 'fan curves', 'undervolting', 'NVMe temperatures', 'monitor calibration'],
  pcbuild: ['cable routing', 'RAM timings', 'BIOS updates', 'the CPU cooler mount', 'drive layout'],
  canada: ['the ferry schedule', 'roaming plans', 'March weather', 'a rail pass', 'customs for gear'],
  vancouver: ['neighbourhoods', 'studio rentals', 'rent levels', 'transit passes'],
  aioki: ['the router fallback order', 'memory provenance', 'the command palette', 'token accounting', 'the activity log', 'offline behaviour'],
  design: ['hairline weights', 'label letterspacing', 'shadow depth', 'the grain overlay', 'motion timing', 'accent restraint'],
  frontend: ['state persistence', 'bundle size', 'CSS custom properties', 'keyboard handling', 'focus management', 'the build base path'],
  work: ['invoice templates', 'the client backlog', 'scheduling', 'file naming'],
  people: ['scheduling a session', 'feedback rounds', 'stem handoffs'],
  prefs: ['answer length', 'code comments', 'file formats', 'notification volume'],
  uitaste: ['border radius', 'contrast ratios', 'icon weight', 'empty states'],
  comms: ['tone', 'follow-up questions', 'terminology'],
  routine: ['session length', 'break intervals', 'sleep schedule'],
  juicewrld: ['melodic phrasing', 'ad-lib placement', 'lyric density'],
  lena: ['topline drafts', 'session timing', 'reference tracks'],
  jonas: ['room bookings', 'mic selection', 'session rates'],
  sara: ['master delivery', 'loudness targets', 'revision rounds'],
  ryzen: ['boost behaviour', 'thermals under load'],
  gpu: ['driver versions', 'power limits'],
  places: ['flight timing', 'packing lists'],
  matteo: ['long-term goals', 'weekly planning'],
  gear: ['microphone placement', 'interface buffer size', 'cable quality', 'stand height'],
  releases: ['release timing', 'distribution splits', 'metadata', 'pre-save links'],
  studio: ['acoustic treatment', 'desk height', 'monitor isolation', 'cable runs'],
  backup: ['backup frequency', 'offsite copies', 'restore tests', 'drive health'],
  whistler: ['day trip timing', 'gear for snow', 'transport options'],
  admin: ['invoice numbering', 'receipt storage', 'deadlines'],
  portfolio: ['case study length', 'project selection', 'hosting', 'contact form'],
}

const GEN_PATTERNS: Array<(topic: string, ctx: string) => { t: string; d: string; k: MemoryKind }> = [
  (topic, ctx) => ({
    t: `Asked about ${topic}`,
    d: `Came up while working on ${ctx}. The answer was kept for later reference.`,
    k: 'fact',
  }),
  (topic, ctx) => ({
    t: `Prefers a conservative approach to ${topic}`,
    d: `Consistently chooses the safer option when ${topic} is involved in ${ctx}.`,
    k: 'preference',
  }),
  (topic, ctx) => ({
    t: `Revisited ${topic} twice`,
    d: `Returned to ${topic} in a later session about ${ctx}, which suggests it is unresolved.`,
    k: 'event',
  }),
  (topic, ctx) => ({
    t: `Has a working setup for ${topic}`,
    d: `Described an existing process for ${topic} that should not be redesigned unprompted. Context: ${ctx}.`,
    k: 'skill',
  }),
  (topic, ctx) => ({
    t: `Flagged ${topic} as a blocker`,
    d: `${topic.charAt(0).toUpperCase() + topic.slice(1)} is currently holding up ${ctx}.`,
    k: 'project',
  }),
  (topic, ctx) => ({
    t: `Dislikes over-explaining ${topic}`,
    d: `Wants direct answers on ${topic}; background only on request. Noted during ${ctx}.`,
    k: 'preference',
  }),
  (topic, ctx) => ({
    t: `Compared two options for ${topic}`,
    d: `Weighed alternatives for ${topic} while planning ${ctx} and went with the simpler one.`,
    k: 'event',
  }),
  (topic) => ({
    t: `Tracks ${topic} across sessions`,
    d: `Expects the system to remember earlier conclusions about ${topic} rather than starting over.`,
    k: 'preference',
  }),
  (topic, ctx) => ({
    t: `Set a personal standard for ${topic}`,
    d: `Defined what "good enough" means for ${topic} in the context of ${ctx}.`,
    k: 'fact',
  }),
  (topic, ctx) => ({
    t: `Wants a reminder about ${topic}`,
    d: `Asked to be nudged about ${topic} when ${ctx} comes up again.`,
    k: 'event',
  }),
  (topic) => ({
    t: `Learned ${topic} recently`,
    d: `New enough that explanations should not assume fluency with ${topic}.`,
    k: 'skill',
  }),
  (topic, ctx) => ({
    t: `Rejected a suggestion about ${topic}`,
    d: `Turned down the proposed change to ${topic} during ${ctx}; do not re-propose it.`,
    k: 'preference',
  }),
]

const CONTEXTS = [
  'the Nightshift EP',
  'the AIO KI interface',
  'the PC build',
  'the Canada trip',
  'a mixing session',
  'the portfolio rebuild',
  'a late-night writing session',
  'a review with Lena',
]

const MODEL_IDS: ModelId[] = ['claude', 'gpt', 'gemini', 'local']
const MODEL_LABEL: Record<ModelId, string> = {
  claude: 'Claude',
  gpt: 'ChatGPT',
  gemini: 'Gemini',
  local: 'Local',
}

const TOTAL_MEMORIES = 247

function buildMemories(): Memory[] {
  const rand = mulberry32(20260317)
  const out: Memory[] = []
  let n = 247

  const push = (s: Seed, ageDays: number) => {
    const source = MODEL_IDS[Math.floor(rand() * 3)]
    const used: ModelId[] = [source]
    for (const m of MODEL_IDS) {
      if (m !== source && rand() > 0.32) used.push(m)
    }
    const created = daysAgo(ageDays + rand())
    out.push({
      id: String(n--).padStart(3, '0'),
      title: s.t,
      detail: s.d,
      kind: s.k,
      entity: s.e,
      source,
      sourceLabel: `${MODEL_LABEL[source]} conversation`,
      usedBy: used.sort(),
      confidence: s.c,
      createdAt: created,
      lastUsedAt: created + rand() * (now() - created),
      uses: 1 + Math.floor(rand() * 34),
      tags: s.tags ?? [],
    })
  }

  CURATED.forEach((s, i) => push(s, i * 0.6 + rand() * 1.4))

  const entityIds = ENTITIES.map((e) => e.id)
  let guard = 0
  while (out.length < TOTAL_MEMORIES && guard++ < 4000) {
    const entity = entityIds[Math.floor(rand() * entityIds.length)]
    const pool = GEN_TOPICS[entity]
    if (!pool || pool.length === 0) continue
    const topic = pool[Math.floor(rand() * pool.length)]
    const ctx = CONTEXTS[Math.floor(rand() * CONTEXTS.length)]
    const pattern = GEN_PATTERNS[Math.floor(rand() * GEN_PATTERNS.length)]
    const made = pattern(topic, ctx)
    if (out.some((m) => m.title === made.t)) continue
    push(
      {
        t: made.t,
        d: made.d,
        k: made.k,
        e: entity,
        c: 0.52 + rand() * 0.44,
        tags: [entity],
      },
      6 + rand() * 170,
    )
  }

  out.sort((a, b) => b.createdAt - a.createdAt)
  // Renumber so the newest memory carries the highest id, like an append-only log.
  out.forEach((m, i) => {
    m.id = String(out.length - i).padStart(3, '0')
  })
  const pinned = new Set(['Prefers subtle, restrained interface design', 'Working on an EP called Nightshift', 'Wants shared memory across every model'])
  out.forEach((m) => {
    if (pinned.has(m.title)) m.pinned = true
  })
  return out
}

export const MEMORIES: Memory[] = buildMemories()

/* --------------------------------------------------------------- projects */

export const PROJECTS: Project[] = [
  { id: 'p-nightshift', name: 'Nightshift EP', blurb: 'Six-track record. Two arranged, one mixed, one parked.', conversations: 12, memories: 38, models: ['claude', 'gpt', 'gemini'], lastActivity: minsAgo(18), status: 'active', progress: 0.42, tags: ['music', 'deadline'] },
  { id: 'p-aioki', name: 'AIO KI', blurb: 'One interface over every model, with shared memory and routing.', conversations: 9, memories: 31, models: ['claude', 'gpt'], lastActivity: minsAgo(4), status: 'active', progress: 0.68, tags: ['work', 'frontend'] },
  { id: 'p-pc', name: 'PC Build 2026', blurb: 'Running, but the cable management is still outstanding.', conversations: 5, memories: 19, models: ['gpt', 'local'], lastActivity: hoursAgo(20), status: 'active', progress: 0.85, tags: ['hardware'] },
  { id: 'p-canada', name: 'Canada, March', blurb: 'Three weeks. Vancouver, Whistler, field recording.', conversations: 4, memories: 22, models: ['gemini', 'gpt'], lastActivity: daysAgo(2), status: 'active', progress: 0.3, tags: ['travel'] },
  { id: 'p-portfolio', name: 'Portfolio Rebuild', blurb: 'Three years stale. Needs the recent work and a faster stack.', conversations: 3, memories: 14, models: ['claude'], lastActivity: daysAgo(4), status: 'paused', progress: 0.12, tags: ['work'] },
  { id: 'p-studio', name: 'Home Studio', blurb: 'Treatment, monitor placement, and a quieter desk.', conversations: 4, memories: 17, models: ['gpt', 'local'], lastActivity: daysAgo(6), status: 'active', progress: 0.55, tags: ['music', 'hardware'] },
  { id: 'p-samples', name: 'Sample Pack', blurb: 'Fourteen ideas, mostly one-shots from household objects.', conversations: 2, memories: 9, models: ['claude', 'gemini'], lastActivity: daysAgo(9), status: 'paused', progress: 0.2, tags: ['music'] },
  { id: 'p-tax', name: 'Tax & Invoices', blurb: 'Collect music invoices before the end of the year.', conversations: 2, memories: 7, models: ['local'], lastActivity: daysAgo(12), status: 'active', progress: 0.45, tags: ['admin', 'private'] },
  { id: 'p-fitness', name: 'Training Plan', blurb: 'Three sessions a week that survive night-shift hours.', conversations: 3, memories: 11, models: ['gpt'], lastActivity: daysAgo(14), status: 'paused', progress: 0.38, tags: ['life'] },
  { id: 'p-reading', name: 'Reading List', blurb: 'Design, systems, and two novels that keep getting pushed.', conversations: 2, memories: 8, models: ['claude', 'gemini'], lastActivity: daysAgo(18), status: 'active', progress: 0.24, tags: ['life'] },
  { id: 'p-photo', name: 'Photo Archive', blurb: 'Twelve years of photos, currently across four drives.', conversations: 1, memories: 6, models: ['local'], lastActivity: daysAgo(23), status: 'archived', progress: 0.9, tags: ['admin', 'private'] },
  { id: 'p-german', name: 'Language Practice', blurb: 'Technical English vocabulary, twenty minutes a day.', conversations: 1, memories: 5, models: ['gemini'], lastActivity: daysAgo(31), status: 'archived', progress: 0.6, tags: ['life'] },
]


/* --------------------------------------------------------------- activity */

export function seedActivity(): ActivityEvent[] {
  const rand = mulberry32(99117)
  const base: Array<[number, ActivityEvent['kind'], string, string?, ModelId?]> = [
    [2, 'sync', 'Memory synchronised', '247 entries reconciled across 4 models'],
    [4, 'response', 'Claude generated response', '612 tokens · Nightshift EP', 'claude'],
    [5, 'memory', 'Memory updated', '“Track 3 has been rewritten four times”', 'claude'],
    [11, 'response', 'Claude generated response', '389 tokens · AIO KI', 'claude'],
    [18, 'project', 'Project touched', 'Nightshift EP · 2 new memories'],
    [26, 'memory', 'Memory created', '“Wants a visible reason whenever a model is switched”', 'claude'],
    [41, 'response', 'ChatGPT generated response', '744 tokens · PC Build 2026', 'gpt'],
    [42, 'route', 'Router selected ChatGPT', 'Claude below reserve · priority order', 'gpt'],
    [58, 'response', 'Gemini generated response', '1,120 tokens · Canada, March', 'gemini'],
    [64, 'sync', 'Memory synchronised', '6 entries propagated to Gemini'],
    [96, 'memory', 'Memory created', '“Travelling to Canada in March”', 'gemini'],
    [122, 'system', 'Context window trimmed', 'Oldest 4 turns summarised into 1 memory'],
    [150, 'response', 'Local generated response', '210 tokens · Tax & Invoices', 'local'],
    [151, 'route', 'Router pinned Local', 'Private topic · never leaves the workstation', 'local'],
    [188, 'limit', 'Gemini approaching limit', '6,210 of 15,000 tokens remaining', 'gemini'],
    [240, 'connect', 'Local runtime online', 'llama-3.3-70b · 32k context', 'local'],
    [305, 'memory', 'Memory forgotten', '“Considering an Ableton switch” · removed by user'],
    [366, 'response', 'Claude generated response', '958 tokens · Portfolio Rebuild', 'claude'],
    [420, 'sync', 'Memory synchronised', '12 entries reconciled'],
    [500, 'project', 'Project created', 'Sample Pack'],
    [610, 'response', 'ChatGPT generated response', '431 tokens · Training Plan', 'gpt'],
    [742, 'connect', 'Gemini connected', 'API key verified · 1M context', 'gemini'],
    [900, 'system', 'Router priority changed', 'Claude → ChatGPT → Gemini → Local'],
    [1180, 'memory', 'Memory created', '“Builds in FL Studio 21”', 'gpt'],
    [1400, 'sync', 'Memory synchronised', '31 entries reconciled'],
  ]
  return base.map(([m, kind, title, detail, model], i) => ({
    id: `seed-${i}`,
    at: minsAgo(m + rand() * 0.8),
    kind,
    title,
    detail,
    model,
  }))
}

/* ---------------------------------------------------------- conversations */

const T = (mins: number) => minsAgo(mins)

const ID_BY_TITLE = new Map(MEMORIES.map((m) => [m.title, m.id]))

/** Seeded transcripts cite memories by title; the store only ever stores ids. */
function ctx(...titles: string[]): string[] {
  return titles.map((t) => ID_BY_TITLE.get(t)).filter((id): id is string => Boolean(id))
}

function msg(
  role: 'user' | 'assistant' | 'system',
  text: string,
  mins: number,
  model?: ModelId,
  extra: Partial<Conversation['messages'][number]> = {},
): Conversation['messages'][number] {
  return {
    id: `m-${role}-${mins}-${Math.round(text.length)}`,
    role,
    text,
    at: T(mins),
    model,
    tokens: Math.round(text.length / 3.6),
    ...extra,
  }
}

const THREAD_TITLES = [
  'Nightshift · track 3 structure',
  'Router fallback semantics',
  'Cable management plan',
  'Vancouver in March',
  'Mix bus chain review',
  'Portfolio information architecture',
  'Sample pack naming scheme',
  'Invoice template for music work',
  'Monitor calibration',
  'Reading list for Q2',
  'Training split that fits nights',
  'Photo archive consolidation',
  'Field recording gear list',
  'Stem delivery checklist for Sara',
  'Low-end control on track 5',
  'Ultrawide layout breakpoints',
  'Keyboard shortcut map',
  'Memory retention policy',
  'Local model quantisation',
  'Ferry timetable Vancouver Island',
  'Artwork direction for the EP',
  'Backup strategy for samples',
  'Ad-lib placement notes',
  'BIOS update, safe order',
  'Tracklist order, second pass',
  'German invoice wording',
  'Guitar practice routine',
  'Whistler day trip',
  'Plugin latency compensation',
  'Colour tokens for light mode',
  'Command palette actions',
  'Session notes, Thursday',
  'Reference track shortlist',
  'NVMe temperatures under load',
  'Grain overlay performance',
  'Topline feedback for Lena',
  'Fan curve profile for night sessions',
  'Export presets for distribution',
  'Colour contrast audit',
]

export function seedConversations(): Conversation[] {
  const rand = mulberry32(5150)
  const main: Conversation = {
    id: 'c-main',
    title: 'Nightshift · arrangement and handoff',
    projectId: 'p-nightshift',
    createdAt: T(64),
    updatedAt: T(3),
    pinned: true,
    messages: [
      msg(
        'user',
        'Ich hänge bei Track 3 fest. Die zweite Hälfte fällt jedes Mal auseinander, egal wie ich sie umbaue.',
        62,
      ),
      msg(
        'assistant',
        'Vier Umbauten an derselben Stelle heißt meistens: das Problem sitzt nicht in der zweiten Hälfte, sondern in dem, was die erste versprochen hat.\n\nDrei Dinge, die ich an deiner Stelle prüfen würde:\n\nDie erste Hälfte baut Spannung über Dichte auf — mehr Layer, mehr Bewegung. Wenn die zweite Hälfte das fortsetzt, hat sie nichts mehr, womit sie sich absetzen kann. Nimm ab Takt 33 bewusst etwas weg statt hinzuzufügen.\n\nDeine Arrangements starten fast immer beim Drumloop. Das funktioniert für den Einstieg, aber für einen zweiten Teil brauchst du einen harmonischen Grund, weiterzuhören. Schreib die zweite Hälfte einmal ohne Drums.\n\nUnd: parken ist eine legitime Entscheidung. Du hast fünf andere Tracks, die weiterlaufen. Track 3 zwei Wochen liegen zu lassen ist billiger als ein fünfter Umbau.',
        61,
        'claude',
        { context: ctx('Track 3 has been rewritten four times', 'Arrangement usually starts from a drum loop') },
      ),
      msg('user', 'Ohne Drums ist ein guter Punkt. Wie halte ich die Energie, wenn ich Layer wegnehme?', 48),
      msg(
        'assistant',
        'Energie kommt nicht nur aus Dichte, sondern aus Kontrast und Erwartung.\n\nWenn ab Takt 33 die Drums verschwinden, trägt der Bass die Bewegung. Gib ihm eine achtel Figur, die vorher nicht da war — das Ohr liest das als Fortschritt, nicht als Abbruch.\n\nDie Vocals dürfen dabei trockener werden. Weniger Reverb heißt näher, und näher heißt aufmerksamer.\n\nDann bringst du die Drums nach acht Takten zurück, aber nur Kick und Clap. Der Rest kommt erst zum letzten Drittel. Das ist dieselbe Mechanik, die du bei den Referenzen magst: die volle Instrumentierung ist ein Ziel, kein Zustand.',
        46,
        'claude',
        { context: ctx('References Juice WRLD for melodic phrasing', 'Mixes to roughly -14 LUFS for streaming') },
      ),
      msg(
        'user',
        'Okay. Und wie gehe ich die Stems dann an Lena raus, damit sie die Topline drüberlegen kann?',
        22,
      ),
      msg(
        'assistant',
        'Lena arbeitet asynchron und schickt Voice Notes mit Timestamps zurück, also bereite die Stems so vor, dass sie ohne Rückfragen arbeiten kann.\n\nBounce ab Takt 1, 24-bit WAV, kein Limiter auf dem Bus. Ein Instrumental-Mixdown plus vier Gruppen — Drums, Bass, Harmonie, FX. Mehr braucht sie nicht, und weniger zwingt sie zum Nachfragen.\n\nLeg eine Textdatei mit BPM, Tonart und der Taktzahl des neuen Teils dazu. Bei den letzten beiden Runden war genau das die Rückfrage.',
        20,
        'claude',
        { context: ctx('Lena co-produces two Nightshift tracks', 'Lena prefers async reviews over calls', 'Sara handles mastering') },
      ),
    ],
  }

  const second: Conversation = {
    id: 'c-aioki',
    title: 'AIO KI · router fallback semantics',
    projectId: 'p-aioki',
    createdAt: T(180),
    updatedAt: T(96),
    messages: [
      msg('user', 'What should happen when a model runs out of tokens halfway through an answer?', 178),
      msg(
        'assistant',
        'The honest option is to cut the answer where the budget ended and say so, then continue on the next model in the priority order — as a new message, not a silent continuation of the old one.\n\nThat way the transcript stays truthful about which model produced which sentence, which matters later when a memory is traced back to its source.\n\nThe handoff itself should be a visible row in the transcript: which model stopped, why, and which one took over. Not a toast that disappears.',
        176,
        'claude',
        { context: ctx('Token limits should trigger an automatic handoff', 'Wants a visible reason whenever a model is switched') },
      ),
      msg('user', 'Agreed. Keep the row compact though — one line if possible.', 98),
      msg(
        'assistant',
        'One line works if the reason is short: "Claude · limit reached → ChatGPT". Expand on hover for the numbers.\n\nI would still animate the transition rather than snapping it in. The two or three hundred milliseconds are what make it read as a system decision instead of an error.',
        96,
        'claude',
      ),
    ],
  }

  const third: Conversation = {
    id: 'c-pc',
    title: 'PC Build · cable routing pass',
    projectId: 'p-pc',
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(20),
    messages: [
      msg('user', 'Ich will die Rückseite neu machen. Custom-Length Kabel oder Extensions?', 1210),
      msg(
        'assistant',
        'Bei deinem Case und dem 7800X3D lohnt sich Custom-Length nur, wenn du die Seite wirklich offen zeigst.\n\nExtensions sind billiger, in einer Stunde erledigt und du kannst die Länge später korrigieren. Custom-Length sieht besser aus, ist aber endgültig — und du hast erwähnt, dass 2027 eine neue GPU kommt.\n\nMein Vorschlag: Extensions jetzt, Custom beim nächsten Umbau.',
        1208,
        'gpt',
        { context: ctx('GPU is an RTX 4070 Ti', 'PC build is finished but not cable-managed') },
      ),
    ],
  }

  const rest: Conversation[] = THREAD_TITLES.map((title, i) => {
    const age = 30 + i * 47 + rand() * 60
    const model = MODEL_IDS[Math.floor(rand() * 4)]
    return {
      id: `c-${i}`,
      title,
      projectId: PROJECTS[Math.floor(rand() * PROJECTS.length)].id,
      createdAt: minsAgo(age + 20),
      updatedAt: minsAgo(age),
      messages: [
        msg('user', `${title} — wo würdest du anfangen?`, age + 20),
        msg(
          'assistant',
          'Archivierter Thread. Öffne ihn, um die vollständige Unterhaltung zu laden.',
          age,
          model,
        ),
      ],
    }
  })

  return [main, second, third, ...rest]
}

/* --------------------------------------------------------------- settings */

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'amber',
  grain: true,
  motion: 'auto',
  density: 'comfortable',
  routerMode: 'auto',
  priority: ['claude', 'gpt', 'gemini', 'local'],
  fallbackThreshold: 400,
  streamResponses: true,
  memoryCapture: true,
  memorySharing: true,
  memoryRetention: 'forever',
  notifyHandoff: true,
  notifyMemory: true,
  notifyLimit: true,
  telemetry: false,
  localOnly: false,
}

/* ---------------------------------------------------------- initial state */

export function initialState(): AppState {
  const conversations = seedConversations()
  return {
    models: MODELS.map((m) => ({ ...m })),
    memories: MEMORIES.map((m) => ({ ...m })),
    entities: ENTITIES,
    projects: PROJECTS.map((p) => ({ ...p })),
    activity: seedActivity(),
    conversations,
    activeConversation: conversations[0].id,
    activeModel: 'claude',
    settings: { ...DEFAULT_SETTINGS },
    lastSync: minsAgo(2),
    syncing: false,
  }
}

export const MODEL_NAME = MODEL_LABEL
