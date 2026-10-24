<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Toast from 'primevue/toast'
import EntryDialog from './components/EntryDialog.vue'
import OverviewView from './views/OverviewView.vue'
import CashFlowView from './views/CashFlowView.vue'
import TrendsView from './views/TrendsView.vue'
import NetWorthView from './views/NetWorthView.vue'
import PlanView from './views/PlanView.vue'
import { isSampleData, state } from './store/finance'
import { ui, isProfileTab } from './store/ui'

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: 'pi pi-home', component: OverviewView },
  { id: 'cashflow', label: 'Cash flow', icon: 'pi pi-list', component: CashFlowView },
  { id: 'networth', label: 'Net worth', icon: 'pi pi-chart-line', component: NetWorthView },
  { id: 'trends', label: 'Trends', icon: 'pi pi-chart-bar', component: TrendsView },
  // opened from the avatar, not listed in the nav
  { id: 'plan', label: 'Financial profile', icon: 'pi pi-calculator', component: PlanView, hidden: true }
]

const NAV = VIEWS.filter((v) => !('hidden' in v))
const me = computed(() => {
  const name = (state.plan?.name || '').trim()
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return { name, initials }
})

const current = ref('overview')
const view = computed(() => VIEWS.find((v) => v.id === current.value) || VIEWS[0])

// Routes are view ids; the profile also takes a tab ("plan/categories").
// "#data" is the old Data page, now the profile's Import & export tab.
function route(h: string): boolean {
  if (h === 'data') h = 'plan/files'
  const [id, tab] = h.split('/')
  if (!VIEWS.some((v) => v.id === id)) return false
  current.value = id
  if (id === 'plan') ui.profileTab = tab && isProfileTab(tab) ? tab : 'plan'
  return true
}

function go(h: string): void {
  if (!route(h)) return
  const hash = current.value === 'plan' && ui.profileTab !== 'plan' ? `plan/${ui.profileTab}` : current.value
  try {
    history.replaceState(null, '', `#${hash}`)
  } catch {
    /* sandboxed */
  }
  window.scrollTo({ top: 0 })
}

function fromHash() {
  route(location.hash.slice(1))
}
onMounted(() => {
  fromHash()
  window.addEventListener('hashchange', fromHash)
})
</script>

<template>
  <div class="shell">
    <nav class="rail" aria-label="Main">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">$</span>
        <span class="brand-name">Financial Tracker</span>
      </div>
      <button
        v-for="v in NAV"
        :key="v.id"
        type="button"
        class="nav-item"
        :aria-label="v.label"
        :aria-current="current === v.id ? 'page' : undefined"
        @click="go(v.id)"
      >
        <i :class="v.icon" aria-hidden="true"></i>
        <span class="full">{{ v.label }}</span>
      </button>
      <button type="button" class="me" :aria-current="current === 'plan' ? 'page' : undefined" :aria-label="`${me.name || 'You'}: financial profile`" @click="go('plan')">
        <span class="avatar" aria-hidden="true">
          <template v-if="me.initials">{{ me.initials }}</template>
          <i v-else class="pi pi-user"></i>
        </span>
        <span class="me-text">
          <span class="me-name">{{ me.name || 'You' }}</span>
          <span class="me-sub">Financial profile</span>
        </span>
      </button>
    </nav>

    <main class="main">
      <p v-if="isSampleData" class="sample-note">Showing made-up sample data. Import your sheets from your profile (avatar, then Import &amp; export), or add <code>src/data/seed.local.json</code>.</p>
      <component :is="view.component" @navigate="go" />
    </main>

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
  padding-block: 16px calc(var(--nav-h) + 24px + env(safe-area-inset-bottom, 0px));
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
.brand {
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

/* Avatar: opens the financial profile. A tab on phones, the bottom-left corner of the rail on desktop. */
.me {
  flex: 1;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 3px;
  height: var(--nav-h);
  border: 0;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.6875rem;
  font-weight: 500;
  cursor: pointer;
}
.avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.avatar .pi {
  font-size: 0.7rem;
}
.me[aria-current='page'] {
  color: var(--accent);
}
.me[aria-current='page'] .avatar {
  border-color: var(--accent);
}
.me-sub {
  display: none;
}
.nav-item {
  white-space: nowrap;
}
/* Desktop: narrow left rail with icon + label rows. The Data screen sits at the bottom like settings. */
@media (min-width: 960px) {
  .shell {
    display: grid;
    grid-template-columns: 208px minmax(0, 1fr);
  }
  .rail {
    position: sticky;
    top: 0;
    height: 100vh;
    flex-direction: column;
    justify-content: flex-start;
    gap: 2px;
    border-top: 0;
    border-right: 1px solid var(--line);
    padding: 16px 12px 22px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 6px 14px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--line);
    font-weight: 600;
    font-size: 0.9375rem;
    order: -2;
  }
  .brand-mark {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--accent);
    color: var(--p-primary-contrast-color, #fff);
    font-weight: 700;
  }
  .nav-item {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .nav-item .pi {
    font-size: 1rem;
    width: 18px;
    text-align: center;
  }
  .nav-item:hover {
    background: var(--panel-2);
    color: var(--ink);
  }
  .nav-item[aria-current='page'] {
    background: var(--panel-2);
    color: var(--ink);
    font-weight: 600;
  }
  .nav-item[aria-current='page'] .pi {
    color: var(--accent);
  }
  .me {
    flex: none;
    display: flex;
    align-items: center;
    justify-items: start;
    gap: 10px;
    height: auto;
    margin-top: auto;
    padding: 14px 8px 10px;
    border-top: 1px solid var(--line);
    border-radius: 0;
    text-align: left;
    color: var(--ink);
    font-size: 0.875rem;
  }
  .me:hover .avatar {
    border-color: var(--muted);
  }
  .avatar {
    width: 34px;
    height: 34px;
    font-size: 0.8125rem;
  }
  .me-text {
    display: grid;
    min-width: 0;
  }
  .me-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .me-sub {
    display: block;
    font-size: 0.75rem;
    color: var(--muted);
    font-weight: 400;
  }
  .me[aria-current='page'] .me-sub {
    color: var(--accent);
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
