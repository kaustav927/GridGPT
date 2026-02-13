'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface TourStep {
  selector: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="grid-ai"]',
    title: 'Grid AI',
    description: 'Ask natural language questions about the Ontario grid — the AI writes SQL queries and returns real-time answers.',
  },
  {
    selector: '[data-tour="zone-map"]',
    title: 'Ontario Zone Map',
    description: 'View zonal pricing across 9 zones, toggle weather layers, and scrub through time with the slider at the bottom.',
  },
  {
    selector: '[data-tour="market-overview"]',
    title: 'Market Overview',
    description: 'Track supply, demand, and price on a dual-axis chart. Toggle the day-ahead forecast overlay for tomorrow\'s prices.',
  },
  {
    selector: '[data-tour="fuel-mix"]',
    title: 'Fuel Mix',
    description: 'See how Ontario\'s electricity is generated — nuclear, hydro, gas, wind, and solar. Switch between donut, table, and radar views. Click a fuel type to highlight it.',
  },
  {
    selector: '[data-tour="gen-by-resource"]',
    title: 'Generation by Resource',
    description: 'Area charts for each major generating station grouped by fuel type. Click a section header to collapse or expand it.',
  },
  {
    selector: '[data-tour="interties"]',
    title: 'Interties',
    description: 'Monitor power flows between Ontario and neighbouring regions. Green chevrons = export, red = import. The NET FLOW pill shows the balance.',
  },
];

type ArrowDir = 'top' | 'bottom' | 'left' | 'right';

interface TutorialTourProps {
  onDismiss: () => void;
}

export default function TutorialTour({ onDismiss }: TutorialTourProps) {
  const [step, setStep] = useState(0);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [arrowDir, setArrowDir] = useState<ArrowDir>('top');
  const [arrowOffset, setArrowOffset] = useState(140); // horizontal or vertical offset for the arrow
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentStep = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  const positionPopover = useCallback(() => {
    const el = document.querySelector(currentStep.selector);
    if (!el || !popoverRef.current) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    requestAnimationFrame(() => {
      if (!popoverRef.current) return;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const popRect = popoverRef.current.getBoundingClientRect();
      const gap = 14; // space between panel edge and popover
      const margin = 8;
      const isMobile = window.innerWidth <= 900;

      let left: number;
      let top: number;
      let dir: ArrowDir;
      let offset: number;

      if (isMobile) {
        // Mobile: place below or above the panel, centered horizontally
        left = Math.max(margin, (window.innerWidth - popRect.width) / 2);
        const belowTop = rect.bottom + gap;
        const aboveTop = rect.top - popRect.height - gap;

        if (belowTop + popRect.height < window.innerHeight - margin) {
          top = belowTop;
          dir = 'top';
        } else if (aboveTop > margin) {
          top = aboveTop;
          dir = 'bottom';
        } else {
          top = Math.max(margin, window.innerHeight - popRect.height - margin);
          dir = 'top';
        }
        // Arrow offset: center of target relative to popover left
        offset = Math.min(Math.max(20, rect.left + rect.width / 2 - left), popRect.width - 20);
      } else {
        // Desktop: prefer placing to the right of the panel, then left, then below
        const rightLeft = rect.right + gap;
        const leftLeft = rect.left - popRect.width - gap;

        if (rightLeft + popRect.width < window.innerWidth - margin) {
          // Place to the right
          left = rightLeft;
          top = rect.top + Math.min(20, Math.max(0, rect.height / 2 - popRect.height / 2));
          dir = 'left';
          offset = Math.min(Math.max(20, rect.top + rect.height / 2 - top), popRect.height - 20);
        } else if (leftLeft > margin) {
          // Place to the left
          left = leftLeft;
          top = rect.top + Math.min(20, Math.max(0, rect.height / 2 - popRect.height / 2));
          dir = 'right';
          offset = Math.min(Math.max(20, rect.top + rect.height / 2 - top), popRect.height - 20);
        } else {
          // Fallback: below
          left = rect.left + rect.width / 2 - popRect.width / 2;
          top = rect.bottom + gap;
          dir = 'top';
          offset = popRect.width / 2;
        }

        // Clamp vertical
        if (top < margin) top = margin;
        if (top + popRect.height > window.innerHeight - margin) {
          top = window.innerHeight - margin - popRect.height;
        }
      }

      // Clamp horizontal
      if (left < margin) left = margin;
      if (left + popRect.width > window.innerWidth - margin) {
        left = window.innerWidth - margin - popRect.width;
      }

      setCoords({ left, top });
      setArrowDir(dir);
      setArrowOffset(offset);
    });
  }, [currentStep.selector]);

  useEffect(() => {
    positionPopover();
    // Re-position after a short delay to allow scroll to settle
    const timeout = setTimeout(positionPopover, 350);
    window.addEventListener('resize', positionPopover);
    return () => {
      window.removeEventListener('resize', positionPopover);
      clearTimeout(timeout);
    };
  }, [positionPopover, step]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onDismiss();
    } else {
      setStep((s) => s + 1);
    }
  }, [isLast, onDismiss]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const handleBackdropClick = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  // Arrow element based on direction
  const arrowEl = (() => {
    const size = 10;
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      width: 0,
      height: 0,
      borderStyle: 'solid',
    };
    switch (arrowDir) {
      case 'top':
        return (
          <div style={{
            ...baseStyle,
            top: -size,
            left: arrowOffset - size,
            borderWidth: `0 ${size}px ${size}px ${size}px`,
            borderColor: `transparent transparent #58A6FF transparent`,
          }} />
        );
      case 'bottom':
        return (
          <div style={{
            ...baseStyle,
            bottom: -size,
            left: arrowOffset - size,
            borderWidth: `${size}px ${size}px 0 ${size}px`,
            borderColor: `#58A6FF transparent transparent transparent`,
          }} />
        );
      case 'left':
        return (
          <div style={{
            ...baseStyle,
            left: -size,
            top: arrowOffset - size,
            borderWidth: `${size}px ${size}px ${size}px 0`,
            borderColor: `transparent #58A6FF transparent transparent`,
          }} />
        );
      case 'right':
        return (
          <div style={{
            ...baseStyle,
            right: -size,
            top: arrowOffset - size,
            borderWidth: `${size}px 0 ${size}px ${size}px`,
            borderColor: `transparent transparent transparent #58A6FF`,
          }} />
        );
    }
  })();

  return (
    <>
      {/* Pulsing border keyframes */}
      <style>{`
        @keyframes tourBorderPulse {
          0%, 100% { border-color: #58A6FF; box-shadow: 0 0 12px rgba(88,166,255,0.6); }
          50% { border-color: rgba(88,166,255,0.4); box-shadow: 0 0 4px rgba(88,166,255,0.2); }
        }
      `}</style>

      {/* Semi-transparent backdrop */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          zIndex: 10500,
        }}
      />

      {/* Popover */}
      <div
        ref={popoverRef}
        style={{
          position: 'fixed',
          left: coords.left,
          top: coords.top,
          zIndex: 10501,
          width: '280px',
          background: 'rgba(88, 166, 255, 0.15)',
          border: '2px solid #58A6FF',
          padding: '16px',
          fontFamily: "'JetBrains Mono', monospace",
          color: '#FFFFFF',
          animation: 'tourBorderPulse 2s ease-in-out infinite',
          backdropFilter: 'blur(8px)',
        }}
      >
        {arrowEl}

        {/* Step counter */}
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
          {step + 1} / {TOUR_STEPS.length}
        </div>

        {/* Title */}
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#FFFFFF' }}>
          {currentStep.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: '11px', lineHeight: '1.5', color: 'rgba(255,255,255,0.85)', marginBottom: '16px' }}>
          {currentStep.description}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onDismiss}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '11px',
                cursor: 'pointer',
                padding: '4px 8px',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Skip
            </button>
            {!isFirst && (
              <button
                onClick={handleBack}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  padding: '4px 12px',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Back
              </button>
            )}
          </div>
          <button
            onClick={handleNext}
            style={{
              background: '#58A6FF',
              border: '1px solid #58A6FF',
              color: '#FFFFFF',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '6px 16px',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
            }}
          >
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
