---
name: Lunaris Marketing
description: Editorial product storytelling on warm olive paper with weathered portals of color.
colors:
  parchment: "oklch(98.8% 0.003 106.5)"
  warm-paper: "oklch(96.6% 0.005 106.5)"
  paper-shadow: "oklch(93% 0.007 106.5)"
  sage-wash: "oklch(88% 0.011 106.6)"
  dry-sage: "oklch(73.7% 0.021 106.9)"
  weathered-olive: "oklch(58% 0.031 107.3)"
  olive-bark: "oklch(46.6% 0.025 107.3)"
  field-ink: "oklch(39.4% 0.023 107.4)"
  deep-grove: "oklch(28.6% 0.016 107.4)"
  press-ink: "oklch(22.8% 0.013 107.4)"
  black-olive: "oklch(15.3% 0.006 107.1)"
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
    fontFamily: "Instrument Serif, serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Instrument Serif, serif"
    fontSize: "3rem"
    fontWeight: 400
    lineHeight: 1.167
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
  body-large:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.778
    letterSpacing: "normal"
  control:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.75
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.667
    letterSpacing: "normal"
  wordmark:
    fontFamily: "Inter, system-ui, sans-serif"
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
    backgroundColor: "oklch(15.3% 0.006 107.1 / 10%)"
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
    backgroundColor: "oklch(15.3% 0.006 107.1 / 2.5%)"
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
    backgroundColor: "oklch(88% 0.011 106.6 / 70%)"
    rounded: "{rounded.2xl}"
    padding: "0.5rem"
  navbar:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.black-olive}"
    typography: "{typography.control}"
    height: "5.25rem"
    padding: "0 1.5rem"
  faq-row:
    backgroundColor: "transparent"
    textColor: "{colors.black-olive}"
    typography: "{typography.body}"
    padding: "1rem 0"
---

# Design System: Lunaris Marketing

## Overview

**Creative North Star: "The Living Manuscript"**

Lunaris marketing feels like an editorial object that is still being made: refined, grounded, and quietly confident. Instrument Serif supplies an expressive publishing voice, Inter keeps evidence and actions legible, and the olive paper field gives every page a warm physical atmosphere. Large type and generous pauses persuade without shouting.

Weathered wallpaper portals bring the manuscript to life. Muted, multi-hue gradients with fine grain hold product screenshots, diagrams, and feature illustrations as evidence within the story. The world rejects neon-gradient SaaS spectacle, corporate blue convention, and sterile monochrome minimalism; its color is atmospheric, tactile, and controlled.

**Key Characteristics:**

- Editorial serif headlines paired with precise sans-serif copy.
- Warm olive paper across light and dark themes.
- Pill actions and fine translucent rings rather than hard boxes.
- Weathered gradient portals with grain, illustration, or product evidence.
- Broad content rhythm, restrained copy widths, and strong responsive composition.

## Colors

Printed Olive is a complete warm neutral ramp, moving from parchment to black olive. It supports both themes without switching to cold gray; wallpaper portals add muted blue, green, purple, brown, coral, gold, and teal only inside bounded feature regions.

### Primary

- **Black Olive:** Primary calls to action, dominant light-theme text, and the dark-theme page field.
- **Press Ink:** Primary hover state and strong supporting surfaces.

### Secondary

- **Sage Wash:** Soft frames, screenshot mats, and calm highlighted surfaces.
- **Weathered Olive:** Mid-ramp supporting text and atmospheric detail.

### Neutral

- **Parchment:** Lightest optional section and illustration surface.
- **Warm Paper:** Main light-theme page and sticky navigation field.
- **Paper Shadow:** Rules, subtle fills, and soft separators.
- **Dry Sage:** Low-emphasis decoration and disabled detail.
- **Olive Bark:** Supporting copy where stronger contrast is needed.
- **Field Ink:** Standard secondary text and eyebrows.
- **Deep Grove:** Strong secondary copy and hover treatment.
- **Clear White:** Text and translucent layers inside wallpaper portals.

### State

- **Error Red:** Form validation and failure messaging only.

### Named Rules

**The Printed Olive Rule.** Structural surfaces, navigation, copy, and calls to action stay inside the olive ramp. Multi-hue color belongs inside a wallpaper portal or a purposeful illustration.

**The Portal Contrast Rule.** Content inside a wallpaper portal uses clear white, translucent white, and fine dark or light rings; it does not import the page's full olive hierarchy.

## Typography

**Display Font:** Instrument Serif with generic serif fallback

**Body Font:** Inter with system sans-serif fallback
**Wordmark Font:** Inter with system sans-serif fallback

**Character:** Instrument Serif gives headlines a literary, human cadence without ornamental excess. Inter handles long-form explanations, data, pricing, navigation, and controls. The Lunaris wordmark uses uppercase lettering at a compact 650 weight with subtly open tracking, letting the canonical mark carry the brand while the lettering stays bold, modern, and minimal.

### Hierarchy

- **Display:** Hero claims at 3rem on small screens and 5rem from the small breakpoint, tightly tracked and balanced across lines.
- **Headline:** Section claims at 2rem on small screens and 3rem from the small breakpoint, with generous leading and pretty wrapping.
- **Title:** Feature and pricing headings use Inter at medium weight, usually between 1.125rem and 1.5rem.
- **Body:** Standard evidence and explanation at 1rem with 1.75rem leading; hold primary prose near 40rem.
- **Body Large:** Hero support copy at 1.125rem with 2rem leading and a tighter maximum width.
- **Control:** Buttons and navigation at 0.875rem, medium weight, with relaxed 1.75rem line height.
- **Label:** Eyebrows, badges, and metadata at 0.75–0.875rem with semibold emphasis.

### Named Rules

**The Serif Claims Rule.** Instrument Serif makes claims; Inter explains, proves, labels, and invites action. Do not use the display face for dense data, controls, or body copy.

## Layout

Pages use a centered responsive container: 42rem on small screens, 48rem at the medium breakpoint, and 80rem with 2.5rem gutters at the large breakpoint. Mobile gutters are 1.5rem. Major sections use 4rem vertical padding, while heroes add larger top and bottom space at the small breakpoint. Content alternates between narrow editorial measures and full-width product evidence rather than filling the container uniformly.

The primary grid grows from one column to two at 40rem and, for feature bento compositions, to twelve columns at 64rem. Navigation is sticky at 5.25rem tall, with the brand on the left, sparse links in the middle, and app, language, and theme actions on the right. Desktop links and the app entry appear at 64rem, while smaller screens use a full-page menu. Pricing comparison collapses from a multi-column table into plan tabs below 40rem.

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

- **Pricing:** Barely tinted olive panel, broad internal padding, and modest rounding. No default shadow.
- **Bento:** Full-bleed wallpaper portal with white typography, fine translucent ring, grain, and clipped artwork.
- **Interaction:** Feature cards lift by only two pixels on hover.

### Inputs / Fields

- **Style:** White or translucent-white field with 0.75rem rounding and an inset ten-percent ring.
- **Focus:** Inset ring strengthens from one to two pixels without shifting layout.
- **Error / Disabled:** Error Red text carries validation; error panels use a light red tint rather than a solid fill.

### Navigation

Sticky navigation uses the page's Warm Paper or Black Olive field with no shadow. The brand anchors the left edge; sparse desktop links lead to pricing, documentation, and self-hosting. A primary app entry sits beside language and theme actions. Mobile navigation expands into a full-page paper surface with large Inter links and closes when a link is followed.

### Screenshot Frames

Product tours use a flat Sage Wash mat with nested corners and optional chapter controls; the recording supplies the visual depth. Other hero screenshots may use a fine Black Olive ring and broad shadow. Smaller screenshots sit on weathered wallpaper with directional padding, one exposed edge, and a concentrated object shadow.

### Wallpaper Portals

Seven muted gradient families—green, blue, purple, brown, coral, gold, and teal—support feature storytelling. Every portal includes monochrome grain at low opacity and may include one soft white bloom. Gradients remain low-chroma and earthy in both themes.

### Named Rules

**The Softly Tactile Rule.** Interaction should feel like touching paper, ink, or a mounted object: a tonal shift, a fine ring, or a two-pixel lift is enough.

## Do's and Don'ts

### Do:

- **Do** pair Instrument Serif claims with concise Inter explanation and evidence.
- **Do** use the olive ramp for all structural light and dark theme decisions.
- **Do** contain expressive color inside clipped, grainy wallpaper portals.
- **Do** keep copy narrow and let product proof occupy the wider composition.
- **Do** preserve visible keyboard focus, localized expansion, and motion-reduced alternatives.

### Don't:

- **Don't** introduce neon gradients, corporate blue defaults, or glossy glassmorphism.
- **Don't** place multicolor atmosphere behind long-form copy or global navigation.
- **Don't** use large shadows on ordinary text sections, pricing cards, or static page chrome.
- **Don't** flatten every nested object to the same radius; preserve the portal and print hierarchy.
- **Don't** use Instrument Serif for controls, tables, form fields, or explanatory paragraphs.
