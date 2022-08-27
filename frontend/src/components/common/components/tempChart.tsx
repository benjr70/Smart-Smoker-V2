import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Grid } from '@mui/material';




function TempChart() {
    

  const svgRef = useRef() as React.RefObject<SVGSVGElement>;
  const [data] = useState([25, 30, 35, 40, 45, 50]);

  useEffect(() => {
    //setting up svg
    const width = 400;
    const hight = 400;
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('hight', hight)
      .style('background', '#d3d3d3')
      .style('margin-top', '20');

    //setting the scaling
    const xScale = d3.scaleLinear()
      .domain([0, data.length -1])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, hight])
      .range([hight, 0]);

      
    // const generateScaledLine = d3.line()
    //   .x((d, i) => xScale(i))
    //   .y(yScale)
    //   .curve(d3.curveCardinal);


    //   svg.selectAll('line')
    //   .data([data])
    //   .join('path')
    //     .attr('d', generateScaledLine)
    //     .attr('fill', 'none')
    //     .attr('stroke', 'black')

  }, [data]);


  return (
    <Grid>
      <svg ref={svgRef}></svg>
    </Grid>
  );


}

export default TempChart;