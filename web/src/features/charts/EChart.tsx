// Internal implementation detail.
import type { CSSProperties } from 'react';
import { useChart, type ChartOption } from './useChart';

export interface EChartProps {
  // Internal implementation detail.
  option: ChartOption;
  // Internal implementation detail.
  height?: number | string;
  // Internal implementation detail.
  className?: string;
  style?: CSSProperties;
}

export default function EChart({ option, height = 300, className, style }: EChartProps) {
  const ref = useChart(option);
  return <div ref={ref} className={className} style={{ width: '100%', height, ...style }} />;
}
