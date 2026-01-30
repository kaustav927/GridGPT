# Recharts Custom Tick Investigation - Analysis Report

## Summary
The Recharts custom tick component (`CustomXAxisTick`) is NOT rendering properly in GenerationByResource.tsx. Only showing single timestamp "15:00" instead of range "12:00 to 15:00".

## Root Cause Analysis

### Problem 1: Custom Component Not Being Invoked ⚠️
**Location:** GenerationByResource.tsx, line 378
```typescript
<XAxis
  dataKey="timestamp"
  tick={<CustomXAxisTick firstTs={firstTs} lastTs={lastTs} />}
  interval="preserveStartEnd"
/>
```

**Issue:** The component reference is created as a JSX element `<CustomXAxisTick ... />`, but Recharts expects a **component class/function reference** that it can call with props, not a JSX instance.

**Why it fails:** Recharts internally calls `React.isValidElement()` on the tick prop. When passed a JSX element instance, it doesn't match the expected component reference pattern. The library then falls back to default tick rendering, completely ignoring the custom component.

### Problem 2: Props Not Being Passed to Custom Component
Even if the component reference was correct, `firstTs` and `lastTs` cannot be passed as JSX props because Recharts doesn't know about them. Recharts only passes standard axis tick props: `{ x, y, payload, ... }`.

**Current approach (WRONG):**
```typescript
// This creates JSX element instance, passes unknown props
tick={<CustomXAxisTick firstTs={firstTs} lastTs={lastTs} />}
```

**Correct approach:**
```typescript
// Pass component reference, data via closure
tick={(props) => <CustomXAxisTick {...props} firstTs={firstTs} lastTs={lastTs} />}
```

OR use a wrapper component that has access to the data via closure.

### Problem 3: Data Structure Issue 🔍
**ClickHouse Query** (generators/history route, line 21):
```sql
SELECT toStartOfHour(timestamp) as timestamp ...
```

Data is aggregated **by hour** (`toStartOfHour`), so a 4-hour history query returns only **4 data points**:
- 12:00 (hour start)
- 13:00
- 14:00
- 15:00

With only 4 points and `interval="preserveStartEnd"`, Recharts shows the first and last only. This is correct behavior for data this sparse.

### Problem 4: Timestamp Format Mismatch ⏰
**ClickHouse returns:** ISO 8601 string like `"2025-01-30T15:00:00Z"`  
**formatTime() function** (line 131):
```typescript
function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}
```

This function correctly formats to "15:00" format. However, it's only called when the custom component actually renders, which it doesn't (see Problem 1).

### Problem 5: Git History Shows Regression
**Commit ba71234** (working version):
```typescript
<XAxis
  dataKey="timestamp"
  tickFormatter={formatTime}  // ← Direct function reference
  tick={{
    fontSize: 8,
    fill: '#8B949E',
    fontFamily: "'JetBrains Mono', monospace",
  }}
  interval={0}  // ← Show ALL ticks
/>
```

**Current version** (broken):
```typescript
<XAxis
  dataKey="timestamp"
  tick={<CustomXAxisTick firstTs={firstTs} lastTs={lastTs} />}  // ← JSX element
  interval="preserveStartEnd"  // ← Only start/end
/>
```

The regression was introduced when switching from `tickFormatter` + static `tick` object to a custom component approach.

## Visual Evidence

### What User Sees
- Only "15:00" displayed (the last timestamp)
- No "12:00" shown
- X-axis appears to have single timestamp only

### Why This Happens
1. CustomXAxisTick component never executes
2. Recharts falls back to default rendering
3. Default rendering with `interval="preserveStartEnd"` shows first/last ticks
4. With default tick rendering, the component's format logic doesn't run
5. User sees whatever Recharts' default tick formatting produces

## CSS Analysis

**GenerationByResource.module.css** - No relevant styles affecting visibility:
- `.chartArea` (line 107): Sets height only, no overflow/clip
- No hidden classes or display:none
- No text overflow hiding
- Responsive padding/margins are normal

CSS is **not the problem**.

## Data Structure Check

Chart data structure is correct:
```typescript
interface ChartPoint {
  timestamp: string;  // ISO 8601 from ClickHouse
  output_mw: number;
}
```

Aggregation logic (lines 269-275) correctly:
1. Creates Map<timestamp, total_mw>
2. Aggregates multiple generators' outputs by timestamp
3. Sorts chronologically
4. Returns ChartPoint array

Data looks correct, issue is rendering layer only.

## Library Limitations

Recharts limitations discovered:
1. **Custom tick components must be function/class references**, not JSX instances
2. **Props cannot be passed directly** to tick components via JSX
3. **`interval="preserveStartEnd"`** with sparse data (4 points) intelligently limits ticks to avoid clutter
4. **Default tick behavior** doesn't use custom formatting functions properly when custom component fails

## Why Previous Approaches Failed

User mentioned "tried multiple approaches":
- Custom component as JSX element ✗ (Recharts doesn't invoke it)
- Props passed to tick ✗ (Recharts ignores unknown props)
- `interval="preserveStartEnd"` ✗ (Doesn't solve root issue of component not rendering)

All approaches missed the core issue: **Recharts isn't using the custom component at all**.

## Recommendations for Fixing

### Option 1: Use Function Wrapper (Recommended) ⭐
Keep custom component, fix how it's passed:
```typescript
tick={(props) => <CustomXAxisTick {...props} firstTs={firstTs} lastTs={lastTs} />}
```

### Option 2: Revert to tickFormatter (Simpler)
Go back to commit ba71234's approach:
```typescript
<XAxis
  dataKey="timestamp"
  tickFormatter={formatTime}
  tick={{ fontSize: 8, fill: '#C9D1D9', ... }}
  interval="preserveStartEnd"
/>
```

Simpler, proven working, though less flexible for alignment logic.

### Option 3: Increase Data Granularity
Change ClickHouse query from `toStartOfHour` to 5-minute buckets:
```sql
SELECT toStartOfFiveMinute(timestamp) as timestamp ...
```
This gives 48 points for 4 hours, more ticks = better display.

### Option 4: Use Different Library
Consider switching to:
- **Nivo** (better tick control)
- **Apache ECharts** (more flexible rendering)
- **Visx** (low-level, more control)

## Conclusion

**The custom Recharts tick component is fundamentally broken due to incorrect API usage.** The component is passed as a JSX instance when Recharts expects a function reference. This causes Recharts to ignore the component completely and fall back to default rendering.

This is a **straightforward API misuse issue**, not a data problem or CSS issue. The fix involves either:
1. Correctly passing the component as a render function
2. Reverting to the working tickFormatter approach
3. Increasing data granularity so ticks display better
