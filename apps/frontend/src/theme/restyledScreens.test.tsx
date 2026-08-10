/**
 * Every screen is recoloured to the design's palette, in both schemes.
 *
 * The screens are rendered the way the application root renders them — inside
 * the colour-scheme provider, with the design's palette applied — and each
 * assertion is about a colour the browser computes, because that is what the
 * user actually sees. A screen that still carried a colour of its own would
 * report the same value under both schemes and fail the dark half.
 */
import { Experimental_CssVarsProvider as CssVarsProvider, useColorScheme } from '@mui/material';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../api';
import { createFakeBackend } from '../api/fakeBackend';
import { PostSmoke, PreSmoke, SmokeHistory, SmokeProfile, rating } from '../api/types';
import { SmokeSessionProvider } from 'smoke-session/src/react';
import { FakeCloudSocket, FakeSessionApi, SteppingClock } from 'smoke-session/src/testing';
import { PaletteTokens } from 'theme/src';
import { BottomBar } from '../components/bottomBar/bottombar';
import { History } from '../components/history/history';
import { Smoke } from '../components/smoke/smoke';
import { PostSmokeStep } from '../components/smoke/postSmokeStep/PostSmokeStep';
import { SmokeStepView } from '../components/smoke/smokeStep/smokeStep';
import { PostSmokeCard } from '../components/history/smokeCards/postSmokeCard';
import { PreSmokeCard } from '../components/history/smokeCards/preSmokeCard';
import { RatingsCard } from '../components/history/smokeCards/ratingsCard';
import { SmokeProfileCard } from '../components/history/smokeCards/smokeProfileCard';
import { WeightUnits } from '../components/common/interfaces/enums';
import { DesignSurface, appTheme, carbonDark, carbonLight } from './index';

/** The four lines the chart draws, in the order it draws them. */
const seriesStrokes = (container: HTMLElement): (string | null)[] =>
  Array.from(container.querySelectorAll('path[data-series]')).map(line =>
    line.getAttribute('stroke')
  );

/** The panel the plot is drawn on: the first thing the chart paints. */
const chartPanel = (container: HTMLElement): string | null =>
  container.querySelector('svg rect')?.getAttribute('fill') ?? null;

/** A screen, mounted and themed exactly as the application root mounts it. */
const renderUnder = (scheme: 'light' | 'dark', ui: JSX.Element) => {
  localStorage.clear();
  const client = createApiClient(createFakeBackend({ history: [historyRow()] }));

  return render(
    <CssVarsProvider theme={appTheme} defaultMode={scheme}>
      <DesignSurface>
        <ApiClientProvider client={client}>
          <SnackbarProvider>{ui}</SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
};

const historyRow = (): SmokeHistory => ({
  name: 'Brisket',
  meatType: 'Brisket',
  weight: '12',
  weightUnit: 'lbs',
  woodType: 'Hickory',
  date: '2023-07-15',
  smokeId: 'smoke-1',
  overAllRating: '5',
  durationMs: 6 * 60 * 60 * 1000,
});

describe('the history list', () => {
  it('paints its cards the dark surface when the dark scheme is in effect', async () => {
    renderUnder('dark', <History />);

    expect(await screen.findByTestId('smoke-card')).toHaveStyle({
      backgroundColor: carbonDark.surface,
    });
  });

  it('paints them the light surface when the light scheme is in effect', async () => {
    renderUnder('light', <History />);

    expect(await screen.findByTestId('smoke-card')).toHaveStyle({
      backgroundColor: carbonLight.surface,
    });
  });
});

/**
 * The four cards of the history detail each used to construct a private theme
 * saying "a card is white with round corners", which survived any scheme the
 * application chose. The card treatment is the shared theme's now, so each of
 * them follows the scheme like everything else.
 */
const reviewCards: [string, JSX.Element][] = [
  ['review-presmoke-card', <PreSmokeCard preSmoke={preSmoke()} key="pre" />],
  ['review-smoke-card', <SmokeProfileCard smokeProfile={smokeProfile()} temps={[]} key="smoke" />],
  ['review-postsmoke-card', <PostSmokeCard postSmoke={postSmoke()} key="post" />],
  ['review-ratings-card', <RatingsCard ratings={ratings()} key="ratings" />],
];

describe.each(reviewCards)('the history detail card %s', (testId, card) => {
  it('is painted the dark surface when the dark scheme is in effect', () => {
    renderUnder('dark', card);

    expect(screen.getByTestId(testId)).toHaveStyle({ backgroundColor: carbonDark.surface });
  });

  it('is painted the light surface when the light scheme is in effect', () => {
    renderUnder('light', card);

    expect(screen.getByTestId(testId)).toHaveStyle({ backgroundColor: carbonLight.surface });
  });
});

/**
 * The same four colours name the probes on the history detail, where they sit on
 * a card rather than on the page.
 */
describe('the history detail’s probe names', () => {
  const names: [string, keyof PaletteTokens['probes']][] = [
    ['review-smoke-chambername', 'chamber'],
    ['review-smoke-probe1name', 'probe1'],
    ['review-smoke-probe2name', 'probe2'],
    ['review-smoke-probe3name', 'probe3'],
  ];

  it.each(names)('names %s in the dark scheme’s probe colour', (testId, probe) => {
    renderUnder('dark', <SmokeProfileCard smokeProfile={smokeProfile()} temps={[]} />);

    expect(screen.getByTestId(testId)).toHaveStyle({ color: carbonDark.probes[probe] });
  });

  it.each(names)('names %s in the light scheme’s probe colour', (testId, probe) => {
    renderUnder('light', <SmokeProfileCard smokeProfile={smokeProfile()} temps={[]} />);

    expect(screen.getByTestId(testId)).toHaveStyle({ color: carbonLight.probes[probe] });
  });
});

/**
 * The names are read against a card, in the probe colours, so they are held to
 * the threshold the palette promises them: large and bold. Set any smaller and
 * two of the light probe colours stop being readable text on a white card.
 */
describe('the history detail’s probe names as text', () => {
  it('sets them large and bold, which is what their colours are chosen for', () => {
    renderUnder('light', <SmokeProfileCard smokeProfile={smokeProfile()} temps={[]} />);

    ['review-smoke-chambername', 'review-smoke-probe1name', 'review-smoke-probe2name'].forEach(
      testId => {
        const name = screen.getByTestId(testId);

        // WCAG counts text large from 14pt — 18.66px — when it is bold.
        expect(parseFloat(getComputedStyle(name).fontSize)).toBeGreaterThanOrEqual(18.66);
        expect(parseInt(getComputedStyle(name).fontWeight, 10)).toBeGreaterThanOrEqual(700);
      }
    );
  });
});

/**
 * The chart is a surface like any other: it used to paint itself a light-grey
 * panel and draw the light probe colours whatever the scheme, which on a dark
 * screen left a pale block with axis labels all but invisible against it. Every
 * colour it draws with comes from the scheme in effect now — and it is drawn
 * here rather than stubbed, so these are the colours a browser would paint.
 */
describe('the temperature chart', () => {
  const screensWithAChart: [string, () => JSX.Element][] = [
    ['the history detail', () => <SmokeProfileCard smokeProfile={smokeProfile()} temps={[]} />],
    ['the smoke step', () => liveSmokeStep()],
  ];

  describe.each(screensWithAChart)('on %s', (_screen, ui) => {
    it('is drawn on the panel of the scheme in effect', () => {
      const { container } = renderUnder('dark', ui());

      expect(chartPanel(container)).toBe(carbonDark.chart.panel);
    });

    it('is drawn on the light one when the light scheme is in effect', () => {
      const { container } = renderUnder('light', ui());

      expect(chartPanel(container)).toBe(carbonLight.chart.panel);
    });

    it('draws each reading’s line in that scheme’s colour for its probe', () => {
      const { container } = renderUnder('dark', ui());

      expect(seriesStrokes(container)).toEqual([
        carbonDark.chart.chamber,
        carbonDark.chart.probe1,
        carbonDark.chart.probe2,
        carbonDark.chart.probe3,
      ]);
    });

    it('rules its frame and writes its labels in that scheme’s colours', () => {
      const { container } = renderUnder('dark', ui());

      expect(container.querySelector('line[data-grid]')).toHaveAttribute(
        'stroke',
        carbonDark.chart.grid
      );
      expect(container.querySelector('text[data-temp-label]')).toHaveAttribute(
        'fill',
        carbonDark.chart.label
      );
    });
  });

  /**
   * The scheme can change while a cook is being watched — somebody chooses dark
   * on another client, or the phone crosses into the evening. The chart is
   * handed the new colours and repaints; it is not rebuilt, because rebuilding
   * it would throw away the cook it has drawn and the reading under the finger.
   */
  it('follows a change of scheme without being rebuilt', () => {
    const Repainter = (): JSX.Element => {
      const { setMode } = useColorScheme();
      return (
        <button data-testid="go-dark" onClick={() => setMode('dark')}>
          dark
        </button>
      );
    };

    const { container } = renderUnder(
      'light',
      <>
        <Repainter />
        <SmokeProfileCard smokeProfile={smokeProfile()} temps={[]} />
      </>
    );
    const plot = container.querySelector('svg');
    expect(seriesStrokes(container)[0]).toBe(carbonLight.chart.chamber);

    fireEvent.click(screen.getByTestId('go-dark'));

    expect(seriesStrokes(container)[0]).toBe(carbonDark.chart.chamber);
    expect(chartPanel(container)).toBe(carbonDark.chart.panel);
    expect(container.querySelector('svg')).toBe(plot);
  });
});

/**
 * The live step is the one an operator reads mid-cook, in the dark, from across
 * a garage: four temperatures, each in the colour of the probe it comes from.
 * Those colours have to belong to the scheme in effect — the light set is dark
 * ink, and on the dark page background two of the four readings were all but
 * invisible.
 */
describe('the smoke step', () => {
  const readouts: [string, keyof PaletteTokens['probes']][] = [
    ['smoke-chamber-temp', 'chamber'],
    ['smoke-probe1-temp', 'probe1'],
    ['smoke-probe2-temp', 'probe2'],
    ['smoke-probe3-temp', 'probe3'],
  ];

  it.each(readouts)('reads %s in the dark scheme’s probe colour', (testId, probe) => {
    renderUnder('dark', liveSmokeStep());

    expect(screen.getByTestId(testId)).toHaveStyle({ color: carbonDark.probes[probe] });
  });

  it.each(readouts)('reads %s in the light scheme’s probe colour', (testId, probe) => {
    renderUnder('light', liveSmokeStep());

    expect(screen.getByTestId(testId)).toHaveStyle({ color: carbonLight.probes[probe] });
  });

  it('paints its start control the accent of the scheme in effect', () => {
    renderUnder('dark', liveSmokeStep());

    expect(screen.getByTestId('smoke-start-button')).toHaveStyle({
      backgroundColor: carbonDark.accent,
    });
  });
});

/** The live step over the session module's fakes: no socket, no HTTP. */
const liveSmokeStep = (): JSX.Element => (
  <SmokeSessionProvider
    config={{
      role: 'monitor',
      socket: new FakeCloudSocket(),
      api: new FakeSessionApi(),
      clock: new SteppingClock(),
    }}
  >
    <SmokeStepView nextButton={<button data-testid="smoke-next-button">Next</button>} />
  </SmokeSessionProvider>
);

describe('the post-smoke step', () => {
  it('labels its fields in the secondary text colour of the scheme in effect', async () => {
    renderUnder('dark', <PostSmokeStep nextButton={<button>Finish</button>} />);

    // The field's label and the notch its outline leaves for it carry the same
    // words; the label is the one that is painted.
    expect((await screen.findAllByText('Rest Time'))[0]).toHaveStyle({
      color: carbonDark.textSecondary,
    });
  });

  it('labels them in the light scheme’s secondary text colour too', async () => {
    renderUnder('light', <PostSmokeStep nextButton={<button>Finish</button>} />);

    expect((await screen.findAllByText('Rest Time'))[0]).toHaveStyle({
      color: carbonLight.textSecondary,
    });
  });

  it('draws the control that adds a step in the accent of the scheme in effect', async () => {
    renderUnder('dark', <PostSmokeStep nextButton={<button>Finish</button>} />);

    expect(await screen.findByTestId('postsmoke-step-add-button')).toHaveStyle({
      color: carbonDark.accent,
    });
  });
});

describe('the smoke wizard', () => {
  it('paints its primary action the dark accent when the dark scheme is in effect', async () => {
    renderUnder('dark', <Smoke />);

    expect(await screen.findByTestId('smoke-next-button')).toHaveStyle({
      backgroundColor: carbonDark.accent,
    });
  });

  it('paints it the light accent when the light scheme is in effect', async () => {
    renderUnder('light', <Smoke />);

    expect(await screen.findByTestId('smoke-next-button')).toHaveStyle({
      backgroundColor: carbonLight.accent,
    });
  });

  /**
   * The step control replaced the stepper, and with it what marks the step the
   * user is on: the segment is lifted onto the card surface and reads in the
   * accent, while the steps either side of it stay in the track in supporting
   * ink. Both halves are asserted, because a control that painted every segment
   * the accent would mark nothing.
   */
  it('lifts the step the user is on onto the surface and accent of the scheme in effect', async () => {
    renderUnder('dark', <Smoke />);

    expect(await screen.findByRole('tab', { name: 'Pre-Smoke' })).toHaveStyle({
      backgroundColor: carbonDark.surface,
      color: carbonDark.accent,
    });
    expect(screen.getByRole('tab', { name: 'Post-Smoke' })).toHaveStyle({
      color: carbonDark.textSecondary,
    });
  });
});

/**
 * The bar is its own surface in the design — darker than a card in the dark
 * scheme, so it reads as the edge of the app rather than as another panel.
 */
describe('the bottom navigation', () => {
  it('is painted the dark navigation surface when the dark scheme is in effect', () => {
    renderUnder('dark', <BottomBar {...navigationHandlers()} />);

    expect(screen.getByTestId('bottom-navigation')).toHaveStyle({
      backgroundColor: carbonDark.navigation,
    });
  });

  it('is painted the light navigation surface when the light scheme is in effect', () => {
    renderUnder('light', <BottomBar {...navigationHandlers()} />);

    expect(screen.getByTestId('bottom-navigation')).toHaveStyle({
      backgroundColor: carbonLight.navigation,
    });
  });

  /**
   * The accent is not one colour reused across the schemes: the light one is not
   * legible against the dark navigation surface, so the destination the user is
   * on has to be marked in the dark accent.
   */
  it('marks the destination in effect with the accent of the scheme in effect', () => {
    renderUnder('dark', <BottomBar {...navigationHandlers()} />);

    expect(screen.getByTestId('nav-smoke')).toHaveStyle({ color: carbonDark.accent });
  });

  /** A recolour adds no destination: the mock's fourth tab is not built here. */
  it('offers the three destinations it always offered, and no fourth', () => {
    renderUnder('light', <BottomBar {...navigationHandlers()} />);

    expect(screen.getAllByRole('button').map(action => action.textContent)).toEqual([
      'Smoke',
      'History',
      'Settings',
    ]);
  });
});

/**
 * A recolour adds no behaviour. The mock the palette comes from also draws a
 * search field and meat-type filter chips over the history list; those are
 * features, and they are not built here.
 */
describe('the recoloured history list', () => {
  it('offers nothing to search or filter with', async () => {
    renderUnder('light', <History />);
    await screen.findByTestId('smoke-card');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map(control => control.textContent)).toEqual([
      'View',
      'delete',
    ]);
  });
});

const navigationHandlers = () => ({
  smokeOnClick: jest.fn(),
  historyOnClick: jest.fn(),
  settingsOnClick: jest.fn(),
});

function preSmoke(): PreSmoke {
  return {
    name: 'Brisket',
    meatType: 'Beef',
    weight: { weight: 12, unit: WeightUnits.LB },
    steps: ['Trim'],
    notes: 'Keep the fat cap on',
  };
}

function smokeProfile(): SmokeProfile {
  return {
    chamberName: 'Chamber',
    probe1Name: 'Probe 1',
    probe2Name: 'Probe 2',
    probe3Name: 'Probe 3',
    woodType: 'Hickory',
    notes: 'Steady 225',
  };
}

function postSmoke(): PostSmoke {
  return { restTime: '01:00', steps: ['Rest'], notes: 'Sliced against the grain' };
}

function ratings(): rating {
  return { smokeFlavor: 5, seasoning: 5, tenderness: 5, overallTaste: 5, notes: '' };
}
