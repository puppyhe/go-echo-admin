import type { WorkflowGraph } from '../types';
export interface GraphHistory {
  past: WorkflowGraph[];
  present: WorkflowGraph;
  future: WorkflowGraph[];
  group?: string;
}
export const GRAPH_HISTORY_STEPS = 50;
export const GRAPH_HISTORY_BYTES = 4 * 1024 * 1024;
export const graphEqual = (a: WorkflowGraph, b: WorkflowGraph) =>
  JSON.stringify(a) === JSON.stringify(b);
const clone = (graph: WorkflowGraph) => structuredClone(graph);
// Approximate retained JavaScript string storage conservatively as UTF-16 bytes.
const bytes = (graph: WorkflowGraph) => JSON.stringify(graph).length * 2;
function bounded(state: GraphHistory): GraphHistory {
  const past = state.past.slice(-GRAPH_HISTORY_STEPS),
    future = state.future.slice(0, GRAPH_HISTORY_STEPS);
  let used = [...past, state.present, ...future].reduce((sum, graph) => sum + bytes(graph), 0);
  while (used > GRAPH_HISTORY_BYTES && past.length) used -= bytes(past.shift()!);
  while (used > GRAPH_HISTORY_BYTES && future.length) used -= bytes(future.pop()!);
  return { ...state, past, future };
}
export const createGraphHistory = (graph: WorkflowGraph): GraphHistory => ({
  past: [],
  present: clone(graph),
  future: [],
});
export function recordGraph(
  state: GraphHistory,
  next: WorkflowGraph,
  group?: string,
): GraphHistory {
  if (graphEqual(state.present, next)) return state;
  return bounded({
    past: group && state.group === group ? state.past : [...state.past, clone(state.present)],
    present: clone(next),
    future: [],
    group,
  });
}
export const finishGraphGroup = (state: GraphHistory): GraphHistory => ({
  ...state,
  group: undefined,
});
export function undoGraph(state: GraphHistory): GraphHistory {
  if (!state.past.length) return state;
  return bounded({
    past: state.past.slice(0, -1),
    present: clone(state.past.at(-1)!),
    future: [clone(state.present), ...state.future],
  });
}
export function redoGraph(state: GraphHistory): GraphHistory {
  if (!state.future.length) return state;
  return bounded({
    past: [...state.past, clone(state.present)],
    present: clone(state.future[0]),
    future: state.future.slice(1),
  });
}
export function graphShortcut(
  event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean },
  editingText: boolean,
): 'undo' | 'redo' | undefined {
  if (editingText || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
}
