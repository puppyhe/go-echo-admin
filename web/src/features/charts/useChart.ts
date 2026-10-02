// Modified for go-echo-admin. Third-party attribution and licensing: see NOTICE.md.
// Internal implementation detail.
import { useCallback, useEffect, useRef, type DependencyList, type RefCallback } from 'react';
import { init, use, type ComposeOption } from 'echarts/core';
import {
  BarChart,
  LineChart,
  PieChart,
  type BarSeriesOption,
  type LineSeriesOption,
  type PieSeriesOption,
} from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Internal implementation detail.
use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

// Internal implementation detail.
export type ChartOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | PieSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
>;

// Internal implementation detail.
type ChartInstance = ReturnType<typeof init>;

// Internal implementation detail.
export function useChart(option: ChartOption, deps?: DependencyList): RefCallback<HTMLDivElement> {
  const chartRef = useRef<ChartInstance | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      chartRef.current = init(node);
      observerRef.current = new ResizeObserver(() => chartRef.current?.resize());
      observerRef.current.observe(node);
    } else {
      // Internal implementation detail.
      observerRef.current?.disconnect();
      observerRef.current = null;
      chartRef.current?.dispose();
      chartRef.current = null;
    }
  }, []);

  useEffect(
    () => {
      chartRef.current?.setOption(option, { notMerge: true });
    },
    deps ?? [option],
  );

  return ref;
}
