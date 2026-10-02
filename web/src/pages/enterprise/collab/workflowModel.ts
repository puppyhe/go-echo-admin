import type { CheckupIssue, Workflow, WorkflowInput } from './types';

/** Preserve the current revision and authorizations when changing one workflow setting. */
export function workflowDraft(value: Workflow): WorkflowInput {
  return {
    name: value.name,
    code: value.code,
    category: value.category,
    enabled: value.enabled,
    description: value.description,
    formId: value.formId,
    businessType: value.businessType,
    steps: value.steps,
    executionMode: value.executionMode,
    graph: value.graph,
    sharedRoleIds: value.sharedRoleIds,
    status: 'draft',
    revision: value.revision,
  };
}
export function draftVersionLabel(value: Pick<Workflow, 'status' | 'version'>): string {
  return value.status === 'draft' ? `v${(value.version ?? 0) + 1}` : '—';
}
export interface CheckupFilters {
  scope: 'definition' | 'runtime';
  keyword?: string;
  severity?: string;
  code?: string;
  workflowId?: number;
}
export function filterCheckupIssues(
  issues: CheckupIssue[],
  filters: CheckupFilters,
): CheckupIssue[] {
  const term = filters.keyword?.trim().toLocaleLowerCase() ?? '';
  return issues.filter(
    (issue) =>
      issue.scope === filters.scope &&
      (!filters.severity || issue.severity === filters.severity) &&
      (!filters.code || issue.code === filters.code) &&
      (!filters.workflowId || issue.workflowId === filters.workflowId) &&
      (!term ||
        `${issue.message} ${issue.workflowName} ${issue.code} ${issue.stepId ?? ''}`
          .toLocaleLowerCase()
          .includes(term)),
  );
}

export async function persistWorkflow(
  api: {
    saveWorkflow: (input: WorkflowInput, id?: number) => Promise<Workflow>;
    publishWorkflow: (id: number, revision: number) => Promise<Workflow>;
  },
  input: WorkflowInput,
  id: number | undefined,
  publish: boolean,
  onDraftSaved: (value: Workflow) => void,
): Promise<Workflow> {
  const saved = await api.saveWorkflow({ ...input, status: 'draft' }, id);
  onDraftSaved(saved);
  return publish ? api.publishWorkflow(saved.id, saved.revision) : saved;
}

export const checkupLabels: Record<string, string> = {
  graph_missing: 'message',
  graph_size: 'configurationmessage',
  graph_limits: 'message',
  graph_empty: 'Message node',
  graph_node_id: 'nodemessage',
  graph_duplicate_node: 'nodeduplicate',
  graph_node_name: 'nodenamemessage',
  graph_position: 'nodemessage',
  graph_approval_mode: 'approvalmessage',
  graph_approver_unavailable: 'approvalmessage',
  graph_condition: 'message',
  graph_node_type: 'nodetypemessage',
  graph_edge_id: 'message',
  graph_dangling_edge: 'message',
  graph_cycle: 'message',
  graph_duplicate_edge: 'duplicate',
  graph_edge_branch: 'message',
  graph_start: 'Message history',
  graph_degree: 'nodemessage',
  graph_join_degree: 'message',
  graph_decision_branches: 'message',
  graph_fork_degree: 'message',
  graph_terminal_edge: 'Message history',
  graph_unreachable: 'nodemessage',
  graph_runtime_missing: 'statusmessage',
  graph_task_mismatch: 'statusmessage',
  graph_node_without_task: 'Message history',
  graph_join_stalled: 'message',
  scan_limit: 'message',
  workflow_disabled: 'workflowdisabled',
  workflow_unpublished: '工作流发布成功',
  form_missing: 'formmessage',
  form_unpublished: 'formrelease',
  form_invalid: 'formmessage',
  steps_invalid: 'nodemessage',
  step_invalid: 'nodeconfigurationmessage',
  approver_unavailable: 'approvalmessage',
  condition_invalid: 'message',
  version_missing: 'releaseversionmessage',
  version_checksum: 'validationfailed',
  published_snapshot_mismatch: 'releasemessage',
  invalid_current_step: 'Message history',
  pending_without_task: 'message',
  pending_wrong_step: 'Message history',
  pending_approver_unavailable: 'approvalmessage',
  terminal_with_pending_tasks: 'message',
};
