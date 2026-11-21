# Sympl Design System Reference

The visual language shared by every Sympl platform. New Sympl-family platforms MUST follow these patterns.

## Color Palette

### Primary
- `blue-600`: primary buttons, active nav item, focus rings, links
- `blue-700`: button hover
- `blue-500`: user avatar background
- `blue-400`: brand accent text (the "PM" / "PA" in the logo)
- `blue-50` / `blue-700`: inline token / highlight chip
- `blue-100` / `blue-800`: default badge

### Neutral (layout)
- `gray-900`: sidebar background, headings
- `gray-800`: sidebar hover
- `gray-700`: sidebar borders, body text, outline-button text
- `gray-500`: secondary labels, timestamps, admin section header
- `gray-400`: placeholders, inactive icons
- `gray-300`: inactive sidebar text, input borders
- `gray-200`: card/table borders, dividers
- `gray-100`: tab list background, secondary button, level badges
- `gray-50`: content area background, table header rows
- `white`: cards, dialogs, inputs

### Semantic
- `green-100/800`: success badge; `green-50/200/800`: success alert box
- `yellow-100/800`: warning badge; `amber-50/200/800`: inline warning strip
- `red-100/800`: destructive badge; `red-600/700`: destructive button; `red-500`: notification count
- `red-50` / `red-200` / `red-700`: error alert box (background / border / text)
- `purple-100/800`: purple badge (used for "added by a category" / secondary provenance)

## Typography
- **Font:** Geist (`next/font/google`, variable `--font-geist`), falling back to `font-sans`
- `text-3xl font-bold`: login logo
- `text-2xl font-bold text-gray-900`: page title
- `text-lg font-semibold`: dialog titles
- `text-base font-semibold`: card and section titles
- `text-sm font-medium`: nav items, form labels, buttons
- `text-sm`: body, table cells, inputs
- `text-xs`: badges, timestamps, helper text, table header cells (uppercase)
- `text-[10px]`: level badges; `text-[9px]`: notification count

## Layout

### App Shell
```
┌──────────────────────────────────────────────┐
│ flex h-screen overflow-hidden bg-gray-50     │
│ ┌──────────┐ ┌─────────────────────────────┐ │
│ │ Sidebar  │ │ main flex-1 overflow-y-auto │ │
│ │ w-56     │ │   page content              │ │
│ │ (w-16    │ │                             │ │
│ │ collapsed│ │                             │ │
│ └──────────┘ └─────────────────────────────┘ │
└──────────────────────────────────────────────┘
```
Containers inside a page that need their own scroll use `overflow-y-auto`, never `overflow-hidden`, or long content (comments, logs) gets clipped.

### Sidebar
- `w-56` expanded / `w-16` collapsed, `bg-gray-900 text-white transition-all duration-200`
- Logo bar: `h-14 px-4 border-b border-gray-700`. Logo `text-lg font-bold tracking-tight` with the accent word in `text-blue-400`. Collapsed, it shows a single centred letter.
- Nav: `flex-1 overflow-y-auto py-4 space-y-1 px-2`
- Item: `flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors`
  - Active `bg-blue-600 text-white`. Inactive `text-gray-300 hover:bg-gray-800 hover:text-white`.
  - Active means `pathname === href || pathname.startsWith(href + "/")`.
- Admin header: `pt-4 pb-1 px-2` with `text-xs font-semibold text-gray-500 uppercase tracking-wider`
- Admin items are filtered by permission and hidden entirely when not granted.
- User block: `border-t border-gray-700 p-3`, avatar `h-8 w-8 rounded-full bg-blue-500 text-xs font-bold`, icon buttons `p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800`
- Collapse toggle: `h-8 border-t border-gray-700`

### Login
- Page `min-h-screen bg-gray-900 flex items-center justify-center`, container `w-full max-w-sm`
- Logo centred `text-3xl font-bold text-white tracking-tight`, subtitle `text-gray-400 mt-1 text-sm`
- Card `bg-white rounded-xl shadow-sm border border-gray-200 p-8`, heading `text-lg font-semibold text-gray-900 mb-6`

## Components

### Buttons (cva)
| Variant | Classes |
|---|---|
| default | `bg-blue-600 text-white hover:bg-blue-700` |
| destructive | `bg-red-600 text-white hover:bg-red-700` |
| outline | `border border-gray-300 bg-white hover:bg-gray-50 text-gray-700` |
| secondary | `bg-gray-100 text-gray-900 hover:bg-gray-200` |
| ghost | `hover:bg-gray-100 text-gray-700` |
| link | `text-blue-600 underline-offset-4 hover:underline` |

Sizes: `default h-9 px-4`, `sm h-8 px-3 text-xs`, `lg h-10 px-8`, `icon h-9 w-9`. Put an icon before the label as `h-4 w-4 mr-1.5`. While busy, disable the button and change the label ("Saving…", "Generating…").

### Inputs
`h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500`
Labels: `block text-sm font-medium text-gray-700 mb-1.5`. For "(optional)", use `text-gray-400 font-normal`. Where a pick list should also accept free text, use `<Input list=…>` with a `<datalist>`.

### Cards
`rounded-lg border border-gray-200 bg-white shadow-sm`. Header `p-6 space-y-1.5`, title `text-base font-semibold`, description `text-sm text-gray-500`, content `p-6 pt-0`.

### Dialogs
Overlay `bg-black/40 backdrop-blur-sm`. Content `max-w-lg rounded-xl bg-white p-6 shadow-lg`, or `max-w-2xl` for forms. Footer: Cancel (outline) then the primary action.

### Badges
`rounded-full px-2.5 py-0.5 text-xs font-semibold`. Variants: default (blue), secondary (gray), destructive (red), outline, success (green), warning (yellow), purple.

### Tabs (Radix)
List `inline-flex h-9 rounded-lg bg-gray-100 p-1 text-gray-500`, active trigger `bg-white text-gray-900 shadow`, content `mt-2`.

### Tables
- Wrapper `border border-gray-200 rounded-lg overflow-hidden bg-white` (add `overflow-x-auto` around wide tables)
- Header row `bg-gray-50`, cells `px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider`
- Body cells `px-4 py-3 text-sm text-gray-900`, rows `border-t border-gray-200 hover:bg-gray-50`
- Row actions: right-aligned icon buttons `p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700` (delete hovers `text-red-600`), each with a `title`
- Inactive or hidden rows: `opacity-50`
- Empty state: `px-4 py-6 text-sm text-gray-400`

### Select (Radix)
Trigger styled like Input. Content `rounded-md border border-gray-200 bg-white shadow-md`. Items `py-1.5 pl-8 pr-2 text-sm hover:bg-gray-100`.

### Alert boxes
- Error: `rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700`
- Success: `rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800`
- Inline warning with a dismiss link: `rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800`

### Newer patterns (from SymplPM's PSIR and Categories modules)
- **Collapsible section card:** a white card whose header is a full-width button (`flex w-full items-center gap-2 px-4 py-3`) with a `ChevronRight`/`ChevronDown` icon (`h-4 w-4 text-gray-400`), a `text-sm font-semibold` title and badges on the right ("9 lines", "3/10 fields" turning `success` when complete). The body sits below a `border-t border-gray-200`.
- **Token chips:** placeholders in text render inline as `rounded bg-blue-50 px-1 text-blue-700 font-medium`. Once a value is filled in, it shows as `bg-green-50 text-green-800`.
- **Provenance badges:** `secondary` for global/default, `purple` for added at a more specific level, `default` for "Overridden here", `outline` for "Overridden above", `warning` for "Hidden".
- **Level badge** next to a tree node's name: `whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500` (e.g. "Sub-Category", "Product Type").
- **Tree tables:** indent the name cell by `depth * 16px` and prefix with a `↳` in `text-gray-300`. Pickers use either full path labels ("A > B > C") or nbsp-indented `↳` options.
- **Drag handle:** `GripVertical h-4 w-4 text-gray-200 group-hover:text-gray-400`. Only the handle is draggable, so the text stays selectable. The drop target shows `bg-blue-50 border-t-2 border-t-blue-400`.

## Page Patterns

### Standard page
```tsx
<div className="p-6 max-w-7xl mx-auto space-y-6">
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Page Title</h1>
      <p className="text-sm text-gray-500 mt-1">Description text</p>
    </div>
    <Button>Primary Action</Button>
  </div>
  <Card>…</Card>
</div>
```
Server `page.tsx` checks auth and permission (redirect to `/dashboard` if denied), loads initial data, and renders a `"use client"` component.

### Stat card
```tsx
<Card>
  <CardContent className="p-6">
    <div className="flex items-center gap-4">
      <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      <div>
        <p className="text-sm text-gray-500">Label</p>
        <p className="text-2xl font-bold text-gray-900">42</p>
      </div>
    </div>
  </CardContent>
</Card>
```

## Dependencies
- Core: `next` 16, `react`/`react-dom` 19, `typescript` 5, `prisma` / `@prisma/client` / `@prisma/adapter-pg` 7, `pg` 8
- UI: `@radix-ui/react-{dialog,select,tabs,slot,checkbox,switch,dropdown-menu,popover,tooltip,scroll-area,separator,label,avatar}`, `class-variance-authority` 0.7, `clsx` 2, `tailwind-merge` 3, `lucide-react`
- Auth: `next-auth` 5 (beta), `bcryptjs` 3
- Utilities: `date-fns` 4, `zod` 4, `exceljs` 4
- Styling: `tailwindcss` 4, `@tailwindcss/postcss` 4
