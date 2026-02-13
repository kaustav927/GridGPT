'use client';

import { useState, useCallback, ReactNode } from 'react';
import styles from './PanelWrapper.module.css';

interface PanelWrapperProps {
  title: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  hideExpand?: boolean;
  /** Extra class on the outer card */
  className?: string;
  /** Extra class on the body area */
  bodyClassName?: string;
  /** Extra inline style on the outer card */
  style?: React.CSSProperties;
  /** Extra inline style on the body area */
  bodyStyle?: React.CSSProperties;
}

export default function PanelWrapper({
  title,
  children,
  defaultCollapsed = false,
  hideExpand = false,
  className,
  bodyClassName,
  style,
  bodyStyle,
}: PanelWrapperProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [expanded, setExpanded] = useState(false);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const toggleExpand = useCallback(() => {
    setExpanded((e) => !e);
  }, []);

  return (
    <>
      {/* Dark backdrop when expanded */}
      {expanded && (
        <div className={styles.overlay} onClick={toggleExpand} />
      )}

      <div
        className={`${styles.card} ${collapsed ? styles.collapsed : ''} ${expanded ? styles.cardExpanded : ''} ${className || ''}`}
        style={style}
      >
        {/* Header bar — always visible */}
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.headerButtons}>
            {!hideExpand && (
              <button
                className={styles.headerBtn}
                onClick={toggleExpand}
                title={expanded ? 'Close' : 'Enlarge'}
              >
                {expanded ? '\u2715' : '\u26F6'}
              </button>
            )}
            {!expanded && (
              <button
                className={styles.headerBtn}
                onClick={toggleCollapse}
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                <span className={collapsed ? styles.chevronRight : styles.chevronDown}>
                  &#x2039;
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Body — children rendered once, never unmounted on expand */}
        {!collapsed && (
          <div className={`${styles.body} ${bodyClassName || ''}`} style={bodyStyle}>
            {children}
          </div>
        )}
      </div>
    </>
  );
}
