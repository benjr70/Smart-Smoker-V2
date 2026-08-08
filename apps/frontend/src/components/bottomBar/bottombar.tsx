import React from 'react';
import './bottomBar.style.css';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import SettingsIcon from '@mui/icons-material/Settings';
import ReviewsIcon from '@mui/icons-material/Reviews';
import OutdoorGrillIcon from '@mui/icons-material/OutdoorGrill';
import { Box, Grid } from '@mui/material';

/**
 * The height of the bar, in pixels — Material-UI's `BottomNavigation` height,
 * which the bar does not override. The bar is pinned to the viewport and so
 * covers this much of whatever is behind it; anything that has to leave room
 * for the bar measures it from here rather than from a number of its own.
 */
export const BOTTOM_BAR_HEIGHT = 56;

interface buttonBarProps {
  smokeOnClick: any;
  reviewOnClick: any;
  settingsOnClick: any;
}

export function BottomBar(props: buttonBarProps) {
  const [value, setValue] = React.useState(0);

  return (
    <>
      {/* The bar takes itself out of flow, so it gives the space back here:
          an empty box of the bar's height, in flow, immediately before it.
          Every screen is laid out above this, so no screen's last element ends
          up underneath the bar — and because the space is only as tall as the
          bar covers, a screen shorter than the viewport gains neither a
          scrollbar nor a gap. Reserving it here rather than per screen is what
          keeps the next overflowing screen from having to rediscover this. */}
      <Box data-testid="bottom-bar-reservation" sx={{ height: `${BOTTOM_BAR_HEIGHT}px` }} />
      <Grid className="bottomBar">
        <BottomNavigation
          // The bar is its own surface in the design, distinct from the cards it
          // sits below, so it is painted from the navigation token rather than
          // from the paper colour Material-UI would otherwise give it.
          sx={theme => ({ backgroundColor: theme.design.navigation })}
          data-testid="bottom-navigation"
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
          <BottomNavigationAction
            label="Smoke"
            icon={<OutdoorGrillIcon />}
            data-testid="nav-smoke"
          />
          <BottomNavigationAction label="Review" icon={<ReviewsIcon />} data-testid="nav-review" />
          <BottomNavigationAction
            label="Settings"
            icon={<SettingsIcon />}
            data-testid="nav-settings"
          />
        </BottomNavigation>
      </Grid>
    </>
  );
}
