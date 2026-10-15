---
name: Lunaris Application
description: Quiet, focused organization UI with warm neutrals and bounded moments of color.
colors:
  clear-paper: "oklch(1 0 0)"
  pale-paper: "oklch(0.985 0.001 106.423)"
  soft-stone: "oklch(0.97 0.001 106.424)"
  hairline-stone: "oklch(0.923 0.003 48.717)"
  focus-stone: "oklch(0.709 0.01 56.259)"
  muted-ink: "oklch(0.553 0.013 58.071)"
  deep-ink: "oklch(0.216 0.006 56.043)"
  warm-ink: "oklch(0.147 0.004 49.25)"
  night-stone: "oklch(0.268 0.007 34.298)"
  signal-red: "oklch(0.577 0.245 27.325)"
  signal-red-night: "oklch(0.704 0.191 22.216)"
typography:
  headline:
    fontFamily: "Nunito Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: "normal"
  title:
    fontFamily: "Nunito Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.556
    letterSpacing: "normal"
  body:
    fontFamily: "Nunito Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
    letterSpacing: "normal"
  control:
    fontFamily: "Nunito Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "normal"
  label:
    fontFamily: "Nunito Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
    letterSpacing: "normal"
  accessible-reading:
    fontFamily: "OpenDyslexic, Verdana, Tahoma, Trebuchet MS, sans-serif"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.deep-ink}"
    textColor: "{colors.pale-paper}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  button-outline:
    backgroundColor: "{colors.clear-paper}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  input-default:
    backgroundColor: "{colors.clear-paper}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  badge-default:
    backgroundColor: "{colors.deep-ink}"
    textColor: "{colors.pale-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  card-default:
    backgroundColor: "{colors.clear-paper}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  tab-active:
    backgroundColor: "{colors.clear-paper}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.125rem 0.375rem"
    height: "2rem"
  sidebar-item:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem"
    height: "2rem"
  dialog-default:
    backgroundColor: "{colors.clear-paper}"
    textColor: "{colors.warm-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "1rem"
    width: "24rem"
---

# Design System: Lunaris Application

## Overview

**Creative North Star: "Quiet Workbench"**

Lunaris treats the interface as a dependable work surface: calm enough for long writing sessions, compact enough for complex workspaces, and precise enough for team workflows. Warm paper-and-ink neutrals keep attention on documents and tools. Hierarchy comes from spacing, weight, and tonal contrast before scale or decoration.

Color and imagery enter as bounded portals rather than ambient chrome. Auth, onboarding, announcements, and other meaningful moments may use colorful or stylized imagery, while the operational organization stays neutral and focused. The result should feel minimal without becoming sterile, and approachable without becoming soft or toy-like.

**Key Characteristics:**

- Warm monochrome foundations in both light and dark themes.
- Compact controls with clear state changes and generous focus visibility.
- Rounded, bordered surfaces with restrained elevation.
- Dense desktop organizations that simplify into direct mobile hierarchies.
- Colorful imagery contained within deliberate, clipped portal regions.

## Colors

The Paper & Ink palette uses near-white paper surfaces, warm charcoal ink, and quiet stone layers; strong color remains functional or deliberately contained.

### Primary

- **Deep Ink:** Primary actions, selected controls, progress, and high-emphasis inverse surfaces.

### Neutral

- **Clear Paper:** Main light-theme canvas and card surface.
- **Pale Paper:** Sidebar and inverse foreground where a softer white avoids glare.
- **Soft Stone:** Muted fills, hover states, secondary controls, and grouped tabs.
- **Hairline Stone:** Borders, dividers, input strokes, and low-contrast rings.
- **Focus Stone:** Focus indication and emphasized interactive boundaries.
- **Muted Ink:** Supporting copy, placeholders, timestamps, and inactive navigation.
- **Warm Ink:** Main text and dark-theme canvas.
- **Night Stone:** Raised dark-theme surfaces and muted interactive states.

### State

- **Signal Red:** Destructive actions, validation failures, and danger messaging. Use the brighter night variant against dark surfaces.

### Named Rules

**The Paper Before Pigment Rule.** Routine application chrome stays in Paper & Ink neutrals. Saturated color belongs to status, data, or a bounded image portal with a clear purpose.

## Typography

**Display Font:** Nunito Sans Variable with system sans-serif fallbacks

**Body Font:** Nunito Sans Variable with system sans-serif fallbacks
**Accessible Reading Font:** OpenDyslexic with Verdana and humanist sans-serif fallbacks

**Character:** A single friendly grotesk keeps dense product UI cohesive and readable. Weight changes carry most hierarchy; the optional OpenDyslexic family changes reading mechanics without changing layout intent.

### Hierarchy

- **Headline:** Compact page titles, key empty states, and major settings surfaces.
- **Title:** Section headings, failure states, and strong card headings.
- **Body:** Default interface copy, descriptions, menus, and document-adjacent UI.
- **Control:** Buttons, tabs, compact navigation, and interactive labels.
- **Label:** Metadata, status, supporting navigation, and dense utility text.

### Named Rules

**The Quiet Hierarchy Rule.** Inside the application, increase weight and spacing before increasing type size. Operational page titles stop at the established headline role; marketing-scale display type does not enter the organization.

## Layout

Lunaris uses two related spatial models. Workspace and settings indexes sit in centered columns up to 56rem with 1rem mobile gutters, expanding to 1.5rem gutters and 3rem vertical breathing room on desktop. Editor organizations fill the viewport and prioritize resizable panels, hierarchy navigation, compact headers, and uninterrupted document area.

Spacing follows a 0.25rem base rhythm, with 0.5rem, 0.75rem, and 1rem doing most component work. Workspace cards move from one column to two at 40rem and three at 64rem. Desktop navigation changes at 48rem: persistent side structures collapse into sheets, horizontal selectors, or direct mobile hierarchy pages. Standard sidebars are 16rem expanded, 3rem icon-only, and 18rem as mobile sheets.

**The Workbench Density Rule.** Keep controls compact and local to their task, then create calm through grouped whitespace around sections rather than inflating every control.

## Elevation & Depth

The system is flat by default. Hairline borders, subtle rings, and tonal surface shifts create most separation. Small shadows appear on selected tabs, hoverable workspace cards, inset shells, menus, and floating surfaces; medium and large shadows are reserved for overlays and transient layers. Backdrops use a light black veil with subtle blur rather than an opaque wall.

### Shadow Vocabulary

- **Ambient Low:** Selected tabs, hover feedback, and inset application shells.
- **Floating:** Menus, popovers, and draggable or temporarily raised surfaces.
- **Overlay:** Dialogs and large transient layers that must separate from complex organization content.

### Named Rules

**The Layer Only When Needed Rule.** A surface earns shadow by moving, floating, or responding. Static hierarchy uses borders and tone.

## Shapes

The base form is a gently rounded rectangle. Compact controls use the medium-to-large radius steps; cards and dialogs use the extra-large step; badges, avatars, switches, and status dots use pills or circles. Hairline borders keep rounded surfaces precise. The flowing Lunaris mark remains a brand asset, not a shape motif to repeat across controls.

**The Radius Ladder Rule.** Match radius to scale and role: tighter for dense navigation, standard for controls, broader for containers, full only for inherently pill-shaped or circular elements.

## Components

Components feel compact, rounded, and quietly tactile. State changes use muted fills, border shifts, small translations, and short transitions rather than dramatic motion.

### Buttons

- **Shape:** Standard rounded control with transparent border allocation to prevent state shifts.
- **Primary:** Deep Ink fill with Pale Paper text; use for the clearest action in a local decision.
- **Secondary / Outline:** Soft Stone fill or a Hairline Stone border for lower-emphasis actions.
- **Ghost:** Transparent at rest, gaining a muted fill on hover or expanded state.
- **Interaction:** A visible three-pixel focus halo, reduced opacity when disabled, and a one-pixel active press.

### Badges

- **Style:** Fully rounded, compact labels using the label role.
- **State:** Deep Ink for default emphasis, Soft Stone for secondary context, outline for neutral metadata, and Signal Red only for destructive meaning.

### Cards / Containers

- **Corner Style:** Broad but controlled extra-large rounding.
- **Background:** Paper surfaces with warm ink text; muted footers may use a half-strength stone fill.
- **Shadow Strategy:** Ring first. Add Ambient Low only for hover, selection, or inset separation.
- **Internal Padding:** One standard section step, reduced for compact cards.

### Inputs / Fields

- **Style:** Compact transparent field with Hairline Stone border and standard control rounding.
- **Focus:** Border shifts to Focus Stone with a three-pixel half-strength halo.
- **Error / Disabled:** Signal Red owns invalid state; disabled fields use muted fill and half opacity.

### Navigation

Sidebars use Pale Paper, compact icon-and-label rows, muted hover and active fills, and medium rounding. Expanded navigation is 16rem wide and may collapse to a 3rem icon rail. Below the desktop breakpoint, navigation becomes an 18rem sheet or a direct mobile hierarchy rather than a squeezed desktop sidebar.

### Dialogs and Overlays

Dialogs use Paper popover surfaces, extra-large rounding, a subtle outline, compact headers, and muted bordered footers. Open and close transitions are fast fades and small scale changes. Destructive confirmation remains visually explicit without flooding the whole dialog red.

### Image Portals

Colorful or stylized artwork may occupy a clearly bounded, clipped region in auth, onboarding, announcements, and similarly meaningful moments. The surrounding controls remain neutral, ensuring imagery feels like a welcome change in atmosphere rather than persistent decoration.

### Named Rules

**The Compact Control Rule.** Default controls occupy the established compact height. Increase size only when touch context, content, or task importance requires it.

## Do's and Don'ts

### Do:

- **Do** use semantic theme variables so every component remains coherent in light and dark modes.
- **Do** build hierarchy with grouping, weight, and tonal contrast before adding size or shadow.
- **Do** preserve clear keyboard focus, reduced-motion behavior, and the accessible reading-font option.
- **Do** keep colorful imagery inside intentional portals with strong clipping and neutral surroundings.
- **Do** simplify panel structures into direct hierarchy and sheet patterns on mobile.

### Don't:

- **Don't** add saturated accent colors to routine organization chrome.
- **Don't** turn every section into a floating card or stack multiple shadow levels without interaction meaning.
- **Don't** use marketing-scale type inside editor, workspace, or settings workflows.
- **Don't** mix arbitrary corner radii; follow the radius ladder and component role.
- **Don't** spread decorative imagery behind dense controls or document content.
