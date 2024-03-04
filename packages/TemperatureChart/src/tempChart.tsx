import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

 export type TempData = {
  ChamberTemp: number;
  MeatTemp: number;
  Meat2Temp: number;
  Meat3Temp: number;
  date: Date;
 }

 interface props {
  ChamberTemp: number;
  MeatTemp: number;
  Meat2Temp: number;
  Meat3Temp: number;
  date: Date;
  smoking: boolean;
  initData: TempData[];
 }

function TempChart(props: props): JSX.Element {
  const svgRef = useRef() as React.RefObject<SVGSVGElement>;
  const [data, setData] = useState(props.initData);
  let xScale: any;
  let yScale: any;
  let generateScaledLineChamber: any;
  let generateScaledLineProbe1: any;
  let generateScaledLineProbe2: any;
  let generateScaledLineProbe3: any;
  let svg: any;
  let tooltip: any;
  let bisect: any;

  d3.select(window).on('resize', () => {
    const containerSize = svg.node()?.getBoundingClientRect();
    width = containerSize!.width;
    height = containerSize!.width * 0.5;
    svg.attr('width', width);
    svg.attr('height', height);
    svg.attr("viewBox", `0 0 ${width} ${height}`)
    CreateStuff();
    reDrawGraph(data);
  });

  

  // Select the container
  const container = d3.select(svgRef.current);

  // Get the size of the container
  const containerSize = container.node()?.getBoundingClientRect();
  // set the dimensions and margins of the graph
  const margin = {top: 10, right: 0, bottom: 10, left: 10};
  let width = (containerSize?.width ?? 0);
  let height = (containerSize?.width ?? 0) * 0.5;
  
  const CreateStuff = () => {
    svg = d3.select(svgRef.current)
    .attr('width', '100%')
    .attr('height', '100%')
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style('background', '#d3d3d3')
    .attr("preserveAspectRatio", "xMinYMin")
    .style("overflow", "visible")
    .on("pointerenter pointermove", pointermoved)
    .on("pointerleave", pointerleft)
    .on("touchstart", event => event.preventDefault());

  tooltip = svg.append("g");
  // @ts-ignore
  bisect = d3.bisector(d =>  new Date(d.date).getTime()).center;

    //setting the scaling
    xScale = d3.scaleTime()
    // @ts-ignore
      .domain(d3.extent(data, d => new Date(d.date).getTime()))
      .range([30, width]);

    yScale = d3.scaleLinear()
    // @ts-ignore
      .domain([0,( d3.max(data, d => {return Math.max(d.ChamberTemp, d.MeatTemp, d.Meat2Temp, d.Meat3Temp)}) * 1.15)])
      .range([height - margin.top - margin.bottom, 0]);

    generateScaledLineChamber = d3.line()
      // @ts-ignore
      .x((d) => {return xScale(new Date(d.date).getTime())})
      // @ts-ignore
      .y((d) => {return yScale(d.ChamberTemp);})
      .curve(d3.curveCardinal)

    generateScaledLineProbe1 = d3.line()
    // @ts-ignore
    .x((d) => {return xScale(new Date(d.date).getTime())})
    // @ts-ignore
    .y((d) => {return yScale(d.MeatTemp);})

    generateScaledLineProbe2 = d3.line()
    // @ts-ignore
    .x((d) => {return xScale(new Date(d.date).getTime())})
    // @ts-ignore
    .y((d) => {return yScale(d.Meat2Temp);})

    generateScaledLineProbe3 = d3.line()
    // @ts-ignore
    .x((d) => {return xScale(new Date(d.date).getTime())})
    // @ts-ignore
    .y((d) => {return yScale(d.Meat3Temp);})
  }
  CreateStuff();

    // Add the event listeners that show or hide the tooltip.
  function pointermoved(event) {

    const i = bisect(data, xScale.invert(d3.pointer(event)[0]));

    tooltip.style("display", null);

    tooltip.attr("transform", `translate(${xScale(new Date(data[i].date).getTime())},${yScale(data[i].ChamberTemp)})`);

    const path = tooltip.selectAll("path")
      .data([,])
      .join("path")
        .attr("fill", "white")
        .attr("stroke", "black");

    const text = tooltip.selectAll("text")
      .data([,])
      .join("text")
      .call(text => text
        .selectAll("tspan")
        .data([formatDate(data[i].date), formatValue(data[i].ChamberTemp, 'Chamber'), formatValue(data[i].MeatTemp, 'Probe1'), formatValue(data[i].Meat2Temp, 'Probe2'), formatValue(data[i].Meat3Temp, 'Probe3')])
        .join("tspan")
          .attr("x", 0)
          .attr("y", (_, i) => `${i * 1.1}em`)
          .attr("font-weight", (_, i) => i ? null : "bold")
          .attr("font-size", (_, i) => i ? "12px" : "14px")
          .text(d => d))

    size(text, path);
  }

  function formatValue(value, Probe: string) {
    return `${Probe}: ${parseFloat(value).toFixed(0) + "°F"}`;
  }
  
  function formatDate(date: Date) {
    let date2 = new Date(date);
    return date2.toLocaleTimeString();
  }

  function pointerleft() {
    tooltip.style("display", "none");
  }

  // Wraps the text with a callout path of the correct size, as measured in the page.
  function size(text, path) {
    const {x, y, width: w, height: h} = text.node().getBBox();
    text.attr("transform", `translate(${-w / 2},${15 - y})`);
    path.attr("d", `M${-w / 2 - 10},5H-5l5,-5l5,5H${w / 2 + 10}v${h + 20}h-${w + 20}z`);
  }

  const reDrawGraph =async (data: TempData[]) => {
    if (!svg.empty()) {
      svg.selectAll('.line')
      .data([data])
      .join('path')
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', '#1f4f2d')
      .attr("stroke-width", 1.5)
      // @ts-ignore
      .attr('d', generateScaledLineChamber)


      svg.append('path')
      .data([data])
      // .join('path')
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', '#2a475e')
      .attr("stroke-width", 1.5)
      // @ts-ignore
      .attr('d', generateScaledLineProbe1)

      svg.append('path')
      .data([data])
      // .join('path')
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', '#118cd8')
      .attr("stroke-width", 1.5)
      // @ts-ignore
      .attr('d', generateScaledLineProbe2)

      svg.append('path')
      .data([data])
      // .join('path')
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', '#5582a7')
      .attr("stroke-width", 1.5)
      // @ts-ignore
      .attr('d', generateScaledLineProbe3)


      svg.selectAll(".xAxis").remove();
      // Add the X Axis
      svg.append("g")
          .attr('class', 'xAxis')
          .attr("transform", "translate(0," + (height - margin.top - margin.bottom) + ")")
          .call(d3.axisBottom(xScale));

      svg.selectAll(".yAxis").remove();
      // Add the Y Axis
      svg.append("g")
        .attr('class', 'yAxis')
        .attr("transform", "translate(30, 0)")
        .call(d3.axisLeft(yScale));
    }
  }
    
  reDrawGraph(data);

  useEffect(() => {
    setData(props.initData);
    if(props.smoking){
      if(!isNaN(props.ChamberTemp) && props.ChamberTemp != 0 && !isNaN(props.MeatTemp) && props.MeatTemp != 0 && !isNaN(props.Meat2Temp) && props.Meat2Temp != 0 && !isNaN(props.Meat3Temp) && props.Meat3Temp != 0){
        data.push({ChamberTemp: props.ChamberTemp, MeatTemp: props.MeatTemp, Meat2Temp: props.Meat2Temp, Meat3Temp: props.Meat3Temp, date: props.date});
      }
    }
    reDrawGraph(data);
  },[props]);

  return (
    <div>
      <svg ref={svgRef}></svg>
    </div>
  );


}

export default TempChart;