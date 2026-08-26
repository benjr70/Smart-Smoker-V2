import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material';
import React from 'react';
import { ApiClientProvider, SnackbarProvider, createApiClient } from '../../api';
import { DEFAULT_STAMPS, newCustomStamp } from '../../api/cookStamps';
import { createFakeBackend, FakeBackend } from '../../api/fakeBackend';
import { DesignSurface, appTheme } from '../../theme';
import { StampEditorCard } from './stampEditor';

// The websocket is the one thing under this card that reaches outside the
// browser; the catalogue it announces is exercised in the hook's own tests.
jest.mock('socket.io-client', () => ({
  io: () => ({ on: () => undefined, off: () => undefined, close: () => undefined }),
}));

/**
 * Render the card and let its mount read land.
 *
 * The catalogue arrives asynchronously even when it is the shipped one, so a
 * test that started asserting immediately would be asserting against the
 * card's first paint and would see the read arrive afterwards.
 */
const renderEditor = async (backend: FakeBackend = createFakeBackend()) => {
  const client = createApiClient(backend);
  const view = render(
    <CssVarsProvider theme={appTheme}>
      <DesignSurface>
        <ApiClientProvider client={client}>
          <SnackbarProvider>
            <StampEditorCard />
          </SnackbarProvider>
        </ApiClientProvider>
      </DesignSurface>
    </CssVarsProvider>
  );
  await act(async () => {
    await Promise.resolve();
  });
  return { backend, client, ...view };
};

/** The catalogue as the backend has it now. */
const stored = (backend: FakeBackend) => backend.store.appSettings?.cookLog?.stamps;

/** Open one stamp's row for editing. */
const expand = async (label: string): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${label}` }));
};

describe('StampEditorCard', () => {
  it('lists the stored stamps in catalogue order, each with its colour', async () => {
    const catalogue = [
      { ...newCustomStamp(), label: 'Foil Boat', tone: 'p2' as const },
      ...DEFAULT_STAMPS,
    ];
    const { backend } = await renderEditor(
      createFakeBackend({ appSettings: { settings: { cookLog: { stamps: catalogue } } } })
    );

    await screen.findByText('Foil Boat');
    const rows = screen.getAllByTestId(/^stamp-row-/);
    expect(rows.map(row => within(row).getByTestId('stamp-label').textContent)).toEqual([
      'Foil Boat',
      ...DEFAULT_STAMPS.map(stamp => stamp.label),
    ]);
    // Reading a catalogue is not editing one: rendering the card must write
    // nothing back.
    expect(backend.requests.filter(request => request.method === 'post')).toEqual([]);
  });

  it('saves the whole list when a stamp is renamed', async () => {
    const { backend } = await renderEditor();
    await expand('Added Wood');

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Split' } });
    fireEvent.blur(screen.getByLabelText('Label'));

    await waitFor(() => expect(stored(backend)?.[0].label).toBe('Split'));
    expect(stored(backend)).toHaveLength(6);
    expect(await screen.findByText('Split')).toBeInTheDocument();
  });

  it('saves the new order when a stamp is moved up', async () => {
    const { backend } = await renderEditor();
    await screen.findByText('Wrapped');

    fireEvent.click(screen.getByRole('button', { name: 'Move Wrapped up' }));

    await waitFor(() =>
      expect(stored(backend)?.map(stamp => stamp.key)).toEqual([
        'wrap',
        'wood',
        'spritz',
        'vent',
        'lid',
        'sauce',
      ])
    );
  });

  it('never moves the first stamp up or the last one down', async () => {
    await renderEditor();
    await screen.findByText('Added Wood');

    expect(screen.getByRole('button', { name: 'Move Added Wood up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Sauced down' })).toBeDisabled();
  });

  it('saves a stamp switched off, keeping it in the list', async () => {
    const { backend } = await renderEditor();
    await screen.findByText('Lid Open');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Lid Open' }));

    await waitFor(() =>
      expect(stored(backend)?.find(stamp => stamp.key === 'lid')).toMatchObject({ enabled: false })
    );
    expect(stored(backend)).toHaveLength(6);
  });

  it('keeps both edits when two stamps are switched off in quick succession', async () => {
    const { backend } = await renderEditor();
    await screen.findByText('Lid Open');

    // No wait in between: the second click lands on the card as it was drawn
    // before the first save, which is what a user flipping two switches does.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Lid Open' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Vent' }));

    await waitFor(() =>
      expect(stored(backend)?.find(stamp => stamp.key === 'vent')).toMatchObject({ enabled: false })
    );
    expect(stored(backend)?.find(stamp => stamp.key === 'lid')).toMatchObject({ enabled: false });
  });

  it('keeps a rename when a colour is chosen straight after it', async () => {
    const { backend } = await renderEditor();
    await expand('Added Wood');

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Split' } });
    fireEvent.blur(screen.getByLabelText('Label'));
    fireEvent.click(screen.getByRole('button', { name: 'Colour chamber' }));

    await waitFor(() =>
      expect(stored(backend)?.find(stamp => stamp.key === 'wood')).toMatchObject({
        tone: 'chamber',
      })
    );
    expect(stored(backend)?.find(stamp => stamp.key === 'wood')).toMatchObject({ label: 'Split' });
  });

  it('saves a new colour chosen for a stamp', async () => {
    const { backend } = await renderEditor();
    await expand('Wrapped');

    fireEvent.click(screen.getByRole('button', { name: 'Colour chamber' }));

    await waitFor(() =>
      expect(stored(backend)?.find(stamp => stamp.key === 'wrap')).toMatchObject({
        tone: 'chamber',
      })
    );
  });

  it('shows what the marker on the chart will look like', async () => {
    await renderEditor();
    await expand('Wrapped');

    expect(screen.getByText('Marker shows W on the chart')).toBeInTheDocument();
  });

  it('adds a custom stamp, saved with the rest', async () => {
    const { backend } = await renderEditor();
    await screen.findByText('Added Wood');

    fireEvent.click(screen.getByRole('button', { name: '+ Add stamp' }));

    await waitFor(() => expect(stored(backend)).toHaveLength(7));
    const added = stored(backend)?.[6];
    expect(added).toMatchObject({ custom: true, enabled: true });
    expect(added?.key).toMatch(/^custom-/);
  });

  it('stops offering to add once the catalogue is full', async () => {
    const full = [
      ...DEFAULT_STAMPS,
      ...Array.from({ length: 6 }, (_, index) => ({
        ...newCustomStamp(),
        label: `Extra ${index}`,
      })),
    ];
    await renderEditor(
      createFakeBackend({ appSettings: { settings: { cookLog: { stamps: full } } } })
    );

    await screen.findByText('Extra 5');
    expect(screen.queryByRole('button', { name: '+ Add stamp' })).not.toBeInTheDocument();
  });

  it('removes a custom stamp, and offers no removal of a default', async () => {
    const catalogue = [...DEFAULT_STAMPS, { ...newCustomStamp(), label: 'Foil Boat' }];
    const { backend } = await renderEditor(
      createFakeBackend({ appSettings: { settings: { cookLog: { stamps: catalogue } } } })
    );
    await expand('Added Wood');
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();

    await expand('Foil Boat');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(stored(backend)).toHaveLength(6));
    expect(stored(backend)?.map(stamp => stamp.label)).not.toContain('Foil Boat');
  });

  it('offers Reset only once the catalogue differs from the shipped one', async () => {
    const { backend } = await renderEditor();
    await screen.findByText('Added Wood');
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ Add stamp' }));
    await waitFor(() => expect(stored(backend)).toHaveLength(7));

    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(stored(backend)).toHaveLength(6));
    expect(stored(backend)?.every(stamp => !stamp.custom && stamp.enabled)).toBe(true);
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  });

  it('says nothing to the backend while a label is being typed', async () => {
    const { backend } = await renderEditor();
    await expand('Added Wood');
    const writes = () => backend.requests.filter(request => request.method === 'post').length;

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'S' } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Sp' } });

    expect(writes()).toBe(0);
  });
});
