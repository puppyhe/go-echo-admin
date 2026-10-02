export interface DelegationInput {
  delegateId: number;
  workflowId: number;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
  revision: number;
}
export interface Delegation extends DelegationInput {
  id: number;
  ownerId: number;
  delegateName: string;
  workflowName: string;
  state: 'active' | 'scheduled' | 'expired' | 'disabled';
}
export interface DelegationCandidates {
  users: { id: number; name: string }[];
  workflows: { id: number; name: string; code: string }[];
}
