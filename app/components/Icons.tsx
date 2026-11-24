// مجموعه آیکون‌های SVG خطی — بدون کتابخانه خارجی
interface IconProps { size?: number; className?: string }
const base = (size = 20) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const IconMic = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconMicOff = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 3 20 21" /></svg>
);
export const IconVolume = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M4 9h3l5-4v14l-5-4H4z" /><path d="M16 8a5 5 0 0 1 0 8" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>
);
export const IconVolumeOff = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M4 9h3l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
);
export const IconSend = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" /></svg>
);
export const IconUsers = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><circle cx="9" cy="8" r="3.4" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2c2.8.4 5 2.8 5 5.8" /></svg>
);
export const IconCrown = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M3 17 5 7l4.5 4L12 5l2.5 6L19 7l2 10z" /><path d="M4 21h16" /></svg>
);
export const IconExit = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h12" /></svg>
);
export const IconGear = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2.2 2.2M17.3 17.3l2.2 2.2M19.5 4.5l-2.2 2.2M6.7 17.3l-2.2 2.2" /></svg>
);
export const IconPlay = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M7 5v14l12-7z" /></svg>
);
export const IconSkip = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M5 5v14l9-7zM15 5h3v14h-3z" /></svg>
);
export const IconFlag = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M5 21V4M5 4c4-2 8 2 14 0v9c-6 2-10-2-14 0" /></svg>
);
export const IconSearch = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
);
export const IconChat = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M21 12a8 8 0 0 1-8 8H4l2.2-2.7A8 8 0 1 1 21 12z" /></svg>
);
export const IconSticker = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M12 3a9 9 0 1 0 9 9c-5 1-10-4-9-9z" /><path d="M13 3.2A9 9 0 0 1 20.8 11" /></svg>
);
export const IconCopy = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
);
export const IconTimer = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></svg>
);
export const IconEye = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconEyeOff = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.1 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.1-1.5M4 20 20 4" /></svg>
);
export const IconPlus = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconMinus = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M5 12h14" /></svg>
);
export const IconCheck = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M4 12.5 10 18 20 6" /></svg>
);
export const IconX = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M5 5l14 14M19 5 5 19" /></svg>
);
export const IconShield = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>
);
export const IconLink = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}><path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5" /><path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" /></svg>
);

/* آیکون دسته‌های مکان */
export const CatIcon = ({ cat, size = 20 }: { cat: string; size?: number }) => {
  switch (cat) {
    case 'public': return <svg {...base(size)}><path d="M4 21h16M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></svg>;
    case 'education': return <svg {...base(size)}><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v6c0 1.6 2.7 3 6 3s6-1.4 6-3v-6" /></svg>;
    case 'fun': return <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M8 14q2 2 4 0t4 0M8.5 9.5h.01M15.5 9.5h.01" /></svg>;
    case 'food': return <svg {...base(size)}><path d="M6 3v8M10 3v8M8 11v10M6 3c0 3 4 3 4 0M15 21V12c-2 0-3-2.5-3-5 0-2 1-4 3-4z" /></svg>;
    case 'health': return <svg {...base(size)}><path d="M12 21C7 16 3 12.5 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5c0 4-4 7.5-9 12.5z" /></svg>;
    case 'historic': return <svg {...base(size)}><path d="M12 3v4M5 21h14M7 21V10a5 5 0 0 1 10 0v11M9 14h2M13 14h2" /></svg>;
    case 'sport': return <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 3c3 3 3 15 0 18M3.5 9.5h17M3.5 14.5h17" /></svg>;
    case 'travel': return <svg {...base(size)}><path d="M4 21c8 0 12-4 16-16-12 4-16 8-16 16z" /><path d="M4 21 10 15" /></svg>;
    case 'fantasy': return <svg {...base(size)}><path d="M12 3l2.2 4.6L19 9l-3.4 3.4.7 5-4.3-2.3L7.7 17.4l.7-5L5 9l4.8-1.4z" /></svg>;
    default: return <svg {...base(size)}><circle cx="12" cy="12" r="9" /></svg>;
  }
};
