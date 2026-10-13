import type { ReactNode } from 'react';
import type { RoleId } from './roles';

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg {...base} width={size} height={size}>{children}</svg>
);

export const BrandMark = () => (
  <Svg size={20}>
    <path d="M4 20V9l5 3V9l5 3V6h6v14z" />
    <path d="M8 16h2M13 16h2M18 16h.01" />
  </Svg>
);

const ICONS: Record<RoleId, ReactNode> = {
  // 공장·설비
  production: (
    <>
      <path d="M3 20V10l6 3V10l6 3V5h6v15z" />
      <path d="M7 17h2M12 17h2M17 17h.01" />
    </>
  ),
  // 플라스크·검사
  qc: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  // 방패·체크
  qa: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

export const RoleIcon = ({ id, size = 20 }: { id: RoleId; size?: number }) => <Svg size={size}>{ICONS[id]}</Svg>;

export const ArrowRight = () => (
  <Svg size={16}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
