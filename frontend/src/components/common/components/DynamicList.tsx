import { Button, TextField } from "@mui/material";
import React from "react"


export class DynamicList extends React.Component<{}> {
    constructor(props: any){
        super(props);
    }

    render(): React.ReactNode {
        return (<>        
        <TextField
            id="outlined-textarea"
            label="Multiline Placeholder"
            placeholder="Placeholder"
            multiline
          />
          <Button  variant="outlined" size="small">+</Button>
          </>)
    }
}