import type { FormDesign } from '../../systemTools/formDesign';

export interface Page<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type ListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  scope?: RequestScope;
  status?: PublishStatus | RequestStatus;
  ownerId?: number;
  urgency?: RequestUrgency;
  createdFrom?: string;
  createdTo?: string;
  overdue?: boolean;
  category?: string;
  enabled?: boolean;
};
export type PublishStatus = 'draft' | 'published';
export interface BusinessForm {
  code: string;
  revision: number;
  id: number;
  name: string;
  description: string;
  schema: FormDesign;
  status: PublishStatus;
  version: number;
  ownerId: number;
  sharedRoleIds: number[];
  createdAt: string;
  updatedAt: string;
}
export type ConditionOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
export interface AssigneeSpec {
  kind: string;
  ids?: number[];
  config?: Record<string, unknown>;
}
export interface BusinessTypeChoice {
  type: string;
  schema: FormDesign;
}
export interface WorkflowStep {
  assignee?: AssigneeSpec;
  ccUserIds?: number[];
  id: string;
  name: string;
  approverIds: number[];
  mode: 'any' | 'all';
  condition?: { field: string; operator: ConditionOperator; value: unknown };
}
export interface WorkflowDefinition {
  businessType?: string;
  executionMode?: 'sequence' | 'graph';
  graph?: WorkflowGraph;
  name: string;
  code: string;
  category: string;
  description: string;
  formId: number;
  steps: WorkflowStep[];
  sharedRoleIds: number[];
}
export interface Workflow {
  businessType?: string;
  executionMode?: 'sequence' | 'graph';
  graph?: WorkflowGraph;
  code: string;
  category: string;
  enabled: boolean;
  version: number;
  revision: number;
  pendingCount: number;
  publishedDefinition?: WorkflowDefinition;
  id: number;
  name: string;
  description: string;
  formId: number;
  steps: WorkflowStep[];
  status: PublishStatus;
  ownerId: number;
  sharedRoleIds: number[];
  createdAt: string;
  updatedAt: string;
}
export interface UserChoice {
  id: number;
  username: string;
  nickName: string;
}
export interface RoleChoice {
  value: number;
  label: string;
}
export type RequestScope = 'mine' | 'pending' | 'handled' | 'all';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export type RequestUrgency = 'normal' | 'urgent' | 'critical';
export interface ApprovalRequest {
  businessType?: string;
  businessId?: string;
  businessVersion?: number;
  previousRequestId?: number;
  urgency?: RequestUrgency;
  overdue?: boolean;
  number?: string;
  businessKey?: string;
  taskTimeoutMinutes?: number;
  id: number;
  title: string;
  formId: number;
  formName: string;
  workflowId: number;
  workflowName: string;
  ownerId: number;
  status: RequestStatus;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  currentStep: number;
  formVersion: number;
  workflowVersion?: number;
  formSnapshot: FormDesign;
  workflowSnapshot: WorkflowStep[];
  graphSnapshot?: WorkflowGraph;
}
export interface ApprovalTask {
  sources?: { taskId: number; userId: number; delegationId: number }[];
  dueAt?: string;
  lastRemindedAt?: string;
  reminderCount?: number;
  nodeId?: string;
  id: number;
  requestId: number;
  stepIndex: number;
  stepId: string;
  stepName: string;
  approverId: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  comment: string;
  actedAt?: string;
}
export interface ApprovalEvent {
  id: number;
  requestId: number;
  actorId: number;
  type: string;
  message: string;
  stepIndex: number;
  createdAt: string;
}
export interface RequestDetail extends ApprovalRequest {
  receipts?: import('./receipts/types').Receipt[];
  nodeRuns?: GraphNodeRun[];
  edgeRuns?: GraphEdgeRun[];
  tasks: ApprovalTask[];
  events: ApprovalEvent[];
}
export type FormInput = Pick<BusinessForm, 'name' | 'description' | 'schema' | 'sharedRoleIds'> & {
  code?: string;
  revision?: number;
};
export interface FormVersion {
  id: number;
  formId: number;
  version: number;
  definition: { name: string; description: string; code: string; schema: FormDesign };
  publishedBy: number;
  note: string;
  checksum: string;
  instanceCount: number;
  current: boolean;
  createdAt: string;
}
export type WorkflowInput = Pick<
  Workflow,
  | 'name'
  | 'code'
  | 'category'
  | 'enabled'
  | 'description'
  | 'formId'
  | 'businessType'
  | 'steps'
  | 'status'
  | 'sharedRoleIds'
  | 'executionMode'
  | 'graph'
> & { revision?: number };

export type GraphNodeType =
  | 'start'
  | 'approval'
  | 'decision'
  | 'fork'
  | 'join'
  | 'success'
  | 'failure';
export interface GraphNode {
  assignee?: AssigneeSpec;
  ccUserIds?: number[];
  id: string;
  type: GraphNodeType;
  name: string;
  x: number;
  y: number;
  approverIds?: number[];
  mode?: 'all' | 'any';
  condition?: WorkflowStep['condition'];
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  branch?: 'true' | 'false';
}
export interface WorkflowGraph {
  version: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface GraphIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  nodeId?: string;
  edgeId?: string;
}
export interface GraphValidation {
  valid: boolean;
  issues: GraphIssue[];
}
export interface GraphNodeRun {
  nodeId: string;
  nodeType: GraphNodeType;
  status: string;
  outcome?: string;
  activatedAt?: string;
  completedAt?: string;
}
export interface GraphEdgeRun {
  edgeId: string;
  source: string;
  target: string;
  status: string;
}
export interface GraphPreview {
  status: RequestStatus;
  nodeRuns: GraphNodeRun[];
  edgeRuns: GraphEdgeRun[];
}

export interface WorkflowVersion {
  id: number;
  workflowId: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedBy: number;
  note: string;
  definition: WorkflowDefinition;
  status: 'published' | 'historical';
  checksum: string;
  instanceCount: number;
  pendingCount: number;
}
export interface CheckupIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  workflowId: number;
  workflowName: string;
  scope: 'definition' | 'runtime';
  requestId?: number;
  stepId?: string;
  count?: number;
}
export interface WorkflowCheckup {
  checkedAt: string;
  summary: { workflows: number; requests: number; errors: number; warnings: number };
  issues: CheckupIssue[];
}

export interface RuntimeConfig {
  version: number;
  maxNodes: number;
  maxBranches: number;
  maxActiveInstances: number;
  maxRoles: number;
  workerEnabled: boolean;
  taskTimeoutMinutes: number;
  reminderIntervalMinutes: number;
  scanBatch: number;
  numberPrefix: string;
  numberDateFormat: 'ymd' | 'ym' | 'none';
  numberDigits: number;
  preventDuplicateBusiness: boolean;
}
