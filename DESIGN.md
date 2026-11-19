---
name: Lunaris Application
description: Compact writing and workspace tools with DM Sans, warm paper surfaces, and a black dark theme.
colors:
  canvas: "#efeeeb"
  surface: "#faf9f7"
  soft-stone: "#e5e4e1"
  hairline-stone: "#d3d2cf"
  field-stroke: "#888784"
  muted-ink: "#616161"
  ink: "#000000"
  inverse-ink: "#f8f8f8"
  night-surface: "#141414"
  night-popover: "#1c1c1c"
  night-muted: "#292929"
  night-text-secondary: "#b1b1b1"
  night-border: "#343434"
  signal-red: "oklch(0.577 0.245 27.325)"
  signal-red-night: "oklch(0.704 0.191 22.216)"
typography:
  headline:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.25rem + 1vw, 2rem)"
    fontWeight: 550
    lineHeight: 1.15
    letterSpacing: "-0.04em"
  title:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 550
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  body:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
    letterSpacing: "normal"
  control:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans Variable, ui-sans-serif, system-ui, sans-serif"
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
    backgroundColor: "{colors.ink}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "0 1rem"
    height: "2rem"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  badge-default:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
    height: "1.25rem"
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "1rem"
  tab-active:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0.125rem 0.375rem"
    height: "2rem"
  sidebar-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.5rem"
    height: "2rem"
  dialog-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "1rem"
    width: "24rem"
---

# Design System: Lunaris Application

## Overview

**Creative North Star: "Quiet Workbench"**

The app borrows the landing page’s DM Sans typography, warm paper canvas, and black dark theme. In the workbench, spacing and type distinguish the current resource from navigation and tools. A slightly raised surface identifies each resizable panel.

The sign-in screen pairs the landing page’s lunar landscape with a compact form. The editor gives that space back to the resource.

**Key Characteristics:**

- Warm paper and black canvases with distinct reading surfaces.
- Compact controls with visible keyboard focus.
- Canvas gutters separate workbench panels. A soft shadow lifts floating menus above the workspace.
- A responsive workspace layout with direct navigation on small screens.
- Color for artwork, status, charts, and user content.

## Colors

The app follows the device appearance on first use. A saved Light or Dark selection takes precedence until the user selects System again.

`packages/ui/src/globals.css` owns the semantic colors, font, and surface styles for both shells. Use role classes such as `bg-background`, `bg-card`, `border-input`, and `text-muted-foreground` in feature code. System UI shown before styles load uses the same canvas colors.

| Role | Light | Dark |
| --- | --- | --- |
| App canvas and sidebar | Canvas | Ink |
| Panel, card, and field | Surface | Night Surface |
| Floating menu or dialog | Surface | Night Popover |
| Text and primary action | Ink | Inverse Ink |
| Supporting text and focus ring | Muted Ink | Night Text Secondary |
| Hover, selection, secondary action | Soft Stone | Night Muted |
| Divider | Hairline Stone | Night Border |
| Field boundary | Field Stroke | Muted Ink |

### State

- **Signal Red:** Destructive actions, validation failures, and danger messaging. Use the brighter night variant against dark surfaces.

### Named Rules

**The Paper Before Pigment Rule.** Routine application chrome stays in Paper & Ink neutrals. Saturated color belongs to status, data, or a bounded image portal with a clear purpose.

## Typography

DM Sans Variable is self-hosted by the UI package. The app also supports the user’s serif or OpenDyslexic reading preference and larger font sizes.

### Hierarchy

- Use `app-page-title` for sign-in, Recent, and settings page headings.
- Use `app-panel-title` for New Tab, extension management, and workspace settings inside the workbench.
- Set control labels and body copy at 0.875rem. Use 0.75rem for timestamps and supporting metadata.
- Pair the app mark with `app-wordmark` where there is room for the Lunaris name. The workbench toolbar uses the mark alone.

### Named Rules

**The Quiet Hierarchy Rule.** Use the page and panel title roles to distinguish a top-level destination from a tool within a workspace.

## Layout

Lunaris uses two related spatial models. The Recent page sits in a centered column up to 56rem wide, with 1rem mobile gutters and 1.5rem desktop gutters. Settings pairs a navigation sidebar with a scrolling content area. The workbench fills the viewport with a resource explorer and resizable resource views.

Spacing follows a 0.25rem base rhythm, with 0.5rem, 0.75rem, and 1rem doing most component work. Workspace cards move from one column to two at 40rem and three at 64rem. Desktop navigation changes at 48rem: persistent side structures collapse into sheets, horizontal selectors, or direct mobile hierarchy pages. Standard sidebars are 16rem expanded, 3rem icon-only, and 18rem as mobile sheets.

**The Workbench Density Rule.** Keep controls compact and local to their task, then create calm through grouped whitespace around sections rather than inflating every control.

## Elevation & Depth

The system is flat by default. Hairline borders and tonal shifts separate static surfaces. Selected tabs and hoverable workspace cards use a small shadow. Floating controls share a neutral translucent fill, backdrop blur, and soft shadow. Modal backdrops dim the surrounding workspace.

### Shadow Vocabulary

- **Ambient Low:** Selected tabs, hover feedback, and inset application shells.
- **Floating:** Menus, popovers, and draggable or temporarily raised surfaces.
- **Overlay:** Dialogs and large transient layers that must separate from complex organization content.

### Named Rules

**The Layer Only When Needed Rule.** A surface earns shadow by moving, floating, or responding. Static hierarchy uses borders and tone.

## Shapes

The base form is a gently rounded rectangle. Compact controls use the medium-to-large radius steps; cards and dialogs use the extra-large step; badges, avatars, switches, and status dots use pills or circles. Hairline borders keep rounded surfaces precise.

**The Radius Ladder Rule.** Use a tight radius on dense navigation, standard corners on controls, and broader corners on panels.

## Components

Components feel compact, rounded, and quietly tactile. State changes use muted fills, border shifts, small translations, and short transitions rather than dramatic motion.

### Buttons

- **Shape:** Standard rounded control with transparent border allocation to prevent state shifts.
- **Primary:** Inverse text on a solid primary fill. Default and large primary buttons use the same corner radius as outline buttons.
- **Secondary / Outline:** Soft Stone fill or a Hairline Stone border for lower-emphasis actions.
- **Ghost:** Transparent at rest, gaining a muted fill on hover or expanded state.
- **Interaction:** A visible three-pixel focus halo, reduced opacity when disabled, and a one-pixel active press.

### Badges

- **Style:** Fully rounded, compact labels using the label role.
- **State:** Ink for default emphasis, Soft Stone for secondary context, outline for neutral metadata, and Signal Red for errors and destructive actions. Use the shared success and warning variants for positive status and cautions. Pair each status color with a label or accessible name.

### Cards / Containers

- **Corner Style:** Broad but controlled extra-large rounding.
- **Background:** Use the shared Card or the `app-surface` utility for a raised panel with a single border ring.
- **Shadow Strategy:** Ring first. Add Ambient Low only for hover, selection, or inset separation.
- **Internal Padding:** One standard section step, reduced for compact cards.

### Inputs / Fields

- **Style:** A card-colored field with a dedicated input stroke and standard control rounding.
- **Focus:** The input stroke takes the focus ring color with a three-pixel half-strength halo.
- **Error / Disabled:** Signal Red owns invalid state; disabled fields use muted fill and half opacity.

### Navigation

Sidebars share the canvas color and use compact icon-and-label rows, muted hover and active fills, and medium rounding. Expanded navigation is 16rem wide and may collapse to a 3rem icon rail. Below the desktop breakpoint, navigation becomes an 18rem sheet or a direct mobile hierarchy rather than a squeezed desktop sidebar.

### Dialogs and Overlays

Search, menus, tooltips, dialogs, and mobile drawers share the `app-overlay-surface` treatment. Apply it once to the floating container so its content can reveal the same blurred backdrop. Reduced transparency uses a solid theme surface. Forced colors adds a system-colored edge. Dialogs retain extra-large corners, compact headers, and muted footers.

### Image Portals

Sign-in uses an offline WebP crop of the landing page’s lunar landscape. It fills the left pane on desktop and a shallow horizontal band on mobile. The welcome banner on the Recent page uses the original abstract artwork as a centered, full-width background, with a 50% black overlay behind white text.

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
