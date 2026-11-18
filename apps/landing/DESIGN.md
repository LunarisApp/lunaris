---
name: Lunaris Marketing
description: Monochrome marketing pages with a lunar illustration framing the homepage demo.
colors:
  parchment: "#f8f8f8"
  warm-paper: "#efeeeb"
  paper-shadow: "#eaeaea"
  sage-wash: "#dddddd"
  dry-sage: "#b1b1b1"
  weathered-olive: "#888888"
  olive-bark: "#616161"
  field-ink: "#494949"
  deep-grove: "#343434"
  press-ink: "#000000"
  black-olive: "#000000"
  clear-white: "#ffffff"
  error-red: "#dc2626"
typography:
  display-mobile:
    fontFamily: "Instrument Serif, serif"
    fontSize: "3rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.025em"
  display:
    fontFamily: "Instrument Serif, serif"
    fontSize: "5rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline-mobile:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 400
    lineHeight: 1.167
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  body-large:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.778
    letterSpacing: "normal"
  control:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.667
    letterSpacing: "normal"
  wordmark:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "0.04em"
    textTransform: "uppercase"
rounded:
  sm: "0.25rem"
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  3xl: "1.5rem"
  4xl: "2rem"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2rem"
  section: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.black-olive}"
    textColor: "{colors.clear-white}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
  button-soft:
    backgroundColor: "rgb(0 0 0 / 10%)"
    textColor: "{colors.black-olive}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  input-default:
    backgroundColor: "{colors.clear-white}"
    textColor: "{colors.black-olive}"
    typography: "{typography.control}"
    rounded: "{rounded.xl}"
    padding: "0.625rem 1rem"
  announcement-pill:
    backgroundColor: "rgba(255, 255, 255, 0.5)"
    textColor: "{colors.deep-grove}"
    typography: "{typography.control}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem 0.25rem 0.25rem"
  pricing-card:
    backgroundColor: "transparent"
    textColor: "{colors.black-olive}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
  bento-card:
    backgroundColor: "{colors.weathered-olive}"
    textColor: "{colors.clear-white}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    padding: "1.75rem"
  screenshot-frame:
    backgroundColor: "rgb(221 221 221 / 70%)"
    rounded: "{rounded.2xl}"
    padding: "0.5rem"
  navbar:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.black-olive}"
    typography: "{typography.control}"
    height: "4.5rem"
    padding: "0 1.5rem"
  faq-row:
    backgroundColor: "transparent"
    textColor: "{colors.black-olive}"
    typography: "{typography.body}"
    padding: "1rem 0"
---

# Design System: Lunaris Marketing

## Overview

The homepage pairs its Instrument Serif headline with a lunar landscape and a wide demo. Inner pages use DM Sans, generous gutters and thin rules to organize pricing, downloads, tools and reference material.

## Colors

Marketing pages open on a pure black canvas with white headings and neutral gray supporting text. Saved light and system preferences apply across routes. Light mode uses a soft stone-white canvas (#EFEEEB) with dark text. Shared theme tokens in `src/app/globals.css` supply both palettes.

Keep page backgrounds continuous. Use a fine divider to separate sections and outline panels. Reserve color for product artwork and meaningful states such as validation errors.

## Typography

**Homepage hero font:** Instrument Serif with generic serif fallback

**Body Font:** DM Sans with system sans-serif fallback
**Wordmark Font:** DM Sans with system sans-serif fallback

**Character:** Instrument Serif gives the homepage headline a literary, human cadence without ornamental excess. DM Sans handles long-form explanations, data, pricing, navigation, and controls. The Lunaris wordmark uses uppercase lettering at a compact 650 weight with subtly open tracking, letting the canonical mark carry the brand while the lettering stays bold, modern, and minimal.

### Hierarchy

- **Display:** Hero claims at 3rem on small screens and 5rem from the small breakpoint, tightly tracked and balanced across lines.
- **Inner page titles:** DM Sans at 2.25rem on mobile and 3.75rem from the small breakpoint.
- **Headline:** Section claims at 2rem on small screens and 3rem from the small breakpoint, with generous leading and pretty wrapping.
- **Title:** Feature and pricing headings use DM Sans at medium weight, usually between 1.125rem and 1.5rem.
- **Body:** Standard evidence and explanation at 1rem with 1.75rem leading; hold primary prose near 40rem.
- **Body Large:** Hero support copy at 1.125rem with 2rem leading and a tighter maximum width.
- **Control:** Buttons and navigation at 0.875rem, medium weight, with relaxed 1.75rem line height.
- **Label:** Eyebrows, badges, and metadata at 0.75–0.875rem with semibold emphasis.

### Named Rules

Reserve Instrument Serif for the homepage hero headline. Set all other live text in DM Sans.

## Layout

Pages use a centered responsive container: 42rem on small screens, 48rem at the medium breakpoint, and 80rem with 2.5rem gutters at the large breakpoint. Mobile gutters are 1.5rem. Major sections use 4rem vertical padding, while heroes add larger top and bottom space at the small breakpoint. Content alternates between narrow editorial measures and full-width product evidence rather than filling the container uniformly.

The primary grid grows from one column to two at 40rem and, for feature bento compositions, to twelve columns at 64rem. The sticky header is 4rem tall on mobile and 4.5rem on desktop. The brand sits at the left and the language, theme, and app actions sit at the right. Desktop links and the app entry appear at 64rem, while smaller screens use a full-page menu. Pricing comparison collapses from a multi-column table into plan tabs below 40rem.

**The Narrow Claim, Wide Proof Rule.** Keep prose constrained enough to read as editorial copy, then allow screenshots, bento grids, tables, and illustrations to use the full container as proof.

## Elevation & Depth

The system uses editorial layering. Page content and typography remain mostly flat; depth concentrates on framed screenshots, floating feature artwork, translucent cards, and interaction. Fine one-pixel rings establish edges before shadows. Ambient shadows are soft and short, while product demos may use one broad theatrical shadow to read as an object placed on paper.

### Shadow Vocabulary

- **Paper Lift:** Low shadow for badges, translucent illustration cards, and quiet interactive surfaces.
- **Portal Object:** Strong local shadow beneath screenshots placed inside colored wallpaper.
- **Hero Proof:** Broad, diffuse shadow beneath the main demo frame.
- **Utility Overlay:** Standard larger shadow for the skip link and transient navigation layers.

### Named Rules

**The Evidence Casts Shadow Rule.** Shadows belong to product proof, lifted illustration fragments, or active overlays. Headlines and ordinary sections stay on the paper plane.

## Shapes

Pills define actions, announcement labels, selectors, and small status elements. Content cards and portals use 0.75rem to 1.5rem rounding, growing with object scale. Product screenshots retain tighter 0.25rem to 0.75rem corners inside broader outer frames, creating a physical mat-and-print relationship. Fine translucent rings and clipped overflow make every portal feel deliberately cut from the page.

**The Nested Frame Rule.** Outer portal radius is broader than the screenshot or artwork it contains. Preserve this visible step instead of giving every nested surface the same corners.

## Components

Components are softly tactile and assured: pill CTAs, translucent surfaces, fine rings, restrained hover shifts, and strong readable contrast.

### Buttons

- **Shape:** Fully rounded pill, sized by horizontal and vertical padding rather than fixed height.
- **Primary:** Black Olive with white text in light mode; Sage Wash with Black Olive text in dark mode.
- **Soft:** Ten-percent ink tint at rest, deepening slightly on hover.
- **Plain:** Transparent text action with a faint tonal hover surface.
- **Hover / Focus:** Change tone without glow or dramatic translation; preserve a clear two-pixel outline for keyboard focus.

### Announcement Pills

- **Style:** Translucent white capsule with a fine ink ring, small shadow, and inset Black Olive badge.
- **State:** Border and translucency rise slightly on hover; the arrow moves only a fraction to signal direction.

### Cards / Containers

- **Pricing:** Transparent panel with a fine border, broad internal padding, and modest rounding. No default shadow.
- **Bento:** Full-bleed wallpaper portal with white typography, fine translucent ring, grain, and clipped artwork.
- **Interaction:** Feature cards lift by only two pixels on hover.

### Inputs / Fields

- **Style:** White or translucent-white field with 0.75rem rounding and an inset ten-percent ring.
- **Focus:** Inset ring strengthens from one to two pixels without shifting layout.
- **Error / Disabled:** Error Red text carries validation; error panels use a light red tint rather than a solid fill.

### Navigation

A translucent paper header and fine bottom rule keep the page visible underneath as it scrolls. Product, Developers, and Resources group related destinations. Pricing and Downloads follow the grouped menus. The full-screen mobile menu and the footer use the same groups, with comparison and legal links in the footer.

### Screenshot Frames

The lunar landscape backs the hero copy, with the moon visible on the right. The video spans the content column below and overlaps the lower edge of the landscape. Keep chapter controls on the paper below. Other hero screenshots may use a fine Black Olive ring and broad shadow.

### Named Rules

**The Softly Tactile Rule.** Interaction should feel like touching paper, ink, or a mounted object: a tonal shift, a fine ring, or a two-pixel lift is enough.

## Do's and Don'ts

### Do:

- **Do** reserve Instrument Serif for the homepage headline.
- **Do** use the shared neutral ramp for all structural light and dark theme decisions.
- **Do** use whitespace and thin dividers to distinguish sections in both themes.
- **Do** keep copy narrow and let product proof occupy the wider composition.
- **Do** preserve visible keyboard focus, localized expansion, and motion-reduced alternatives.

### Don't:

- **Don't** introduce neon gradients, corporate blue defaults, or glossy glassmorphism.
- **Don't** place multicolor atmosphere behind long-form copy or global navigation.
- **Don't** use large shadows on ordinary text sections, pricing cards, or static page chrome.
- **Don't** flatten every nested object to the same radius; preserve the portal and print hierarchy.
- **Don't** use Instrument Serif for controls, tables, form fields, or explanatory paragraphs.
