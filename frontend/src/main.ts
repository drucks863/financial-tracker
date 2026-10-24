import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import 'primeicons/primeicons.css'
import './style.css'
import App from './App.vue'
import { FinancePreset } from './theme'
import { syncDarkMode } from './lib/theme-mode'

syncDarkMode()

createApp(App)
  .use(PrimeVue, { theme: { preset: FinancePreset, options: { darkModeSelector: '.app-dark', cssLayer: false } } })
  .use(ToastService)
  .mount('#app')
