# Events UI Components - Production Quality

## Overview
This directory contains production-ready components for the Events screen, built with pixel-perfect attention to detail, smooth animations, and optimal performance for a betting app context.

## Components

### EventCard.tsx
The core event display component with comprehensive enhancements:

**Visual Enhancements:**
- Team logo placeholders with sport-based color coding (NFL: green, NBA: orange, etc.)
- Live game pulse animation on red indicator dot
- Score display for live/final games prominently positioned
- Border accent for live games (2px red border with 30% opacity)
- Improved spacing hierarchy for better scannability

**Touch Feedback:**
- All odds buttons meet 44pt minimum touch target requirement
- Visual press states with scale transform (0.98) for tactile feedback
- Active states on buttons transition to elevated surface color
- Disabled states at 40% opacity for clear affordance

**Animations:**
- Fade-in on mount with translateY for smooth entrance
- Staggered animations (50ms delay per card) when multiple cards load
- Live indicator pulse using continuous loop animation
- All animations use `useNativeDriver: true` for 60fps performance

**Defensive Coding:**
- Null-safe odds checking with explicit undefined/null guards
- Graceful degradation when odds data is unavailable
- Date parsing wrapped in error-safe formatters

**Performance:**
- Memoized animation refs prevent unnecessary re-creates
- Minimal re-render footprint with proper prop dependencies
- StyleSheet.create for style object reuse

### EventCardSkeleton.tsx
Pixel-perfect skeleton loader matching EventCard dimensions:

**Visual Accuracy:**
- Exact width/height matching for team logos (48x48)
- Precise spacing matching for all UI elements
- Shimmer pulse animation (1.2s cycle) for loading feedback
- Staggered fade-in (50ms delay) when multiple skeletons render

**Animation:**
- Opacity interpolation from 0.3 to 0.6 for subtle shimmer
- Continuous loop prevents jarring stops
- Fade-in on mount to prevent layout pop

**Layout Stability:**
- Zero layout shift when skeleton transitions to real EventCard
- Maintains all padding, margins, and border radius exactly

### SportFilter.tsx
Premium segmented control with spring physics:

**Visual Design:**
- Floating selection indicator with drop shadow
- Smooth spring animation (tension: 80, friction: 10) for natural motion
- Selected text receives subtle text shadow for depth
- Container shadow for elevated appearance

**Animations:**
- translateX interpolation for indicator slide (0%, 100%, 200%)
- Scale animation (1.05 → 1) on selection for tactile feedback
- Spring physics prevent robotic linear motion

**Accessibility:**
- Proper `accessibilityRole="button"` on all segments
- `accessibilityState={{ selected }}` for screen readers
- Clear `accessibilityLabel` describing filter action

**Touch Targets:**
- 44pt minimum height enforced
- Proper press states with opacity reduction (0.7)
- Visual indicator prevents confusion about current selection

## Utilities

### date-helpers.ts
Date formatting and grouping utilities:

**Functions:**
- `getDateGroupKey()`: Groups events into "Today", "Tomorrow", or formatted date
- `formatEventTime()`: Consistent 12-hour time formatting
- `formatEventDate()`: Short date format for card headers
- `isToday()`: Boolean check for today's events
- `isLive()`: Status checker for in_progress/halftime
- `getEventTimeLabel()`: Relative time labels ("LIVE", "2h", "Final", etc.)

**Performance:**
- Pure functions with no side effects
- Memoization-friendly for use in useMemo hooks
- Defensive date parsing with fallback formatting

## Screen Implementation

### events.tsx Refactor
Complete overhaul from ScrollView to SectionList:

**Data Grouping:**
- Events grouped by date using `getDateGroupKey()`
- useMemo hook prevents expensive re-grouping on every render
- Sections maintain chronological order

**Virtualization:**
- SectionList for proper list virtualization
- `maxToRenderPerBatch: 10` for smooth scrolling
- `windowSize: 10` balances memory vs. blank scroll
- `initialNumToRender: 8` for fast initial render
- `removeClippedSubviews: true` for memory efficiency

**Pull-to-Refresh:**
- RefreshControl with brand-colored tint (#6366f1)
- Proper `isRefetching` state prevents double-loading
- 30-second stale time balances freshness vs. requests

**State Handling:**
- Dedicated loading state with 4 skeleton cards
- Enhanced error state with clear messaging
- Context-aware empty state (shows filter in message)
- All states maintain SportFilter for continuity

**Performance:**
- Proper keyExtractor using event.id
- Sticky section headers for context while scrolling
- Footer padding prevents content hiding behind tab bar

## Design Principles Applied

### Visual Perfection
- Consistent 16px horizontal padding throughout
- 12px spacing between cards
- All touch targets ≥ 44pt
- Sport badges use 20% opacity overlay on primary color
- Shadows with proper elevation (2-4 elevation units)

### Animation Philosophy
- Entry animations: 400ms duration, staggered 50ms
- Pulse animations: 800ms for subtle, non-distracting rhythm
- Spring physics: tension 80, friction 10 for natural feel
- All animations use native driver for GPU acceleration

### Performance Obsession
- Zero layout shift from skeleton → real content
- Virtualized lists prevent memory bloat
- Memoized grouping logic prevents wasted CPU cycles
- Stale time prevents unnecessary network requests
- Proper key extraction prevents list reconciliation issues

### Thumb-Feel Excellence
- Odds buttons are full-width with generous padding
- Press states provide instant visual feedback
- Scale transforms create subtle "button press" sensation
- Disabled states are clearly communicated (40% opacity)

### Betting App Specific
- Live games are visually prominent (border, pulse, color)
- Odds are the primary CTA with largest touch targets
- Date grouping helps users quickly find today's games
- Quick filtering with 0-tap access to sport categories
- 30s stale time keeps odds relatively fresh

## File Structure
```
apps/mobile/src/
├── components/
│   └── events/
│       ├── EventCard.tsx          # Main event card with animations
│       ├── EventCardSkeleton.tsx  # Matching skeleton loader
│       ├── SportFilter.tsx        # Premium segmented control
│       ├── index.ts               # Barrel export
│       └── README.md              # This file
└── utils/
    └── date-helpers.ts            # Date formatting utilities
```

## Usage Example
```typescript
import { EventCard, EventCardSkeleton, SportFilter } from '@/components/events';
import { getDateGroupKey } from '@/utils/date-helpers';

// In your screen
const sections = useMemo(() => {
  return events.reduce((acc, event) => {
    const key = getDateGroupKey(event.scheduledAt);
    // ... grouping logic
  }, {});
}, [events]);

<SectionList
  sections={sections}
  renderItem={({ item, index }) => <EventCard event={item} index={index} />}
/>
```

## Type Safety
All components are fully TypeScript strict-mode compliant:
- No `any` types in component props
- Proper null checking on all optional fields
- Explicit type imports from @pick-rivals/shared-types
- Interface definitions for all component props

## Future Enhancements
- Haptic feedback on bet selection (requires expo-haptics)
- Real-time odds updates via WebSocket
- Optimistic bet placement animations
- Gesture-based filtering (swipe between sports)
- Deep link support to specific events

---

Built with obsessive attention to detail by the mobile-ui-engineer.
Every pixel, every millisecond matters in a betting app.
