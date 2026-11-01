// The Plan pages: what-if simulators that start from your real numbers and never change them.
// App.vue maps each id to its view and lists them in the nav's Plan section; each simulator page
// wraps itself in components/SimulatorShell.vue. To add one (home buying is next on the todo list),
// add it here, map its view in App.vue, and build its inputs with useScenario (lib/scenario.ts).

export interface SimulatorInfo {
  id: string
  label: string
  icon: string
  /** one line for the page header */
  blurb: string
}

export const SIMULATORS: SimulatorInfo[] = [
  {
    id: 'retirement',
    label: 'Retirement',
    icon: 'pi pi-sun',
    blurb: 'When you could retire, and how your money holds up after.'
  }
]

export const isSimulator = (id: string): boolean => SIMULATORS.some((simulator) => simulator.id === id)
