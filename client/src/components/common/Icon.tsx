import type { SVGProps } from 'react'

const paths = {
  play: <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="4" y="3.5" width="2.6" height="9" rx=".6" fill="currentColor" stroke="none" />
      <rect x="9.4" y="3.5" width="2.6" height="9" rx=".6" fill="currentColor" stroke="none" />
    </>
  ),
  resume: (
    <>
      <rect x="3" y="3.5" width="2.2" height="9" rx=".6" fill="currentColor" stroke="none" />
      <path d="M7.5 3.5v9l6-4.5z" fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" stroke="none" />,
  folder: <path d="M2 4.5c0-.6.4-1 1-1h3.2l1.4 1.6H13c.6 0 1 .4 1 1v6.4c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" />,
  drive: (
    <>
      <rect x="2" y="5" width="12" height="6.5" rx="1.2" />
      <circle cx="11.2" cy="8.25" r=".7" fill="currentColor" stroke="none" />
    </>
  ),
  star: <path d="M8 2.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L8 10.6l-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" />,
  chevronRight: <path d="M6 3.5L10.5 8 6 12.5" />,
  chevronLeft: <path d="M10 3.5L5.5 8l4.5 4.5" />,
  up: <path d="M8 13V3.5M4 7.5l4-4 4 4" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  grid: (
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx=".8" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx=".8" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx=".8" />
      <rect x="9" y="9" width="4.5" height="4.5" rx=".8" />
    </>
  ),
  list: <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2L13.5 13.5" />
    </>
  ),
  reveal: <path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3c0 .6-.4 1-1 1h-7c-.6 0-1-.4-1-1v-7c0-.6.4-1 1-1h3" />,
  roll: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.6" />
      <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2" />
    </>
  ),
  check: <path d="M3.5 8.5l3 3 6-7" />,
  cross: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  compare: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1" />
      <path d="M8 1.5v13" />
    </>
  ),
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  )
}
