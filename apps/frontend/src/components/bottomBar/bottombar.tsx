import React from 'react';
import './bottomBar.style.css';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import { Box, Grid } from '@mui/material';
import { FlameIcon, HistoryIcon, SettingsIcon } from '../common/components/DesignIcons';
import { Screens } from '../common/interfaces/enums';

/**
 * The height of the bar, in pixels — Material-UI's `BottomNavigation` height,
 * which the bar does not override. The bar is pinned to the viewport and so
 * covers this much of whatever is behind it; anything that has to leave room
 * for the bar measures it from here rather than from a number of its own.
 */
export const BOTTOM_BAR_HEIGHT = 56;

interface buttonBarProps {
  /**
   * The screen actually in effect. The bar lights whichever destination leads
   * here rather than remembering the last one tapped: taps are not the only way
   * to arrive anywhere — finishing a smoke sends the user to the history from
   * the completion screen — and a bar that remembers instead of reading goes on
   * lighting SMOKE while the history is on screen.
   */
  currentScreen: Screens;
  smokeOnClick: any;
  historyOnClick: any;
  settingsOnClick: any;
}

/**
 * The three destinations, in the order the design puts them, each with the
 * screen it leads to — which is also how the bar recognises the screen in
 * effect as one of its own. The design draws a fourth — Stats — which is
 * deliberately not built (see the parent PRD's carve-outs), so it is not
 * offered here either: a tab leading nowhere is worse than an absent one.
 */
const destinations = [
  { label: 'Smoke', icon: <FlameIcon />, testId: 'nav-smoke', screen: Screens.HOME },
  { label: 'History', icon: <HistoryIcon />, testId: 'nav-history', screen: Screens.HISTORY },
  { label: 'Settings', icon: <SettingsIcon />, testId: 'nav-settings', screen: Screens.SETTINGS },
] as const;

export function BottomBar(props: buttonBarProps) {
  // Which destination is lit is read off the screen in effect on every render.
  // A screen no destination leads to — none does today — lights none of them,
  // which is what the index of a screen that is not here comes to.
  const value = destinations.findIndex(destination => destination.screen === props.currentScreen);

  const handlers = [props.smokeOnClick, props.historyOnClick, props.settingsOnClick];

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
            // Asking to go somewhere is all a tap does; what the bar lights
            // follows from having arrived, on the next render.
            const handler = handlers[newValue];
            if (typeof handler === 'function') {
              handler();
            }
          }}
        >
          {destinations.map(destination => (
            <BottomNavigationAction
              key={destination.label}
              label={destination.label}
              icon={destination.icon}
              data-testid={destination.testId}
              // The design sets its navigation labels in small upper-case with
              // the letters opened up. The transform is applied to the painted
              // text rather than to the string, so what a screen reader
              // announces — and what a test looks a destination up by — stays
              // the word itself.
              sx={{
                '& .MuiBottomNavigationAction-label': {
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontSize: '0.625rem',
                  fontWeight: 700,
                },
              }}
            />
          ))}
        </BottomNavigation>
      </Grid>
    </>
  );
}
