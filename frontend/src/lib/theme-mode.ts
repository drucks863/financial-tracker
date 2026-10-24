import { ref } from 'vue'

// True while the dark palette is showing. Charts watch this to recolor.
export const isDark = ref(true)

// Dark unless <html data-theme="light"> asks for light. PrimeVue reads the `.app-dark` class.
export function syncDarkMode(): void {
  const root = document.documentElement
  const apply = () => {
    const dark = root.getAttribute('data-theme') !== 'light'
    root.classList.toggle('app-dark', dark)
    isDark.value = dark
  }
  apply()
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
}
