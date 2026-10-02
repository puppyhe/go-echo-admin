import { useState } from 'react';
import { Descriptions, Typography } from 'antd';
import type { GraphEdgeRun, GraphNodeRun, WorkflowGraph } from '../types';
import { operatorLabels } from '../model';
import { GraphCanvas } from './GraphCanvas';
import { nodeLabels, runLabels } from './graphModel';

export function GraphSnapshotView({
  graph,
  nodeRuns,
  edgeRuns,
}: {
  graph: WorkflowGraph;
  nodeRuns?: GraphNodeRun[];
  edgeRuns?: GraphEdgeRun[];
}) {
  const [selected, setSelected] = useState<string>();
  const node = graph.nodes.find((item) => item.id === selected);
  const edge = graph.edges.find((item) => item.id === selected);
  const run = nodeRuns?.find((item) => item.nodeId === selected);
  return (
    <>
      <Typography.Paragraph type="secondary">
        Select a node to inspect its configuration.
        {nodeRuns ? 'Run details include status, approval results, and errors.' : ''}
      </Typography.Paragraph>
      <GraphCanvas
        graph={graph}
        selected={selected}
        onSelect={setSelected}
        nodeRuns={nodeRuns}
        edgeRuns={edgeRuns}
      />
      {node && (
        <Descriptions
          bordered
          size="small"
          column={2}
          style={{ marginTop: 16 }}
          items={[
            { label: 'node', children: node.name },
            { label: 'type', children: nodeLabels[node.type] },
            ...(run
              ? [
                  {
                    label: 'status',
                    children: `${runLabels[run.status] ?? run.status}${run.outcome ? ` (${run.outcome})` : ''}`,
                  },
                ]
              : []),
            ...(node.type === 'approval'
              ? [
                  { label: 'Approval mode', children: node.mode === 'all' ? 'All approvers' : 'Any approver' },
                  { label: 'Approver IDs', children: node.approverIds?.join('、') || 'Not configured' },
                ]
              : []),
            ...(node.condition
              ? [
                  {
                    label: 'Condition',
                    children: `${node.condition.field} ${operatorLabels[node.condition.operator]} ${JSON.stringify(node.condition.value)}`,
                    span: 2,
                  },
                ]
              : []),
          ]}
        />
      )}
      {edge && (
        <Typography.Paragraph style={{ marginTop: 16 }}>
          {graph.nodes.find((n) => n.id === edge.source)?.name} →{' '}
          {graph.nodes.find((n) => n.id === edge.target)?.name}
          {edge.branch ? ` · ${edge.branch === 'true' ? 'Yes' : 'No'}` : ''}
        </Typography.Paragraph>
      )}
    </>
  );
}
