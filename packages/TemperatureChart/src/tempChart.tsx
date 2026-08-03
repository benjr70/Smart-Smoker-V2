import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export type TempData = {
  ChamberTemp: number;
  MeatTemp: number;
  Meat2Temp: number;
  Meat3Temp: number;
  date: Date;
};

/** One colour per temperature reading, for the line each of them is drawn as. */
export type ChartProbeColors = {
  chamber: string;
  probe1: string;
  probe2: string;
  probe3: string;
};

/**
 * Every colour the chart paints with.
 *
 * The chart knows how to draw temperatures over time; it does not know which
 * colour scheme the application around it is in. A consumer that follows a
 * scheme hands it that scheme's colours, and a consumer that does not gets the
 * ones below.
 */
export type ChartColors = {
  /** The panel the plot is drawn on. */
  surface: string;
  /** The line colour of each reading. */
  probes: ChartProbeColors;
  /** The hover callout's own surface. */
  tooltipSurface: string;
  /** The outline around that callout. */
  tooltipBorder: string;
  /** The readings written inside it. */
  tooltipText: string;
};

/**
 * The colours the chart has drawn since it was written, so a consumer that
 * passes none is painted exactly as it is today.
 */
export const defaultChartColors: ChartColors = {
  surface: '#d3d3d3',
  probes: {
    chamber: '#1f4f2d',
    probe1: '#2a475e',
    probe2: '#118cd8',
    probe3: '#5582a7',
  },
  tooltipSurface: 'white',
  tooltipBorder: 'black',
  tooltipText: 'black',
};

interface props {
  ChamberName: string;
  Probe1Name: string;
  Probe2Name: string;
  Probe3Name: string;
  ChamberTemp: number;
  MeatTemp: number;
  Meat2Temp: number;
  Meat3Temp: number;
  date: Date;
  smoking: boolean;
  initData: TempData[];
  /** The palette to draw in; the chart's historical colours when omitted. */
  colors?: ChartColors;
}

function TempChart(props: props): JSX.Element {
  const colors = props.colors ?? defaultChartColors;
  const svgRef = useRef() as React.RefObject<SVGSVGElement>;
  const [data, setData] = useState(props.initData);
  const [initialized, setInitialized] = useState(false);
  const xScale = useRef() as any;
  const yScale = useRef() as any;
  const generateScaledLineChamber = useRef() as any;
  const generateScaledLineProbe1 = useRef() as any;
  const generateScaledLineProbe2 = useRef() as any;
  const generateScaledLineProbe3 = useRef() as any;
  const tooltip = useRef() as any;
  const bisect = useRef() as any;

  d3.select(window).on('resize', () => {
    reSize();
  });

  const reSize = () => {
    // Select the container
    const container = d3.select(svgRef.current);

    // Get the size of the container
    const containerSize = container.node()?.getBoundingClientRect();

    let width = containerSize!.width;
    let height = containerSize!.width * 0.5;
    d3.select(svgRef.current).attr('width', width);
    d3.select(svgRef.current).attr('height', height);
    d3.select(svgRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    setupSVGChart();
    reDrawGraph(data);
  };

  const setupSVGChart = () => {
    // Select the container
    const container = d3.select(svgRef.current);

    // Get the size of the container
    const containerSize = container.node()?.getBoundingClientRect();
    // set the dimensions of the graph
    let width = containerSize?.width ?? 0;
    let height = (containerSize?.width ?? 0) * 0.5;
    d3.select(svgRef.current)
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', colors.surface)
      .attr('preserveAspectRatio', 'xMinYMin')
      .style('overflow', 'visible')
      .on('pointerenter pointermove', pointerMoved)
      .on('pointerleave', pointerLeft)
      .on('touchstart', event => event.preventDefault());

    tooltip.current = d3.select(svgRef.current).append('g');
  };

  useEffect(() => {
    setData(props.initData);
    reDrawGraph(props.initData);
  }, [props.initData]);

  useEffect(() => {
    if (!initialized && data.length > 1) {
      setupSVGChart();
      reSize();
      reDrawGraph(data);
      setInitialized(true);
    }
  }, [data]);

  useEffect(() => {
    setupSVGChart();
    reDrawGraph(props.initData);
  }, []);

  /**
   * Repaint when the palette changes under the chart.
   *
   * Switching colour scheme hands the chart new colours but produces no new
   * readings, and everything the chart draws is drawn imperatively — so without
   * this the panel and the four lines would stay in the previous scheme's
   * colours until the next temperature arrived. The panel is restyled in place
   * rather than through `setupSVGChart`, which would append a second tooltip
   * group.
   */
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (svg && !svg.empty()) {
      svg.style('background', colors.surface);
      reDrawGraph(data);
    }
  }, [
    colors.surface,
    colors.probes.chamber,
    colors.probes.probe1,
    colors.probes.probe2,
    colors.probes.probe3,
  ]);

  // Add the event listeners that show or hide the tooltip.
  function pointerMoved(event) {
    const i = d3
      .bisector((d: TempData) => new Date(d.date).getTime())
      .center(data, xScale.current.invert(d3.pointer(event)[0]));
    tooltip.current.style('display', null);

    tooltip.current.attr(
      'transform',
      `translate(${xScale.current(new Date(data[i].date).getTime())},${yScale.current(data[i].ChamberTemp)})`
    );

    const path = tooltip.current
      .selectAll('path')
      .data([,])
      .join('path')
      .attr('fill', colors.tooltipSurface)
      .attr('stroke', colors.tooltipBorder);

    const text = tooltip.current
      .selectAll('text')
      .data([,])
      .join('text')
      .attr('fill', colors.tooltipText)
      .call(text =>
        text
          .selectAll('tspan')
          .data([
            formatDate(data[i].date),
            formatValue(data[i].ChamberTemp, props.ChamberName),
            formatValue(data[i].MeatTemp, props.Probe1Name),
            formatValue(data[i].Meat2Temp, props.Probe2Name),
            formatValue(data[i].Meat3Temp, props.Probe3Name),
          ])
          .join('tspan')
          .attr('x', 0)
          .attr('y', (_, i) => `${i * 1.1}em`)
          .attr('font-weight', (_, i) => (i ? null : 'bold'))
          .attr('font-size', (_, i) => (i ? '12px' : '14px'))
          .text(d => d)
      );

    size(text, path);
  }

  function formatValue(value, Probe: string) {
    return `${Probe}: ${parseFloat(value).toFixed(0) + '°F'}`;
  }

  function formatDate(date: Date) {
    let date2 = new Date(date);
    return date2.toLocaleTimeString();
  }

  function pointerLeft() {
    tooltip.current.style('display', 'none');
  }

  // Wraps the text with a callout path of the correct size, as measured in the page.
  function size(text, path) {
    const { x, y, width: w, height: h } = text.node().getBBox();
    text.attr('transform', `translate(${-w / 2},${15 - y})`);
    path.attr('d', `M${-w / 2 - 10},5H-5l5,-5l5,5H${w / 2 + 10}v${h + 20}h-${w + 20}z`);
  }

  const reDrawGraph = async (data: TempData[]) => {
    let svg = d3.select(svgRef.current);
    if (svg && !svg.empty()) {
      d3.select(svgRef.current)
        .on('pointerenter pointermove', pointerMoved)
        .on('pointerleave', pointerLeft)
        .on('touchstart', event => event.preventDefault());

      // @ts-ignore
      bisect.current = d3.bisector(d => new Date(d.date).getTime()).center;
      // Select the container
      const container = d3.select(svgRef.current);

      // Get the size of the container
      const containerSize = container.node()?.getBoundingClientRect();
      // set the dimensions and margins of the graph
      const margin = { top: 10, right: 0, bottom: 10, left: 10 };
      let width = containerSize?.width ?? 0;
      let height = (containerSize?.width ?? 0) * 0.5;

      //setting the scaling
      xScale.current = d3
        .scaleTime()
        // @ts-ignore
        .domain(d3.extent(data, d => new Date(d.date).getTime()))
        .range([30, width]);

      yScale.current = d3
        .scaleLinear()
        .domain([
          0,
          (d3.max(data, (d: TempData) => {
            return Math.max(d.ChamberTemp, d.MeatTemp, d.Meat2Temp, d.Meat3Temp);
          }) || 100) * 1.15,
        ])
        .range([height - margin.top - margin.bottom, 0]);

      generateScaledLineChamber.current = d3
        .line<TempData>()
        .x((d: TempData) => {
          return xScale.current(new Date(d.date).getTime());
        })
        .y((d: TempData) => {
          return yScale.current(d.ChamberTemp);
        })
        .curve(d3.curveCardinal);

      generateScaledLineProbe1.current = d3
        .line<TempData>()
        .x((d: TempData) => {
          return xScale.current(new Date(d.date).getTime());
        })
        .y((d: TempData) => {
          return yScale.current(d.MeatTemp);
        });

      generateScaledLineProbe2.current = d3
        .line<TempData>()
        .x((d: TempData) => {
          return xScale.current(new Date(d.date).getTime());
        })
        .y((d: TempData) => {
          return yScale.current(d.Meat2Temp);
        });

      generateScaledLineProbe3.current = d3
        .line<TempData>()
        .x((d: TempData) => {
          return xScale.current(new Date(d.date).getTime());
        })
        .y((d: TempData) => {
          return yScale.current(d.Meat3Temp);
        });

      svg
        .selectAll('.line')
        .data([data])
        .join('path')
        .attr('class', 'line')
        .attr('fill', 'none')
        .attr('stroke', colors.probes.chamber)
        .attr('stroke-width', 1.5)
        // @ts-ignore
        .attr('d', generateScaledLineChamber.current);

      svg
        .append('path')
        .data([data])
        // .join('path')
        .attr('class', 'line')
        .attr('fill', 'none')
        .attr('stroke', colors.probes.probe1)
        .attr('stroke-width', 1.5)
        // @ts-ignore
        .attr('d', generateScaledLineProbe1.current);

      svg
        .append('path')
        .data([data])
        // .join('path')
        .attr('class', 'line')
        .attr('fill', 'none')
        .attr('stroke', colors.probes.probe2)
        .attr('stroke-width', 1.5)
        // @ts-ignore
        .attr('d', generateScaledLineProbe2.current);

      svg
        .append('path')
        .data([data])
        // .join('path')
        .attr('class', 'line')
        .attr('fill', 'none')
        .attr('stroke', colors.probes.probe3)
        .attr('stroke-width', 1.5)
        // @ts-ignore
        .attr('d', generateScaledLineProbe3.current);

      svg.selectAll('.xAxis').remove();
      // Add the X Axis
      svg
        .append('g')
        .attr('class', 'xAxis')
        .attr('transform', 'translate(0,' + (height - margin.top - margin.bottom) + ')')
        .call(d3.axisBottom(xScale.current));

      svg.selectAll('.yAxis').remove();
      // Add the Y Axis
      svg
        .append('g')
        .attr('class', 'yAxis')
        .attr('transform', 'translate(30, 0)')
        .call(d3.axisLeft(yScale.current));

      if (tooltip.current) {
        tooltip.current.raise();
      }
    }
  };

  useEffect(() => {
    if (props.smoking) {
      if (
        !isNaN(props.ChamberTemp) &&
        props.ChamberTemp != 0 &&
        !isNaN(props.MeatTemp) &&
        props.MeatTemp != 0 &&
        !isNaN(props.Meat2Temp) &&
        props.Meat2Temp != 0 &&
        !isNaN(props.Meat3Temp) &&
        props.Meat3Temp != 0
      ) {
        setData(data => [
          ...data,
          ...[
            {
              ChamberTemp: props.ChamberTemp,
              MeatTemp: props.MeatTemp,
              Meat2Temp: props.Meat2Temp,
              Meat3Temp: props.Meat3Temp,
              date: props.date,
            },
          ],
        ]);
      }
      reDrawGraph(data);
    }
  }, [
    props.ChamberTemp,
    props.MeatTemp,
    props.Meat2Temp,
    props.Meat3Temp,
    props.date,
    props.smoking,
  ]);

  return (
    <div>
      <svg ref={svgRef}></svg>
    </div>
  );
}

export default TempChart;
