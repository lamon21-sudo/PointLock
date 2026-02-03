/**
 * Premium SaaS Financial Dashboard Theme Constants
 * For use in StyleSheet where Tailwind classes are not applicable
 */

export const LUXURY_THEME = {
  // Backgrounds - Deeper Matte Black
  bg: {
    primary: '#0A0A0A',      // Deepest matte black
    secondary: '#0D0D0D',    // Subtle layering
    tertiary: '#121212',     // For elevated containers
  },
  // Surfaces - Lighter than background with clear hierarchy
  surface: {
    card: '#141414',         // Card backgrounds
    raised: '#1A1A1A',       // Modals and overlays
    elevated: '#1F1F1F',     // Floating elements
  },
  // Text Colors - Enhanced contrast
  text: {
    primary: '#FFFFFF',      // Pure white for maximum contrast
    secondary: '#A3A3A3',    // Neutral gray
    muted: '#666666',        // For hints and disabled
  },
  // Multi-tone Gold System
  gold: {
    brushed: '#D4AF37',      // Primary text/borders (Brushed Gold)
    vibrant: '#FFD700',      // CTA buttons (Vibrant Gold)
    main: '#D4AF37',         // Backwards compatibility alias
    depth: '#AA771C',        // Darker gold for depth
    light: '#FCF6BA',        // Highlight gold
    glow: 'rgba(212, 175, 55, 0.15)',
    border: 'rgba(212, 175, 55, 0.10)', // 10% opacity border
  },
  // Status Colors
  status: {
    success: '#3FD08F',      // Mint green
    error: '#FF5C6C',        // Soft red
    warning: '#F59E0B',      // Amber
    info: '#3b82f6',         // Blue
  },
  // Risk level colors for pick cards
  risk: {
    favorite: '#3FD08F',     // Mint green (same as status.success)
    underdog: '#A78BFA',     // Purple (Tailwind violet-400)
    extreme: '#FF5C6C',      // Soft red (same as status.error)
  },
  // Borders
  border: {
    subtle: 'rgba(212, 175, 55, 0.10)',  // 10% gold for card borders
    muted: 'rgba(255, 255, 255, 0.08)',  // Neutral border
    gold: 'rgba(212, 175, 55, 0.25)',    // More visible gold border
  },
  // Spacing constants for consistency
  spacing: {
    cardPadding: 24,
    borderRadius: 20,
    borderRadiusPill: 9999,
    sectionMargin: 32,
    cardGap: 16,
  },
} as const;

// Gradient presets for LinearGradient
export const GRADIENTS = {
  // Metallic gold gradient - mimics real metal light reflection
  metallicGold: ['#BF953F', '#FCF6BA', '#B38728', '#FBF5B7', '#AA771C'] as const,
  // Standard gold gradients
  goldButton: ['#AA771C', '#D4AF37'] as const,
  goldButtonHover: ['#D4AF37', '#FCF6BA'] as const,
  vibrantGold: ['#FFD700', '#D4AF37'] as const,
  // Glass card gradients
  glassCard: ['#141414', '#0D0D0D'] as const,
  glassCardElevated: ['#1A1A1A', '#141414'] as const,
} as const;

// Shadow presets
export const SHADOWS = {
  goldGlow: {
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  goldGlowSubtle: {
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
} as const;

// Type exports for TypeScript
export type LuxuryTheme = typeof LUXURY_THEME;
export type Gradients = typeof GRADIENTS;
export type Shadows = typeof SHADOWS;
