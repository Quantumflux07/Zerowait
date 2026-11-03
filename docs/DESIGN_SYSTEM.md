# ZeroWait Design System & UI Specification

## 1. Product Context & Scope

**ZeroWait** is an intelligent supermarket checkout and queue management system.
Active branch scope:
- **`develop`**: Shared foundation, database schema, integer paise monetary engine, shared TypeScript types, validated API contracts, and reusable design system.
- **`queue_engine`**: Dynamic checkout queue allocation, counter load balancing, and token display.
- **`cart`**: Smart shopping cart interface, barcode scanning, item management, and checkout locking.

The visual design is inspired by modern, clean supermarket POS aesthetics, focused strictly on ZeroWait's actual checkout and queue workflows.

---

## 2. Visual Palette & Semantic Tokens

| Token | Hex Value | Role & Semantic Application |
|---|---|---|
| `--color-brand-blue` (Primary) | `#4DB3E6` | Primary action buttons, active navigation pills, highlighted selection rings, brand accent |
| `--color-brand-blue-hover` | `#3AA3D8` | Hover and active state for primary buttons |
| `--color-brand-navy` | `#0F2A43` | Primary headings, prominent numerals, high-contrast typography |
| `--color-brand-bg` | `#EAF4FF` | Soft light-blue background tint across all screens |
| `--color-brand-card` | `#FFFFFF` | Crisp white surfaces for data cards, lists, and forms |
| `--color-brand-muted` | `#7B8BA0` / `#64748B` | Secondary descriptions, micro-labels, barcode tags |
| `--color-brand-border` | `#E2EDF8` | 1px subtle surface borders, dividers, outlines |
| `--color-status-green` | `#10B981` | Open lanes, served tokens, paid transactions, healthy battery |
| `--color-status-amber` | `#F59E0B` | Paused counters, queued carts, payment pending, low battery |
| `--color-status-red` | `#EF4444` | Closed lanes, skipped tokens, exceptions, critical stock alerts |
| `--color-status-orange` | `#F97316` | Queue delay warnings, express lane overflow notices |

---

## 3. Typography

- **Font Family**: Urbanist / Poppins (`var(--font-urbanist)`, sans-serif) with generous tracking and geometric clarity.
- **Hierarchy**:
  - Hero & KPI Numerals: `text-3xl` to `text-5xl`, `font-black` (e.g. large token numbers `E-045` or grand totals).
  - Section Headings: `text-base` to `text-lg`, `font-bold` in Navy (`#0F2A43`).
  - Item Titles & Table Rows: `text-xs` to `text-sm`, `font-bold` or `font-semibold`.
  - Micro-labels & Category Tags: `text-[10px]` to `text-[11px]`, uppercase tracking-wider in Slate (`#7B8BA0`).

---

## 4. Spacing, Radii & Surfaces

- **Grid**: 8px layout baseline.
- **Radii**:
  - Cards: `rounded-[22px]` (`22px` radius) for soft, friendly supermarket tablet ergonomics.
  - Buttons & Chips: Full pill (`rounded-full`, `9999px`).
  - Inputs & Steppers: `rounded-full` or `rounded-2xl`.
  - Avatars & Badges: Circular or pill.
- **Touch Ergonomics**: All interactive elements (steppers, buttons, lane selector cards) enforce minimum 44px touch targets.
- **Shadows**:
  - `shadow-soft`: `0 8px 24px -4px rgba(15, 42, 67, 0.05), 0 2px 6px -1px rgba(15, 42, 67, 0.02)`
  - `shadow-card-hover`: `0 14px 32px -4px rgba(15, 42, 67, 0.08), 0 4px 12px -2px rgba(15, 42, 67, 0.04)`

---

## 5. Restrained Glassmorphism Guidelines

Glassmorphism is employed with restraint as an accent layer rather than a wholesale UI treatment:
- **Permitted**:
  - Active checkout token display panels (`TokenDisplay`).
  - Modal dialogs (queue allocation confirmations, cart locking alerts).
  - Floating status pills and headers.
- **Prohibited**:
  - Dense product lists, barcode scanning tables, and pricing breakdowns must remain solid `#FFFFFF` cards to preserve rapid legibility and WCAG AA contrast.
- **CSS Specification**:
  ```css
  background: rgba(255, 255, 255, 0.70);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.60);
  box-shadow: 0 10px 30px 0 rgba(15, 42, 67, 0.05), inset 0 1px 1px 0 rgba(255, 255, 255, 0.80);
  ```

---

## 6. Shared Component Inventory

### Core Primitives (`src/components/ui/`)
1. **`Button`**: Pill-shaped action buttons supporting `primary` (sky blue `#4DB3E6`), `secondary`, `outline`, `ghost`, and `danger`.
2. **`Card`**: 22px rounded white surfaces with `#E2EDF8` borders and soft shadows.
3. **`GlassCard`**: Restrained frosted glass container for elevated highlights and token callouts.
4. **`Badge`**: Semantic pill badges (`green`, `amber`, `red`, `blue`, `slate`) with optional dot indicators.
5. **`Input`**: Pill form inputs with icon slots for barcode, search, or credentials.

### ZeroWait Specific Primitives (`src/components/zerowait/`)
1. **`BrandLogo`**: Standardized ZeroWait logo with intelligent cart/lightning icon.
2. **`PaisePrice`**: Integer paise currency formatter preventing floating-point errors and rendering verified INR values (`₹65.00`).
3. **`CartHeader`**: Physical cart identity component showing permanent QR code (`ZW-CART-001`), battery level, and cart status badge.
4. **`LaneWorkloadCard`**: Dynamic counter card displaying lane number, type (Express/Regular/Self-Checkout), queue depth, and predicted wait time.
5. **`TokenDisplay`**: High-visibility token panel rendering assigned token numbers (`E-045`), target lane, and queue order.
6. **`CartItemRow`**: Scanned product row with thumbnail, barcode snapshot, item name, unit price, quantity steppers, and total line price.
