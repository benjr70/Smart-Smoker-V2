/**
 * App-root snackbar surface for surfacing API failures.
 *
 * The provider owns a single Material-UI error snackbar and exposes an imperative
 * `notify(message)` through context. The API hooks (see {@link useCurrentResource})
 * call it when a load or save fails so the user finally sees when their data did
 * not persist, instead of the old silent-`undefined` behavior. Rendered once at
 * the app root; components read the notifier through {@link useApiSnackbar}.
 */
import { Alert, Snackbar } from '@mui/material';
import React, { createContext, useCallback, useContext, useState } from 'react';

/** Raises the error snackbar with the given message. */
export type SnackbarNotifier = (message: string) => void;

const SnackbarContext = createContext<SnackbarNotifier | null>(null);

export interface SnackbarProviderProps {
  children: React.ReactNode;
  /** How long the snackbar stays visible, in ms. */
  autoHideDuration?: number;
}

export const SnackbarProvider = ({
  children,
  autoHideDuration = 6000,
}: SnackbarProviderProps): JSX.Element => {
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const notify = useCallback<SnackbarNotifier>(nextMessage => {
    setMessage(nextMessage);
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <SnackbarContext.Provider value={notify}>
      {children}
      <Snackbar open={open} autoHideDuration={autoHideDuration} onClose={handleClose}>
        <Alert severity="error" onClose={handleClose} sx={{ width: '100%' }}>
          {message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
};

/**
 * Returns the snackbar notifier. Outside a {@link SnackbarProvider} it is a
 * no-op, so non-UI callers (and unprovided trees) never crash.
 */
export const useApiSnackbar = (): SnackbarNotifier =>
  useContext(SnackbarContext) ?? (() => undefined);
