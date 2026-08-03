/**
 * The chart is drawn in the colours it is given.
 *
 * It used to name every one of them itself — a light-grey panel, four stroke
 * colours, a white callout outlined in black — which is a colour scheme written
 * into a component that has no idea which scheme is in effect. On a dark screen
 * that left a light-grey block with axis labels the same colour as the panel.
 *
 * The colours are a prop now, defaulting to exactly the ones the chart has
 * always drawn, so a consumer that has not been recoloured (the touchscreen
 * application) keeps the appearance it has today while the web app hands the
 * chart the palette of the scheme in effect.
 */
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import * as d3 from 'd3';
import React from 'react';
import TempChart, { ChartColors, TempData, defaultChartColors } from './tempChart';
import { clearStoredCallbacks, triggerCallback } from './__mocks__/d3';

const tempData: TempData[] = [
  {
    ChamberTemp: 225,
    MeatTemp: 150,
    Meat2Temp: 160,
    Meat3Temp: 155,
    date: new Date('2023-01-01T12:00:00'),
  },
  {
    ChamberTemp: 230,
    MeatTemp: 155,
    Meat2Temp: 165,
    Meat3Temp: 160,
    date: new Date('2023-01-01T12:05:00'),
  },
];

const defaultProps = {
  ChamberName: 'Chamber',
  Probe1Name: 'Probe 1',
  Probe2Name: 'Probe 2',
  Probe3Name: 'Probe 3',
  ChamberTemp: 225,
  MeatTemp: 150,
  Meat2Temp: 160,
  Meat3Temp: 155,
  date: new Date('2023-01-01T12:00:00'),
  smoking: false,
  initData: tempData,
};

/** A palette nothing like the one the chart used to name for itself. */
const darkColors: ChartColors = {
  surface: '#202020',
  probes: {
    chamber: '#4FBF6A',
    probe1: '#7FA9C9',
    probe2: '#4FB5FF',
    probe3: '#A8C4DB',
  },
  tooltipSurface: '#161616',
  tooltipBorder: '#8E8E8A',
  tooltipText: '#F0EFED',
};

/** The one selection every d3 call in the component paints through. */
const painted = () => (d3.select as jest.Mock)('svg') as any;

/** Every value the component ever passed to `.style(name, …)`. */
const styled = (name: string): string[] =>
  painted()
    .style.mock.calls.filter((call: unknown[]) => call[0] === name)
    .map((call: string[]) => call[1]);

/** Every value the component ever passed to `.attr(name, …)`. */
const attributed = (name: string): string[] =>
  painted()
    .attr.mock.calls.filter((call: unknown[]) => call[0] === name)
    .map((call: string[]) => call[1]);

describe('the temperature chart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearStoredCallbacks();
  });

  describe('given no colours', () => {
    it('paints the panel and the four lines it has always painted', () => {
      render(<TempChart {...defaultProps} />);

      expect(styled('background')).toContain('#d3d3d3');
      expect(attributed('stroke')).toEqual(
        expect.arrayContaining(['#1f4f2d', '#2a475e', '#118cd8', '#5582a7'])
      );
    });

    it('publishes those colours as the default set', () => {
      expect(defaultChartColors).toEqual({
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
      });
    });
  });

  describe('given a palette', () => {
    it('paints its panel in the surface it was given', () => {
      render(<TempChart {...defaultProps} colors={darkColors} />);

      expect(styled('background')).toContain('#202020');
      expect(styled('background')).not.toContain('#d3d3d3');
    });

    it('draws each probe’s line in that probe’s colour', () => {
      render(<TempChart {...defaultProps} colors={darkColors} />);

      expect(attributed('stroke')).toEqual(
        expect.arrayContaining(['#4FBF6A', '#7FA9C9', '#4FB5FF', '#A8C4DB'])
      );
      expect(attributed('stroke')).not.toContain('#1f4f2d');
    });

    /**
     * Switching scheme re-renders the chart with a new palette but produces no
     * new readings, so a chart that only recoloured itself as data arrived would
     * sit in the old scheme's colours until the next temperature came in.
     */
    it('repaints itself when the palette changes under it', () => {
      const { rerender } = render(<TempChart {...defaultProps} />);
      (d3.select as jest.Mock).mockClear();
      painted().style.mockClear();
      painted().attr.mockClear();

      rerender(<TempChart {...defaultProps} colors={darkColors} />);

      expect(styled('background')).toContain('#202020');
      expect(attributed('stroke')).toEqual(
        expect.arrayContaining(['#4FBF6A', '#7FA9C9', '#4FB5FF', '#A8C4DB'])
      );
    });
  });

  /**
   * The readings under the pointer are the most-read text the chart draws, and
   * the callout they sit in was a white box with a black outline whatever the
   * scheme — near-white text on white once the page went dark.
   */
  describe('its hover callout', () => {
    it('is drawn in the callout colours it was given', () => {
      render(<TempChart {...defaultProps} colors={darkColors} />);

      triggerCallback('pointerenter pointermove', { target: null });

      expect(attributed('fill')).toContain('#161616');
      expect(attributed('stroke')).toContain('#8E8E8A');
      expect(attributed('fill')).toContain('#F0EFED');
    });

    it('keeps its white box and black text when no colours are given', () => {
      render(<TempChart {...defaultProps} />);

      triggerCallback('pointerenter pointermove', { target: null });

      expect(attributed('fill')).toContain('white');
      expect(attributed('stroke')).toContain('black');
      expect(attributed('fill')).toContain('black');
    });
  });
});
