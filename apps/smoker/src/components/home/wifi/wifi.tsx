import { Button, Grid, IconButton, TextField } from "@mui/material";
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import React, { useRef, useState } from "react";
import './wifi.style.css'
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css"

interface WifiProps {
    onBack: (screen: number) => void
}




export function Wifi(props: WifiProps): JSX.Element {
    const keyboard = useRef()


    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [textInput, setInput] = useState(0);
    const [layout, setLayout] = useState("default");


    const onChange = (input: any) =>{
        if (textInput === 0){
            setSsid(input);
        } else if (textInput === 1){
            setPassword(input)
        }
    }
    
    const onKeyPress = (button:any) => {
        if (button === "{shift}" || button === "{lock}") handleShift();
    }
    

    const handleShift = () => {
        const newLayoutName = layout === "default" ? "shift" : "default";
        setLayout(newLayoutName);
      };

    const setInputChange = (input: number) => {
        setInput(input);
        if(input === 0){
            // @ts-ignore
            keyboard.current.setInput(ssid);
        }else{
            // @ts-ignore
            keyboard.current.setInput(password);
        }
    }


    return (
    <>
        <Grid container spacing={3} justifyContent='space-around' alignItems='flex-start' direction='row' padding={2}>
            <Grid item>
                <IconButton color="primary"  component="label" onClick={() => props.onBack(0)}>
                    <ArrowBackIosIcon/>
                </IconButton>
            </Grid>
            <Grid item>
                <TextField
                    sx={{marginBottom: '10px'}}
                    id="standard-basic" 
                    label="SSid" 
                    variant="outlined" 
                    value={ssid}
                    onClick={() => setInputChange(0)}
                    focused={textInput === 0 ? true : false }
                />
            </Grid>
            <Grid item>
                <TextField
                    sx={{marginBottom: '10px'}}
                    id="standard-basic" 
                    label="Password" 
                    type="password"
                    variant="outlined" 
                    value={password}
                    onClick={() => setInputChange(1)}
                    focused={textInput === 1 ? true : false }
                />
            </Grid>
            <Grid item>
                <Button
                className="button"
                variant="contained"
                size="small">
                    Connect
                </Button>
            </Grid>
        </Grid>
        <Keyboard
            keyboardRef={r => (keyboard.current = r)}
            onChange={onChange}
            onKeyPress={onKeyPress}
            layoutName={layout}
        />
    </>
    );
}

