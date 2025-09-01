import React from 'react';
import './bottomBar.style.css';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import SettingsIcon from '@mui/icons-material/Settings';
import ReviewsIcon from '@mui/icons-material/Reviews';
import OutdoorGrillIcon from '@mui/icons-material/OutdoorGrill';
import { Grid } from '@mui/material';

interface buttonBarProps {
  smokeOnClick: any;
  reviewOnClick: any;
  settingsOnClick: any;
}

export function BottomBar(props: buttonBarProps) {
  const [value, setValue] = React.useState(0);

  return (
    <Grid className="bottomBar">
      <BottomNavigation
        showLabels
        value={value}
        onChange={(event, newValue) => {
          switch (newValue) {
            case 0:
              if (props.smokeOnClick && typeof props.smokeOnClick === 'function') {
                props.smokeOnClick();
              }
              break;
            case 1:
              if (props.reviewOnClick && typeof props.reviewOnClick === 'function') {
                props.reviewOnClick();
              }
              break;
            case 2:
              if (props.settingsOnClick && typeof props.settingsOnClick === 'function') {
                props.settingsOnClick();
              }
              break;
          }
          setValue(newValue);
        }}
      >
        <BottomNavigationAction label="Smoke" icon={<OutdoorGrillIcon />} />
        <BottomNavigationAction label="Review" icon={<ReviewsIcon />} />
        <BottomNavigationAction label="Settings" icon={<SettingsIcon />} />
      </BottomNavigation>
    </Grid>
  );
}
