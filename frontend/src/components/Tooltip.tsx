'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';

interface TooltipProps {
  /** Content shown inside the tooltip panel */
  content: ReactNode;
  /** The element that triggers the tooltip on hover */
  children: ReactNode;
  /** Placement relative to the trigger element */
  position?: 'top' | 'bottom';
}

/**
 * Reusable tooltip styled to match the Palantir-inspired map tooltips.
 * Renders a dark panel with monospace font, 1px border, and sharp corners.
 */
export default function Tooltip({ content, children, position = 'bottom' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    let top: number;

    if (position === 'top') {
      top = triggerRect.top - tooltipRect.height - 6;
    } else {
      top = triggerRect.bottom + 6;
    }

    // Clamp to viewport
    const margin = 8;
    if (left < margin) left = margin;
    if (left + tooltipRect.width > window.innerWidth - margin) {
      left = window.innerWidth - margin - tooltipRect.width;
    }
    if (top < margin) top = triggerRect.bottom + 6;
    if (top + tooltipRect.height > window.innerHeight - margin) {
      top = triggerRect.top - tooltipRect.height - 6;
    }

    setCoords({ left, top });
  }, [visible, position]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </div>
      {visible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            left: coords.left,
            top: coords.top,
            zIndex: 10000,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            padding: '8px',
            background: '#161B22',
            border: '1px solid #30363D',
            color: '#E6EDF3',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
