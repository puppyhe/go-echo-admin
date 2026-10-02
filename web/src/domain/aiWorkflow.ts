import type {
  AiWorkflowMessage,
  AiWorkflowSessionDetail,
  AiWorkflowSessionPayload,
} from '../api/endpoints';
import { record, structuredLlmResult, type LlmProgress } from './llmStream';

export type WorkflowTab = 'analysis' | 'workflow';
export const workflowTypes = [
  { value: 'gea_codegen', label: 'Generate code' },
  { value: 'gea_polish', label: 'Refine code' },
];
export const defaultWorkflowForm = (tab: WorkflowTab): Record<string, unknown> =>
  tab === 'analysis'
    ? {
        requirement: '',
        packageType: 'auto',
        businessScene: '',
        extraConstraints: '',
        hasClientPage: false,
        clientPageDescription: '',
        clientPageConstraints: '',
      }
    : { source: '', flowType: 'gea_codegen', extraConstraints: '' };

// Internal implementation detail.
function normalizeWorkflowForm(tab: WorkflowTab, value: Record<string, unknown>) {
  const form = { ...defaultWorkflowForm(tab), ...value };
  if (tab === 'workflow') {
    if (form.flowType === 'gva_codegen') form.flowType = 'gea_codegen';
    if (form.flowType === 'gva_polish') form.flowType = 'gea_polish';
  }
  return form;
}

export interface WorkflowSession extends AiWorkflowSessionPayload {
  id: number;
  tab: WorkflowTab;
  updatedAt?: string;
  title: string;
  settings: Record<string, unknown>;
  formData: Record<string, unknown>;
  resultData: Record<string, unknown>;
}
function parsed(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
export function hydrateWorkflow(value: AiWorkflowSessionDetail): WorkflowSession {
  const tab = value.tab === 'workflow' ? 'workflow' : 'analysis';
  const messages = parsed(value.messages);
  return {
    ...value,
    id: value.id,
    tab,
    title: value.title ?? '',
    settings: record(parsed(value.settings)),
    formData: normalizeWorkflowForm(tab, record(parsed(value.formData))),
    resultData: record(parsed(value.resultData)),
    messages: Array.isArray(messages)
      ? messages.filter((m): m is AiWorkflowMessage =>
          Boolean(
            m &&
              typeof m.id === 'string' &&
              ['user', 'assistant'].includes(m.role) &&
              typeof m.content === 'string',
          ),
        )
      : [],
  };
}
export function newWorkflow(tab: WorkflowTab): WorkflowSession {
  return {
    id: 0,
    tab,
    title: '',
    settings: {},
    formData: defaultWorkflowForm(tab),
    resultData: {},
    messages: [],
  };
}
export function workflowPayload(value: WorkflowSession): AiWorkflowSessionPayload {
  const { updatedAt, ...body } = value;
  return {
    ...body,
    formData: normalizeWorkflowForm(value.tab, value.formData),
    expectedUpdatedAt: value.id ? updatedAt : undefined,
  };
}
export function parseWorkflowSettings(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) return {};
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    throw new Error('Settings must be a JSON object');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Settings must be a JSON object');
  const reserved = new Set([
    'mode',
    'query',
    'prompt',
    'inputs',
    'user',
    'response_mode',
    'conversation_id',
    'scene',
    'stream',
  ]);
  return Object.fromEntries(Object.entries(data).filter(([key]) => !reserved.has(key)));
}
export function buildWorkflowRequest(
  value: WorkflowSession,
  followUp: string | undefined,
  userID: number,
): Record<string, unknown> {
  const form = normalizeWorkflowForm(value.tab, value.formData);
  const requirement = String(form.requirement ?? '').trim();
  const source = String(form.source ?? '').trim();
  if (!followUp?.trim() && !(value.tab === 'analysis' ? requirement : source))
    throw new Error(value.tab === 'analysis' ? 'Enter a requirement' : 'Enter source content');
  let query =
    followUp?.trim() ||
    (value.tab === 'analysis'
      ? requirement
      : `Please ${workflowTypes.find((item) => item.value === form.flowType)?.label.toLowerCase() ?? 'process the source content'}.`);
  if (!value.conversationId && value.messages.length) {
    const history = value.messages
      .filter((m) => m.content && m.status !== 'pending')
      .slice(-8)
      .map((m) => `${m.role === 'user' ? 'user' : 'assistant'}: ${m.content}`)
      .join('\n\n');
    query = `Message history:\n${history.slice(-24000)}\n\nRequest: ${query}`;
  }
  return {
    ...parseWorkflowSettings(value.settings.extraPayload),
    mode: value.tab === 'analysis' ? 'analysisChat' : 'workflowPromptChat',
    query,
    inputs: { ...form },
    user: String(userID),
    response_mode: 'streaming',
    scene: 'gea_ai_workflow',
    ...(value.conversationId ? { conversation_id: value.conversationId } : {}),
  };
}
export function workflowSnapshot(progress: LlmProgress): Record<string, unknown> {
  const data = structuredLlmResult(progress.text) ?? structuredLlmResult(progress.payload) ?? {};
  // Internal implementation detail.
  // JSON snapshot or inventing structured results when the model returned prose.
  const result = Object.fromEntries(
    Object.entries(data).filter(
      ([key]) =>
        ![
          'answer',
          'text',
          'rawText',
          'rawJson',
          'event',
          'conversation_id',
          'message_id',
        ].includes(key),
    ),
  );
  const summary =
    [data.summary, data.overview, data.analysisSummary, data.workflowSummary].find(
      (v): v is string => typeof v === 'string' && Boolean(v.trim()),
    ) ??
    progress.text.split(/\n\s*\n/)[0]?.slice(0, 1000) ??
    '';
  const canonical: Record<string, unknown> = {};
  const aliases: Record<string, unknown> = {
    modules: data.modules ?? data.moduleList ?? data.entities ?? data.items,
    clientPages: data.clientPages ?? data.client_pages ?? data.pages,
    missingInfo: data.missingInfo ?? data.missing_info ?? data.questions ?? data.clarifyQuestions,
    suggestions: data.suggestions ?? data.recommendations ?? data.advice ?? data.tips,
    recommendedPackageType: data.recommendedPackageType ?? data.packageType ?? data.targetType,
    steps: data.steps ?? data.workflow ?? data.prompts ?? data.promptFlow ?? data.promptList,
  };
  for (const [key, value] of Object.entries(aliases))
    if (value !== undefined) canonical[key] = value;
  if (Array.isArray(canonical.steps))
    canonical.steps = canonical.steps.map((value) =>
      typeof value === 'string' ? { prompt: value } : value,
    );
  return { ...result, ...canonical, summary };
}
export function restoreWorkflowNode(value: WorkflowSession, id: string): WorkflowSession {
  const index = value.messages.findIndex(
    (m) => m.id === id && m.role === 'assistant' && m.status !== 'pending',
  );
  if (index < 0) throw new Error('Message node');
  const node = value.messages[index];
  const resultData =
    node.snapshot ?? workflowSnapshot({ text: node.content, conversationId: '', messageId: '' });
  return {
    ...value,
    messages: value.messages.slice(0, index + 1),
    conversationId: '',
    messageId: '',
    currentNodeId: id,
    resultData,
    summary: String(resultData.summary ?? ''),
  };
}

export interface WorkflowIO {
  save: (value: AiWorkflowSessionPayload) => Promise<AiWorkflowSessionDetail>;
  stream: (
    body: Record<string, unknown>,
    onProgress: (value: LlmProgress) => void,
    signal: AbortSignal,
  ) => Promise<LlmProgress>;
}
/** One instance owns exactly one conversation. A detached/aborted run can only
 * save that instance; navigation waits for its final save before loading another. */
export class WorkflowConversation {
  value: WorkflowSession;
  dirty = false;
  running = false;
  error = '';
  private controller?: AbortController;
  private execution?: Promise<void>;
  private saving: Promise<void> = Promise.resolve();
  constructor(
    value: WorkflowSession,
    private io: WorkflowIO,
    private changed: () => void,
  ) {
    this.value = value;
    if (value.messages.some((m) => m.status === 'pending')) {
      this.value = {
        ...value,
        conversationId: '',
        messageId: '',
        messages: value.messages.map((m) =>
          m.status === 'pending'
            ? { ...m, status: 'stopped', error: 'Generation was interrupted. The partial response was retained.' }
            : m,
        ),
      };
      this.dirty = true;
    }
  }
  edit(change: Partial<WorkflowSession>) {
    if (this.running) return;
    this.value = { ...this.value, ...change, id: this.value.id, tab: this.value.tab };
    this.dirty = true;
    this.changed();
  }
  save(): Promise<void> {
    const next = this.saving
      .catch(() => undefined)
      .then(async () => {
        const submitted = this.value;
        try {
          const saved = hydrateWorkflow(await this.io.save(workflowPayload(submitted)));
          // A checkpoint may finish after more stream chunks arrived. Only merge
          // the identity/revision into newer local content in that case.
          if (this.value === submitted) {
            this.value = saved;
            this.dirty = false;
          } else {
            this.value = { ...this.value, id: saved.id, updatedAt: saved.updatedAt };
            this.dirty = true;
          }
          this.error = '';
        } catch (error) {
          this.error = error instanceof Error ? error.message : 'Save failed';
          throw error;
        } finally {
          this.changed();
        }
      });
    this.saving = next;
    return next;
  }
  run(followUp: string | undefined, userID: number): Promise<void> {
    if (this.running) return Promise.reject(new Error('A generation is already running'));
    const body = buildWorkflowRequest(this.value, followUp, userID);
    const controller = new AbortController();
    this.controller = controller;
    this.running = true;
    this.error = '';
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const content =
      followUp?.trim() ||
      String(this.value.formData[this.value.tab === 'analysis' ? 'requirement' : 'source']);
    this.value = {
      ...this.value,
      title: this.value.title || content.slice(0, 80),
      currentNodeId: id,
      messages: [
        ...this.value.messages,
        { id: crypto.randomUUID(), role: 'user', content, createdAt },
        { id, role: 'assistant', content: '', status: 'pending', createdAt },
      ],
    };
    this.dirty = true;
    this.changed();
    const update = (progress: LlmProgress) => {
      if (controller.signal.aborted || this.controller !== controller) return;
      this.value = {
        ...this.value,
        conversationId: progress.conversationId || this.value.conversationId,
        messageId: progress.messageId || this.value.messageId,
        messages: this.value.messages.map((m) =>
          m.id === id
            ? {
                ...m,
                content: progress.text,
                conversationId: progress.conversationId,
                messageId: progress.messageId,
              }
            : m,
        ),
      };
      this.dirty = true;
      this.changed();
    };
    this.execution = (async () => {
      let finalError: unknown;
      let checkpoint: ReturnType<typeof setInterval> | undefined;
      let checkpointBusy = false;
      try {
        await this.save(); // Persist the pending turn before contacting the model.
        if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
        checkpoint = setInterval(() => {
          if (!this.dirty || checkpointBusy) return;
          checkpointBusy = true;
          void this.save()
            .catch((error: unknown) => {
              finalError = error;
              controller.abort();
            })
            .finally(() => {
              checkpointBusy = false;
            });
        }, 4000);
        const progress = await this.io.stream(body, update, controller.signal);
        if (controller.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
        if (!progress.text.trim() && !progress.payload)
          throw new Error('AI service returned no content');
        const finalProgress = {
          ...progress,
          text: progress.text || JSON.stringify(progress.payload, null, 2),
        };
        update(finalProgress);
        const snapshot = workflowSnapshot(finalProgress);
        this.value = {
          ...this.value,
          resultData: snapshot,
          summary: String(snapshot.summary ?? ''),
          messages: this.value.messages.map((m) =>
            m.id === id ? { ...m, status: 'complete', snapshot } : m,
          ),
        };
      } catch (error) {
        const effectiveError = finalError ?? error;
        const stopped = controller.signal.aborted && !finalError;
        const explanation = stopped
          ? 'Request failed; the partial response was retained.'
          : effectiveError instanceof Error
            ? effectiveError.message
            : 'Request failed. Please try again.';
        const partial = this.value.messages.find((m) => m.id === id)?.content ?? '';
        const snapshot = partial
          ? workflowSnapshot({ text: partial, conversationId: '', messageId: '' })
          : {};
        this.value = {
          ...this.value,
          resultData: snapshot,
          summary: String(snapshot.summary ?? ''),
          conversationId: '',
          messageId: '',
          messages: this.value.messages.map((m) =>
            m.id === id
              ? {
                  ...m,
                  snapshot,
                  status: stopped ? 'stopped' : 'failed',
                  error: explanation.slice(0, 1000),
                }
              : m,
          ),
        };
        if (!stopped) finalError = effectiveError;
      } finally {
        if (checkpoint) clearInterval(checkpoint);
        this.dirty = true;
        try {
          await this.save();
        } catch (error) {
          finalError = error;
        }
        this.running = false;
        this.controller = undefined;
        this.error = finalError instanceof Error ? finalError.message : '';
        this.changed();
      }
      if (finalError) throw finalError;
    })();
    return this.execution;
  }
  async stop() {
    this.controller?.abort();
    await this.execution?.catch(() => undefined);
  }
}
