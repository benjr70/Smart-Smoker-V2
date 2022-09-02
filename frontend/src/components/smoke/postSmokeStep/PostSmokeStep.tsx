import { Grid, TextField } from "@mui/material";
import React from "react";
import { getCurrentPostSmoke, setCurrentPostSmoke } from "../../../Services/postSmokeService";
import { DynamicList } from "../../common/components/DynamicList";
import { IMaskInput } from 'react-imask';


export interface PostSmoke {
    restTime: string;
    steps: string[];
    notes?: string;
}

export class PostSmokeStep extends React.Component<{},{postSmokeState: PostSmoke}> {

    constructor(props: any){
        super(props);
        this.state = { postSmokeState: {
            restTime: '',
            steps: [''],
            notes: ''
        }};

        getCurrentPostSmoke().then(postSmoke => {
            let temp = this.state.postSmokeState;
            temp.notes = postSmoke.notes;
            temp.restTime = postSmoke.restTime;
            temp.steps = postSmoke.steps;
        })
        this.updateName = this.updateName.bind(this);
        this.updateNotes = this.updateNotes.bind(this);
        this.updateSteps = this.updateSteps.bind(this);
    }

    updateName(event: any){
        let temp = this.state.postSmokeState;
        temp.restTime = event.target.value;
        this.setState({postSmokeState: temp});
    }

    newLine() {
        let temp = this.state.postSmokeState;
        temp.steps = [...temp.steps, ''];
        this.setState({postSmokeState: temp});
    }

     removeLine(index: number){
        let temp = this.state.postSmokeState;
        temp.steps.splice(index, 1);
        this.setState({postSmokeState: temp});
    }
    
     updateSteps(value: string, index: number){
        let temp = this.state.postSmokeState;
        temp.steps[index] = value;
        this.setState({postSmokeState: temp});
    }

    updateNotes(event: any){
        let temp = this.state.postSmokeState;
        temp.notes = event.target.value;
        this.setState({postSmokeState: temp});
    }

    componentWillUnmount(){
        setCurrentPostSmoke(this.state.postSmokeState);
    }




    render(): React.ReactNode {
        return (
        <Grid container padding={3}>
            <TextField
                sx={{marginBottom: '10px'}}
                id="standard-basic" 
                label="Rest Time" 
                variant="outlined" 
                value={this.state.postSmokeState.restTime}
                onChange={this.updateName}
                InputProps={{
                    inputComponent: TextMaskCustom as any
                }}

            />
            <DynamicList
                newline ={() => {this.newLine()}}
                removeLine={(index) => {this.removeLine(index)}}
                steps={this.state.postSmokeState.steps}
                onListChange={(step, index) => this.updateSteps(step, index)} />
            <Grid container direction="row" justifyContent='space-around'>
                <TextField
                    sx={{
                        marginTop: '10px',
                        marginBottom: '10px',
                        width: '350px'
                    }}
                    id="outlined-multiline-static"
                    label="Notes"
                    multiline
                    value={this.state.postSmokeState.notes}
                    onChange={this.updateNotes}
                    rows={4}
                />
            </Grid>
        </Grid>);
    }
}

interface CustomProps {
    onChange: (event: { target: { name: string; value: string } }) => void;
    name: string;
  }

const TextMaskCustom = React.forwardRef<HTMLElement, CustomProps>(
    function TextMaskCustom(props, ref) {
        const { onChange, ...other } = props;
        return (
        <IMaskInput
            {...other}
            mask="00:00"
            definitions={{
            '#': /[1-9]/,
            }}
            onAccept={(value: any) => onChange({ target: { name: props.name, value } })}
            overwrite
        />
        );
    },
    );