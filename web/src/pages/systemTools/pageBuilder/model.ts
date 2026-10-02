import type { LlmProgress } from '../../../domain/llmStream';
export interface Brief {
  purpose: string;
  sections: string[];
  style: string;
  layout: string;
  responsive: boolean;
  colors: string;
  details: string;
}
export interface DesignInput {
  title: string;
  brief: Brief;
  source: string;
  revision: number;
}
export interface Design extends DesignInput {
  id: number;
  previewHtml: string;
  createdAt: string;
  updatedAt: string;
}
export interface Version {
  id: number;
  designId: number;
  baseRevision: number;
  revision: number;
  status: string;
  instruction: string;
  brief: Brief;
  source: string;
  rawText: string;
  error: string;
  previewHtml: string;
  createdAt: string;
}
export const initialBrief = (): Brief => ({
  purpose: 'Company website',
  sections: ['Hero', 'About', 'Services', 'Testimonials', 'Contact'],
  style: 'Clean and modern',
  layout: 'Single page',
  responsive: true,
  colors: 'Blue and white',
  details: '',
});
export const versionLabels: Record<string, string> = {
  running: 'Generating',
  complete: 'Saved',
  failed: 'Request failed',
  stopped: 'Stopped',
  conflict: 'Update conflict',
  interrupted: 'Interrupted',
};
export function htmlFileName(title: string) {
  return `${
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .trim()
      .slice(0, 100) || 'page'
  }.html`;
}
export function designInput(
  values: { title: string; brief: Brief },
  source: string,
  revision = 0,
): DesignInput {
  return {
    title: values.title.trim(),
    brief: {
      ...values.brief,
      sections: values.brief.sections ?? [],
      responsive: values.brief.responsive === true,
    },
    source,
    revision,
  };
}
export interface GenerationAPI {
  save(input: DesignInput, id?: number): Promise<Design>;
  generate(
    id: number,
    revision: number,
    instruction: string,
    signal: AbortSignal,
    progress: (value: LlmProgress) => void,
  ): Promise<LlmProgress>;
  get(id: number): Promise<Design>;
  version(id: number, versionId: number): Promise<Version>;
}
/** Persist before generating; the authoritative current document wins over a conflicting output. */
export async function runGeneration(
  api: GenerationAPI,
  input: DesignInput,
  id: number | undefined,
  instruction: string,
  signal: AbortSignal,
  onSaved: (value: Design) => void,
  progress: (value: LlmProgress) => void,
) {
  const check = () => {
    if (signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
  };
  check();
  const saved = await api.save(input, id);
  onSaved(saved);
  check();
  const result = await api.generate(saved.id, saved.revision, instruction, signal, (value) => {
    if (!signal.aborted) progress(value);
  });
  check();
  const versionId = Number(result.messageId);
  if (!Number.isSafeInteger(versionId) || versionId < 1)
    throw new Error('Version ID is missing from the generation response');
  const [current, version] = await Promise.all([
    api.get(saved.id),
    api.version(saved.id, versionId),
  ]);
  check();
  return { current, version };
}
