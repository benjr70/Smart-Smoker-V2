/**
 * One temperature reading, as the rest of the product has always spelled it.
 *
 * This was the old imperative chart's module, and the type outlived the
 * component: it is the shape a smoke's temperatures are stored and sent in, so
 * the API clients, the history card and the smoker's temps service all name it.
 * The component is gone; the type stays here, unchanged and at the same import
 * path, so nothing outside the chart had to move when the chart was rewritten.
 *
 * The chart itself works in {@link ChartSample}s — see `./chartGeometry` — which
 * is the same reading with the dates already normalized.
 */
export type TempData = {
  ChamberTemp: number;
  MeatTemp: number;
  Meat2Temp: number;
  Meat3Temp: number;
  date: Date;
};
