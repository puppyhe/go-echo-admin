import { prepareAssignee } from './assigneeModel';
import { normalizeCC } from './receipts/model';
import {
  calendarValue,
  conditionFields,
  dataFields,
  type DesignField,
  type FormDesign,
} from '../../systemTools/formDesign';
import type { ConditionOperator, WorkflowStep } from './types';

export const operatorLabels: Record<ConditionOperator, string> = {
  eq: 'Equals',
  ne: 'Does not equal',
  gt: 'Greater than',
  gte: 'Greater than or equal to',
  lt: 'Less than',
  lte: 'Less than or equal to',
  contains: 'Contains',
};
export const statusLabels: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
};
export const statusColors: Record<string, string> = {
  published: 'green',
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'default',
  draft: 'default',
  cancelled: 'default',
};
export function allowedOperators(field?: DesignField): ConditionOperator[] {
  if (field && ['number', 'slider', 'rate'].includes(field.type))
    return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];
  if (field && ['input', 'textarea', 'password', 'checkbox'].includes(field.type))
    return ['eq', 'ne', 'contains'];
  return ['eq', 'ne'];
}
export function conditionValue(
  field: DesignField | undefined,
  value: unknown,
  operator: ConditionOperator = 'eq',
): unknown {
  if (field?.type === 'checkbox' && operator !== 'contains') {
    if (
      !Array.isArray(value) ||
      value.some(
        (item) =>
          typeof item !== 'string' || !field.options.some((option) => option.value === item),
      )
    )
      throw new Error('Select valid field options');
    return [...new Set(value)];
  }
  if (field && ['number', 'slider', 'rate'].includes(field.type)) {
    if (value === '' || value === undefined || value === null) throw new Error('Enter a condition value');
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Numeric conditions require a finite number');
    return number;
  }
  if (field?.type === 'switch') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new Error('Select true or false for this field');
  }
  return value ?? '';
}
export function prepareSteps(steps: WorkflowStep[], schema: FormDesign): WorkflowStep[] {
  if (!steps.length) throw new Error('Add at least one approval node');
  const seen = new Set<string>();
  return steps.map((step, index) => {
    if (!step.id || seen.has(step.id)) throw new Error('Approval node IDs must be present and unique');
    seen.add(step.id);
    if (!step.name.trim()) throw new Error(`Enter a name for approval node ${index + 1}`);
    const assignment = prepareAssignee(step);
    if (step.mode !== 'any' && step.mode !== 'all') throw new Error('Select a valid approval mode');
    let condition: WorkflowStep['condition'];
    if (step.condition) {
      const field = conditionFields(schema.fields).find(
        (field) => field.name === step.condition?.field,
      );
      if (!field || field.disabled)
        throw new Error(`「${step.name}」condition field is unavailable; select another field`);
      if (!allowedOperators(field).includes(step.condition.operator))
        throw new Error('Condition field has an unsupported operator');
      condition = {
        field: field.name,
        operator: step.condition.operator,
        value: conditionValue(field, step.condition.value, step.condition.operator),
      };
    }
    return {
      id: step.id,
      name: step.name.trim(),
      ...assignment,
      ...(normalizeCC(step.ccUserIds) ? { ccUserIds: normalizeCC(step.ccUserIds) } : {}),
      mode: step.mode,
      ...(condition ? { condition } : {}),
    };
  });
}

/** Persist date-only and local time controls without UTC shifting or executable values. */
export function serializeSubmission(
  schema: FormDesign,
  values: Record<string, unknown>,
): Record<string, unknown> {
  let total = 0;
  const serialize = (
    fields: DesignField[],
    input: Record<string, unknown>,
    depth: number,
  ): Record<string, unknown> => {
    if (depth > 4) throw new Error('Form nesting exceeds 4 levels');
    const data: Record<string, unknown> = {};
    for (const field of dataFields(fields)) {
      if (++total > 5000) throw new Error('Form data exceeds 5000 fields');
      if (field.disabled) continue;
      if (['constructor', 'prototype', '__proto__'].includes(field.name))
        throw new Error('Form contains a reserved field name');
      let value = input[field.name];
      if (value === undefined || value === null) continue;
      if (field.type === 'subform') {
        if (!Array.isArray(value) || value.length > (field.maxRows ?? 20))
          throw new Error(`「${field.label}」data is invalid`);
        data[field.name] = value.map((row) => {
          if (!row || typeof row !== 'object' || Array.isArray(row))
            throw new Error(`「${field.label}」data is invalid`);
          return serialize(field.children ?? [], row as Record<string, unknown>, depth + 1);
        });
        continue;
      }
      if (field.type === 'date' || field.type === 'time')
        value = calendarValue(value, field.type === 'date' ? 'YYYY-MM-DD' : 'HH:mm:ss');
      if (field.type === 'dateRange') {
        if (!Array.isArray(value) || value.length !== 2)
          throw new Error(`「${field.label}」data is invalid`);
        value = value.map((item) => calendarValue(item, 'YYYY-MM-DD'));
      }
      if (field.type === 'numberRange') {
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
        )
          throw new Error(`「${field.label}」must contain finite numbers`);
      } else if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        !(Array.isArray(value) && value.every((item) => typeof item === 'string'))
      )
        throw new Error(`「${field.label}」data is invalid`);
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error(`「${field.label}」must contain finite numbers`);
      data[field.name] = value;
    }
    return data;
  };
  return serialize(schema.fields, values, 0);
}

export function displayValue(field: DesignField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'password') return '••••••••';
  if (field.type === 'switch') return value ? 'On' : 'Off';
  const label = (item: unknown) =>
    field.options.find((option) => option.value === item)?.label ?? String(item);
  return Array.isArray(value) ? value.map(label).join('、') || '—' : label(value);
}
