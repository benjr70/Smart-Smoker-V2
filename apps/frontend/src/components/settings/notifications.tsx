import { Box, Button, Card, CardContent, Grid, IconButton, Stack, Switch, TextField, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleIcon from '@mui/icons-material/AddCircle';


export interface Notification {
    type: boolean;
    message: string;
    probe1: string;
    op: string;
    probe2?: string;
    offset?: number;
    temperature?: number;
}

export function NotificationsCard(): JSX.Element {

    const initialNotification: Notification = {
        type: false,
        message: '',
        probe1: '',
        op: '',
    }

    const [Notifications, setNotifications] = React.useState([initialNotification]);

    const handleNewRule = () => {
        setNotifications([...Notifications, initialNotification]);
    }

    const handleDelete = (index: number) => {
        let temp = Notifications;
        temp.splice(index, 1);
        setNotifications([...temp]);
    }

    const handleNotificationChange = (notification: Notification, index: number) => {
        let temp = Notifications;
        temp[index] = notification;
        setNotifications([...temp]);
    }

    return (
    <Grid paddingBottom={1}>
        <Card>
            <CardContent >
                <Grid >
                    <Typography variant="h5" component="div" align={'center'}>
                        Notifications
                    </Typography>
                    {Notifications.map((notification, index) => {
                        return <Notification 
                                notification={notification}
                                handleDelete={handleDelete}
                                index={index}
                                onNotificationChange={handleNotificationChange}
                                key={`notification${index}`}
                                />
                    })}
                    <Button variant="contained" startIcon={<AddCircleIcon/>} onClick={handleNewRule} >
                        New Rule
                    </Button>
                </Grid>
            </CardContent>
        </Card>
    </Grid>);
}

interface NotificationProps {
    notification: Notification;
    handleDelete: (index: number) => void;
    onNotificationChange?: (notification: Notification, index: number) => void;
    index: number;
}

function Notification(props: NotificationProps): JSX.Element {

    const Probes = [
            {
                value: 'Chamber',
                label: 'Chamber',
            },
            {
                value: 'Probe 1',
                label: 'Probe 1',
            },
            {
                value: 'Probe 2',
                label: 'Probe 2',
            },
            {
                value: 'Probe 3',
                label: 'Probe 4',
            },
        ];

    const operations = [
            {
                value: '>',
                label: '>',
            },
            {
                value: '<',
                label: '<',
            }
        ];

        const handleSwitchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            let temp = props.notification;
            temp.type = event.target.checked;
            props.onNotificationChange && props.onNotificationChange(temp, props.index);
        }

        const onMessageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            let temp = props.notification;
            temp.message = event.target.value;
            props.onNotificationChange && props.onNotificationChange(temp, props.index);
        }

        const onProbe1Change = (event: React.ChangeEvent<HTMLInputElement>) => {
            let temp = props.notification;
            temp.probe1 = event.target.value;
            props.onNotificationChange && props.onNotificationChange(temp, props.index);
        }

        const onOpsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            let temp = props.notification;
            temp.op = event.target.value;
            props.onNotificationChange && props.onNotificationChange(temp, props.index);
        }

        const onProbe2Change = (event: React.ChangeEvent<HTMLInputElement>) => {
            let temp = props.notification;
            temp.probe2 = event.target.value;
            props.onNotificationChange && props.onNotificationChange(temp, props.index);
        }

        const offsetChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            let temp = props.notification;
            temp.offset = Number(event.target.value);
            props.onNotificationChange && props.onNotificationChange(temp, props.index);
        }

        const onTemperatureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            let temp = props.notification;
            temp.temperature = Number(event.target.value);
            props.onNotificationChange && props.onNotificationChange(temp, props.index);
        }

    return (
    <Grid item sx={{ p: 0.5, border: '0.5px solid grey',  borderRadius: 1, padding: '5px'  }}>
        {/* <Box sx={{ p: 0.5, border: '1px solid grey',  borderRadius: 1 }}> */}
            <Grid>
                <Stack direction="row" alignItems="center" justifyContent={'space-between'} >
                    <Stack direction="row" alignItems="center" justifyContent={'flex-start'}>
                        <Typography>Temp</Typography>
                            <Switch 
                            checked={props.notification.type}
                            onChange={handleSwitchChange}/>
                        <Typography>Probe</Typography>
                    </Stack>
                    <IconButton aria-label="delete" onClick={(e) => {props.handleDelete(props.index)}}>
                        <DeleteIcon />
                    </IconButton>
                </Stack>

            </Grid>
            <Grid >
                <TextField 
                    id="outlined-basic"
                    label="Message"
                    variant="standard"
                    value={props.notification.message}
                    onChange={onMessageChange}
                    // size="small"
                    sx={{width: '100%'}}
                />
            </Grid>
            <Grid paddingTop={2}>
                <TextField
                    id="outlined-select-currency-native"
                    select
                    label="Probe 1"
                    value={props.notification.probe1}
                    onChange={onProbe1Change}
                    // size="small"
                    sx={{width: '34%'}}
                    variant="standard"
                    SelectProps={{
                        native: true,
                    }}
                >
                    {Probes.map((option) => (
                        <option key={option.value} value={option.value}>
                        {option.label}
                        </option>
                    ))}
                </TextField>
                <TextField
                    id="outlined-select-currency-native"
                    select
                    label="Op"
                    value={props.notification.op}
                    onChange={onOpsChange}
                    // size="small"
                    variant="standard"
                    sx={{width: '16%'}}
                    SelectProps={{
                        native: true,
                    }}
                >
                    {operations.map((option) => (
                        <option key={option.value} value={option.value}>
                        {option.label}
                        </option>
                    ))}
                </TextField>
                {props.notification.type ? <>
                <TextField
                    id="outlined-select-currency-native"
                    select
                    label="Probe 2"
                    value={props.notification.probe2}
                    onChange={onProbe2Change}
                    // size="small"
                    variant="standard"
                    sx={{width: '34%'}}
                    SelectProps={{
                        native: true,
                    }}
                >
                    {Probes.map((option) => (
                        <option key={option.value} value={option.value}>
                        {option.label}
                        </option>
                    ))}
                </TextField>
                <TextField 
                    id="outlined-basic"
                    label="offset"
                    variant="standard"
                    value={props.notification.offset}
                    onAbort={offsetChange}
                    // size="small"
                    type="number"
                    sx={{width: '15%'}}
                /> </>:
                <TextField 
                    id="outlined-basic"
                    label="Temperature"
                    variant="standard"
                    value={props.notification.temperature}
                    onChange={onTemperatureChange}
                    // size="small"
                    type="number"
                    sx={{width: '34%'}}
                /> }
            </Grid>
        {/* </Box> */}
    </Grid>);
}