/**
 * Every screen is recoloured to the design's palette, in both schemes.
 *
 * The screens are rendered the way the application root renders them — inside
 * the colour-scheme provider, with the design's palette applied — and each
 * assertion is about a colour the browser computes, because that is what the
 * user actually sees. A screen that still carried a colour of its own would
 * report the same value under both schemes and fail the dark half.
 */
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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

// The temperature chart is deliberately outside this recolour (it keeps its own
// panel and stroke colours), and its d3 rendering has nothing to say about the
// card it sits in.
jest.mock('temperaturechart/src/tempChart', () => ({
  __esModule: true,
  default: () => <div data-testid="temp-chart" />,
}));

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

  it('labels the step the user is on in the text colour of the scheme in effect', async () => {
    renderUnder('dark', <Smoke />);

    expect(await screen.findByText('Pre-Smoke')).toHaveStyle({ color: carbonDark.text });
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
      'Review',
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
  reviewOnClick: jest.fn(),
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
