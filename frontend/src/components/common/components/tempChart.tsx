import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

 interface data {
  temp1: number;
  temp2: number;
  date: Date;
 }

function TempChart(props: data) {
    

  const svgRef = useRef() as React.RefObject<SVGSVGElement>;
  const [data] = useState([{temp1: props.temp1, temp2: props.temp2, date: props.date}]);

  const createGraph =async (data: data[]) => {
    
    // set the dimensions and margins of the graph
    const margin = {top: 10, right: 0, bottom: 10, left: 0};
    const width = 400 - margin.left - margin.right;
    const height = 150 - margin.top - margin.bottom;


    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('hight', height  + margin.top + margin.bottom)
      .style('background', '#d3d3d3')

    //setting the scaling
    const xScale = d3.scaleTime()
    // @ts-ignore
      .domain(d3.extent(data, d => new Date(d.date).getTime()))
      .range([20, width]);

    const yScale = d3.scaleLinear()
    // @ts-ignore
      .domain([0,( d3.max(data, d => {return d.temp1 > d.temp2 ? d.temp1 : d.temp2}) * 1.15)])
      .range([height, 0]);

    const generateScaledLine1 = d3.line()
      // @ts-ignore
      .x((d) => {return xScale(new Date(d.date).getTime())})
      // @ts-ignore
      .y((d) => {return yScale(d.temp1);})
      .curve(d3.curveCardinal)

      const generateScaledLine2 = d3.line()
      // @ts-ignore
      .x((d) => {return xScale(new Date(d.date).getTime())})
      // @ts-ignore
      .y((d) => {return yScale(d.temp2);})
      .curve(d3.curveCardinal)


      svg.selectAll('.line')
      .data([data])
      .join('path')
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', 'black')
      // @ts-ignore
      .attr('d', generateScaledLine1)


      svg.append('path')
      .data([data])
      // .join('path')
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', 'blue')
      // @ts-ignore
      .attr('d', generateScaledLine2)


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
      .attr("transform", "translate(20, 0)")
      .call(d3.axisLeft(yScale));

  }



  useEffect(() => {
    if(!isNaN(props.temp1) && props.temp1 != 0 && !isNaN(props.temp2) && props.temp2 != 0){
      data.push({temp1: props.temp1, temp2: props.temp2, date: props.date});
    }
    createGraph(data);
  },[props.temp1]);

  return (
    <div>
      <svg ref={svgRef}></svg>
    </div>
  );


}

export default TempChart;