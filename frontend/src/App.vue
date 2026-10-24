<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Toast from 'primevue/toast'
import Button from 'primevue/button'
import EntryDialog from './components/EntryDialog.vue'
import OverviewView from './views/OverviewView.vue'
import CashFlowView from './views/CashFlowView.vue'
import TrendsView from './views/TrendsView.vue'
import NetWorthView from './views/NetWorthView.vue'
import SettingsView from './views/SettingsView.vue'
import { openEntry } from './store/ui'
import { isSampleData } from './store/finance'

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: 'pi pi-home', component: OverviewView },
  { id: 'cashflow', label: 'Cash flow', icon: 'pi pi-list', component: CashFlowView },
  { id: 'trends', label: 'Trends', icon: 'pi pi-chart-bar', component: TrendsView },
  { id: 'networth', label: 'Net worth', icon: 'pi pi-chart-line', component: NetWorthView },
  { id: 'data', label: 'Data', icon: 'pi pi-sliders-h', component: SettingsView }
]

const current = ref('overview')
const view = computed(() => VIEWS.find((v) => v.id === current.value) || VIEWS[0])

function go(id: string): void {
  current.value = id
  try {
    history.replaceState(null, '', `#${id}`)
  } catch {
    /* sandboxed */
  }
  window.scrollTo({ top: 0 })
}

function fromHash() {
  const h = location.hash.slice(1)
  if (VIEWS.some((v) => v.id === h)) current.value = h
}
onMounted(() => {
  fromHash()
  window.addEventListener('hashchange', fromHash)
})
</script>

<template>
  <div class="shell">
    <nav class="rail" aria-label="Main">
      <div class="brand" title="Financial Tracker">
        <span class="brand-mark" aria-hidden="true">$</span>
        <span class="sr-only">Financial Tracker</span>
      </div>
      <button
        v-for="v in VIEWS"
        :key="v.id"
        type="button"
        class="nav-item"
        :class="{ end: v.id === 'data' }"
        :title="v.label"
        :aria-current="current === v.id ? 'page' : undefined"
        @click="go(v.id)"
      >
        <i :class="v.icon" aria-hidden="true"></i>
        <span>{{ v.label }}</span>
      </button>
      <button type="button" class="rail-add" title="Add entry" aria-label="Add entry" @click="openEntry()"><i class="pi pi-plus" aria-hidden="true"></i></button>
    </nav>

    <main class="main">
      <p v-if="isSampleData" class="sample-note">Showing made-up sample data. Import your sheets from the Data tab, or add <code>src/data/seed.local.json</code>.</p>
      <component :is="view.component" @navigate="go" />
    </main>

    <Button class="fab" icon="pi pi-plus" rounded aria-label="Add entry" @click="openEntry()" />
    <EntryDialog />
    <Toast position="top-center" />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100%;
}
.main {
  max-width: 1180px;
  margin: 0 auto;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 16px calc(var(--nav-h) + 88px + env(safe-area-inset-bottom, 0px));
}

.sample-note {
  margin: 0 0 16px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--ink-2);
  font-size: 0.8125rem;
}

/* Mobile: bottom tab bar */
.rail {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  justify-content: space-around;
  background: var(--panel);
  border-top: 1px solid var(--line);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: max(4px, env(safe-area-inset-left, 0px));
  padding-right: max(4px, env(safe-area-inset-right, 0px));
}
.brand,
.rail-add {
  display: none;
}
.nav-item {
  flex: 1;
  display: grid;
  justify-items: center;
  gap: 3px;
  height: var(--nav-h);
  align-content: center;
  border: 0;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.6875rem;
  font-weight: 500;
  cursor: pointer;
}
.nav-item .pi {
  font-size: 1.15rem;
}
.nav-item[aria-current='page'] {
  color: var(--accent);
}
.fab {
  position: fixed;
  right: calc(16px + env(safe-area-inset-right, 0px));
  bottom: calc(var(--nav-h) + 16px + env(safe-area-inset-bottom, 0px));
  z-index: 21;
  width: 56px !important;
  height: 56px !important;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent);
}

/* Desktop: slim icon rail. Labels show as tooltips; the Data screen sits at the bottom like a settings gear. */
@media (min-width: 960px) {
  .shell {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
  }
  .rail {
    position: sticky;
    top: 0;
    height: 100vh;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    gap: 6px;
    border-top: 0;
    border-right: 1px solid var(--line);
    padding: 16px 0;
  }
  .brand {
    display: grid;
    place-items: center;
    padding-bottom: 14px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--line);
    order: -2;
  }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--accent);
    color: var(--p-primary-contrast-color, #fff);
    font-weight: 700;
  }
  .nav-item,
  .rail-add {
    flex: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border-radius: 12px;
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .nav-item span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .nav-item .pi,
  .rail-add .pi {
    font-size: 1.15rem;
  }
  .nav-item:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  .nav-item[aria-current='page'] {
    background: var(--panel-2);
    color: var(--accent);
  }
  .nav-item.end {
    margin-top: auto;
  }
  .rail-add {
    order: -1;
    margin-bottom: 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    color: var(--accent);
  }
  .rail-add:hover {
    background: var(--accent-soft);
  }
  .fab {
    display: none;
  }
  .main {
    max-width: 1320px;
    padding-block: 24px 48px;
    padding-left: 28px;
    padding-right: 28px;
    width: 100%;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
