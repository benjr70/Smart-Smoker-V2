import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

 export interface TempData {
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
  height: number;
  width: number;
  smoking: boolean;
  initData: TempData[];
 }

 function TempChart(props: props) {
    
  const svgRef = useRef() as React.RefObject<SVGSVGElement>;
  const [data, setData] = useState(props.initData);

    // set the dimensions and margins of the graph
    const margin = {top: 10, right: 0, bottom: 10, left: 10};
    const width = props.width - margin.left - margin.right;
    const height = props.height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height  + margin.top + margin.bottom)
      .style('background', '#d3d3d3')
      
    //setting the scaling
    const xScale = d3.scaleTime()
    // @ts-ignore
      .domain(d3.extent(data, d => new Date(d.date).getTime()))
      .range([30, width]);

    const yScale = d3.scaleLinear()
    // @ts-ignore
      .domain([0,( d3.max(data, d => {return Math.max(d.ChamberTemp, d.MeatTemp, d.Meat2Temp, d.Meat3Temp)}) * 1.15)])
      .range([height, 0]);

    const generateScaledLineChamber = d3.line()
      // @ts-ignore
      .x((d) => {return xScale(new Date(d.date).getTime())})
      // @ts-ignore
      .y((d) => {return yScale(d.ChamberTemp);})
      .curve(d3.curveCardinal)

      const generateScaledLineProbe1 = d3.line()
      // @ts-ignore
      .x((d) => {return xScale(new Date(d.date).getTime())})
      // @ts-ignore
      .y((d) => {return yScale(d.MeatTemp);})

      const generateScaledLineProbe2 = d3.line()
      // @ts-ignore
      .x((d) => {return xScale(new Date(d.date).getTime())})
      // @ts-ignore
      .y((d) => {return yScale(d.Meat2Temp);})

      const generateScaledLineProbe3 = d3.line()
      // @ts-ignore
      .x((d) => {return xScale(new Date(d.date).getTime())})
      // @ts-ignore
      .y((d) => {return yScale(d.Meat3Temp);})

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
          .attr("transform", "translate(0," + height + ")")
          .call(d3.axisBottom(xScale));

      svg.selectAll(".yAxis").remove();
      // Add the Y Axis
      svg.append("g")
        .attr('class', 'yAxis')
        .attr("transform", "translate(30, 0)")
        .call(d3.axisLeft(yScale));
    }
  }

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