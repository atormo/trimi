import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type RefObject } from 'react';
import { IconCheck, IconKey, IconLoader2, IconScissors, IconX } from '@tabler/icons-react';
import type { LicenseState } from '../hooks/useLicense';
import logo from '../assets/trimi-logo.png';
import './LicenseDialog.css';

type Flow = 'idle' | 'armed' | 'unlinking' | 'cutting' | 'unlinked' | 'activated';
interface Props {
  state: LicenseState;
  activating: boolean;
  activateError: string | null;
  unlinking: boolean;
  unlinkError: string | null;
  onActivate: (key: string) => Promise<boolean>;
  onUnlink: () => Promise<boolean>;
  onRetry: () => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

function keyStyle(value: string): CSSProperties {
  return { '--license-length': Math.max(value.length, 24) } as CSSProperties;
}

function CopyLicense({ value, variant = 'panel' }: { value: string; variant?: 'panel' | 'card' }) {
  const [copied, setCopied] = useState(false);
  const [copyCount, setCopyCount] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied, copyCount]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setError('');
      setCopied(true);
      setCopyCount(count => count + 1);
    } catch {
      setError('Couldn’t copy. Select the license text and copy it manually.');
    }
  }

  return <div className="success-license-wrap" data-variant={variant} data-copied={copied} style={keyStyle(value)}>
    <button type="button" className="success-license" onClick={copy} aria-label="Copy license key" title="Click to copy your license">
      <span key={copyCount} className={copied ? 'copied-key' : undefined}>{value}</span>
    </button>
    <span className="copied-indicator" role="status">{copied ? 'Copied!' : ''}</span>
    {error && <span className="copy-license-error" role="alert">{error}</span>}
  </div>;
}

export function LicenseDialog({ state, activating, activateError, unlinking, unlinkError, onActivate, onUnlink, onRetry, onClose, returnFocusRef }: Props) {
  const [flow, setFlow] = useState<Flow>('idle');
  const [draft, setDraft] = useState('');
  const [activationAttempted, setActivationAttempted] = useState(false);
  const [unlinkAttempted, setUnlinkAttempted] = useState(false);
  const [localError, setLocalError] = useState('');
  // Keep the exact key available after successful removal from persisted licensing state.
  const [retainedKey, setRetainedKey] = useState(state.status === 'unlocked' ? state.key : '');
  const dialog = useRef<HTMLDialogElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const cutButton = useRef<HTMLButtonElement>(null);
  const unlinkButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const gestureStart = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const mutationPending = useRef(false);
  const armed = flow === 'armed';
  const cutting = flow === 'cutting';
  const busy = activating || unlinking || flow === 'unlinking' || cutting;
  const entering = flow === 'idle' && state.status === 'locked';
  const success = flow === 'unlinked' || flow === 'activated';
  const serviceStatus = flow === 'idle' && (state.status === 'checking' || state.status === 'offline');
  const key = state.status === 'unlocked' ? state.key : retainedKey;
  const error = localError || (entering && activationAttempted ? activateError : null) || (armed && unlinkAttempted ? unlinkError : null);

  useEffect(() => {
    const panel = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const fallback = returnFocusRef.current;
    panel.showModal();
    return () => {
      panel.close();
      if (previous?.isConnected && previous !== document.body) previous.focus({ preventScroll: true });
      else fallback?.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  useEffect(() => {
    if (armed) cutButton.current?.focus({ preventScroll: true });
    if (!armed && document.activeElement?.classList.contains('header-cancel')) unlinkButton.current?.focus({ preventScroll: true });
    if (entering) keyInput.current?.focus({ preventScroll: true });
    if (success || serviceStatus) heading.current?.focus({ preventScroll: true });
  }, [armed, entering, success, serviceStatus, state.status]);

  useEffect(() => {
    if (!cutting) return;
    // Animationend is primary; this also completes if animation events are unavailable.
    const timeout = window.setTimeout(() => setFlow('unlinked'), 1600);
    return () => window.clearTimeout(timeout);
  }, [cutting]);

  async function cut() {
    if (!armed || mutationPending.current) return;
    mutationPending.current = true;
    gestureStart.current = null;
    setRetainedKey(key);
    setUnlinkAttempted(true);
    setLocalError('');
    setFlow('unlinking');
    try {
      const unlinked = await onUnlink();
      if (unlinked) setFlow(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'unlinked' : 'cutting');
      else setFlow('armed');
    } catch {
      setLocalError('Couldn’t unlink this device. Please try again.');
      setFlow('armed');
    } finally {
      mutationPending.current = false;
    }
  }

  function moveScissors(event: PointerEvent<HTMLButtonElement>) {
    if (gestureStart.current !== null && gestureStart.current - event.clientY > 28) void cut();
  }

  async function saveLicense(event: FormEvent) {
    event.preventDefault();
    if (busy || mutationPending.current) return;
    if (!draft.trim()) {
      setLocalError('Enter your license key to activate Trimi.');
      keyInput.current?.focus();
      return;
    }
    mutationPending.current = true;
    setActivationAttempted(true);
    setLocalError('');
    try {
      if (await onActivate(draft)) {
        setRetainedKey(draft.trim());
        setFlow('activated');
      } else keyInput.current?.focus();
    } catch {
      setLocalError('Couldn’t activate your license. Please try again.');
    } finally {
      mutationPending.current = false;
    }
  }

  function cancelUnlink() {
    setUnlinkAttempted(false);
    setLocalError('');
    setFlow('idle');
  }

  function cardFace(decorative = false) {
    const unlinkMode = armed || flow === 'unlinking' || cutting;
    return <div className="license-card" data-armed={unlinkMode}>
      <div className="card-header">
        <img className="brand-logo" src={logo} alt={decorative ? '' : 'Trimi'} />
        <div className="header-message" data-unlink={unlinkMode}>
          <span className="header-thanks" aria-hidden={unlinkMode}>Thank you for using Trimi.</span>
          <button type="button" className="header-cancel" disabled={!armed || decorative} aria-hidden={!armed || decorative} onClick={cancelUnlink}>Cancel unlink</button>
        </div>
      </div>
      <div className="card-key-area" style={keyStyle(entering ? draft : key)}>
        <div className="card-key-row">
          {entering ? <input ref={keyInput} className="license-key license-key-input" aria-label="License key" placeholder="Paste your license key" value={draft} disabled={activating} onChange={event => { setDraft(event.target.value); setActivationAttempted(false); setLocalError(''); }} autoComplete="off" autoCorrect="off" spellCheck={false} autoCapitalize="off" aria-invalid={!!error} aria-describedby={error ? 'trimi-license-error' : undefined} /> : decorative ? <span className="license-key">{key}</span> : <CopyLicense value={key} variant="card" />}
        </div>
        {error && !decorative && <p className="key-error" id="trimi-license-error" role="alert">{error}</p>}
      </div>
      <div className="card-footer">
        {entering ? <button className="primary-button" type="submit" disabled={activating}>{activating ? 'Activating…' : 'Save license'}</button> : flow === 'unlinking' ? <span className="request-status" role="status">Unlinking this device…</span> : !armed && !cutting && <button ref={decorative ? undefined : unlinkButton} type="button" className="text-button unlink-button" onClick={() => setFlow('armed')}><IconScissors size={18} aria-hidden="true" />Unlink this device</button>}
      </div>
    </div>;
  }

  return <dialog ref={dialog} className="trimi-license-dialog" aria-labelledby="trimi-license-title" aria-describedby={armed ? 'trimi-cut-instructions' : undefined} aria-busy={busy} onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { if (!dialog.current?.open) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) dialog.current?.close(); }}>
    <div className="dialog-content" onClick={event => event.stopPropagation()}>
      {!cutting && <button type="button" className="close-card icon-button" disabled={busy} onClick={() => dialog.current?.close()} aria-label="Close license dialog"><IconX size={20} aria-hidden="true" /></button>}
      {success || serviceStatus ? <section className="success-card" key={success ? flow : state.status}>
        <img className="brand-logo" src={logo} alt="Trimi" />
        <div className="success-icon">{success ? <IconCheck size={28} stroke={1.7} aria-hidden="true" /> : state.status === 'checking' ? <IconLoader2 size={28} className="trimi-spin" aria-hidden="true" /> : <IconKey size={28} aria-hidden="true" />}</div>
        <h2 ref={heading} tabIndex={-1} id="trimi-license-title">{flow === 'unlinked' ? 'Your license is ready to travel.' : flow === 'activated' ? 'You’re all set.' : state.status === 'checking' ? 'Checking your license…' : 'Couldn’t verify your license'}</h2>
        {success ? <>
          <p>{flow === 'unlinked' ? 'This device has been unlinked. Copy your license below to activate Trimi in another browser or on another computer.' : 'Your license is active on this device. You can now upload and edit your own videos.'}</p>
          <CopyLicense value={key} />
          <button type="button" className="primary-button success-close" onClick={() => dialog.current?.close()}>{flow === 'unlinked' ? 'Close' : 'Back to the editor'}</button>
        </> : state.status === 'offline' ? <><p>Check your connection and try again. Your saved license is still on this device.</p><button type="button" className="primary-button success-close" onClick={onRetry}>Retry</button></> : <p role="status">Please wait while we check this device.</p>}
      </section> : <>
        <h2 className="sr-only" id="trimi-license-title">{entering ? 'Activate your Trimi license' : 'Your Trimi license'}</h2>
        <form onSubmit={saveLicense} className="card-scene" data-cutting={cutting} data-unlinking={flow === 'unlinking'} data-armed={armed} aria-busy={busy}>
          <div className="intact-card" inert={cutting || flow === 'unlinking'}>{cardFace()}</div>
          {cutting && <div className="cut-fragments" aria-hidden="true" inert>
            <div className="card-fragment fragment-left">{cardFace(true)}</div>
            <div className="card-fragment fragment-right" onAnimationEnd={event => { if (event.target === event.currentTarget) setFlow('unlinked'); }}>{cardFace(true)}</div>
            <div className="cut-scissors-track"><span className="cut-scissors"><IconScissors size={28} stroke={1.7} /></span></div>
          </div>}
          {armed && <button ref={cutButton} type="button" className="cut-line" aria-label="Cut along the line to unlink this device" aria-describedby="trimi-cut-instructions" onClick={() => { if (!suppressClick.current) void cut(); suppressClick.current = false; }} onPointerDown={event => { suppressClick.current = false; gestureStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={moveScissors} onPointerUp={event => { suppressClick.current = gestureStart.current !== null && Math.abs(event.clientY - gestureStart.current) > 8; gestureStart.current = null; }} onPointerCancel={() => { gestureStart.current = null; suppressClick.current = true; }}><span className="cut-dashes" /></button>}
        </form>
        {armed && <p className="sr-only" id="trimi-cut-instructions">Click the dotted line or drag upwards to unlink this device. This removes the videos from this editor. Your license can be activated again.</p>}
        {flow === 'unlinking' && <span className="sr-only" role="status">Unlinking this device…</span>}
        {entering && <div className="card-guidance"><a className="purchase-link" href="https://polar.sh/checkout/polar_c_iX6OeQw78TX3oxQA7cye3PBCxfcxaiKD28us84ZAEMi" target="_blank" rel="noreferrer">Don’t have a license? Get Trimi</a></div>}
      </>}
    </div>
  </dialog>;
}
