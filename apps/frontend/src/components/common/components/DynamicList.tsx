import { Button, TextField } from "@mui/material";
import './Dynamiclist.style.css'
import React from 'react'

interface dynamicListProps {
    onListChange: (step: string, index: number) => void;
    newline: () => void;
    removeLine: (index: number) => void;
    steps: string[];
}

export function DynamicList(props: dynamicListProps ): JSX.Element{
    if(props.steps){
    return (<>
        {props.steps.map((step, index) => (
            <div className="dynamicList">
                <p className="stepNumber">{index + 1}.</p>
                <TextField
                    sx={{marginRight: '10px'}}
                    id="outlined-textarea"
                    label="Step"
                    placeholder="Placeholder"
                    defaultValue={step}
                    value={step}
                    onChange={(event) => {props.onListChange(event.target.value, index)}}
                    multiline
                />
                { props.steps.length === index + 1 ?
                <Button
                    className="addButton"
                    variant="outlined"
                    size="small"
                    onClick={props.newline}
                    >+
                </Button> : 
                <Button
                    className="addButton"
                    variant="outlined"
                    size="small"
                    onClick={() => props.removeLine(index)}
                    >-
                </Button>}
            </div>
        ))}
    </> );  
    } else {
        return <></>
    }
}