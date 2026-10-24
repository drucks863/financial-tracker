<script setup>
// Thin Chart.js wrapper. `build(dark, chrome)` returns a full Chart.js config, so
// each chart re-themes itself when the color scheme flips.
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import Chart from 'chart.js/auto'
import { isDark } from '../lib/theme-mode'
import { chrome } from '../lib/chart-colors'
import { money } from '../lib/format'

const props = defineProps({
  build: { type: Function, required: true },
  height: { type: String, default: '240px' },
  label: { type: String, required: true }
})

const FONT = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
const canvas = ref(null)
let chart = null

function baseOptions(c) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 4, right: 4 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.surface,
        titleColor: c.ink,
        bodyColor: c.ink2,
        borderColor: c.axis,
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
        titleFont: { family: FONT, weight: '600' },
        bodyFont: { family: FONT },
        callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${money(ctx.parsed.y ?? ctx.parsed)}` }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: c.axis },
        ticks: { color: c.muted, font: { family: FONT, size: 11 }, maxRotation: 0, autoSkipPadding: 8 }
      },
      y: {
        grid: { color: c.grid },
        border: { display: false },
        ticks: { color: c.muted, font: { family: FONT, size: 11 }, maxTicksLimit: 5, callback: (v) => compactTick(v) }
      }
    }
  }
}

function compactTick(v) {
  const a = Math.abs(v)
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a % 1000 === 0 ? 0 : 1)}k` : `$${a}`
  return v < 0 ? `−${s}` : s
}

function merge(base, extra) {
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null) merge(base[k], v)
    else base[k] = v
  }
  return base
}

function render() {
  if (!canvas.value) return
  const c = chrome(isDark.value)
  const cfg = props.build(isDark.value, c)
  cfg.options = merge(baseOptions(c), cfg.options || {})
  if (cfg.type === 'doughnut') delete cfg.options.scales
  if (chart) chart.destroy()
  chart = new Chart(canvas.value, cfg)
}

onMounted(render)
watch([isDark, () => props.build], render)
onBeforeUnmount(() => chart?.destroy())
defineExpose({ render })
</script>

<template>
  <div class="chart-box" :style="{ height }">
    <canvas ref="canvas" role="img" :aria-label="label"></canvas>
  </div>
</template>

<style scoped>
.chart-box {
  position: relative;
  width: 100%;
  min-width: 0;
}
</style>
