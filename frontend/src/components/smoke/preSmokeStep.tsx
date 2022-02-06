import { Autocomplete, MenuItem, Select, SelectChangeEvent, TextField } from "@mui/material";
import React from "react";
import { DynamicList } from "../common/components/DynamicList";
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
        return (<div className="presmoke">
            <TextField
                sx={{marginBottom: '10px'}}
                id="standard-basic" 
                label="Name" 
                variant="standard" 
            />
            <Autocomplete
            sx={{marginBottom: '10px'}}
            freeSolo
            options={meats.map((option) => option)}
            renderInput={(params) => <TextField {...params} label="Meat Type" />}
            />
            <div className="weight">
                <TextField sx={{marginBottom: '10px', marginRight: '10px'}} type='number' id="standard-basic" label="Weight" variant="standard" />
                <Select
                    sx={{marginBottom: '10px'}}
                    labelId="demo-simple-select-label"
                    id="demo-simple-select"
                    value={this.state.weightUnit}
                    label="Age"
                    onChange={this.handleUnitChange}
                >
                    <MenuItem value={WeightUnits.LB}>LB</MenuItem>
                    <MenuItem value={WeightUnits.KG}>KG</MenuItem>
                </Select>
            </div>
            <DynamicList/>
            <TextField
               sx={{
                    marginTop: '10px',
                    width: '350px'
                }}
                id="outlined-multiline-static"
                label="Notes"
                multiline
                rows={4}
            />
        </div>)
    }
}

