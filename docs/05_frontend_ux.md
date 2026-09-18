# Frontend and UX Specification

## 1. Design objective

The strongest product feature is the experience of filling a form. It should feel focused, calm, modern and fast.

Do not copy Typeform visual assets, brand elements or exact UI. Recreate the interaction principles:
- one primary question at a time
- strong typography
- keyboard friendliness
- minimal chrome
- smooth progression
- clear progress
- generous spacing

## 2. Technology

- React through Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui for dashboard primitives
- Motion for question transitions
- dnd-kit for builder reordering
- React Hook Form + Zod or equivalent for local typed validation where useful

Do not force shadcn visual style onto the public form renderer. The renderer needs its own product design system.

## 3. Marketing site

Visual tone:
- clean
- premium but friendly
- not corporate-heavy
- demonstrate forms interactively

Homepage sections:
1. Hero: build forms people enjoy answering
2. Live mini-demo
3. Core advantages: beautiful, fast, QR-ready, affordable
4. Feature grid
5. Example use cases
6. Pricing
7. FAQ
8. final CTA

SEO basics:
- semantic HTML
- metadata
- OpenGraph
- sitemap
- robots
- canonical URLs
- structured FAQ data only where content genuinely qualifies

## 4. Dashboard UX

Dashboard should answer:
- What forms do I have?
- Are they live?
- How many responses did they get?
- Am I close to limits?

Form card/list displays:
- title
- draft/published/closed state
- response count this month / total
- last updated
- public URL quick-copy when published
- overflow actions

Do not make users enter a form just to copy its URL.

## 5. Builder layout

Desktop default:

```text
┌──────────────────────────────────────────────────────────────┐
│ topbar: back | form name | save state | preview | publish   │
├───────────────┬──────────────────────────┬───────────────────┤
│ block outline │ live respondent preview │ selected settings │
│               │                          │                   │
│ Welcome       │                          │ Required          │
│ Name          │  What should we         │ Placeholder       │
│ Email         │  call you?              │ Validation        │
│ Role          │                          │ Logic             │
│ Thank you     │  Type your answer...    │                   │
└───────────────┴──────────────────────────┴───────────────────┘
```

On smaller laptop widths, right settings may become a drawer. On mobile, builder editing can use tabbed sections; mobile creation need not have every desktop affordance at V1 launch but must remain usable.

## 6. Adding questions

Provide an Add Block control with searchable block types.

Fast path:
- keyboard shortcut `/` or `+`
- selection adds after current block
- automatically focus title

Allow duplicate and reorder.

## 7. Live preview

Preview must use the same rendering components as the real public form wherever possible. Do not maintain a fake builder preview and a different runtime implementation.

Preview modes:
- desktop
- mobile width
- full-screen test mode

## 8. Public form visual behavior

Desktop:
- content max-width ~640–800px depending on question type
- vertically balanced but not rigidly centered when keyboard/content height requires scrolling
- large readable type
- answer control clearly visible

Question transition:
- outgoing: subtle opacity + translate up
- incoming: opacity + translate from below
- approximately 180–300ms
- honor `prefers-reduced-motion`

No motion should block input.

## 9. Navigation

Controls:
- Back where previous step is logically defined
- Next
- Submit
- keyboard Enter where safe

For single choice, optional auto-advance may be enabled with a small delay, but there must be no accidental jump that prevents correction. Default can be click/select then Next for accessibility and predictability.

## 10. Progress

Support:
- progress bar
- `3 of 8` label

Conditional logic makes exact denominator tricky. Use a best-effort reachable-step count from current flow or show a simple progress bar based on traversed path. Do not lie with obviously incorrect fixed counts.

## 11. Validation

Validation message:
- close to field
- concise
- accessible via ARIA
- preserve answer

Examples:
- "Enter a valid email address."
- "Choose at least one option."
- "File must be under 10 MB."

Never validate aggressively on the first keystroke.

## 12. Accessibility

Minimum:
- keyboard navigable
- visible focus state
- labels associated with controls
- semantic headings
- reduced motion support
- screen-reader announcements for question changes where practical
- sufficient color contrast
- no critical information encoded only by color
- logical tab order

## 13. Themes

V1 themes can be controlled through design tokens:
- background
- text
- accent
- button style
- font family from a safe curated set
- border radius scale
- logo

Do not allow arbitrary user JavaScript or unsafe HTML.

## 14. Responses UI

Use two views:
- table/list for multiple submissions
- detail panel/page for one submission

Choice analytics can use simple bars/counts. Avoid heavy chart libraries unless needed.

## 15. Empty/error states

Every major view needs intentional states:
- no forms
- no responses
- no search result
- form unavailable
- form closed
- limit reached
- form deleted
- upload failed
- payment pending
- network save failed

A polished side project is often differentiated by these states.
