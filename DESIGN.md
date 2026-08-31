---
version: alpha
colors:
  obsidian: "#080B0F"
  graphite: "#10161D"
  raisedGraphite: "#151D26"
  steel: "#26313C"
  signalBlue: "#4CA7FF"
  mint: "#58D68D"
  amber: "#F4B860"
  coral: "#FF6577"
  fog: "#93A2B1"
  ice: "#EDF4FA"
  traceCyan: "#64D8D5"
  violet: "#A98BFA"
typography:
  display:
    fontFamily: "Bahnschrift, 'DIN Alternate', 'Arial Narrow', ui-sans-serif, system-ui, sans-serif"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
components:
  hud:
    purpose: "Show only primary survival state first; finance is secondary."
  servicePulse:
    purpose: "Connect time progression to the current service state without decorative motion."
  serviceStage:
    purpose: "Make the topology the dominant playable object."
  inspector:
    purpose: "Explain status, why it matters, current configuration, then available actions."
---

# Dev to Scale Design Context

## Overview

Dev to Scale is a product/game interface for developers learning and enjoying backend, infrastructure, and scaling trade-offs. Its visual North Star is a **Living System Board**: the player should feel that the service itself is alive, and the screen should make the next useful place to look obvious.

The interface is product-first rather than marketing-first. Clarity, state reading, interaction hierarchy, and consistency take priority over decorative expression. The one memorable signature is **Service Pulse**, a restrained link between the passage of a game day and the current service state.

Anti-references: AWS Console, Grafana dashboards, database admin tools, log consoles, Matrix/hacker neon, and generic SaaS dashboards where every metric is an equally weighted card.

## Colors

The runtime source of truth is the `:root` token block in `app/globals.css`; this document records the approved durable meanings.

- Obsidian `#080B0F`: application background.
- Graphite `#10161D`: primary surfaces.
- Raised Graphite `#151D26`: selected or interactive surfaces.
- Steel `#26313C`: borders and dividers.
- Signal Blue `#4CA7FF`: selection, navigation, primary actions, keyboard focus.
- Mint `#58D68D`: healthy and successful state.
- Amber `#F4B860`: busy, warning, or recoverable pressure.
- Coral `#FF6577`: overload, incident, destructive or critical state.
- Fog `#93A2B1`: secondary copy.
- Ice `#EDF4FA`: primary copy.
- Trace Cyan `#64D8D5`: request-flow tracing only; it is not a second primary brand color.
- Violet `#A98BFA`: rare milestone/won-state accent only.

Never communicate operational state with color alone. Pair color with labels, icons, shapes, or explicit percentages.

## Typography

Display/status headings use a narrow industrial sans stack sparingly. Korean body copy uses the body sans stack for readability. Data, cost, capacity, IDs, and terse technical metadata use the mono stack.

Do not render ordinary explanatory sentences in mono. The product should feel like a precise simulation interface, not a terminal dump.

## Layout

Hierarchy comes before density.

1. Primary: service structure, dangerous location, Day, DAU, Cash, current work, actionable risk.
2. Secondary: monthly revenue/cost/net, settlement timing, detailed capacity, observability metadata.
3. Tertiary: history, long explanations, completed-option details, and report-only analysis.

On desktop the Service Map should occupy roughly two-thirds of the service workspace's visual attention. Work and alerts are supporting rails. On mobile the map appears first; Day/DAU/Cash and time controls fit without horizontal KPI scrolling.

## Elevation & Depth

Static content is mostly flat. Use subtle surface-level differences and spacing before shadows. Strong glow is reserved for selected nodes, incidents, and the Service Pulse moment. Avoid large shadows on ordinary panels.

Motion must explain state. Request particles remain tied to observability; incident pulse remains restrained. `prefers-reduced-motion` removes non-essential movement while preserving state labels and geometry.

## Shapes

Use 8–12px radii for most interactive surfaces. Avoid turning every data value into a separate rounded card. Buttons and nodes should look tactile, but the topology and information hierarchy remain the focus.

## Components

### HUD

Always-visible priority is Day, DAU, Cash, and game speed. Monthly revenue/cost/net appear as one grouped secondary summary rather than three or four peer KPI cards.

### Service Pulse

Service Pulse combines day progress with the already-projected Application service summary. UI code does not fabricate day-over-day deltas that the ViewModel does not expose.

### Service Stage

The topology is the playable object. Toolbars, traces, loads, work, and alerts visually support it rather than compete with it.

### Node Inspector

Read in this order: **Status → Why it matters → Current → Options**. Show only data already projected by Application. Never infer game rules or preview effects in React.

### Build Decision Board

Group options by Application state: In progress, Available now, Locked / Needs, Completed. Preserve Application ordering within groups. Filters are secondary controls.

## Do's and Don'ts

**Do** make the dangerous node visible before its detailed numbers.  
**Do** use plain action language and preserve native button semantics.  
**Do** keep focus rings visible and touch targets usable.  
**Do** keep Service Map behavior and request traces accurate to Application data.  
**Do** make empty or disabled states explain what is unavailable.

**Don't** add neon decoration, ambient particles, or repeated glow.  
**Don't** make every number a bordered KPI card.  
**Don't** hide product-owned scrollbars merely for aesthetics.  
**Don't** calculate capacity, business rules, or unavailable previews in React.  
**Don't** let mobile require horizontal scrolling just to read the primary HUD.
