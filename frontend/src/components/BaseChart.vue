<script setup lang="ts">
// Thin Chart.js wrapper. `build(dark, chrome)` returns a full Chart.js config, so
// each chart re-themes itself when the color scheme flips.
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import Chart from 'chart.js/auto'
import type { ChartOptions, TooltipItem } from 'chart.js'
import { isDark } from '../lib/theme-mode'
import { chrome, type ChartChrome } from '../lib/chart-colors'
import type { ChartBuilder } from '../lib/chart-types'
import { money } from '../lib/format'

const props = withDefaults(defineProps<{ build: ChartBuilder; label: string; height?: string }>(), { height: '240px' })

const FONT = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function baseOptions(c: ChartChrome): ChartOptions {
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
        titleFont: { family: FONT, weight: 600 },
        bodyFont: { family: FONT },
        callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${ctx.dataset.label}: ${money(typeof ctx.parsed === 'number' ? ctx.parsed : ctx.parsed.y)}` }
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
        ticks: { color: c.muted, font: { family: FONT, size: 11 }, maxTicksLimit: 5, callback: (v) => compactTick(Number(v)) }
      }
    }
  }
}

function compactTick(v: number): string {
  const a = Math.abs(v)
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a % 1000 === 0 ? 0 : 1)}k` : `$${a}`
  return v < 0 ? `−${s}` : s
}

type Plain = Record<string, unknown>
const isPlain = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v)

// Deep-merges a chart's own options over the shared defaults.
function merge(base: Plain, extra: Plain): Plain {
  for (const [k, v] of Object.entries(extra)) {
    const b = base[k]
    if (isPlain(v) && isPlain(b)) merge(b, v)
    else base[k] = v
  }
  return base
}

function render() {
  if (!canvas.value) return
  const c = chrome(isDark.value)
  const cfg = props.build(isDark.value, c)
  const options = merge(baseOptions(c) as Plain, (cfg.options ?? {}) as Plain)
  if (cfg.type === 'doughnut') delete options.scales
  cfg.options = options
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
