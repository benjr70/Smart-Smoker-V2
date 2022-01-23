import { Autocomplete, InputLabel, MenuItem, Select, SelectChangeEvent, TextField } from "@mui/material";
import React from "react";
import { WeightUnits } from "../common/interfaces/enums";
import './preSmokeStep.style.css'

const meats = [
    'ribs',
    'brisket',
    'turkey',
];

export class PreSmokeStep extends React.Component<{},{weightUnit: WeightUnits}> {
    constructor(props: any){
        super(props);
        this.state = {weightUnit: WeightUnits.LB};
       this.handleUnitChange = this.handleUnitChange.bind(this);
    }

    handleUnitChange( event: SelectChangeEvent) {
        console.log('here',  event.target.value)
        switch(event.target.value){
            case 'LB':
                this.setState({weightUnit: WeightUnits.LB})
                break;
            case 'KG':
                this.setState({weightUnit: WeightUnits.KG})
                break;
        }
      };


    render(): React.ReactNode {
        return (<div>
            <TextField className="input" id="standard-basic" label="Name" variant="standard" />
            <Autocomplete
            className="input"
            freeSolo
            options={meats.map((option) => option)}
            renderInput={(params) => <TextField {...params} label="Meat Type" />}
            />
            <TextField className="input" id="standard-basic" label="Weight" variant="standard" />
            <InputLabel  id="demo-simple-select-label">Unit</InputLabel>
            <Select
                labelId="demo-simple-select-label"
                id="demo-simple-select"
                value={this.state.weightUnit}
                label="Age"
                onChange={this.handleUnitChange}
            >
                <MenuItem value={WeightUnits.LB}>LB</MenuItem>
                <MenuItem value={WeightUnits.KG}>KG</MenuItem>
            </Select>
            <TextField
                className="input"
                id="outlined-multiline-static"
                label="Notes"
                multiline
                rows={4}
            />
        </div>)
    }
}
