/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    // Top-level overrides: fully replace Tailwind defaults with RN-safe numeric values
    letterSpacing: {
      tighter: -0.8,
      tight: -0.4,
      normal: 0,
      wide: 0.8,
      wider: 1.6,
      widest: 2.4,
    },
    lineHeight: {
      none: 1,
      tight: 1.25,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2,
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      7: '28px',
      8: '32px',
      9: '36px',
      10: '40px',
    },
    extend: {
      colors: {
        // Multi-tone Gold System
        primary: {
          DEFAULT: '#D4AF37',      // Brushed Gold
          vibrant: '#FFD700',      // Vibrant Gold for CTAs
          depth: '#AA771C',        // Darker gold for depth
          light: '#FCF6BA',        // Highlight gold
        },
        // Backgrounds - Deeper Matte Black
        background: {
          DEFAULT: '#0A0A0A',      // Deepest matte black
          secondary: '#0D0D0D',    // Subtle layering
          tertiary: '#121212',     // For elevated containers
        },
        // Surfaces - Lighter than background
        surface: {
          DEFAULT: '#141414',      // Card backgrounds
          elevated: '#1A1A1A',     // Modals and overlays
          raised: '#1F1F1F',       // Floating elements
        },
        // Text Colors - Enhanced contrast
        text: {
          primary: '#FFFFFF',      // Pure white for maximum contrast
          secondary: '#A3A3A3',    // Neutral gray
          muted: '#666666',        // For hints and disabled
        },
        // Status Colors
        success: '#3FD08F',
        warning: '#F59E0B',
        error: '#FF5C6C',
        info: '#3b82f6',
        win: '#3FD08F',
        loss: '#FF5C6C',
        push: '#F59E0B',
        // Gold accent colors for direct use
        gold: {
          DEFAULT: '#D4AF37',
          brushed: '#D4AF37',
          vibrant: '#FFD700',
          depth: '#AA771C',
          light: '#FCF6BA',
        },
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',        // New default for cards
        '3xl': '24px',
        'full': '9999px',     // For pills
      },
      fontSize: {
        'hero': ['48px', { lineHeight: '56px', letterSpacing: -0.96 }],
        'display': ['36px', { lineHeight: '44px', letterSpacing: -0.36 }],
      },
      boxShadow: {
        'gold-glow': '0 0 20px rgba(212, 175, 55, 0.25)',
        'gold-glow-lg': '0 0 40px rgba(212, 175, 55, 0.35)',
        'card': '0 4px 12px rgba(0, 0, 0, 0.4)',
        'floating': '0 -4px 16px rgba(0, 0, 0, 0.25)',
      },
      spacing: {
        '18': 72,
        '22': 88,
      },
    },
  },
  plugins: [],
};
