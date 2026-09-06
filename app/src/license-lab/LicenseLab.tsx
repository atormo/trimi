import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { IconCheck, IconKey, IconLock, IconPlus, IconScissors, IconUserCircle, IconX } from '@tabler/icons-react';
import logo from '../assets/trimi-logo.png';

const DEMO_KEY = 'TRIMI-8F3A-72C9-BE41-6D05';
type CardState = 'license' | 'armed' | 'cutting' | 'unlinked' | 'entry' | 'activated';

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

  return <div className="success-license-wrap" data-variant={variant} data-copied={copied}>
    <button type="button" className="success-license" onClick={copy} aria-label="Copy license key" title="Click to copy your license">
      <span key={copyCount} className={copied ? 'copied-key' : undefined}>{value}</span>
    </button>
    <span className="copied-indicator" role="status">{copied ? 'Copied!' : ''}</span>
    {error && <span className="copy-license-error" role="alert">{error}</span>}
  </div>;
}

export function LicenseLab() {
  // Deliberately memory-only. This experiment never imports the real licensing hook or API.
  const [licensed, setLicensed] = useState(true);
  const [licenseKey, setLicenseKey] = useState(DEMO_KEY);
  const [cardState, setCardState] = useState<CardState>('license');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const avatar = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const cutButton = useRef<HTMLButtonElement>(null);
  const unlinkButton = useRef<HTMLButtonElement>(null);
  const successTitle = useRef<HTMLHeadingElement>(null);
  const gestureStart = useRef<number | null>(null);
  const cutCommitted = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  const armed = cardState === 'armed';
  const cutting = cardState === 'cutting';
  const entering = cardState === 'entry';

  useEffect(() => {
    if (video) return () => URL.revokeObjectURL(video.url);
  }, [video]);

  useEffect(() => {
    if (armed) cutButton.current?.focus({ preventScroll: true });
    if (!armed && document.activeElement?.classList.contains('header-cancel')) unlinkButton.current?.focus({ preventScroll: true });
    if (entering) keyInput.current?.focus({ preventScroll: true });
    if (cardState === 'unlinked' || cardState === 'activated') successTitle.current?.focus({ preventScroll: true });
  }, [armed, entering, cardState]);

  function openCard() {
    trigger.current = document.activeElement as HTMLElement;
    popover.current?.hidePopover();
    cutCommitted.current = false;
    setCardState(licensed ? 'license' : 'entry');
    setDraft('');
    setError('');
    dialog.current?.showModal();
  }

  function closeCard() {
    dialog.current?.close();
  }

  function finishCut() {
    setLicensed(false);
    setVideo(null);
    setUploadError('');
    setCardState('unlinked');
  }

  function cut() {
    if (!armed || cutCommitted.current) return;
    cutCommitted.current = true;
    gestureStart.current = null;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finishCut();
    else setCardState('cutting');
  }

  function moveScissors(event: PointerEvent<HTMLButtonElement>) {
    if (gestureStart.current !== null && gestureStart.current - event.clientY > 28) cut();
  }

  function saveLicense(event: FormEvent) {
    event.preventDefault();
    // Only the displayed demo key is accepted; never pretend to validate a real license.
    if (draft.trim().toUpperCase() !== DEMO_KEY) {
      setError('Use the sample license shown below to try activation.');
      keyInput.current?.focus();
      return;
    }
    setLicenseKey(DEMO_KEY);
    setLicensed(true);
    setCardState('activated');
  }

  function cardFace(decorative = false) {
    return <div className="license-card" data-armed={armed || cutting}>
      <div className="card-header">
        <img className="brand-logo" src={logo} alt={decorative ? '' : 'Trimi'} />
        <div className="header-message" data-unlink={armed || cutting}>
          <span className="header-thanks" aria-hidden={armed || cutting}>Thank you for using Trimi.</span>
          <button type="button" className="header-cancel" disabled={!armed || decorative} aria-hidden={!armed || decorative} onClick={() => setCardState('license')}>Cancel unlink</button>
        </div>
      </div>
      <div className="card-key-area">
        <div className="card-key-row">
          {entering ? <input ref={keyInput} className="license-key license-key-input" aria-label="License key" placeholder="Paste your license key" value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} autoComplete="off" spellCheck={false} autoCapitalize="characters" aria-invalid={!!error} aria-describedby={error ? 'key-error demo-license-hint' : 'demo-license-hint'} /> : decorative ? <span className="license-key">{licenseKey}</span> : <CopyLicense value={licenseKey} variant="card" />}
        </div>
        {error && <p className="key-error" id="key-error" role="alert">{error}</p>}
      </div>
      <div className="card-footer">
        {entering ? <button className="primary-button" type="submit">Save license</button> : !armed && !cutting &&
          (decorative ? <span className="text-button unlink-button"><IconScissors size={18} /> Unlink this device</span> : <button ref={unlinkButton} type="button" className="text-button unlink-button" onClick={() => setCardState('armed')}><IconScissors size={18} aria-hidden="true" />Unlink this device</button>)}
      </div>
    </div>;
  }

  return <div className="license-lab">
    <header className="lab-header">
      <a href="/" aria-label="Trimi editor"><img src={logo} className="brand-logo" alt="Trimi" /></a>
      <span className="lab-tag">License concept</span>
      <div className="header-account"><span className="license-status" role="status">{licensed ? 'License active' : 'Preview mode'}</span><button ref={avatar} type="button" className="avatar-button icon-button" aria-label="Account" popoverTarget="lab-account"><IconUserCircle size={27} stroke={1.6} aria-hidden="true" /></button></div>
      <div id="lab-account" ref={popover} popover="auto" className="account-popover"><button type="button" onClick={openCard}><IconKey size={17} aria-hidden="true" />{licensed ? 'View License' : 'Add License'}</button></div>
    </header>
    <main className="lab-editor">
      <div className="editor-heading"><div><span className="small-label">YOUR WORKSPACE</span><h1>A little space to create.</h1></div><button className="primary-button upload-button" type="button" aria-disabled={!licensed} aria-describedby={!licensed ? 'preview-description' : undefined} onClick={() => licensed ? fileInput.current?.click() : openCard()}>{licensed ? <IconPlus size={18} aria-hidden="true" /> : <IconLock size={17} aria-hidden="true" />}Add video</button></div>
      <input ref={fileInput} type="file" accept="video/*" hidden onChange={event => {
        const file = event.target.files?.[0];
        if (licensed && file) {
          if (!file.type.startsWith('video/')) setUploadError('Choose a video file to preview.');
          else { setVideo({ url: URL.createObjectURL(file), name: file.name }); setUploadError(''); }
        }
        event.target.value = '';
      }} />
      <div className="preview-stage"><video key={video?.url ?? 'sample'} src={video?.url ?? '/sample-wolf.mp4#t=0.1'} controls playsInline preload="metadata" aria-label={video?.name ?? 'Placeholder video'} onError={() => setUploadError('This video could not be played. Try another video format.')} /><div className="video-caption"><span>{video?.name ?? 'A moment in the wild'}</span><span>{video ? 'Your video' : 'Placeholder video · Nicky Pe'}</span></div></div>
      <div className="editor-bottom"><p id="preview-description">{licensed ? 'Your next idea starts here. Add a video and make it yours.' : 'Try Trimi with the placeholder video. Activate your license to add your own.'}</p>{!licensed && <button type="button" className="text-button" onClick={openCard}>Activate license</button>}</div>
      {uploadError && <p className="key-error" role="alert">{uploadError}</p>}
    </main>
    <footer className="lab-footer"><span>Design playground · Sample license only</span><button type="button" className="text-button" onClick={() => { setLicensed(true); setLicenseKey(DEMO_KEY); setCardState('license'); setVideo(null); setUploadError(''); }}>Reset demo</button></footer>

    <dialog ref={dialog} className="license-dialog" aria-labelledby="license-dialog-title" aria-describedby={armed ? 'cut-instructions' : undefined} onCancel={event => { if (cutting) event.preventDefault(); }} onClose={() => { if (cutting) finishCut(); const previous = trigger.current; if (previous?.isConnected && !popover.current?.contains(previous)) previous.focus(); else avatar.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget && !cutting) closeCard(); }}>
      <div className="dialog-content" onClick={event => event.stopPropagation()}>
        {!cutting && <button type="button" className="close-card icon-button" onClick={closeCard} aria-label="Close license dialog"><IconX size={20} aria-hidden="true" /></button>}
        {cardState === 'unlinked' || cardState === 'activated' ? <section className="success-card" key={cardState}>
          <img className="brand-logo" src={logo} alt="Trimi" />
          <div className="success-icon"><IconCheck size={28} stroke={1.7} aria-hidden="true" /></div>
          <h2 id="license-dialog-title" ref={successTitle} tabIndex={-1}>{cardState === 'unlinked' ? 'Your license is ready to travel.' : 'You’re all set.'}</h2>
          <p>{cardState === 'unlinked' ? 'This device has been unlinked. Copy your license below to activate Trimi in another browser or on another computer.' : 'Your license is active on this device. You can now upload and edit your own videos.'}</p>
          <CopyLicense value={licenseKey} />
          <button type="button" className="primary-button success-close" onClick={closeCard}>{cardState === 'unlinked' ? 'Close' : 'Back to the editor'}</button>
        </section> : <>
          <h2 className="sr-only" id="license-dialog-title">{entering ? 'Activate your Trimi license' : 'Your Trimi license'}</h2>
          <form onSubmit={saveLicense} className="card-scene" data-cutting={cutting} data-armed={armed} aria-busy={cutting}>
            <div className="intact-card" inert={cutting}>{cardFace()}</div>
            {cutting && <div className="cut-fragments" aria-hidden="true" inert>
              <div className="card-fragment fragment-left">{cardFace(true)}</div>
              <div className="card-fragment fragment-right" onAnimationEnd={event => { if (event.target === event.currentTarget) finishCut(); }}>{cardFace(true)}</div>
              <div className="cut-scissors-track"><span className="cut-scissors"><IconScissors size={28} stroke={1.7} /></span></div>
            </div>}
            {armed && <button ref={cutButton} type="button" className="cut-line" aria-label="Cut along the line to unlink this device" aria-describedby="cut-instructions" onClick={cut} onPointerDown={event => { gestureStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={moveScissors} onPointerUp={() => { gestureStart.current = null; }} onPointerCancel={() => { gestureStart.current = null; }}><span className="cut-dashes" /></button>}
          </form>
          <div className="card-guidance" aria-live="polite">
            {armed && <p className="sr-only" id="cut-instructions">Click the dotted line or drag upwards to unlink this device.</p>}
            {entering && <p id="demo-license-hint">Try it with this sample license:<br /><button type="button" className="demo-key" onClick={() => { setDraft(DEMO_KEY); setError(''); keyInput.current?.focus(); }}>{DEMO_KEY}</button></p>}
          </div>
        </>}
      </div>
    </dialog>
  </div>;
}
