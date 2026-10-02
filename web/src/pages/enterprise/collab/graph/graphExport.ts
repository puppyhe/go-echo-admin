import type { WorkflowGraph } from '../types';
import { nodeLabels } from './graphModel';
export interface GraphImage {
  svg: string;
  width: number;
  height: number;
}
export function escapeGraphText(value: string): string {
  return value
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
export function graphImage(graph: WorkflowGraph): GraphImage {
  if (!graph.nodes.length || graph.nodes.length > 200 || graph.edges.length > 400)
    throw new Error('导出失败：节点数量需在 1–200 之间，连线不能超过 400 条');
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (nodes.size !== graph.nodes.length) throw new Error('节点 ID 重复，无法导出');
  for (const node of graph.nodes) {
    if (
      !Object.hasOwn(nodeLabels, node.type) ||
      typeof node.name !== 'string' ||
      node.name.length > 400 ||
      ![node.x, node.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 10000)
    )
      throw new Error('节点名称、类型信息不合法，无法导出');
  }
  let minX = Math.min(...graph.nodes.map((n) => n.x - 30)),
    minY = Math.min(...graph.nodes.map((n) => n.y - 30));
  let maxX = Math.max(...graph.nodes.map((n) => n.x + 190)),
    maxY = Math.max(...graph.nodes.map((n) => n.y + 94));
  const paths: string[] = [];
  for (const edge of graph.edges) {
    const source = nodes.get(edge.source),
      target = nodes.get(edge.target);
    if (!source || !target) throw new Error('连线引用的节点不存在，无法导出');
    const x1 = source.x + 80,
      y1 = source.y + 64,
      x2 = target.x + 80,
      y2 = target.y,
      bend = Math.max(35, Math.abs(y2 - y1) / 2);
    minY = Math.min(minY, y2 - bend - 20);
    maxY = Math.max(maxY, y1 + bend + 20);
    paths.push(
      `<path d="M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}" fill="none" stroke="#8c9db3" stroke-width="2" marker-end="url(#graph-arrow)"/>`,
    );
    if (edge.branch) {
      if (!['true', 'false'].includes(edge.branch)) throw new Error('连线分支不合法');
      paths.push(
        `<text x="${(x1 + x2) / 2 + 10}" y="${(y1 + y2) / 2}" fill="#52657f" font-size="12" stroke="white" stroke-width="4" paint-order="stroke">${edge.branch === 'true' ? '是' : '否'}</text>`,
      );
    }
  }
  const shapes = graph.nodes.map((node) => {
    const color = node.type === 'failure' ? '#cf1322' : '#35547a';
    const shape =
      node.type === 'decision'
        ? `<polygon points="80,-8 170,32 80,72 -10,32" fill="white" stroke="${color}" stroke-width="2"/>`
        : `<rect width="160" height="64" rx="${['start', 'success', 'failure'].includes(node.type) ? 32 : 8}" fill="white" stroke="${color}" stroke-width="2"/>`;
    const bar =
      node.type === 'fork' || node.type === 'join'
        ? `<rect x="10" y="8" width="140" height="4" rx="2" fill="${color}"/>`
        : '';
    const label = node.name.length > 12 ? `${node.name.slice(0, 11)}…` : node.name || '未命名节点';
    return `<g transform="translate(${node.x},${node.y})"><title>${escapeGraphText(node.name)}</title>${shape}${bar}<text x="80" y="29" text-anchor="middle" fill="${color}" font-size="13" font-weight="600">${escapeGraphText(label)}</text><text x="80" y="49" text-anchor="middle" fill="#68788d" font-size="11">${nodeLabels[node.type]}</text></g>`;
  });
  minX = Math.floor(minX);
  minY = Math.floor(minY);
  maxX = Math.ceil(maxX);
  maxY = Math.ceil(maxY);
  const width = maxX - minX,
    height = maxY - minY;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" font-family="Source Han Sans SC, Source Han Sans CN, Noto Sans CJK SC, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif"><title>工作流图</title><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f6f8fc"/><defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8c9db3"/></marker></defs>${paths.join('')}${shapes.join('')}</svg>`;
  if (new Blob([svg]).size > 2 * 1024 * 1024) throw new Error('SVG 内容超过 2MB，无法导出');
  return { svg, width, height };
}
export function graphRasterSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('尺寸不合法');
  const scale = Math.min(1, 4096 / Math.max(width, height), Math.sqrt(16000000 / (width * height)));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
export async function graphPNG(graph: GraphImage): Promise<Blob> {
  const size = graphRasterSize(graph.width, graph.height);
  // Cap intrinsic decoding size too, before the destination canvas is allocated.
  const rasterSVG = graph.svg.replace(
    /width="[^"]*" height="[^"]*"/,
    `width="${size.width}" height="${size.height}"`,
  );
  const url = URL.createObjectURL(new Blob([rasterSVG], { type: 'image/svg+xml;charset=utf-8' }));
  let canvas: HTMLCanvasElement | undefined;
  try {
    const decoded = new window.Image();
    decoded.src = url;
    await decoded.decode();
    canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法生成 PNG 导出，请下载 SVG');
    context.drawImage(decoded, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas!.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('PNG 编码失败，请下载 SVG'))),
        'image/png',
      ),
    );
    if (blob.type !== 'image/png' || !blob.size || blob.size > 20 * 1024 * 1024)
      throw new Error('PNG 内容超过 20MB，请下载 SVG');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
export function downloadGraph(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
