---
name: Lunaris Marketing
description: Neutral, dark-first marketing pages with a lunar landscape and a full-width product demo inside the homepage container.
colors:
  canvas-dark: "#000000"
  canvas-light: "#efeeeb"
  foreground-dark: "#f8f8f8"
  white: "#ffffff"
  olive-200: "#eaeaea"
  olive-300: "#dddddd"
  olive-400: "#b1b1b1"
  olive-600: "#616161"
  olive-700: "#494949"
  olive-800: "#343434"
typography:
  hero:
    fontFamily: "Instrument Serif, serif"
    fontSize: "clamp(3.35rem, 7.1vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  page-title:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "2.25rem"
    lineHeight: 1
    letterSpacing: "-0.025em"
  page-title-sm:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "3.75rem"
    lineHeight: 1
    letterSpacing: "-0.025em"
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: "1.75rem"
  button:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.75rem"
  wordmark:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "0.04em"
rounded:
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  pill: "9999px"
spacing:
  gutter: "1.5rem"
  gutter-lg: "2.5rem"
  feature-block: "3.5rem"
  feature-block-sm: "5rem"
components:
  button-primary:
    backgroundColor: "{colors.canvas-dark}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  button-primary-dark:
    backgroundColor: "{colors.olive-300}"
    textColor: "{colors.canvas-dark}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  input-default:
    backgroundColor: "{colors.white}"
    textColor: "{colors.canvas-dark}"
    rounded: "{rounded.xl}"
    padding: "0.625rem 1rem"
  catalog-card:
    backgroundColor: "transparent"
    rounded: "{rounded.xl}"
    padding: "1.25rem"
  pricing-card:
    backgroundColor: "transparent"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
  editor-panel:
    backgroundColor: "{colors.white}"
    textColor: "{colors.canvas-dark}"
    rounded: "{rounded.2xl}"
  faq-row:
    backgroundColor: "transparent"
    padding: "1rem 0"
---

# Design System: Lunaris Marketing

## Overview

On the homepage, the lunar landscape draws attention to the headline and the recorded demo. Below it, each section answers one question about the workspace. Inner pages give the largest share of space to the visitor’s task, whether that is choosing a download, comparing plans, finding an extension or editing text.

## Colors

Dark is the initial theme. Light and system preferences persist across routes. The global stylesheet retains the `olive` token names for an achromatic ramp. In light mode, both `olive-50` and `olive-100` resolve to the warm off-white canvas. In dark mode they supply near-white foregrounds, and `olive-950` supplies the black canvas. Use `olive-700` for supporting copy on light backgrounds and `olive-300` or `olive-400` on dark backgrounds. [Theme definitions](src/app/globals.css)

Keep the original colors of the lunar image, product captures and extension icons. Platform and social marks use their monochrome variants. Reserve interface color for meaningful states such as form errors, with a text explanation alongside the color.

## Typography

Only the homepage headline uses Instrument Serif. It has a balanced measure of up to 18 characters, with its closing phrase in italic on a separate line. DM Sans carries the rest of the interface, including code, commands and the uppercase wordmark.

The shared inner-page heading grows from 2.25rem to 3.75rem at 40rem. Homepage feature headings grow from 2.25rem to 3rem with tight leading. The Word Counter has a smaller, medium-weight title so the editor and live count take priority. Standard explanatory copy uses 1rem type on 1.75rem lines. Keep timestamps and changing metrics aligned with tabular numerals.

## Layout

Use the shared centered container. It has 1.5rem horizontal gutters and a 42rem width cap, growing to 48rem at the medium breakpoint. At 64rem it opens to 80rem with 2.5rem gutters. Align headings, artwork, video and horizontal rules to the same content edges. [Container](src/components/elements/container.tsx)

The homepage places extensions, storage choices and enterprise access in separate bands with thin dividers. The extension artwork sits beside a compact group of labeled icons. Storage pairs a three-row definition list with artwork on the right. Enterprise puts its artwork on the left and its explanation on the right. At narrow widths these pairs stack. Let translated labels wrap and preserve the reading order. [Homepage features](src/components/sections/home-features.tsx)

## Elevation & Depth

Use whitespace and fine, low-opacity borders for most separation. The sticky header has a translucent surface and backdrop blur. The landscape has a directional scrim for the white headline and a masked blur that fades its lower edge into the active canvas. On narrow screens, the image occupies a shallow strip above the copy. The 16:9 demo overlaps the landscape by 1.5rem on mobile and 2.5rem from the small breakpoint. Its chapter controls sit below on the page background. [Homepage hero](src/app/[locale]/page.tsx)

Give tools a distinct working surface. Word Counter uses a fine ring and soft shadow around the editor and statistics panel. Catalog and pricing cards use a simple border.

## Shapes

Use pills for primary actions and catalog filters, a 0.75rem radius for catalog cards, pricing tiers and form fields, and 1rem for the Word Counter panel. The demo video uses a tighter 0.5rem radius. The Explore tile has one upright rounded border, sized to sit alongside the extension icons.

## Components

- **Navigation.** The sticky header is 4rem tall on mobile and 4.5rem from 64rem. Desktop menus use the shared navigation menu, with icons and short descriptions for primary destinations. Product groups the tour, extensions and MCP. Developers groups CLI, Extensions SDK and self-hosting. Resources includes documentation, contact and security links. Enterprise, Pricing and Downloads are direct links, in that order. Mobile uses a full-screen dialog with expandable groups. The footer orders Product, Developers, Compare, Resources and Legal. Downloads appears under footer Product. Pricing and Enterprise lead footer Resources. [Navigation data](src/app/[locale]/layout.tsx)
- **Actions and fields.** Primary buttons use black on the light canvas and a light gray fill in dark mode. Soft buttons use a translucent tint. Use the shared `glass` button variant for secondary actions over imagery. It uses a borderless tint and backdrop blur, as on the homepage’s Other platforms link. Large buttons increase padding to 0.5rem by 1rem. Understated text links gain an underline on hover. Give fields visible labels and preserve the keyboard outline or inset focus ring in both themes. [Shared button variants](../../packages/ui/src/components/button.tsx)
- **Workspace artwork.** The homepage uses monochrome isometric diagrams on a shared grid. The extensions illustration shows an orbit simulator, a spreadsheet formula, and an assembled PDF as examples. Storage routes connect a document to three destinations, and the Enterprise campus appears on both pages. Its trace plays once when visible and stays static with reduced motion. The Enterprise page also uses the animated extension showcase. [Extensions](src/components/elements/extensions-artwork.tsx) · [Storage](src/components/elements/storage-artwork.tsx) · [Enterprise](src/components/elements/enterprise-artwork.tsx) · [Extension showcase](src/components/elements/extension-showcase.tsx)
- **Catalog and pricing.** The catalog places search and count-bearing filters above a one-, two- or three-column grid. Each card leads with the extension icon and name. Pricing gives each plan a bordered tier and uses a comparison table. Below 40rem, tabs show one plan’s comparison at a time.
- **Word Counter.** A compact header leads directly into the editor. The toolbar, text area and dark statistics panel form one unit. The word count is the largest figure. At desktop widths the metrics sit in a side rail, then move below the editor on smaller screens. Additional analysis follows beneath the tool. [Word Counter](src/components/tools/word-counter-tool.tsx)

## Do's and Don'ts

- Do keep a common left edge between hero copy and video, and give the video the full container width.
- Do separate a visitor’s primary task from supporting links and explanations through spacing, order and type scale.
- Don’t tint images to match the interface or give each section its own accent.
- Don’t rely on motion, hover or an icon alone to explain a destination.
