# Blueprint.js Dark Theme Patterns

## Setup in Next.js

### layout.tsx
```tsx
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "@blueprintjs/select/lib/css/blueprint-select.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="bp5-dark">
      <body className="bp5-dark">{children}</body>
    </html>
  );
}
```

## Color Overrides (globals.css)

```css
:root {
  /* Palantir-inspired dark theme */
  --bg-primary: #0D1117;
  --bg-surface: #161B22;
  --bg-elevated: #1C2128;
  --border-color: #30363D;
  
  --accent-blue: #58A6FF;
  --accent-cyan: #39D5FF;
  --status-green: #3FB950;
  --status-yellow: #D29922;
  --status-red: #F85149;
  
  --text-primary: #E6EDF3;
  --text-secondary: #8B949E;
  --text-muted: #6E7681;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* Override Blueprint defaults */
.bp5-dark {
  background: var(--bg-primary);
}

/* Sharp corners - NO border-radius */
.bp5-card,
.bp5-button,
.bp5-tag,
.bp5-input,
.bp5-menu {
  border-radius: 0 !important;
}

/* Monospace numbers */
.mono-num {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-variant-numeric: tabular-nums;
}
```

## Common Component Patterns

### Panel/Card
```tsx
import { Card, Elevation } from "@blueprintjs/core";

const Panel = ({ title, children }) => (
  <Card 
    elevation={Elevation.ONE}
    style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-color)',
      borderRadius: 0
    }}
  >
    <h3 className="bp5-heading" style={{ color: 'var(--text-secondary)' }}>
      {title}
    </h3>
    {children}
  </Card>
);
```

### Data Table
```tsx
import { HTMLTable } from "@blueprintjs/core";

<HTMLTable 
  bordered 
  striped 
  compact
  style={{ width: '100%' }}
>
  <thead>
    <tr>
      <th>Zone</th>
      <th className="mono-num" style={{ textAlign: 'right' }}>Price</th>
    </tr>
  </thead>
  <tbody>
    {data.map(row => (
      <tr key={row.zone}>
        <td>{row.zone}</td>
        <td className="mono-num" style={{ textAlign: 'right' }}>
          ${row.price.toFixed(2)}
        </td>
      </tr>
    ))}
  </tbody>
</HTMLTable>
```

### Status Tag
```tsx
import { Tag, Intent } from "@blueprintjs/core";

const StatusTag = ({ status }) => {
  const intent = {
    online: Intent.SUCCESS,
    offline: Intent.DANGER,
    warning: Intent.WARNING
  }[status];
  
  return (
    <Tag 
      intent={intent} 
      minimal 
      round={false}
      style={{ borderRadius: 0 }}
    >
      {status}
    </Tag>
  );
};
```

### KPI Value
```tsx
const KPIValue = ({ label, value, unit, color }) => (
  <div style={{ marginBottom: '1rem' }}>
    <div style={{ 
      color: 'var(--text-muted)', 
      fontSize: '0.75rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    }}>
      {label}
    </div>
    <div style={{ 
      color: color || 'var(--accent-cyan)',
      fontSize: '1.5rem',
      fontFamily: 'JetBrains Mono, monospace',
      fontVariantNumeric: 'tabular-nums'
    }}>
      {value}
      <span style={{ 
        fontSize: '0.875rem', 
        color: 'var(--text-muted)',
        marginLeft: '0.25rem'
      }}>
        {unit}
      </span>
    </div>
  </div>
);
```

### Icon Usage
```tsx
import { Icon } from "@blueprintjs/core";
import { IconNames } from "@blueprintjs/icons";

<Icon icon={IconNames.FLASH} color="var(--status-yellow)" />
<Icon icon={IconNames.TRENDING_UP} color="var(--status-green)" />
<Icon icon={IconNames.TRENDING_DOWN} color="var(--status-red)" />
```

## Component Library

| Use Case | Blueprint Component |
|----------|-------------------|
| Panels | `Card` |
| Data tables | `HTMLTable` |
| Status indicators | `Tag` |
| Loading | `Spinner` |
| Buttons | `Button` |
| Dropdowns | `Select` from @blueprintjs/select |
| Icons | `Icon` from @blueprintjs/icons |
| Tooltips | `Tooltip` |
| Dialogs/Modals | `Dialog` |

## Don'ts

- Don't use `border-radius` anywhere
- Don't use Blueprint's default light theme colors
- Don't use `Intent.PRIMARY` for data - use custom accent colors
- Don't use default font - always monospace for numbers
