'use client';

import { useState, useCallback, ReactNode } from 'react';
import styles from './PanelWrapper.module.css';

interface PanelWrapperProps {
  title: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  hideExpand?: boolean;
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
      <div className={`${styles.card} ${collapsed ? styles.collapsed : ''}`} style={style}>
        {/* Header bar — always visible */}
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.headerButtons}>
            {!hideExpand && (
              <button
                className={styles.headerBtn}
                onClick={toggleExpand}
                title="Enlarge"
              >
                &#x26F6;
              </button>
            )}
            <button
              className={styles.headerBtn}
              onClick={toggleCollapse}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <span className={collapsed ? styles.chevronRight : styles.chevronDown}>
                &#x2039;
              </span>
            </button>
          </div>
        </div>

        {/* Collapsible body */}
        {!collapsed && (
          <div className={`${styles.body} ${bodyClassName || ''}`} style={bodyStyle}>
            {children}
          </div>
        )}
      </div>

      {/* Fullscreen overlay */}
      {expanded && (
        <div className={styles.overlay} onClick={toggleExpand}>
          <div
            className={styles.expandedCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 className={styles.title}>{title}</h2>
              <button
                className={styles.headerBtn}
                onClick={toggleExpand}
                title="Close"
              >
                &#x2715;
              </button>
            </div>
            <div className={`${styles.expandedBody} ${bodyClassName || ''}`} style={bodyStyle}>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
