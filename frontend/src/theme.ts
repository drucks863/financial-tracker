import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

// Aura re-skinned as a ledger: warm graphite surfaces (no blue cast) and a brass primary.
// The app is dark by default; light only applies when the viewer explicitly picks it
// (`.app-dark` on <html> is managed by lib/theme-mode.ts).

const graphite = {
  0: '#ffffff',
  50: '#f6f5f2',
  100: '#eceae5',
  200: '#dcd9d1',
  300: '#c3bfb4',
  400: '#9d988c',
  500: '#7b766b',
  600: '#5f5b52',
  700: '#46433d',
  800: '#2f2d29',
  900: '#211f1c',
  950: '#171614'
}

const brass = {
  50: '#fbf6ea',
  100: '#f4e7c6',
  200: '#e9d08f',
  300: '#ddb862',
  400: '#d4a443',
  500: '#bf8c2c',
  600: '#a07222',
  700: '#7f591d',
  800: '#66481c',
  900: '#553c1b',
  950: '#30200b'
}

export const FinancePreset = definePreset(Aura, {
  primitive: { graphite, brass },
  semantic: {
    primary: brass,
    colorScheme: {
      light: {
        primary: { color: '{brass.700}', contrastColor: '#ffffff', hoverColor: '{brass.800}', activeColor: '{brass.900}' },
        surface: graphite,
        highlight: { background: '{brass.50}', focusBackground: '{brass.100}', color: '{brass.800}', focusColor: '{brass.900}' }
      },
      dark: {
        primary: { color: '{brass.400}', contrastColor: '{graphite.950}', hoverColor: '{brass.300}', activeColor: '{brass.200}' },
        surface: graphite,
        highlight: {
          background: 'color-mix(in srgb, {brass.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {brass.400}, transparent 76%)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)'
        }
      }
    }
  }
})
