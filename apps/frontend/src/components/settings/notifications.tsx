import { Box, Button, Card, CardContent, Grid, Stack, Switch, TextField, ThemeProvider, Typography, createTheme } from "@mui/material";
import React from "react";




export function NotificationsCard(): JSX.Element {
    return (
    <Grid paddingBottom={1}>
        <Card>
            <CardContent >
                <Typography variant="h5" component="div" align={'center'}>
                    Notifications
                </Typography>
                <Notification/>
            </CardContent>
        </Card>
    </Grid>);
}

function Notification(): JSX.Element {

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

    return (
    <Grid item sx={{ p: 0.5, border: '0.5px solid grey',  borderRadius: 1, padding: '5px'  }}>
        {/* <Box sx={{ p: 0.5, border: '1px solid grey',  borderRadius: 1 }}> */}
            <Grid>
                <Stack direction="row" alignItems="center" justifyContent={'space-between'} >
                    <Stack direction="row" alignItems="center" justifyContent={'flex-start'}>
                        <Typography>Temp</Typography>
                            <Switch />
                        <Typography>Probe</Typography>
                    </Stack>
                    <Button
                        className="addButton"
                        variant="outlined"
                        size="small"
                        >+
                    </Button>
                </Stack>

            </Grid>
            <Grid >
                <TextField 
                    id="outlined-basic"
                    label="Message"
                    variant="standard"
                    // size="small"
                    sx={{width: '100%'}}
                />
            </Grid>
            <Grid paddingTop={2}>
                <TextField
                id="outlined-select-currency-native"
                select
                label="Probe 1"
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
                <TextField
                id="outlined-select-currency-native"
                select
                label="Probe 2"
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
                    // size="small"
                    type="number"
                    sx={{width: '15%'}}
                />
            </Grid>
        {/* </Box> */}
    </Grid>);
}