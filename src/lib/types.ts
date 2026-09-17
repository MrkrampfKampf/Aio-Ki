export type ModelId = 'claude' | 'gpt' | 'gemini' | 'local'

export type ModelStatus = 'available' | 'limited' | 'exhausted' | 'offline' | 'disconnected'

export interface Model {
  id: ModelId
  /** Vendor as it appears on the model plate. */
  vendor: string
  name: string
  variant: string
  /** Short mark used in dense places. */
  mark: string
  tokens: number
  tokensTotal: number
  contextWindow: number
  latency: number
  connected: boolean
  /** Runs on the user's own machine — never reports a token budget. */
  local: boolean
  strengths: string[]
  note: string
}

export type MemoryKind =
  | 'preference'
  | 'person'
  | 'project'
  | 'interest'
  | 'fact'
  | 'event'
  | 'skill'

export interface Memory {
  id: string
  title: string
  detail: string
  kind: MemoryKind
  entity: string
  source: ModelId
  sourceLabel: string
  usedBy: ModelId[]
  confidence: number
  createdAt: number
  lastUsedAt: number
  uses: number
  tags: string[]
  pinned?: boolean
  forgotten?: boolean
}

export interface Entity {
  id: string
  label: string
  parent: string | null
  kind: MemoryKind | 'root'
  /** Optional caption shown on the node when there is room. */
  note?: string
}

export interface Project {
  id: string
  name: string
  blurb: string
  conversations: number
  memories: number
  models: ModelId[]
  lastActivity: number
  status: 'active' | 'paused' | 'archived'
  progress: number
  tags: string[]
}

export type ActivityKind =
  | 'response'
  | 'memory'
  | 'limit'
  | 'route'
  | 'sync'
  | 'connect'
  | 'project'
  | 'system'

export interface ActivityEvent {
  id: string
  at: number
  kind: ActivityKind
  title: string
  detail?: string
  model?: ModelId
}

export type Role = 'user' | 'assistant' | 'system'

export interface Handoff {
  from: ModelId
  to: ModelId
  reason: string
}

export interface Message {
  id: string
  role: Role
  model?: ModelId
  text: string
  at: number
  tokens?: number
  /** Populated on system rows that visualise a router handoff. */
  handoff?: Handoff
  /** Memory ids the router injected as context for this turn. */
  context?: string[]
  /** Set while the response is being produced. */
  streaming?: boolean
  /** The model ran out of budget mid-answer and the text is cut short. */
  truncated?: boolean
}

export interface Conversation {
  id: string
  title: string
  projectId?: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  pinned?: boolean
}

export type ThemeMode = 'dark' | 'light' | 'auto'
export type AccentName = 'amber' | 'ice' | 'lime' | 'signal'

export interface Settings {
  theme: ThemeMode
  accent: AccentName
  grain: boolean
  motion: 'full' | 'reduced' | 'auto'
  density: 'comfortable' | 'compact'
  routerMode: 'auto' | 'manual'
  /** Priority order used by the router in auto mode. */
  priority: ModelId[]
  fallbackThreshold: number
  streamResponses: boolean
  memoryCapture: boolean
  memorySharing: boolean
  memoryRetention: '30d' | '180d' | 'forever'
  notifyHandoff: boolean
  notifyMemory: boolean
  notifyLimit: boolean
  telemetry: boolean
  localOnly: boolean
}

export interface AppState {
  models: Model[]
  memories: Memory[]
  entities: Entity[]
  projects: Project[]
  activity: ActivityEvent[]
  conversations: Conversation[]
  activeConversation: string
  activeModel: ModelId
  settings: Settings
  /** Last time the shared memory index was reconciled across models. */
  lastSync: number
  syncing: boolean
}

export type ViewName =
  | 'home'
  | 'chat'
  | 'memory'
  | 'models'
  | 'projects'
  | 'activity'
  | 'settings'
