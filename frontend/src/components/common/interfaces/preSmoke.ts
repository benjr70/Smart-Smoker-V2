import { WeightUnits } from "./enums"

export interface preSmoke {
    name?: string
    meatType?: string
    weight: {
        weight?: number
        unit?: WeightUnits
    }
    Steps?: string[]
    notes?: string
}