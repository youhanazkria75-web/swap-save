# Swap & Save — AI-Powered Product Exchange Platform

A complete, production-quality marketplace frontend built with Next.js 14, TypeScript, Tailwind CSS, and shadcn/ui. This is a graduation project demonstrating a full-stack product exchange platform with admin oversight, AI matching, and a controlled 17-step swap lifecycle.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the development server
npm run dev

# 3. Open http://localhost:3000
```

No environment variables required — all data is mocked client-side with Zustand persistence.

---

## Demo Credentials

Use the **Quick Demo Login** buttons on the login page, or use these directly:

| Role | Email | Notes |
|------|-------|-------|
| **Regular User** | `alex.morgan@email.com` | Has active swaps, products, notifications |
| **Trusted User** | `nour.aa@email.com` | 22 completed swaps, featured products |
| **New User** | `omar.khalil@email.com` | New account, few swaps |
| **Admin** | `admin@swapandsave.com` | Full admin panel access |

All passwords are accepted in demo mode (any string).

---

## Platform Overview

### Core Concept
Swap & Save is a **controlled product exchange marketplace** where users swap items instead of buying and selling. The platform:

- Requires **admin approval** for every swap before completion
- Uses **AI matching** to suggest ideal swap partners
- Has a **structured 17-step swap lifecycle** from request to completion
- Enforces **anti-escape rules** — no personal contact sharing before approval
- Features **trust scoring**, ratings, and a coin economy

### The Swap Lifecycle
```
1. Browse (guest OK)        →  2. Login/Signup
3. Add a product            →  4. Request a swap
5. Other user accepts       →  6. Structured discussion
7. Admin reviews            →  8. Admin approves/rejects
9. Unlock exchange          ->  10. Service fee (EGP)
11. Choose meetup/delivery  →  12. Meet in person
13. In Progress             →  14. Both confirm
15. Completed               →  16. Rate each other
17. Trust & history update
```

---

## Project Structure

```
swap-save/
├── app/
│   ├── (admin)/admin/         # Admin panel (auth-guarded)
│   │   ├── page.tsx           # Dashboard + charts
│   │   ├── approvals/         # Pending swap reviews
│   │   ├── users/             # User management
│   │   ├── products/          # Product management
│   │   ├── swaps/             # Swap management + detail
│   │   ├── transactions/      # Financial records
│   │   ├── reports/           # Reports & disputes
│   │   ├── suspicious/        # Fraud monitoring
│   │   ├── discussions/       # Communication review
│   │   └── analytics/         # Charts & KPIs
│   ├── (auth)/                # Auth pages (split-screen layout)
│   │   ├── login/
│   │   ├── signup/            # 4-step wizard with live password rules
│   │   ├── forgot-password/
│   │   ├── reset-password/
│   │   └── verify-email/      # 6-digit OTP UI
│   ├── (public)/              # Public pages (navbar + footer)
│   │   ├── page.tsx           # Home / Landing
│   │   ├── marketplace/       # Browse with filters + pagination
│   │   ├── products/[id]/     # Product detail + swap request modal
│   │   ├── categories/
│   │   ├── users/[id]/        # Public user profile
│   │   ├── about/
│   │   ├── help/              # FAQ accordion
│   │   ├── contact/
│   │   ├── terms/
│   │   └── privacy/
│   ├── (user)/user/           # Logged-in user area (sidebar layout)
│   │   ├── dashboard/
│   │   ├── products/          # My products + add/edit
│   │   ├── swaps/             # Swap list + full detail with discussion
│   │   ├── recommendations/   # AI match cards
│   │   ├── notifications/
│   │   ├── saved/
│   │   ├── coins/             # Balance, packages, history
│   │   └── profile/           # Profile + settings tabs
│   ├── globals.css            # Design tokens + CSS variables
│   ├── layout.tsx             # Root layout
│   └── not-found.tsx          # 404
├── components/
│   ├── shared/
│   │   ├── navbar.tsx         # Auth-aware top navigation
│   │   ├── footer.tsx         # Marketplace-quality footer
│   │   ├── product-card.tsx   # Reusable product card + grid
│   │   ├── swap-card.tsx      # Swap list row component
│   │   ├── stats-card.tsx     # KPI stat card
│   │   └── status-badges.tsx  # All status badge variants
│   └── ui/                    # shadcn-style primitives
│       ├── button.tsx         # 8 variants incl. brand, loading state
│       ├── badge.tsx          # 15 variants for all status types
│       ├── card.tsx
│       ├── form-elements.tsx  # Input, Label, Textarea, Checkbox, Switch
│       ├── primitives.tsx     # Dialog, Tabs, Avatar, Progress, Tooltip
│       ├── dropdown-menu.tsx
│       ├── select.tsx
│       ├── alert.tsx
│       ├── breadcrumb.tsx
│       └── empty-state.tsx
├── contexts/
│   └── app-context.tsx        # Zustand store — all app state + actions
├── lib/
│   ├── mock-data.ts           # Full mock dataset (users, products, swaps…)
│   └── utils.ts               # cn() utility
├── types/
│   └── index.ts               # All TypeScript types (35+ interfaces)
└── middleware.ts               # Security headers
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| UI Components | Radix UI primitives (shadcn/ui pattern) |
| State Management | Zustand with localStorage persistence |
| Charts | Recharts |
| Icons | Lucide React |
| Dates | date-fns |
| Toasts | Sonner |
| Forms | React Hook Form + Zod (types ready) |
| Themes | next-themes (light/dark) |

---

## Key Features

### For Users
- Browse marketplace without login
- 4-step signup with live password strength checker
- Add products with image upload UI, category picker, condition selector
- Request swaps with product-picker modal
- Full swap discussion panel with anti-escape rules
- AI-powered match recommendations with score breakdown
- Service fee payment flow (mock Visa)
- Meetup scheduling with suggested locations
- Completion confirmation + star ratings
- Coin economy: purchase packs, spend on features
- Notification center with type-specific icons
- Profile with trust score, verification badges, ratings history

### For Admins
- Overview dashboard with Recharts area/bar charts
- Pending approvals with side-by-side user + product comparison
- One-click approve/reject with admin notes
- Full discussion transcript review with suspicious-content highlighting
- User management: suspend/unsuspend with reason
- Product management: feature/deactivate/delete
- Reports & disputes with resolve/dismiss workflow
- Suspicious activity monitoring with severity levels
- Transaction history and revenue analytics
- Conversion funnel visualization

---

## State Architecture

All data lives in a single Zustand store (`contexts/app-context.tsx`) with:

- **Persistent state** — auth, products, swaps, notifications saved to localStorage
- **Optimistic updates** — UI updates instantly, then confirms
- **Cross-page consistency** — changes on one page immediately reflect everywhere
- **Mock async** — all actions simulate network delay (800–1500ms)

### Mock Data
`lib/mock-data.ts` contains:
- 6 users (various trust levels, verification states)
- 8 products across categories
- 5 swaps at different lifecycle stages
- Messages, notifications, transactions, ratings
- Reports, disputes, suspicious activity flags
- Admin stats and analytics data

---

## Connecting a Real Backend

The frontend is fully decoupled from backend concerns. To connect:

1. Replace `useApp()` store actions with API calls
2. Remove the mock data from `lib/mock-data.ts`
3. Replace Zustand persistence with proper auth tokens (JWT/sessions)
4. Add `NEXT_PUBLIC_API_URL` environment variable
5. The TypeScript types in `types/index.ts` match standard REST/GraphQL schemas

---

## Design System

### Color Palette
- **Brand**: Emerald green (`brand-600: #16a34a`)
- **Secondary**: Teal (`teal-600: #0d9488`)  
- **Accents**: Amber for coins/featured, Red for destructive, Blue for info

### CSS Variables (light + dark)
All colors use HSL CSS variables defined in `globals.css`, automatically adapting to dark mode via `next-themes`.

### Component Naming
- `variant="approved"` / `"rejected"` / `"pending"` on Badge
- `color="green"` / `"amber"` / `"red"` on StatsCard
- Status badges auto-map from SwapStatus type

---

## Graduation Project Notes

This project demonstrates:
- Complex multi-step UI flows with state transitions
- Role-based access control (guest / user / admin)
- Admin moderation workflows
- AI recommendation UI with scoring
- Financial transaction UI
- Trust and reputation systems
- Anti-fraud UX patterns
- Responsive marketplace design
- Full TypeScript typing throughout

Built as a frontend-only demonstration — no real payments, no real AI, no real backend. All business logic is represented through believable UX flows and frontend state.
