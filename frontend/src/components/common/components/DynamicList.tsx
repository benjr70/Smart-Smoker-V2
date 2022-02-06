import { Button, TextField } from "@mui/material";
import React from "react"
import './Dynamiclist.style.css'

export class DynamicList extends React.Component<{},{steps: string[]}> {

    constructor(props: any){
        super(props);
        this.state = {steps: ['']};
        this.newLine = this.newLine.bind(this);
        this.removeLine = this.removeLine.bind(this);
    }
    
    newLine() {
       this.setState({steps: [...this.state.steps, '']})
    }

    removeLine(index: number) {
        this.state.steps.splice(index, 1);
        this.setState({steps: this.state.steps});
    }
    
    updateSteps(event: any, index: number){
        let temp = this.state.steps
        temp[index] = event.target.value;
        this.setState({steps: temp})
    }

    render(): React.ReactNode {
        return (
        this.state.steps.map((step, index) => (
            <div className="dynamicList">
                <p className="stepNumber">{index + 1}.</p>
                <TextField
                    sx={{marginRight: '10px'}}
                    id="outlined-textarea"
                    label="Step"
                    placeholder="Placeholder"
                    defaultValue={step}
                    value = {step}
                    onChange={(event) => {this.updateSteps(event, index)}}
                    multiline
                />
                { this.state.steps.length === index + 1 ?
                <Button
                    className="addButton"
                    variant="outlined"
                    size="small"
                    onClick={this.newLine}
                    >+
                </Button> : 
                <Button
                    className="addButton"
                    variant="outlined"
                    size="small"
                    onClick={() => this.removeLine(index)}
                    >-
                </Button>}
            </div>
        ))
        )
    }
}