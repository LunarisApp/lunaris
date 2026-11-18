---
target: All landing pages
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-11-18T23-40-29Z
slug: apps-landing-src-app
---
# Landing page design review

The homepage connects the lunar setting to a real workspace. Labeled extensions and chapter controls make that promise tangible. The stone and black palette works across the interior pages. The largest opportunities lie between arriving with a task and reaching its action.

## Findings

1. **P2 · Pricing**. At 390 × 844, Start free begins at y=930 and Choose Plus at y=1414. Four long plan cards precede the comparison. Place each action immediately after its price and short description, and add a jump from the billing selector to the existing feature comparison. Retain feature detail for evaluators.
2. **P2 · Downloads**. On a phone the first three actions download desktop installers. Open Lunaris begins at y=1074. Surface the browser option directly below the introduction on mobile, keeping installers available for visitors downloading for another device.
3. **P2 · MCP**. “Choose your data region” mixes United States, Desktop app, and European Union. Ask where to connect, offer Cloud and Desktop, and show region choices under Cloud. The generated snippet and transport should follow the selected connection. Provide a manual-copy response when clipboard access fails.
4. **P2 · Extension detail**. The shared template moves usage instructions and the primary action below screenshots, description, and tags on small screens. On Excalidraw, Open Lunaris starts at y=1046. Put the existing use instructions and action below the introduction on mobile. Preserve developer, version, and permissions farther down.

## Coverage

English homepage, pricing, downloads, demo request, video, self-hosting, MCP, word counter, extension catalog, eight extension detail routes, three comparison pages, and missing-page recovery. Desktop and mobile template checks used 1280 × 720 and 390 × 844. All observed templates fit horizontally. The three comparisons explain their sources, the counter exposes its input early, and self-hosting places requirements beside installation on desktop. The self-host installer could reuse the manual-copy interaction from Downloads.

## Heuristics

| Heuristic | Score | Evidence |
| --- | --- | --- |
| System status | 3 | Plan and filter selection are visible. MCP copy failure has no feedback. |
| Real-world match | 2 | Desktop appears among regions. |
| User control | 3 | Chapter seeking and back-to-catalog links provide control. |
| Consistency | 3 | Shared type, navigation, and neutral palette hold across pages. |
| Error prevention | 3 | Unavailable regions are disabled and downloads name their formats. |
| Recognition | 2 | Long plan summaries make comparing adjacent prices difficult on phones. |
| Efficiency | 2 | Browser and extension entry actions require extra scrolling. |
| Minimalism | 3 | Product artwork carries the palette. Plan detail repeats across tiers. |
| Error recovery | 3 | Clear 404 recovery and manual Homebrew copying. MCP lacks a copy fallback. |
| Help | 3 | Extension management, deployment guides, and comparison sources are linked. |

**27/40**. A first-time visitor has a clear route from the homepage. A mobile team evaluator must scroll past feature lists to act or compare. A developer choosing local MCP transport must interpret “data region” as a connection target.

The source detector raised four advisories. One flagged the explicitly approved headline typeface. Three concerned local type sizes in extension-tip.tsx and home-features.tsx. None warrants changing the overall typography. The highest-value next pass is mobile pricing and downloads.
