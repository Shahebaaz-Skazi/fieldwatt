# Growth OS UI Style Guide

A minimalist, Apple-inspired design system with modern accents.

---

## Color Palette

### Primary Colors (Gray Scale)
```css
--color-primary: #111827;     /* gray-900 - Primary text, buttons */
--color-secondary: #6b7280;   /* gray-500 - Secondary text */
--color-muted: #9ca3af;       /* gray-400 - Muted text, icons */
--color-border: #e5e7eb;      /* gray-200 - Borders */
--color-border-light: #f3f4f6; /* gray-100 - Light borders */
--color-background: #ffffff;  /* White - Card backgrounds */
--color-surface: #f9fafb;     /* gray-50 - Surface backgrounds */
```

### Accent Colors (Use Sparingly)
```css
/* Status */
--color-success: #10b981;     /* emerald-500 */
--color-warning: #f59e0b;     /* amber-500 */
--color-error: #ef4444;       /* red-500 */
--color-info: #0ea5e9;        /* sky-500 */

/* Feature Accents */
--color-violet: #8b5cf6;      /* violet-500 */
--color-orange: #f97316;      /* orange-500 */
```

---

## Typography

### Font Family
```css
font-family: Inter, system-ui, sans-serif;
```

### Sizes
| Element | Class |
|---------|-------|
| Page Title | `text-2xl font-bold text-gray-900` |
| Section Header | `text-sm font-semibold text-gray-900` |
| Card Title | `font-semibold text-gray-900` |
| Body Text | `text-sm text-gray-500` |
| Small Labels | `text-xs text-gray-500` |
| Stat Numbers | `text-3xl font-bold text-gray-900` or `text-5xl` |

---

## Spacing

### Container
```tsx
<div className="p-4 max-w-7xl mx-auto">
```

### Section Gaps
- Major sections: `space-y-6`
- Related elements: `space-y-3` or `space-y-4`
- Grid gaps: `gap-3` or `gap-4`

---

## Cards

### Standard Card
```tsx
<div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100">
  {/* Content */}
</div>
```

### Elevated Card (Stats/Hero)
```tsx
<div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
  {/* Content */}
</div>
```

### Card with Form
```tsx
<Card className="border-gray-200 shadow-sm">
  <CardContent className="p-6">
    {/* Form content */}
  </CardContent>
</Card>
```

---

## Buttons

### Primary Button (Dark)
```tsx
<Button className="bg-black hover:bg-gray-800 text-white font-medium">
  <Play className="h-4 w-4 mr-2" />
  Start
</Button>
```

### Secondary Button
```tsx
<Button variant="outline" size="sm" className="hover:bg-gray-100">
  <Download className="h-4 w-4 mr-1" />
  Export CSV
</Button>
```

### Filter Pill (Toggle)
```tsx
<button className={cn(
  "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
  isActive
    ? "bg-gray-900 text-white border-gray-900"
    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
)}>
  Label
</button>
```

---

## Icons

### Header Icon (Dark)
```tsx
<div className="p-2 bg-black rounded-lg text-white shadow-sm">
  <Icon className="h-5 w-5" />
</div>
```

### Stat Icon (Colored Background)
```tsx
<div className="p-1.5 bg-emerald-100 rounded-lg">
  <Icon className="h-4 w-4 text-emerald-600" />
</div>
```

### Icon Color Map
| Type | Background | Icon Color |
|------|------------|------------|
| Success | `bg-emerald-100` | `text-emerald-600` |
| Warning | `bg-amber-100` | `text-amber-600` |
| Error | `bg-red-50` | `text-red-500` |
| Info | `bg-sky-100` | `text-sky-600` |
| Feature | `bg-violet-100` | `text-violet-600` |
| Neutral | `bg-gray-100` | `text-gray-600` |

---

## Bento Grid Layout

### Stats Grid (12-Column System)
The dashboard uses a flexible 12-column grid system (`grid-cols-12`) for widget layout.

```tsx
<div className="grid grid-cols-12 gap-3">
  {/* Hero Stat - 4 cols (Full height) */}
  <div className="col-span-12 md:col-span-4 bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
    <div className="flex items-center gap-2 mb-3">
      <div className="p-1.5 bg-emerald-100 rounded-lg">
        <Icon className="h-4 w-4 text-emerald-600" />
      </div>
      <span className="text-sm font-medium text-gray-600">Metric Name</span>
    </div>
    <div className="text-5xl font-bold text-gray-900">{value}</div>
    <p className="text-sm text-gray-500 mt-2">Description</p>
  </div>
  
  {/* Small Stats - 2 cols each (Compact) */}
  <div className="col-span-6 md:col-span-2 bg-white rounded-2xl p-5 shadow-md border border-gray-100">
    <div className="p-1.5 bg-violet-100 rounded-lg w-fit mb-2">
      <Icon className="h-4 w-4 text-violet-600" />
    </div>
    <div className="text-3xl font-bold text-gray-900">{value}</div>
    <p className="text-xs text-gray-500 mt-1">Label</p>
  </div>
  
  {/* Wide Priority Card - 8 cols (Visual Interest) */}
  <div className="col-span-12 md:col-span-8 relative overflow-hidden bg-white rounded-2xl p-5 shadow-md border border-gray-100">
    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-gray-50 to-transparent rounded-bl-full" />
    <div className="relative">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Section Title</h3>
        <Badge className="bg-red-50 text-red-700 border border-red-200 text-xs font-medium">Tag</Badge>
      </div>
      {/* Content / Badges */}
    </div>
  </div>
</div>
```

---

## Form Inputs

### Input with Icon
```tsx
<div className="relative">
  <Icon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
  <Input className="pl-9 h-10 border-gray-200" placeholder="..." />
</div>
```

### Select Dropdown
```tsx
<Select>
  <SelectTrigger className="w-36 h-9 text-sm">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="...">Label</SelectItem>
  </SelectContent>
</Select>
```

---

## Badges

### Tier Badge
```tsx
<Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
  Tier A
</Badge>
```

### Keyword Badge
```tsx
<Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-gray-700 text-xs font-normal border border-gray-200/50 shadow-sm hover:shadow-md transition-shadow">
  {keyword}
  <span className="ml-1 text-[10px] font-semibold text-emerald-600">
    {score}
  </span>
</Badge>
```

---

## Tables

### Data Table
```tsx
<div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
  <table className="w-full text-sm">
    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
      <tr>
        <th className="p-3 text-left font-semibold text-gray-700">
          Column
        </th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="p-3 text-gray-600">Data</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## Filter Panel

```tsx
<div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
  {/* Filters */}
</div>
```

---

## Transitions

```css
transition-all          /* Default */
transition-colors       /* Color only */
transition-shadow       /* Shadow effects */
hover:bg-gray-100       /* Hover states */
```

---

## Do's and Don'ts

### ✅ Do
- Use `gray-*` palette (900, 700, 500, 400, 200, 100, 50)
- Use `rounded-2xl` for cards, `rounded-xl` for smaller elements
- Use subtle shadows: `shadow-sm`, `shadow-md`, `shadow-lg`
- Use colored icon backgrounds for visual interest
- Keep forms compact with grid layouts

### ❌ Don't
- Overuse saturated colors
- Mix gray and zinc palettes
- Use flat designs without shadows
- Add too many borders
- Use inconsistent border radius
