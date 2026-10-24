import type { ChartConfiguration } from 'chart.js'
import type { ChartChrome } from './chart-colors'

/**
 * Builds a full Chart.js config for the current color scheme. BaseChart calls it again
 * whenever light/dark flips or the builder itself changes (i.e. its data changed).
 */
export type ChartBuilder = (dark: boolean, c: ChartChrome) => ChartConfiguration
