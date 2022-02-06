import React from 'react';
import './bottomBar.style.css'
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import SettingsIcon from '@mui/icons-material/Settings';
import ReviewsIcon from '@mui/icons-material/Reviews';
import OutdoorGrillIcon from '@mui/icons-material/OutdoorGrill';

interface buttonBarProps {
    smokeOnClick: any;
    reviewOnClick: any;
    settingsOnClick: any;
}


export function BottomBar (props: buttonBarProps) {
    

        const [value, setValue] = React.useState(0);

        return (
            <div className='bottomBar'>
            <BottomNavigation 
                showLabels
                value={value}
                onChange={(event, newValue) => {
                switch(newValue){
                    case 0:
                        props.smokeOnClick();
                        break;
                    case 1 :
                        props.reviewOnClick();
                        break;
                    case 2:
                        props.settingsOnClick();
                        break;
                }
                setValue(newValue);
            }}>
                <BottomNavigationAction label="Smoke" icon={<OutdoorGrillIcon/>} />
                <BottomNavigationAction label="Review" icon={<ReviewsIcon />} />
                <BottomNavigationAction label="Settings" icon={<SettingsIcon />} />
            </BottomNavigation>
            </div>
        )
    
 }