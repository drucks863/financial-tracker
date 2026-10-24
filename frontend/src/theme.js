import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

// Aura with a spruce (blue-green) primary and slate surfaces.
// Dark mode is driven by the `.app-dark` class on <html>, which main.js keeps in
// sync with the OS setting and any explicit data-theme attribute.
const ramp = (name) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `{${name}.${s}}`]))

export const FinancePreset = definePreset(Aura, {
  semantic: {
    primary: ramp('cyan'),
    colorScheme: {
      light: {
        primary: { color: '{cyan.700}', contrastColor: '#ffffff', hoverColor: '{cyan.800}', activeColor: '{cyan.900}' },
        surface: { 0: '#ffffff', ...ramp('slate') },
        highlight: { background: '{cyan.50}', focusBackground: '{cyan.100}', color: '{cyan.800}', focusColor: '{cyan.900}' }
      },
      dark: {
        primary: { color: '{cyan.400}', contrastColor: '{slate.950}', hoverColor: '{cyan.300}', activeColor: '{cyan.200}' },
        surface: { 0: '#ffffff', ...ramp('slate') },
        highlight: {
          background: 'color-mix(in srgb, {cyan.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {cyan.400}, transparent 76%)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)'
        }
      }
    }
  }
})
