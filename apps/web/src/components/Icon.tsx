/**
 * Íconos de línea simples (24×24, trazo 2), dibujados a mano para no depender de otra librería.
 * Siempre van acompañados de texto: el ícono ayuda a reconocer, la palabra explica.
 */
const PATHS = {
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>,
  sprout: <><path d="M12 21v-9" /><path d="M12 12C12 8 9 6 4 6c0 4 3 6 8 6z" /><path d="M12 14c0-4 3-7 8-7 0 5-3 7-8 7z" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" /><path d="M12 17.5h.01" /></>,
  account: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="10" r="3" /><path d="M6.2 18.8a7 7 0 0 1 11.6 0" /></>,
  back: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  pin: <><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1" /><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18.5 20a6.5 6.5 0 0 0-2.8-5.3" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14" /><path d="M15 6v14" /></>,
  drop: <path d="M12 2.7s6 6.6 6 11.3a6 6 0 0 1-12 0C6 9.3 12 2.7 12 2.7z" />,
  camera: <><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="4" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4" /><path d="m15.4 6.5-6.8 4" /></>,
  refresh: <><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8" /><path d="m17 6 3 3" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15v3" /><path d="M12 10v8" /><path d="M17 6v12" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M15 9.2c-.6-.8-1.7-1.2-3-1.2-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.4-3-1.2" /><path d="M12 6v2M12 16v2" /></>,
  snow: <><path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18" /><path d="m9.5 3.5 2.5 2 2.5-2M9.5 20.5l2.5-2 2.5 2" /></>,
  leaf: <><path d="M5 19c0-9 5-14 15-15 0 10-5 15-14 15" /><path d="M5 19c3-4 6-7 10-9" /></>,
  cow: <><path d="M6 8c-2 0-3-1-3-3 1.5 0 3 .5 3.5 1.5M18 8c2 0 3-1 3-3-1.5 0-3 .5-3.5 1.5" /><path d="M6.5 6.5h11c.8 0 1.5.7 1.5 1.5v4a7 7 0 0 1-14 0V8c0-.8.7-1.5 1.5-1.5z" /><ellipse cx="12" cy="16" rx="3.5" ry="2.5" /><path d="M10.8 16h.01M13.2 16h.01M9 11h.01M15 11h.01" /></>,
  wheat: <><path d="M12 22V8" /><path d="M12 8c-2-1-2.5-3-2-5 2 .5 3 2.5 2 5zM12 8c2-1 2.5-3 2-5-2 .5-3 2.5-2 5z" /><path d="M12 13c-2.5-.5-4-2.5-4-4.5 2.5 0 4 2 4 4.5zM12 13c2.5-.5 4-2.5 4-4.5-2.5 0-4 2-4 4.5zM12 18c-2.5-.5-4-2.5-4-4.5 2.5 0 4 2 4 4.5zM12 18c2.5-.5 4-2.5 4-4.5-2.5 0-4 2-4 4.5z" /></>,
  mountain: <><path d="m3 20 6.5-11 4 6.5 2.5-4L21 20z" /><path d="m8 11.5 1.5 1 1.5-1" /></>,
  wilt: <><path d="M12 22v-8c0-3 2-5 5-6" /><path d="M17 8c1 2 1 4-1 6-1-2-1-4 1-6z" /><path d="M12 14c-1-3-3.5-4-6.5-3.5.5 3 3 4.5 6.5 3.5z" /></>,
  hand: <><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5" /><path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14" /><path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4l-2.6-4.6a1.5 1.5 0 0 1 2.6-1.5L8 15" /></>,
  rain: <><path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 6.5a3.8 3.8 0 0 1 .5 7.5" /><path d="m8 18-1 3M12 17l-1 4M16 18l-1 3" /></>,
  basket: <><path d="M3 10h18l-2 10H5z" /><path d="m7 10 4-6M17 10l-4-6" /><path d="M9 14v3M12 14v3M15 14v3" /></>,
  pencil: <><path d="M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5z" /><path d="m15 5 4 4" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
