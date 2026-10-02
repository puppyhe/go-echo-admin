import type { Delegation, DelegationCandidates, DelegationInput } from './types';
export const MAX_DELEGATION_DURATION = 366 * 24 * 60 * 60 * 1000;
export const delegationStates: Record<Delegation['state'], { label: string; color: string }> = {
  active: { label: 'Active', color: 'success' },
  scheduled: { label: 'Scheduled', color: 'processing' },
  expired: { label: 'Expired', color: 'default' },
  disabled: { label: 'disabled', color: 'default' },
};
// Internal implementation detail.
export function delegationInput(value: DelegationInput): DelegationInput {
  return {
    delegateId: value.delegateId,
    workflowId: value.workflowId,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    enabled: value.enabled,
    revision: value.revision,
  };
}
export function validateDelegation(
  input: DelegationInput,
  records: Delegation[],
  candidates: DelegationCandidates | undefined,
  editingId?: number,
  now = Date.now(),
): void {
  if (!Number.isSafeInteger(input.delegateId) || input.delegateId < 1)
    throw new Error('Select a valid delegate and time range');
  if (!Number.isSafeInteger(input.workflowId) || input.workflowId < 0)
    throw new Error('Select a valid workflow');
  if (
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    (editingId ? input.revision < 1 : input.revision !== 0)
  )
    throw new Error('The delegation revision is invalid; reload before saving');
  if (typeof input.enabled !== 'boolean') throw new Error('Enabled must be a boolean');
  const start = Date.parse(input.startsAt),
    end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('Select a valid delegate and time range');
  if (end <= start) throw new Error('End time must be later than start time');
  if (end - start > MAX_DELEGATION_DURATION) throw new Error('A delegation cannot exceed 366 days');
  if (input.enabled) {
    if (end <= now) throw new Error('An enabled delegation must end in the future');
    if (!candidates) throw new Error('Workflow data is unavailable; refresh and try again');
    if (!candidates.users.some((user) => user.id === input.delegateId))
      throw new Error('The selected delegate is unavailable');
    if (
      input.workflowId &&
      !candidates.workflows.some((workflow) => workflow.id === input.workflowId)
    )
      throw new Error('The selected workflow is unavailable');
    const overlapping = records.find(
      (record) =>
        record.id !== editingId &&
        record.enabled &&
        record.workflowId === input.workflowId &&
        start < Date.parse(record.endsAt) &&
        Date.parse(record.startsAt) < end,
    );
    if (overlapping)
      throw new Error(`Workflow #${overlapping.id} overlaps an enabled delegation`);
  }
}
