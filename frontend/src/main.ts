import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import 'primeicons/primeicons.css'
import './style.css'
import { FinancePreset } from './theme'
import { syncDarkMode } from './lib/theme-mode'
import { initStore } from './store/finance'

syncDarkMode()

// Load data from the API (when it's running) before the app, so screens start on the right month.
await initStore()
const { default: App } = await import('./App.vue')

createApp(App)
  .use(PrimeVue, { theme: { preset: FinancePreset, options: { darkModeSelector: '.app-dark', cssLayer: false } } })
  .use(ToastService)
  .mount('#app')
