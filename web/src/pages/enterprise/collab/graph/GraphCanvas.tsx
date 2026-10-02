import { useId, useRef } from 'react';
import type { GraphEdgeRun, GraphNodeRun, WorkflowGraph } from '../types';
import { nodeLabels, runLabels } from './graphModel';
import './graph.css';

const colors: Record<string, string> = {
  pending: '#1677ff',
  waiting: '#d48806',
  completed: '#389e0d',
  failed: '#cf1322',
  cancelled: '#8c8c8c',
  skipped: '#bfbfbf',
};
interface Props {
  graph: WorkflowGraph;
  selected?: string;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onMoveStart?: (id: string) => void;
  onMoveEnd?: (id: string, cancelled: boolean) => void;
  connecting?: boolean;
  nodeRuns?: GraphNodeRun[];
  edgeRuns?: GraphEdgeRun[];
}
export function GraphCanvas({
  graph,
  selected,
  onSelect,
  onMove,
  onMoveStart,
  onMoveEnd,
  connecting,
  nodeRuns,
  edgeRuns,
}: Props) {
  const marker = `arrow-${useId().replaceAll(':', '')}`;
  const drag = useRef<{
    id: string;
    pointerID: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
  }>();
  const endDrag = (pointerID: number, cancelled: boolean) => {
    if (!drag.current || drag.current.pointerID !== pointerID) return;
    const id = drag.current.id;
    drag.current = undefined;
    onMoveEnd?.(id, cancelled);
  };
  const width = Math.max(850, ...graph.nodes.map((n) => n.x + 240));
  const height = Math.max(440, ...graph.nodes.map((n) => n.y + 150));
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  return (
    <div className="workflow-graph-scroll" aria-label="工作流图">
      <svg
        width={width}
        height={height}
        className="workflow-graph-canvas"
        role="group"
        aria-label="工作流节点图"
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        {graph.edges.map((edge) => {
          const source = nodes.get(edge.source),
            target = nodes.get(edge.target);
          if (!source || !target) return null;
          const x1 = source.x + 80,
            y1 = source.y + 64,
            x2 = target.x + 80,
            y2 = target.y;
          const bend = Math.max(35, Math.abs(y2 - y1) / 2);
          const d = `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
          const state = edgeRuns?.find((run) => run.edgeId === edge.id)?.status;
          const stroke =
            selected === edge.id
              ? '#722ed1'
              : state === 'arrived'
                ? '#389e0d'
                : state === 'skipped'
                  ? '#bfbfbf'
                  : '#8c9db3';
          return (
            <g
              key={edge.id}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`从 ${source.name} 到 ${target.name}${edge.branch ? ` · ${edge.branch === 'true' ? '是' : '否'}` : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelect?.(edge.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect?.(edge.id);
                }
              }}
            >
              <path d={d} fill="none" stroke="transparent" strokeWidth="18" />
              <path
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={selected === edge.id ? 3 : 2}
                strokeDasharray={state === 'skipped' ? '6 5' : undefined}
                markerEnd={`url(#${marker})`}
              />
              {edge.branch && (
                <text
                  x={(x1 + x2) / 2 + 10}
                  y={(y1 + y2) / 2}
                  fill={stroke}
                  fontSize="12"
                  stroke="white"
                  strokeWidth="4"
                  paintOrder="stroke"
                >
                  {edge.branch === 'true' ? '是' : '否'}
                </text>
              )}
            </g>
          );
        })}
        {graph.nodes.map((node) => {
          const state = nodeRuns?.find((run) => run.nodeId === node.id);
          const color =
            selected === node.id
              ? '#722ed1'
              : (colors[state?.status ?? ''] ?? (node.type === 'failure' ? '#cf1322' : '#35547a'));
          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${nodeLabels[node.type]}：${node.name}${state ? `，${runLabels[state.status] ?? state.status}` : ''}`}
              className={onMove && !connecting ? 'workflow-graph-draggable' : ''}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect?.(node.id);
                if (onMove && !connecting && event.button === 0 && !drag.current) {
                  drag.current = {
                    id: node.id,
                    pointerID: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    originX: node.x,
                    originY: node.y,
                  };
                  onMoveStart?.(node.id);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
              }}
              onPointerMove={(event) => {
                const current = drag.current;
                if (current?.id === node.id && current.pointerID === event.pointerId)
                  onMove?.(
                    node.id,
                    current.originX + event.clientX - current.x,
                    current.originY + event.clientY - current.y,
                  );
              }}
              onPointerUp={(event) => {
                endDrag(event.pointerId, false);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => endDrag(event.pointerId, true)}
              onLostPointerCapture={(event) => endDrag(event.pointerId, true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect?.(node.id);
                }
              }}
            >
              <title>
                {node.name} · {node.id}
                {state ? ` · ${runLabels[state.status] ?? state.status}` : ''}
              </title>
              {node.type === 'decision' ? (
                <polygon
                  points="80,-8 170,32 80,72 -10,32"
                  fill="white"
                  stroke={color}
                  strokeWidth="2"
                />
              ) : (
                <rect
                  width="160"
                  height="64"
                  rx={['start', 'success', 'failure'].includes(node.type) ? 32 : 8}
                  fill="white"
                  stroke={color}
                  strokeWidth="2"
                />
              )}
              {(node.type === 'fork' || node.type === 'join') && (
                <rect x="10" y="8" width="140" height="4" rx="2" fill={color} />
              )}
              <text x="80" y="29" textAnchor="middle" fill={color} fontSize="13" fontWeight="600">
                {node.name.length > 12 ? `${node.name.slice(0, 11)}…` : node.name || '未命名'}
              </text>
              <text x="80" y="49" textAnchor="middle" fill="#68788d" fontSize="11">
                {state ? (runLabels[state.status] ?? state.status) : nodeLabels[node.type]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
