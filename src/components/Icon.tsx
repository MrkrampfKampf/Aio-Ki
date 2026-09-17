import type { JSX } from 'react'

export type IconName =
  | 'home' | 'chat' | 'memory' | 'models' | 'projects' | 'activity' | 'settings'
  | 'search' | 'command' | 'plus' | 'send' | 'close' | 'chevron' | 'chevronDown'
  | 'grip' | 'pin' | 'trash' | 'edit' | 'check' | 'arrow' | 'bolt' | 'shield'
  | 'bell' | 'palette' | 'database' | 'link' | 'dots' | 'refresh' | 'lock'
  | 'stop' | 'sliders' | 'graph' | 'list' | 'flask' | 'menu' | 'clock' | 'branch'

const P: Record<IconName, JSX.Element> = {
  home: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v9h12v-9" /></>,
  chat: <><path d="M5 8l4 4-4 4" /><path d="M13 17h6" /></>,
  memory: <><circle cx="12" cy="5.5" r="2.2" /><circle cx="5.5" cy="17" r="2.2" /><circle cx="18.5" cy="17" r="2.2" /><path d="M10.6 7.4 7 14.9M13.4 7.4 17 14.9M7.7 17h8.6" /></>,
  models: <><path d="M12 3.5 21 8l-9 4.5L3 8l9-4.5Z" /><path d="m3 12.5 9 4.5 9-4.5" /><path d="m3 16.8 9 4.5 9-4.5" opacity=".55" /></>,
  projects: <><rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.6" /><rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.6" opacity=".55" /><rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.6" opacity=".55" /><rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.6" /></>,
  activity: <><path d="M2.5 12.5h4l2.5-7 3.5 13 2.6-8 1.6 2h4.8" /></>,
  settings: <><path d="M3.5 7h11M18 7h2.5M3.5 12h3M10 12h10.5M3.5 17h8M15 17h5.5" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="17" r="2" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.4 15.4 4 4" /></>,
  command: <><path d="M9 6.5a2.5 2.5 0 1 0-2.5 2.5H9V6.5ZM15 6.5A2.5 2.5 0 1 1 17.5 9H15V6.5ZM9 17.5A2.5 2.5 0 1 1 6.5 15H9v2.5ZM15 17.5a2.5 2.5 0 1 0 2.5-2.5H15v2.5Z" /><rect x="9" y="9" width="6" height="6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  send: <><path d="M4.5 12h13" /><path d="m12 6.5 5.5 5.5L12 17.5" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevron: <><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></>,
  chevronDown: <><path d="m5.5 9.5 6.5 6 6.5-6" /></>,
  grip: <><circle cx="9" cy="6.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="6.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="17.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="17.5" r="1.3" fill="currentColor" stroke="none" /></>,
  pin: <><path d="M9 3.5h6l-1 5 3 3.5H7l3-3.5-1-5Z" /><path d="M12 12v8.5" /></>,
  trash: <><path d="M4.5 6.5h15M9.5 6.5V4h5v2.5" /><path d="M6.5 6.5 7.6 20h8.8l1.1-13.5" /></>,
  edit: <><path d="M4.5 19.5h4L19 9a2.1 2.1 0 0 0-3-3L4.5 17.5v2Z" /><path d="m14.5 6.5 3 3" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7" /></>,
  arrow: <><path d="M5 12h13.5" /><path d="m13 6.5 5.5 5.5-5.5 5.5" /></>,
  bolt: <><path d="M13.5 3 5.5 13.5h5L10 21l8.5-10.5h-5L13.5 3Z" /></>,
  shield: <><path d="M12 3.5 5 6v6c0 4.2 3 7.4 7 8.5 4-1.1 7-4.3 7-8.5V6l-7-2.5Z" /></>,
  bell: <><path d="M7 10a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S7 14 7 10Z" /><path d="M10.2 18.5a2 2 0 0 0 3.6 0" /></>,
  palette: <><circle cx="12" cy="12" r="8.5" /><circle cx="9" cy="9.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="9.5" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" /></>,
  database: <><ellipse cx="12" cy="6" rx="7.5" ry="2.8" /><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6" /><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></>,
  link: <><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5" /><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5" /></>,
  dots: <><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
  refresh: <><path d="M19 12a7 7 0 1 1-2.2-5.1" /><path d="M19.5 4v3.6H16" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  stop: <><rect x="7" y="7" width="10" height="10" rx="1.6" /></>,
  sliders: <><path d="M6 20V13M6 9V4M12 20v-9M12 7V4M18 20v-4M18 12V4" /><circle cx="6" cy="11" r="2" /><circle cx="12" cy="9" r="2" /><circle cx="18" cy="14" r="2" /></>,
  graph: <><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="16.5" cy="17.5" r="2.2" /><circle cx="6.5" cy="16" r="2.2" /><path d="m8 7.6 7.8-1.2M7.4 9l8 7.2M8.6 16.8l5.8.5M7.2 14 16.8 8" opacity=".7" /></>,
  list: <><path d="M4 6.5h16M4 12h16M4 17.5h10" /></>,
  flask: <><path d="M10 3.5v5.2L4.8 18a2.2 2.2 0 0 0 1.9 3.3h10.6A2.2 2.2 0 0 0 19.2 18L14 8.7V3.5" /><path d="M8.5 3.5h7M7.4 14.5h9.2" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.3l3.2 2" /></>,
  branch: <><circle cx="7" cy="5.5" r="2.2" /><circle cx="7" cy="18.5" r="2.2" /><circle cx="17" cy="9" r="2.2" /><path d="M7 7.7v8.6M9.2 5.9h3.6A2.2 2.2 0 0 1 15 8.1v.5M17 11.2v1.3a3 3 0 0 1-3 3H9.2" /></>,
}

interface Props {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export function Icon({ name, size = 16, className, strokeWidth = 1.5 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  )
}
