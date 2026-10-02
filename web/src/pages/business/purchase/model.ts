import type { Workflow } from '../../enterprise/collab/types';
export function purchaseCents(amountYuan: number): number {
  if (
    typeof amountYuan !== 'number' ||
    !Number.isFinite(amountYuan) ||
    amountYuan <= 0 ||
    amountYuan > 10_000_000_000 ||
    Number(amountYuan.toFixed(2)) !== amountYuan
  )
    throw new Error('message 0，message');
  return Math.round(amountYuan * 100);
}
export function availablePurchaseWorkflows(workflows: Workflow[]): Workflow[] {
  return workflows.filter(
    (workflow) =>
      workflow.businessType === 'purchase_order' &&
      workflow.status === 'published' &&
      workflow.enabled !== false,
  );
}
