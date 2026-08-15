import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { Button, ButtonBase, IconButton, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { connectToWiFi, getConnection } from '../../../services/deviceService';
import { VirtualKeyboard } from '../../keyboard/VirtualKeyboard';
import './wifi.style.css';

interface WifiProps {
  onBack: (screen: number) => void;
}

declare const VERSION: string;

/** The two entry fields; exactly one is active and receives the keyboard. */
type ActiveField = 'ssid' | 'password';

/**
 * What the header's status area is showing. One value, one state: the screen is
 * either idle (nothing connected), connecting, connected to a named network, or
 * showing why the last attempt failed.
 */
type ConnectionState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; ssid: string }
  | { kind: 'failed'; reason: string };

/** The label the status area reads, per state. */
const statusLabel = (state: ConnectionState): string => {
  switch (state.kind) {
    case 'connected':
      return `Connected: ${state.ssid}`;
    case 'connecting':
      return 'Connecting…';
    case 'failed':
      return state.reason;
    default:
      return 'Not connected';
  }
};

/**
 * Why a connect attempt failed, in the words the header can show. The device
 * service speaks axios errors, so the service's own message is preferred, then
 * the error's, then a generic line — each step checked rather than assumed,
 * because the value in a catch is whatever the network layer threw.
 */
const failureReason = (e: unknown): string => {
  if (typeof e === 'object' && e !== null) {
    const maybeAxiosError = e as { response?: { data?: { error?: unknown } }; message?: unknown };
    const serviceError = maybeAxiosError.response?.data?.error;
    if (typeof serviceError === 'string' && serviceError.length > 0) {
      return serviceError;
    }
    if (typeof maybeAxiosError.message === 'string' && maybeAxiosError.message.length > 0) {
      return maybeAxiosError.message;
    }
  }
  return 'Connection error';
};

/**
 * One tappable entry field: a label over the value being typed, with a blinking
 * caret while it is the field the keyboard feeds. A button, because a tap
 * is all it responds to — there is no browser text input underneath; the
 * on-screen keyboard is the only way characters arrive.
 */
interface FieldProps {
  label: string;
  value: string;
  active: boolean;
  masked?: boolean;
  onActivate: () => void;
}

function Field({ label, value, active, masked, onActivate }: FieldProps): JSX.Element {
  return (
    <ButtonBase
      component="button"
      className={active ? 'wifiField wifiFieldActive' : 'wifiField'}
      onClick={onActivate}
    >
      <span className="wifiFieldLabel">{label}</span>
      <span className="wifiFieldValue">
        {masked ? '•'.repeat(value.length) : value}
        {active && <span className="wifiCaret" data-testid="wifi-caret" aria-hidden="true" />}
      </span>
    </ButtonBase>
  );
}

/**
 * The wifi setup screen: header (back, title, live status), the two entry
 * fields with Connect, and the on-screen keyboard. Characters route to
 * whichever field is active — the screen owns that model itself; the keyboard
 * only reports taps.
 */
export function Wifi(props: WifiProps): JSX.Element {
  let versionToDisplay = 'unknown';
  try {
    versionToDisplay = VERSION;
  } catch (error) {
    console.log('Cannot get version of application.');
  }

  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [activeField, setActiveField] = useState<ActiveField>('ssid');
  const [connection, setConnection] = useState<ConnectionState>({ kind: 'idle' });

  useEffect(() => {
    getConnection()
      .then(result => {
        if (result && result.length > 0) {
          setConnection({ kind: 'connected', ssid: result[0].ssid });
        } else {
          setConnection({ kind: 'idle' });
        }
      })
      .catch(err => {
        console.log(err);
      });
  }, []);

  const typeCharacter = (character: string): void => {
    if (activeField === 'ssid') {
      setSsid(current => current + character);
    } else {
      setPassword(current => current + character);
    }
  };

  const eraseCharacter = (): void => {
    if (activeField === 'ssid') {
      setSsid(current => current.slice(0, -1));
    } else {
      setPassword(current => current.slice(0, -1));
    }
  };

  const connectWifi = async (): Promise<void> => {
    setConnection({ kind: 'connecting' });
    try {
      await connectToWiFi({ ssid, password });
    } catch (e: unknown) {
      console.log(e);
      setConnection({ kind: 'failed', reason: failureReason(e) });
      return;
    }
    // The join itself succeeded. The follow-up read only refines the network's
    // name — if it comes back empty or fails outright (the device is mid
    // network switch), the attempt is still a success, reported as typed.
    let connectedSsid = ssid;
    try {
      const result = await getConnection();
      if (result && result.length > 0) {
        connectedSsid = result[0].ssid;
      }
    } catch (e: unknown) {
      console.log(e);
    }
    setConnection({ kind: 'connected', ssid: connectedSsid });
  };

  const connected = connection.kind === 'connected';

  return (
    <div className="wifiScreen">
      <div className="wifiHeader">
        <IconButton aria-label="back" color="primary" onClick={() => props.onBack(0)}>
          <ArrowBackIosNewIcon />
        </IconButton>
        <Typography variant="h6" component="h1" className="wifiTitle">
          Wi-Fi Setup
        </Typography>
        <div className={`wifiStatus wifiStatus-${connection.kind}`} data-testid="wifi-status">
          {connected || connection.kind === 'connecting' ? (
            <WifiIcon fontSize="small" />
          ) : (
            <WifiOffIcon fontSize="small" />
          )}
          <span className="wifiStatusLabel">{statusLabel(connection)}</span>
        </div>
      </div>
      <div className="wifiFieldRow">
        <Field
          label="NETWORK"
          value={ssid}
          active={activeField === 'ssid'}
          onActivate={() => setActiveField('ssid')}
        />
        <Field
          label="PASSWORD"
          value={password}
          active={activeField === 'password'}
          masked
          onActivate={() => setActiveField('password')}
        />
        <Button
          className="wifiConnectButton"
          variant="contained"
          onClick={() => void connectWifi()}
          disabled={connection.kind === 'connecting'}
        >
          Connect
        </Button>
      </div>
      <div className="wifiKeyboard">
        <VirtualKeyboard onCharacter={typeCharacter} onBackspace={eraseCharacter} />
      </div>
      <div className="wifiVersion">{`Version: ${versionToDisplay}`}</div>
    </div>
  );
}
