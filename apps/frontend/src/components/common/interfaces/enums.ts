export enum Screens {
  HOME = 'HOME',
  HISTORY = 'HISTORY',
  STATS = 'STATS',
  SETTINGS = 'SETTINGS',
}

/**
 * The units a cut of meat is weighed in.
 *
 * Kilograms are not a nicety: pounds and ounces are one country's units, and
 * without this the rest of the world was converting in its head before it could
 * fill the form in. The values are what gets stored, so they are stable strings
 * rather than positions in a list.
 */
export enum WeightUnits {
  LB = 'LB',
  OZ = 'OZ',
  KG = 'KG',
}
