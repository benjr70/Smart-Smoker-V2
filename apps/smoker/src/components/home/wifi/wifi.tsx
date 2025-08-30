import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PendingIcon from '@mui/icons-material/Pending';
import { Button, Grid, IconButton, TextField, Typography } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { connectToWiFi, getConnection } from "../../../services/deviceService";
import './wifi.style.css';

interface WifiProps {
    onBack: (screen: number) => void
}


declare const VERSION: string;

export function Wifi(props: WifiProps): JSX.Element {
    const keyboard = useRef()

    let versionToDisplay = "unknown";
    try {
        versionToDisplay = VERSION;
    } catch (error) {
        console.log("Cannot get version of application.");
    }


    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [textInput, setInput] = useState(0);
    const [layout, setLayout] = useState("default");
    const [connection, setConnection] = useState(true);
    const [loading, setLoading] = useState(false);
    const [connectionMessage, setConnectionMessage] = useState('')

    useEffect(() => {
        if (!loading) {
            getConnection().then(result => {
                console.log(result);
                if (result.length > 0) {
                    setConnection(true);
                    setConnectionMessage(result[0].ssid)
                } else {
                    setConnection(false);
                    setConnectionMessage('')
                }
            }).catch(err => {
                console.log(err);
            })
        }
    }, [])



    const onChange = (input: any) => {
        if (textInput === 0) {
            setSsid(input);
        } else if (textInput === 1) {
            setPassword(input)
        }
    }

    const onKeyPress = (button: any) => {
        if (button === "{shift}" || button === "{lock}") handleShift();
    }


    const handleShift = () => {
        const newLayoutName = layout === "default" ? "shift" : "default";
        setLayout(newLayoutName);
    };

    const setInputChange = (input: number) => {
        setInput(input);
        if (input === 0) {
            // @ts-ignore
            keyboard.current.setInput(ssid);
        } else {
            // @ts-ignore
            keyboard.current.setInput(password);
        }
    }

    const connectWifi = async () => {
        setLoading(true);
        await connectToWiFi({ ssid, password }).then(async result => {
            console.log('from connect to', result);
            await getConnection().then(result => {
                console.log('from get connection', result)
                if (result && result.length > 0) {
                    setConnectionMessage(result[0].ssid);
                }
            });
            setConnection(true);
        })
            .catch(e => {
                console.log(e);
                setConnection(false);
                setConnectionMessage(e?.response?.data?.error || e.message || 'Connection error');
            }).finally(() => {
                setLoading(false);
            });

    }


    return (
        <>
            <Grid container spacing={3} justifyContent='space-around' alignItems='flex-start' direction='row' paddingTop={2}>
                <Grid item>
                    <IconButton color="primary" component="label" onClick={() => props.onBack(0)}>
                        <ArrowBackIosIcon />
                    </IconButton>
                </Grid>
                <Grid item>
                    <TextField
                        sx={{ marginBottom: '10px' }}
                        id="standard-basic"
                        label="SSid"
                        variant="outlined"
                        value={ssid}
                        onClick={() => setInputChange(0)}
                        focused={textInput === 0 ? true : false}
                    />
                </Grid>
                <Grid item>
                    <TextField
                        sx={{ marginBottom: '10px' }}
                        id="standard-basic"
                        label="Password"
                        type="password"
                        variant="outlined"
                        value={password}
                        onClick={() => setInputChange(1)}
                        focused={textInput === 1 ? true : false}
                    />
                </Grid>
                <Grid item>
                    <Button
                        className="button"
                        variant="contained"
                        size="small"
                        onClick={() => connectWifi()}>
                        Connect
                    </Button>
                </Grid>
            </Grid>
            <Grid container spacing={3} justifyContent='center' alignItems='flex-start' padding={0}>
                {loading ?
                    <>
                        <Grid item>
                            <IconButton color="info" component="label">
                                <PendingIcon />
                            </IconButton>
                        </Grid>
                        <Grid item justifyContent={'flex-start'}>
                            <Typography variant="h6" component="div">
                                Connecting
                            </Typography>
                        </Grid>
                    </> :
                    <>
                        {connection ?
                            <>
                                <Grid item>
                                    <IconButton color="success" component="label">
                                        <CheckCircleOutlineIcon />
                                    </IconButton>
                                </Grid>
                                <Grid item justifyContent={'flex-start'}>
                                    <Typography variant="h6" component="div">
                                        Connected: {connectionMessage}
                                    </Typography>
                                </Grid>
                            </>
                            :
                            <>
                                <Grid item>
                                    <IconButton color="error" component="label">
                                        <ErrorOutlineIcon />
                                    </IconButton>
                                </Grid>
                                <Grid item justifyContent={'flex-start'}>
                                    <Typography variant="h6" component="div">
                                        Disconnected: {connectionMessage}
                                    </Typography>
                                </Grid>
                            </>}
                    </>}
            </Grid>
            <Grid container sx={{ margin: '5px' }} justifyContent='flex-end' alignItems={'flex-end'} >
                {`Version: ${versionToDisplay}`}
            </Grid>
            <Grid container spacing={3} alignItems={'flex-end'}>
                <Keyboard
                    keyboardRef={r => (keyboard.current = r)}
                    onChange={onChange}
                    onKeyPress={onKeyPress}
                    layoutName={layout}
                />
            </Grid>
        </>
    );
}

