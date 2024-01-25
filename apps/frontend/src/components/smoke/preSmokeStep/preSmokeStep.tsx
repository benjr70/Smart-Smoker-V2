import { Autocomplete, Grid, MenuItem, Select, TextField } from "@mui/material";
import React from "react";
import { getCurrentPreSmoke, setCurrentPreSmoke } from "../../../Services/preSmokeService";
import { DynamicList } from "../../common/components/DynamicList";
import { WeightUnits } from "../../common/interfaces/enums";
import { preSmoke } from "../../common/interfaces/preSmoke";
import './preSmokeStep.style.css'

const meats = [
    'ribs',
    'brisket',
    'turkey',
];

type PreSmokeStepProps = {
    nextButton: JSX.Element;
  };
  

export class PreSmokeStep extends React.Component<PreSmokeStepProps,{preSmokeState: preSmoke}> {
    constructor(props: any){
        super(props);
        this.state = { preSmokeState: {
            name: '',
            meatType: '',
            weight: {
                unit: WeightUnits.LB
            },
            steps: [''],
            notes: ''
        }};
       this.handleUnitChange = this.handleUnitChange.bind(this);
       this.updateName = this.updateName.bind(this);
       this.updateMeatType = this.updateMeatType.bind(this);
       this.onNextClick = this.onNextClick.bind(this);
       this.updateWeight = this.updateWeight.bind(this);
       this.updateNotes = this.updateNotes.bind(this);
       this.newLine = this.newLine.bind(this);
       this.removeLine = this.removeLine.bind(this);
       this.updateSteps = this.updateSteps.bind(this);
    }

    componentDidMount(): void {
        getCurrentPreSmoke().then(result => {
            this.setState({preSmokeState: result});
         })
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
        setCurrentPreSmoke(this.state.preSmokeState);
    }

    componentWillUnmount() {
        setCurrentPreSmoke(this.state.preSmokeState);
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
    
     newLine() {
        let temp = this.state.preSmokeState;
        temp.steps = [...temp.steps, ''];
        this.setState({preSmokeState: temp});
    }

     removeLine(index: number){
        let temp = this.state.preSmokeState;
        temp.steps.splice(index, 1);
        this.setState({preSmokeState: temp});
    }
    
     updateSteps(value: string, index: number){
        let temp = this.state.preSmokeState;
        temp.steps[index] = value;
        this.setState({preSmokeState: temp});
    }

    render(): React.ReactNode {
        return (
        <Grid item xs={11} flexDirection='column'>
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
            <Grid className="weight">
                <TextField
                    sx={{marginBottom: '10px', marginRight: '10px'}} 
                    type='number' 
                    id="standard-basic" 
                    label="Weight"
                    variant="standard"
                    value={this.state.preSmokeState.weight.weight ? this.state.preSmokeState.weight.weight: ''}
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
            </Grid>
            <Grid flexDirection='column'>
                <DynamicList
                    newline ={() => {this.newLine()}}
                    removeLine={(index) => {this.removeLine(index)}}
                    steps={this.state.preSmokeState.steps}
                    onListChange={(step, index) => this.updateSteps(step, index)} />
            </Grid>
            <TextField
               sx={{
                    marginTop: '10px',
                    marginBottom: '10px',
                    width: '100%'
                }}
                id="outlined-multiline-static"
                label="Notes"
                multiline
                value={this.state.preSmokeState.notes}
                onChange={this.updateNotes}
                rows={4}
            />
            <Grid container flexDirection='row-reverse'>
                {this.props.nextButton}
            </Grid>
        </Grid>)
    }
}

