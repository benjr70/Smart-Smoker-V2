import { Autocomplete, Button, MenuItem, Select, TextField } from "@mui/material";
import React from "react";
import { DynamicList } from "../common/components/DynamicList";
import { WeightUnits } from "../common/interfaces/enums";
import { preSmoke } from "../common/interfaces/preSmoke";
import './preSmokeStep.style.css'

const meats = [
    'ribs',
    'brisket',
    'turkey',
];

export class PreSmokeStep extends React.Component<{},{preSmokeState: preSmoke}> {
    constructor(props: any){
        super(props);
        this.state = { preSmokeState: {
            name: '',
            meatType: '',
            weight: {
                unit: WeightUnits.LB
            },
            Steps: [''],
            notes: ''
        }};
       this.handleUnitChange = this.handleUnitChange.bind(this);
       this.updateName = this.updateName.bind(this);
       this.updateMeatType = this.updateMeatType.bind(this);
       this.onNextClick = this.onNextClick.bind(this);
       this.updateWeight = this.updateWeight.bind(this);
       this.updateNotes = this.updateNotes.bind(this);
    }

    handleUnitChange( event: any) {
        let temp = this.state.preSmokeState;
        switch(event.target.value){
            case 'LB':
                temp.weight.unit = WeightUnits.LB
                this.setState({preSmokeState: temp})
                break;
            case 'OZ':
                temp.weight.unit = WeightUnits.OZ
                this.setState({preSmokeState: temp})
                break;
        }
    };

    updateName(event: any){
        let temp = this.state.preSmokeState;
        temp.name = event.target.value;
        this.setState({preSmokeState: temp});
    }

    updateMeatType(newInputValue: string){
        let temp = this.state.preSmokeState;
        temp.meatType = newInputValue;
        this.setState({preSmokeState: temp});
    }

    onNextClick() {
        console.log(this.state.preSmokeState)
    }

    updateWeight(event: any){
        let temp = this.state.preSmokeState;
        temp.weight.weight = event.target.value;
        this.setState({preSmokeState: temp});
    }

    updateNotes(event: any){
        let temp = this.state.preSmokeState;
        temp.notes = event.target.value;
        this.setState({preSmokeState: temp});
    }

    render(): React.ReactNode {
        return (<div className="presmoke">
            <TextField
                sx={{marginBottom: '10px'}}
                id="standard-basic" 
                label="Name" 
                variant="standard" 
                value={this.state.preSmokeState.name}
                onChange={this.updateName}
            />
            <Autocomplete
            sx={{marginBottom: '10px'}}
            freeSolo
             options={meats.map((option) => option)}
            inputValue={this.state.preSmokeState.meatType}
            onInputChange={(event, newInputValue) => {this.updateMeatType(newInputValue)}}
            renderInput={(params) => <TextField  {...params}label="Meat Type"  />}
            />
            <div className="weight">
                <TextField
                    sx={{marginBottom: '10px', marginRight: '10px'}} 
                    type='number' 
                    id="standard-basic" 
                    label="Weight"
                    variant="standard"
                    onChange={this.updateWeight}
                />
                <Select
                    sx={{marginBottom: '10px'}}
                    labelId="demo-simple-select-label"
                    id="demo-simple-select"
                    value={this.state.preSmokeState.weight.unit}
                    label="Age"
                    onChange={this.handleUnitChange}
                >
                    <MenuItem value={WeightUnits.LB}>LB</MenuItem>
                    <MenuItem value={WeightUnits.OZ}>OZ</MenuItem>
                </Select>
            </div>
            <DynamicList/>
            <TextField
               sx={{
                    marginTop: '10px',
                    marginBottom: '10px',
                    width: '350px'
                }}
                id="outlined-multiline-static"
                label="Notes"
                multiline
                onChange={this.updateNotes}
                rows={4}
            />
            <Button
                className="nextButton"
                variant="contained"
                size="small"
                onClick={this.onNextClick}
                >Next
            </Button>
        </div>)
    }
}

