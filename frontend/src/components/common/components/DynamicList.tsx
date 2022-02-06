import { Button, TextField } from "@mui/material";
import React from "react"
import './Dynamiclist.style.css'

export class DynamicList extends React.Component<{}> {
    constructor(props: any){
        super(props);
    }

    render(): React.ReactNode {
        return (
        <div>
            <TextField
                sx={{marginRight: '10px'}}
                id="outlined-textarea"
                label="Multiline Placeholder"
                placeholder="Placeholder"
                multiline
            />
            <Button
                className="addButton"
                variant="outlined"
                size="small"
                >+
            </Button>
          </div>)
    }
}