// Small inline SVG icons (no external assets).

export function WhatsAppIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.47 15.03L2.1 22l5.1-1.43A9.9 9.9 0 1 0 12.04 2Zm0 18.04a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.03.85.86-2.95-.2-.31a8.13 8.13 0 1 1 6.8 3.72Zm4.46-6.08c-.24-.12-1.45-.72-1.67-.8-.23-.08-.39-.12-.55.12-.16.24-.63.8-.78.96-.14.16-.29.18-.53.06a6.66 6.66 0 0 1-1.96-1.21 7.37 7.37 0 0 1-1.36-1.69c-.14-.24-.02-.37.1-.49.11-.11.25-.29.37-.43.12-.15.16-.25.24-.41.08-.16.04-.3-.02-.43-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.85 2.04 4.76 4.76 0 0 0 1 2.52c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.45-.6 1.65-1.17.2-.57.2-1.06.14-1.17-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

export function CartIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3.5h2.4l2.3 11.2a1.8 1.8 0 0 0 1.8 1.4h8.7a1.8 1.8 0 0 0 1.75-1.38L21.2 8H6" />
    </svg>
  );
}

export function CopyIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function PrintIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

/** Grok icon: black sphere with two white highlights (drawn from the icon the user provided). */
export function GrokIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="49" fill="#000" />
      <rect x="59.5" y="14" width="9" height="25" rx="4.5" fill="#fff" transform="rotate(-34 64 26.5)" />
      <rect x="82" y="10.5" width="6" height="23" rx="3" fill="#fff" transform="rotate(-34 85 22)" />
    </svg>
  );
}
