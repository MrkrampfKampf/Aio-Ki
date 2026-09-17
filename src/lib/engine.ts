import { emit, getState, reducedMotion, setState } from './store'
import type {
  ActivityEvent,
  AppState,
  Conversation,
  Memory,
  Message,
  Model,
  ModelId,
  ModelStatus,
} from './types'
import { MODEL_NAME } from './mockData'

/* ------------------------------------------------------------ token maths */

export const estimateIn = (text: string): number => Math.max(8, Math.round(text.length / 4))
export const estimateOut = (text: string): number => Math.max(8, Math.round(text.length / 3.6))
const CONTEXT_COST_PER_MEMORY = 46
const SYSTEM_PROMPT_COST = 180

/**
 * What a turn costs before the answer is written: the system prompt, the whole
 * transcript so far (models are stateless, the history is re-sent every time),
 * the injected memories and the new prompt.
 */
export function promptCost(
  prompt: string,
  contextCount: number,
  s: AppState = getState(),
  convId = s.activeConversation,
): number {
  const conv = s.conversations.find((c) => c.id === convId)
  const history = (conv?.messages ?? []).reduce(
    (sum, m) => sum + (m.role === 'system' ? 12 : estimateIn(m.text)),
    0,
  )
  return SYSTEM_PROMPT_COST + history + contextCount * CONTEXT_COST_PER_MEMORY + estimateIn(prompt)
}

export function modelStatus(m: Model): ModelStatus {
  if (!m.connected) return 'disconnected'
  if (m.local) return 'available'
  if (m.tokens <= 0) return 'exhausted'
  if (m.tokens / m.tokensTotal < 0.15) return 'limited'
  return 'available'
}

export function isUsable(m: Model, reserve = 0): boolean {
  if (!m.connected) return false
  if (m.local) return true
  return m.tokens > reserve
}

export function byId(s: AppState, id: ModelId): Model {
  return s.models.find((m) => m.id === id) ?? s.models[0]
}

/* ---------------------------------------------------------------- routing */

export interface RouteDecision {
  model: ModelId
  reason: string
  skipped: Array<{ id: ModelId; why: string }>
}

/** The decision the AI Router makes for the next turn. */
export function decideRoute(s: AppState = getState(), forceAuto = false): RouteDecision {
  const reserve = s.settings.fallbackThreshold
  const skipped: RouteDecision['skipped'] = []

  if (!forceAuto && s.settings.routerMode === 'manual') {
    const pinned = byId(s, s.activeModel)
    if (isUsable(pinned, 0)) {
      return { model: pinned.id, reason: 'Pinned manually', skipped }
    }
    skipped.push({ id: pinned.id, why: 'Out of budget' })
  }

  for (const id of s.settings.priority) {
    const m = s.models.find((x) => x.id === id)
    if (!m) continue
    if (!m.connected) {
      skipped.push({ id, why: 'Not connected' })
      continue
    }
    if (s.settings.localOnly && !m.local) {
      skipped.push({ id, why: 'Local-only mode' })
      continue
    }
    if (!isUsable(m, reserve)) {
      skipped.push({ id, why: m.tokens <= 0 ? 'Limit reached' : 'Below reserve' })
      continue
    }
    const reason = skipped.length === 0 ? 'Highest priority, budget available' : 'Next available in priority order'
    return { model: id, reason, skipped }
  }

  const local = s.models.find((m) => m.local && m.connected)
  return {
    model: local ? local.id : s.settings.priority[0],
    reason: 'Last resort — on-device runtime',
    skipped,
  }
}

/* --------------------------------------------------------------- activity */

let seq = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

export function logActivity(e: Omit<ActivityEvent, 'id' | 'at'> & { at?: number }): void {
  const event: ActivityEvent = { id: uid('ev'), at: e.at ?? Date.now(), ...e }
  setState((s) => ({ activity: [event, ...s.activity].slice(0, 400) }))
}

/* ------------------------------------------------- shared memory retrieval */

const STOP = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was', 'ich', 'und', 'der',
  'die', 'das', 'ein', 'eine', 'ist', 'wie', 'was', 'mit', 'für', 'auf', 'den', 'dem', 'nicht',
  'mir', 'mich', 'aber', 'noch', 'from', 'have', 'has', 'can', 'how', 'what', 'about', 'when',
])

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

/** Picks the memories the router would inject as context for a turn. */
export function retrieve(text: string, s: AppState = getState(), limit = 3): Memory[] {
  const words = tokenise(text)
  const scored = s.memories
    .filter((m) => !m.forgotten)
    .map((m) => {
      const hay = `${m.title} ${m.detail} ${m.tags.join(' ')} ${m.entity}`.toLowerCase()
      let score = 0
      for (const w of words) if (hay.includes(w)) score += w.length > 5 ? 2.2 : 1.4
      score += m.confidence * 0.9
      if (m.pinned) score += 2.6
      score += Math.min(m.uses, 30) / 42
      return { m, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((x) => x.m)
}

/* ----------------------------------------------------- response synthesis */

type Intent = 'music' | 'hardware' | 'travel' | 'design' | 'code' | 'memory' | 'models' | 'plan' | 'greeting' | 'general'
type Lang = 'de' | 'en'

const INTENT_WORDS: Array<[Intent, RegExp]> = [
  ['greeting', /^\s*(hi|hey|hallo|moin|servus|yo|guten (morgen|abend|tag))\b/i],
  ['models', /\b(model|modell|claude|chatgpt|gpt|gemini|router|token|fallback|switch|wechsel|limit)\b/i],
  ['memory', /\b(memory|memories|gedächtnis|erinner|remember|merk|weißt du|weisst du|vergiss)\b/i],
  ['music', /\b(musik|music|song|track|mix|mixing|ep|beat|vocal|bpm|master|studio|gitarre|guitar|melodie|melody|sample|produz|arrangement|nightshift|lena|sara|jonas)\b/i],
  ['hardware', /\b(pc|gpu|cpu|ryzen|rtx|ram|kabel|cable|lüfter|fan|nvme|ssd|monitor|build|bios|kühl|cooler)\b/i],
  ['travel', /\b(canada|kanada|vancouver|whistler|reise|trip|flug|flight|ferry|packing|visa)\b/i],
  ['design', /\b(design|ui|interface|layout|farbe|color|colour|font|typo|animation|glass|spacing|kontrast|contrast)\b/i],
  ['code', /\b(code|react|typescript|css|build|deploy|bug|api|component|komponente|function|vite|git|state|hook)\b/i],
  ['plan', /\b(plan|todo|schritte|steps|roadmap|anfangen|starten|priorit|deadline|zeitplan)\b/i],
]

function detectIntent(text: string): Intent {
  for (const [intent, re] of INTENT_WORDS) if (re.test(text)) return intent
  return 'general'
}

function detectLang(text: string): Lang {
  if (/[äöüß]/i.test(text)) return 'de'
  const de = /\b(ich|und|nicht|wie|was|der|die|das|ist|mit|für|auf|mir|mich|kannst|soll|wir|eine|aber|noch|mal|wenn|sind|hab|habe|bei)\b/gi
  const hits = text.match(de)?.length ?? 0
  return hits >= 2 ? 'de' : 'en'
}

const BODY: Record<Intent, Record<Lang, string[][]>> = {
  greeting: {
    de: [[
      'Alles bereit. Vier Modelle verbunden, das gemeinsame Gedächtnis ist vor zwei Minuten synchronisiert worden.',
      'Woran arbeiten wir — Nightshift, die Oberfläche hier, oder etwas Neues?',
    ]],
    en: [[
      'Everything is up. Four models connected, shared memory reconciled two minutes ago.',
      'What are we on — Nightshift, this interface, or something new?',
    ]],
  },
  music: {
    de: [
      [
        'Der Punkt, an dem das kippt, ist fast immer die Übergangsstelle, nicht das Material selbst.',
        'Nimm an der Nahtstelle bewusst etwas weg statt hinzuzufügen. Ein Arrangement, das dichter wird, hat nach zwei Minuten keine Reserve mehr — eines, das zwischendurch ausdünnt, kann zweimal aufmachen.',
        'Praktisch: acht Takte ohne Drums, Bass übernimmt die Bewegung, Vocals trockener. Danach Kick und Clap zurück, der Rest erst im letzten Drittel.',
      ],
      [
        'Bevor du am Sound schraubst, würde ich die Struktur festklopfen — sonst mischst du gegen ein Arrangement, das sich noch bewegt.',
        'Leg die Sektionen als Marker an und hör dir nur die Übergänge hintereinander an. Wenn die tragen, trägt der Rest meistens auch.',
        'Den Mix danach in einem Durchgang, nicht in Schleifen. Schleifen machen jede Entscheidung lauter, als sie ist.',
      ],
    ],
    en: [
      [
        'The place this usually breaks is the transition, not the material either side of it.',
        'Take something away at the seam instead of adding to it. An arrangement that only ever thickens has nothing left after two minutes; one that thins out can open up twice.',
        'Concretely: eight bars without drums, bass carries the movement, vocals drier. Then kick and clap return, everything else waits for the last third.',
      ],
      [
        'Lock the structure before touching the sound, otherwise you are mixing against an arrangement that is still moving.',
        'Drop section markers and listen to the transitions back to back. If those hold, the rest usually does too.',
        'Then mix in one pass rather than in loops — loops make every decision sound louder than it is.',
      ],
    ],
  },
  hardware: {
    de: [[
      'Die einfache Variante zuerst: alles, was du später noch ändern willst, sollte jetzt nicht endgültig werden.',
      'Für deinen Aufbau heißt das — Verlängerungen statt maßgefertigter Kabel, Lüfterkurven über das BIOS statt über Software, und einen Slot frei lassen.',
      'Temperaturen einmal unter echter Last messen, nicht im Benchmark. Ein DAW-Projekt mit vollen Plugin-Ketten ist der ehrlichere Test.',
    ]],
    en: [[
      'Simple option first: anything you might still change should not become permanent today.',
      'For your build that means extensions rather than custom-length cables, fan curves in the BIOS rather than in software, and one slot left free.',
      'Measure temperatures under real load, not in a benchmark. A DAW project with full plugin chains is the more honest test.',
    ]],
  },
  travel: {
    de: [[
      'Drei Wochen sind genug, um nicht durchzuhetzen — wenn du die Basis nicht dreimal wechselst.',
      'Vancouver als Standquartier, Whistler als zwei Tage, der Rest als Tagesfahrten. Fähren sind im März selten ausgebucht, aber die Zeiten sind ausgedünnt.',
      'Für die Field Recordings: Regen und Raumton bekommst du überall, Fähre und Hafen nur dort. Plan die Aufnahmen an die Wege, nicht umgekehrt.',
    ]],
    en: [[
      'Three weeks is enough not to rush, as long as you do not move base three times.',
      'Vancouver as the anchor, two days in Whistler, everything else as day trips. Ferries are rarely full in March, but the timetable thins out.',
      'For the field recordings: rain and room tone you can get anywhere; ferry and harbour only there. Plan the recordings around the routes, not the other way round.',
    ]],
  },
  design: {
    de: [[
      'Zurückhaltung ist hier die teurere Entscheidung, weil sie an jedem Detail sichtbar wird.',
      'Halte die Hierarchie über Größe und Gewicht, nicht über Farbe. Eine einzige Signalfarbe, sonst Graustufen — dann trägt der Akzent tatsächlich Bedeutung.',
      'Haarlinien statt Rahmen, Tiefe über Schatten und Material statt über Rundungen. Sobald drei Radien im Bild sind, sieht es nach Baukasten aus.',
    ]],
    en: [[
      'Restraint is the more expensive choice here, because it shows up in every detail.',
      'Carry hierarchy with size and weight rather than colour. One signal colour and otherwise greys — then the accent actually means something.',
      'Hairlines instead of borders, depth through material and shadow instead of rounding. The moment three different radii are on screen it reads as a kit.',
    ]],
  },
  code: {
    de: [[
      'Ich würde das an der Stelle lösen, an der der Zustand entsteht, nicht dort, wo er auffällt.',
      'Ein einzelner Store mit expliziten Aktionen ist hier robuster als verteilte Effekte — jede Zustandsänderung hat dann genau einen Ursprung und lässt sich im Log nachvollziehen.',
      'Was du dabei nicht brauchst: eine zusätzliche Bibliothek. Das ist etwa sechzig Zeilen und spart dir die Abhängigkeit.',
    ]],
    en: [[
      'I would fix this where the state originates rather than where it becomes visible.',
      'A single store with explicit actions is sturdier here than scattered effects — every change then has exactly one origin and shows up in the log.',
      'What you do not need for it is another library. This is about sixty lines and it saves you the dependency.',
    ]],
  },
  memory: {
    de: [[
      'Das gemeinsame Gedächtnis ist der Grund, warum ein Modellwechsel hier nichts kostet.',
      'Jeder Eintrag trägt seine Herkunft, ein Vertrauensmaß und die Liste der Modelle, die ihn schon verwendet haben. Löschen wirkt sofort für alle vier.',
      'Was automatisch erfasst wird, kannst du pro Eintrag widerrufen — die Herkunft bleibt sichtbar, damit du nachvollziehen kannst, woher eine Annahme kam.',
    ]],
    en: [[
      'The shared memory is the reason a model switch costs nothing here.',
      'Every entry carries its provenance, a confidence figure and the list of models that have already used it. Forgetting takes effect for all four at once.',
      'Anything captured automatically can be revoked per entry — the provenance stays visible so you can trace where an assumption came from.',
    ]],
  },
  models: {
    de: [[
      'Der Router entscheidet pro Nachricht, nicht pro Unterhaltung.',
      'Er geht deine Prioritätsliste von oben nach unten durch und nimmt das erste Modell, das noch über der Reserve liegt. Fällt es während der Antwort unter das Limit, übernimmt das nächste — mit demselben Kontext und demselben Gedächtnis.',
      'Sichtbar wird das als Zeile im Verlauf, nicht als Hinweis, der wieder verschwindet.',
    ]],
    en: [[
      'The router decides per message, not per conversation.',
      'It walks your priority list top down and takes the first model still above the reserve. If that model drops below its limit mid-answer, the next one continues — same context, same memory.',
      'It shows up as a row in the transcript rather than a notice that disappears.',
    ]],
  },
  plan: {
    de: [[
      'Sortiert nach dem, was den Rest blockiert:',
      'Zuerst die Entscheidung, die alles andere festlegt — solange die offen ist, ist jede Arbeit daran vorläufig.',
      'Danach das, was du in einer Sitzung abschließen kannst. Ein erledigter kleiner Schritt ist mehr wert als drei halbe große.',
      'Zum Schluss das, was warten kann, ohne teurer zu werden. Das ist bei dir gerade der Teil, der sich am dringendsten anfühlt.',
    ]],
    en: [[
      'Ordered by what blocks the rest:',
      'First the decision that fixes everything else — while it is open, work downstream of it stays provisional.',
      'Then whatever you can finish in one sitting. One small closed step is worth more than three half-finished large ones.',
      'Last, the things that can wait without getting more expensive. In your case that is the part that currently feels most urgent.',
    ]],
  },
  general: {
    de: [
      [
        'Kurz eingeordnet, bevor ich ins Detail gehe.',
        'Die Frage hat zwei Ebenen: was jetzt funktioniert und was in drei Monaten noch funktioniert. Die zweite ist meistens die, die man beim Entscheiden vergisst.',
        'Wenn du willst, gehe ich eine davon konkret durch.',
      ],
      [
        'Das lässt sich in einem Durchgang lösen, wenn wir die Reihenfolge festlegen.',
        'Der Teil, den du beschreibst, ist eher ein Symptom — der eigentliche Hebel liegt eine Ebene darunter. Dort angesetzt, erledigt sich der Rest fast von selbst.',
        'Sag mir, welche der beiden Richtungen dir näher liegt, dann baue ich sie aus.',
      ],
    ],
    en: [
      [
        'Quick framing before the detail.',
        'There are two layers here: what works now and what still works in three months. The second is the one that tends to get dropped while deciding.',
        'Say the word and I will take one of them apart properly.',
      ],
      [
        'This is solvable in one pass once the order is settled.',
        'What you describe reads as a symptom — the actual lever sits one level below it. Pull that and most of the rest resolves on its own.',
        'Tell me which of the two directions is closer and I will build it out.',
      ],
    ],
  },
}

const MEMORY_LEAD: Record<Lang, string[]> = {
  de: ['Aus dem gemeinsamen Gedächtnis', 'Im Gedächtnis liegt dazu', 'Bekannt aus früheren Sitzungen'],
  en: ['From shared memory', 'Shared memory has', 'Carried over from earlier sessions'],
}

const GPT_LIST: Record<Lang, string[]> = {
  de: ['Konkret:', 'In Schritten:', 'Der kürzeste Weg:'],
  en: ['Concretely:', 'In steps:', 'Shortest path:'],
}

const GEMINI_EXTRA: Record<Lang, string[]> = {
  de: [
    'Auch relevant: dieselbe Entscheidung taucht später bei einem anderen Teil wieder auf. Wenn du sie jetzt sauber triffst, sparst du dir die zweite Runde.',
    'Ein Randaspekt, der oft untergeht: die Variante, die heute zehn Minuten spart, kostet beim nächsten Umbau meistens eine Stunde.',
  ],
  en: [
    'Also relevant: the same decision resurfaces later in a different part. Making it cleanly now saves the second round.',
    'One side point that usually gets lost: the option that saves ten minutes today tends to cost an hour at the next rebuild.',
  ],
}

const PICKUP: Record<Lang, string[]> = {
  de: [
    'Ich mache an der Stelle weiter, an der das abgebrochen ist.',
    'Weiter ab dem abgeschnittenen Satz — der Kontext liegt mir vor.',
  ],
  en: [
    'Picking up where that broke off.',
    'Continuing from the cut sentence — I have the same context.',
  ],
}

const LOCAL_NOTE: Record<Lang, string> = {
  de: 'Lokal beantwortet — nichts davon hat die Workstation verlassen.',
  en: 'Answered locally — none of this left the workstation.',
}

function pickFrom<T>(arr: T[], salt: number): T {
  return arr[Math.abs(salt) % arr.length]
}

/**
 * Builds the full text a given model would return for a prompt. With
 * `continuing` the model has taken over a turn another model started, so it
 * resumes instead of repeating the opening it never wrote.
 */
export function compose(
  prompt: string,
  model: ModelId,
  context: Memory[],
  continuing = false,
): string {
  const lang = detectLang(prompt)
  const intent = detectIntent(prompt)
  const salt = prompt.length + prompt.charCodeAt(0) + model.length
  const body = pickFrom(BODY[intent][lang], salt)
  const lead = continuing ? pickFrom(PICKUP[lang], salt) : body[0]
  const rest = body.slice(1)

  // The citation is what makes shared memory visible in the answer itself.
  // A continuation skips it: the model it took over from already said it.
  let recall: string | null = null
  if (context.length && intent !== 'greeting' && !continuing) {
    const opener = pickFrom(MEMORY_LEAD[lang], salt)
    const cited = context.slice(0, 2).map((m) => `„${m.title}“`).join(lang === 'de' ? ' und ' : ' and ')
    recall =
      lang === 'de'
        ? `${opener}: ${cited}. Das nehme ich als gegeben an.`
        : `${opener}: ${cited}. I am treating that as given.`
  }

  const join = (parts: Array<string | null>) => parts.filter(Boolean).join('\n\n')

  switch (model) {
    case 'gpt':
      return join([
        lead,
        recall,
        pickFrom(GPT_LIST[lang], salt),
        ...rest.map((p, i) => `${i + 1}. ${p}`),
      ])
    case 'gemini':
      return join([lead, recall, ...rest, pickFrom(GEMINI_EXTRA[lang], salt)])
    case 'local':
      return join([lead, recall, rest[rest.length - 1] ?? null, LOCAL_NOTE[lang]])
    default:
      return join([lead, recall, ...rest])
  }
}

/* -------------------------------------------------- automatic memory capture */

const CAPTURE: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/\bich arbeite (?:gerade )?an\s+(.{4,64}?)(?:[.,!?]|$)/i, (m) => `Arbeitet an ${m[1].trim()}`],
  [/\bi'?m working on\s+(.{4,64}?)(?:[.,!?]|$)/i, (m) => `Working on ${m[1].trim()}`],
  [/\bich (?:mag|bevorzuge|will|möchte)\s+(.{4,64}?)(?:[.,!?]|$)/i, (m) => `Bevorzugt ${m[1].trim()}`],
  [/\bi (?:prefer|like|want)\s+(.{4,64}?)(?:[.,!?]|$)/i, (m) => `Prefers ${m[1].trim()}`],
  [/\bmein(?:e|en)?\s+(.{3,40}?)\s+ist\s+(.{3,40}?)(?:[.,!?]|$)/i, (m) => `${m[1].trim()} ist ${m[2].trim()}`],
  [/\bmy\s+(.{3,40}?)\s+is\s+(.{3,40}?)(?:[.,!?]|$)/i, (m) => `${m[1].trim()} is ${m[2].trim()}`],
  [/\bich (?:hänge|stecke) (?:bei|an)\s+(.{4,64}?)(?:[.,!?]|$)/i, (m) => `Blockiert bei ${m[1].trim()}`],
  [/\bdeadline (?:ist|is)\s+(.{3,48}?)(?:[.,!?]|$)/i, (m) => `Deadline: ${m[1].trim()}`],
]

function capture(prompt: string, model: ModelId, s: AppState): Memory | null {
  if (!s.settings.memoryCapture) return null
  for (const [re, make] of CAPTURE) {
    const match = prompt.match(re)
    if (!match) continue
    const title = make(match).replace(/\s+/g, ' ').slice(0, 88)
    if (s.memories.some((m) => m.title.toLowerCase() === title.toLowerCase())) return null
    const nextId = String(
      Math.max(...s.memories.map((m) => Number(m.id))) + 1,
    ).padStart(3, '0')
    return {
      id: nextId,
      title: title.charAt(0).toUpperCase() + title.slice(1),
      detail: `Extracted automatically from: “${prompt.trim().slice(0, 180)}”`,
      kind: /prefer|bevorzugt/i.test(title) ? 'preference' : 'project',
      entity: 'matteo',
      source: model,
      sourceLabel: `${MODEL_NAME[model]} conversation`,
      usedBy: [model],
      confidence: 0.62 + Math.random() * 0.2,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      uses: 1,
      tags: ['auto'],
    }
  }
  return null
}

/* ------------------------------------------------------------- generation */

let runToken = 0
let running = false

export const isGenerating = (): boolean => running

export function stopGeneration(): void {
  runToken++
  running = false
  setState((s) => ({
    conversations: s.conversations.map((c) => ({
      ...c,
      messages: c.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    })),
  }))
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function patchConversation(id: string, fn: (c: Conversation) => Conversation): void {
  setState((s) => ({
    conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)),
  }))
}

function addMessage(convId: string, m: Message): void {
  patchConversation(convId, (c) => ({ ...c, messages: [...c.messages, m], updatedAt: m.at }))
}

function spendTokens(id: ModelId, amount: number): void {
  setState((s) => ({
    models: s.models.map((m) =>
      m.id === id && !m.local ? { ...m, tokens: Math.max(0, m.tokens - amount) } : m,
    ),
  }))
}

/** Streams `text` into an existing message, word by word. Returns false if cancelled. */
async function stream(convId: string, msgId: string, text: string, mine: number): Promise<boolean> {
  const instant = !getState().settings.streamResponses || reducedMotion()
  if (instant) {
    patchConversation(convId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === msgId ? { ...m, text, streaming: false } : m)),
    }))
    return true
  }
  const parts = text.split(/(\s+)/)
  let buf = ''
  for (let i = 0; i < parts.length; i += 2) {
    if (mine !== runToken) return false
    buf += parts[i] + (parts[i + 1] ?? '')
    patchConversation(convId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === msgId ? { ...m, text: buf } : m)),
    }))
    await sleep(parts[i].length > 9 ? 34 : 19)
  }
  patchConversation(convId, (c) => ({
    ...c,
    messages: c.messages.map((m) => (m.id === msgId ? { ...m, text, streaming: false } : m)),
  }))
  return true
}

function truncateToBudget(text: string, ratio: number): string {
  if (ratio >= 1) return text
  const cut = Math.max(40, Math.floor(text.length * Math.max(0.12, ratio)))
  const slice = text.slice(0, cut)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trimEnd()
}

export async function sendMessage(raw: string): Promise<void> {
  const text = raw.trim()
  if (!text || running) return
  running = true
  const mine = ++runToken

  const s0 = getState()
  const convId = s0.activeConversation
  const context = s0.settings.memorySharing ? retrieve(text, s0, 3) : []

  addMessage(convId, {
    id: uid('u'),
    role: 'user',
    text,
    at: Date.now(),
    tokens: estimateIn(text),
  })

  // Title an untouched thread after its first real prompt.
  patchConversation(convId, (c) =>
    c.messages.length <= 1 && /^(new conversation|neue unterhaltung)$/i.test(c.title)
      ? { ...c, title: text.slice(0, 54) }
      : c,
  )

  if (context.length) {
    const ids = new Set(context.map((m) => m.id))
    setState((st) => ({
      memories: st.memories.map((m) =>
        ids.has(m.id) ? { ...m, uses: m.uses + 1, lastUsedAt: Date.now() } : m,
      ),
    }))
  }

  await sleep(240)
  if (mine !== runToken) return

  let decision = decideRoute(getState())
  let modelId = decision.model

  if (decision.skipped.length) {
    logActivity({
      kind: 'route',
      title: `Router selected ${MODEL_NAME[modelId]}`,
      detail: decision.skipped.map((x) => `${MODEL_NAME[x.id]}: ${x.why}`).join(' · '),
      model: modelId,
    })
  }

  // The previous model became unusable between turns — show that as a handoff
  // rather than silently answering under a different name.
  const previous = byId(getState(), s0.activeModel)
  if (modelId !== previous.id) {
    const why = !previous.connected
      ? 'Provider disconnected'
      : previous.tokens <= 0
        ? 'Token limit reached'
        : previous.tokens <= getState().settings.fallbackThreshold
          ? 'Below fallback reserve'
          : null
    if (why) {
      addMessage(convId, {
        id: uid('sys'),
        role: 'system',
        text: 'handoff',
        at: Date.now(),
        handoff: { from: previous.id, to: modelId, reason: why },
      })
      emit({ type: 'handoff', from: previous.id, to: modelId })
      logActivity({
        kind: 'route',
        title: `Router switched to ${MODEL_NAME[modelId]}`,
        detail: `${MODEL_NAME[previous.id]} unavailable · ${why.toLowerCase()}`,
        model: modelId,
      })
      await sleep(reducedMotion() ? 150 : 1450)
      if (mine !== runToken) {
        running = false
        return
      }
    }
  }

  setState({ activeModel: modelId })

  const full = compose(text, modelId, context)
  const inCost = promptCost(text, context.length, getState(), convId)
  const outCost = estimateOut(full)
  const model = byId(getState(), modelId)
  const budget = model.local ? Infinity : Math.max(0, model.tokens)

  const msgId = uid('a')
  addMessage(convId, {
    id: msgId,
    role: 'assistant',
    model: modelId,
    text: '',
    at: Date.now(),
    tokens: 0,
    context: context.map((m) => m.id),
    streaming: true,
  })

  const affordable = budget - inCost
  const ratio = affordable <= 0 ? 0 : Math.min(1, affordable / outCost)

  if (ratio >= 1) {
    const ok = await stream(convId, msgId, full, mine)
    if (!ok) {
      running = false
      return
    }
    spendTokens(modelId, inCost + outCost)
    finishTurn(convId, msgId, modelId, inCost + outCost, text, context)
    running = false
    return
  }

  /* ---- the model runs out of budget part-way through the answer ---- */
  const partial = truncateToBudget(full, ratio)
  if (partial.length > 24) {
    const ok = await stream(convId, msgId, partial, mine)
    if (!ok) {
      running = false
      return
    }
    patchConversation(convId, (c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === msgId ? { ...m, truncated: true, tokens: Math.max(0, budget) } : m,
      ),
    }))
  } else {
    patchConversation(convId, (c) => ({
      ...c,
      messages: c.messages.filter((m) => m.id !== msgId),
    }))
  }

  spendTokens(modelId, budget)
  logActivity({
    kind: 'limit',
    title: `${MODEL_NAME[modelId]} token limit reached`,
    detail: `0 of ${model.tokensTotal.toLocaleString('en-US')} tokens remaining`,
    model: modelId,
  })

  const after = getState()
  decision = decideRoute({ ...after, settings: { ...after.settings, routerMode: 'auto' } }, true)
  const nextId = decision.model === modelId ? fallbackAfter(after, modelId) : decision.model

  const handoffId = uid('sys')
  addMessage(convId, {
    id: handoffId,
    role: 'system',
    text: 'handoff',
    at: Date.now(),
    handoff: { from: modelId, to: nextId, reason: 'Token limit reached' },
  })
  emit({ type: 'handoff', from: modelId, to: nextId })
  logActivity({
    kind: 'route',
    title: `Router switched to ${MODEL_NAME[nextId]}`,
    detail: `${MODEL_NAME[modelId]} unavailable · conversation continued`,
    model: nextId,
  })

  await sleep(reducedMotion() ? 200 : 1500)
  if (mine !== runToken) {
    running = false
    return
  }
  setState({ activeModel: nextId })

  const contText = compose(text, nextId, context, true)
  const contId = uid('a')
  addMessage(convId, {
    id: contId,
    role: 'assistant',
    model: nextId,
    text: '',
    at: Date.now(),
    tokens: 0,
    context: context.map((m) => m.id),
    streaming: true,
  })
  const ok = await stream(convId, contId, contText, mine)
  if (!ok) {
    running = false
    return
  }
  const contCost = promptCost(text, context.length, getState(), convId) + estimateOut(contText)
  spendTokens(nextId, contCost)
  finishTurn(convId, contId, nextId, contCost, text, context)
  running = false
}

function fallbackAfter(s: AppState, current: ModelId): ModelId {
  const order = s.settings.priority
  const idx = order.indexOf(current)
  for (let i = idx + 1; i < order.length; i++) {
    const m = s.models.find((x) => x.id === order[i])
    if (m && isUsable(m, 0)) return m.id
  }
  const local = s.models.find((m) => m.local)
  return local ? local.id : order[order.length - 1]
}

function finishTurn(
  convId: string,
  msgId: string,
  modelId: ModelId,
  cost: number,
  prompt: string,
  context: Memory[],
): void {
  patchConversation(convId, (c) => ({
    ...c,
    updatedAt: Date.now(),
    messages: c.messages.map((m) => (m.id === msgId ? { ...m, tokens: cost, streaming: false } : m)),
  }))
  const conv = getState().conversations.find((c) => c.id === convId)
  logActivity({
    kind: 'response',
    title: `${MODEL_NAME[modelId]} generated response`,
    detail: `${cost.toLocaleString('en-US')} tokens${conv?.title ? ` · ${conv.title}` : ''}`,
    model: modelId,
  })

  if (context.length) {
    setState((st) => ({
      memories: st.memories.map((m) =>
        context.some((c) => c.id === m.id) && !m.usedBy.includes(modelId)
          ? { ...m, usedBy: [...m.usedBy, modelId].sort() }
          : m,
      ),
    }))
  }

  const captured = capture(prompt, modelId, getState())
  if (captured) {
    setState((st) => ({ memories: [captured, ...st.memories] }))
    logActivity({
      kind: 'memory',
      title: 'Memory created',
      detail: `“${captured.title}”`,
      model: modelId,
    })
    emit({ type: 'memory', id: captured.id, title: captured.title })
    void syncMemory(900)
  }
}

/* ------------------------------------------------------- memory operations */

export async function syncMemory(delay = 1400): Promise<void> {
  if (getState().syncing) return
  setState({ syncing: true })
  emit({ type: 'sync' })
  await sleep(delay)
  const count = getState().memories.filter((m) => !m.forgotten).length
  setState({ syncing: false, lastSync: Date.now() })
  logActivity({
    kind: 'sync',
    title: 'Memory synchronised',
    detail: `${count.toLocaleString('en-US')} entries reconciled across 4 models`,
  })
}

export function forgetMemory(id: string): void {
  const m = getState().memories.find((x) => x.id === id)
  setState((s) => ({
    memories: s.memories.map((x) => (x.id === id ? { ...x, forgotten: true, pinned: false } : x)),
  }))
  logActivity({ kind: 'memory', title: 'Memory forgotten', detail: m ? `“${m.title}”` : undefined })
}

export function restoreMemory(id: string): void {
  setState((s) => ({
    memories: s.memories.map((x) => (x.id === id ? { ...x, forgotten: false } : x)),
  }))
  logActivity({ kind: 'memory', title: 'Memory restored' })
}

export function pinMemory(id: string, pinned: boolean): void {
  setState((s) => ({ memories: s.memories.map((x) => (x.id === id ? { ...x, pinned } : x)) }))
}

export function editMemory(id: string, patch: Partial<Memory>): void {
  setState((s) => ({ memories: s.memories.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  logActivity({ kind: 'memory', title: 'Memory updated', detail: patch.title ? `“${patch.title}”` : undefined })
}

/* ------------------------------------------------------------ demo controls */

export function drainModel(id: ModelId, to = 0): void {
  const m = byId(getState(), id)
  setState((s) => ({ models: s.models.map((x) => (x.id === id ? { ...x, tokens: to } : x)) }))
  logActivity({
    kind: 'limit',
    title: `${MODEL_NAME[id]} token limit reached`,
    detail: `Simulated · 0 of ${m.tokensTotal.toLocaleString('en-US')} tokens remaining`,
    model: id,
  })
  emit({ type: 'toast', text: `${MODEL_NAME[id]} drained — next message will hand off`, tone: 'warn' })
}

/**
 * Leaves the model exactly enough budget to start an answer but not to finish
 * it, which is what makes the mid-stream handoff reproducible on demand.
 */
export function partialBudget(id: ModelId): void {
  const s = getState()
  const to = Math.max(
    s.settings.fallbackThreshold + 40,
    promptCost('Ein typischer Prompt für die Demo.', 3, s) + 110,
  )
  setState((st) => ({ models: st.models.map((x) => (x.id === id ? { ...x, tokens: to } : x)) }))
  logActivity({
    kind: 'limit',
    title: `${MODEL_NAME[id]} approaching limit`,
    detail: `Simulated · ${to.toLocaleString('en-US')} tokens left — not enough for a full answer`,
    model: id,
  })
  emit({
    type: 'toast',
    text: `${MODEL_NAME[id]} left with ${to.toLocaleString('en-US')} tokens — the next answer will be cut short`,
    tone: 'warn',
  })
}

export function refillModels(): void {
  setState((s) => ({
    models: s.models.map((m) => ({
      ...m,
      tokens: m.local ? 0 : Math.round(m.tokensTotal * (m.id === 'claude' ? 0.842 : m.id === 'gpt' ? 0.637 : 0.414)),
    })),
  }))
  logActivity({ kind: 'system', title: 'Token budgets restored', detail: 'Demo control' })
  emit({ type: 'toast', text: 'Token budgets restored', tone: 'ok' })
}

export function toggleConnection(id: ModelId): void {
  setState((s) => ({
    models: s.models.map((m) => (m.id === id ? { ...m, connected: !m.connected } : m)),
  }))
  const m = byId(getState(), id)
  logActivity({
    kind: 'connect',
    title: m.connected ? `${m.name} connected` : `${m.name} disconnected`,
    detail: m.connected ? `${m.vendor} · ${m.variant}` : 'Removed from the routing pool',
    model: id,
  })
}

export function newConversation(projectId?: string): string {
  const id = uid('c')
  const conv: Conversation = {
    id,
    title: 'New conversation',
    projectId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  }
  setState((s) => ({ conversations: [conv, ...s.conversations], activeConversation: id }))
  return id
}
