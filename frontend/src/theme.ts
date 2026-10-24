import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

// Aura re-skinned as a command center: near-black neutral surfaces (no blue cast) and a
// monochrome silver primary.
// The app is dark by default; light only applies when the viewer explicitly picks it
// (`.app-dark` on <html> is managed by lib/theme-mode.ts).

const graphite = {
  0: '#ffffff',
  50: '#f7f7f6',
  100: '#efefed',
  200: '#e0e0dd',
  300: '#c8c8c4',
  400: '#a0a09b',
  500: '#787873',
  600: '#5a5a56',
  700: '#3a3a37',
  800: '#262624',
  900: '#161615',
  950: '#0c0c0b'
}

// Accent is monochrome: soft silver on dark (not stark white), near-black on light.
const silver = {
  50: '#fafaf9',
  100: '#f2f2f0',
  200: '#e6e5e1',
  300: '#d6d5d0',
  400: '#bdbcb6',
  500: '#9c9b95',
  600: '#787873',
  700: '#55554f',
  800: '#3a3a37',
  900: '#262624',
  950: '#161615'
}

export const FinancePreset = definePreset(Aura, {
  primitive: { graphite, silver },
  semantic: {
    primary: silver,
    colorScheme: {
      light: {
        primary: { color: '{silver.900}', contrastColor: '#ffffff', hoverColor: '{silver.800}', activeColor: '{silver.700}' },
        surface: graphite,
        highlight: { background: '{silver.100}', focusBackground: '{silver.200}', color: '{silver.950}', focusColor: '{silver.950}' }
      },
      dark: {
        primary: { color: '{silver.300}', contrastColor: '{graphite.950}', hoverColor: '{silver.200}', activeColor: '{silver.100}' },
        surface: graphite,
        highlight: {
          background: 'color-mix(in srgb, {silver.300}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {silver.300}, transparent 76%)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)'
        }
      }
    }
  }
})
