import { ref } from 'vue'

// True while the dark palette is showing. Charts watch this to recolor.
export const isDark = ref(false)

// Dark when <html data-theme="dark">, light when data-theme="light",
// otherwise follow the OS. PrimeVue reads the `.app-dark` class.
export function syncDarkMode(): void {
  const root = document.documentElement
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const t = root.getAttribute('data-theme')
    const dark = t === 'dark' || (t !== 'light' && mq.matches)
    root.classList.toggle('app-dark', dark)
    isDark.value = dark
  }
  apply()
  mq.addEventListener('change', apply)
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
}
