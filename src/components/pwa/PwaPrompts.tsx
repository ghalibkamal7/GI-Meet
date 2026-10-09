import { useEffect, useState } from 'react';
import { Download, Plus, RefreshCw, Share, X } from 'lucide-react';
import {
  applyUpdate,
  dismissInstallPrompt,
  getUpdateRisk,
  promptInstall,
  usePwa,
  type UpdateRisk,
} from '../../pwa/pwa';
import { BrandMark } from '../common/BrandMark';
import { ConfirmDialog } from '../common/ConfirmDialog';

// Wait a little after the app opens before asking — never interrupt the first seconds.
const INSTALL_PROMPT_DELAY_MS = 10_000;

const RISK_MESSAGE: Record<UpdateRisk, string> = {
  call: "You're in a call or meeting. Updating reloads GI Meet and will disconnect you.",
  'unsaved-text': "You have text you haven't sent yet. Updating reloads GI Meet and that text will be lost.",
};

export function PwaPrompts() {
  const pwa = usePwa();
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [updateDeferred, setUpdateDeferred] = useState(false);
  const [risk, setRisk] = useState<UpdateRisk | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDelayElapsed(true), INSTALL_PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // isInstalled already folds in "running inside the native app", so none of
  // the install UI can appear there; canInstall / showIosInstructions are
  // both false whenever the app is installed.
  const showInstall = delayElapsed && pwa.canInstall && !pwa.installDismissed;
  const showIosSteps = delayElapsed && pwa.showIosInstructions && !pwa.installDismissed;
  const showUpdate = pwa.updateAvailable && !updateDeferred;

  function handleUpdateClick() {
    const found = getUpdateRisk();
    if (found) {
      setRisk(found); // ask first — reloading would lose something
      return;
    }
    applyUpdate();
  }

  return (
    <>
      {showUpdate && (
        <div className="gi-pwa-card gi-pwa-update rb-card" role="status" aria-live="polite">
          <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
          <div className="gi-pwa-text">
            <strong>New version available</strong>
            <span>Reload to get the latest GI Meet.</span>
          </div>
          <button type="button" className="rb-btn rb-btn--primary gi-pwa-btn" onClick={handleUpdateClick}>
            Update
          </button>
          <button
            type="button"
            className="rb-icon-btn gi-pwa-close"
            aria-label="Remind me later"
            onClick={() => setUpdateDeferred(true)}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {showInstall && (
        <div className="gi-pwa-card gi-pwa-install rb-card" role="dialog" aria-label="Install GI Meet">
          <BrandMark size={30} />
          <div className="gi-pwa-body">
            <div className="gi-pwa-text">
              <strong>Install GI Meet</strong>
              <span>Add it to your device for quick access and a full-screen experience.</span>
            </div>
            <div className="gi-pwa-actions">
              <button type="button" className="rb-btn rb-btn--primary gi-pwa-btn" onClick={() => void promptInstall()}>
                <Download size={15} strokeWidth={1.75} aria-hidden="true" /> Install
              </button>
              <button type="button" className="rb-btn rb-btn--outline gi-pwa-btn" onClick={() => dismissInstallPrompt()}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {showIosSteps && (
        <div className="gi-pwa-card gi-pwa-install rb-card" role="dialog" aria-label="Install GI Meet on iPhone or iPad">
          <BrandMark size={30} />
          <div className="gi-pwa-body">
            <div className="gi-pwa-text">
              <strong>Install GI Meet:</strong>
              <ol className="gi-pwa-steps">
                <li>
                  Tap <Share size={14} strokeWidth={1.75} aria-hidden="true" /> <b>Share</b>
                </li>
                <li>
                  Select <Plus size={14} strokeWidth={1.75} aria-hidden="true" /> <b>Add to Home Screen</b>
                </li>
                <li>
                  Tap <b>Add</b>
                </li>
              </ol>
            </div>
            <div className="gi-pwa-actions">
              <button type="button" className="rb-btn rb-btn--outline gi-pwa-btn" onClick={() => dismissInstallPrompt()}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {risk && (
        <ConfirmDialog
          title="Update now?"
          message={RISK_MESSAGE[risk]}
          confirmLabel="Update anyway"
          danger
          onConfirm={() => {
            setRisk(null);
            applyUpdate();
          }}
          onCancel={() => setRisk(null)}
        />
      )}

      <style>{`
        .gi-pwa-card {
          position: fixed;
          z-index: 350;
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          box-shadow: var(--shadow-md);
          animation: gi-pwa-in 0.22s ease-out;
        }
        .gi-pwa-install { align-items: flex-start; }
        .gi-pwa-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; flex: 1; }
        .gi-pwa-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; font-size: 13px; }
        .gi-pwa-text strong { font-size: 14px; }
        .gi-pwa-text span { color: var(--color-text-muted); }
        .gi-pwa-steps { margin: 6px 0 0; padding-left: 18px; color: var(--color-text-muted); line-height: 1.7; }
        .gi-pwa-steps svg { vertical-align: -2px; }
        .gi-pwa-actions { display: flex; gap: 8px; }
        .gi-pwa-btn { padding: 8px 14px; font-size: 13px; }
        .gi-pwa-close { background: none; border: none; color: var(--color-text-muted); cursor: pointer; border-radius: 8px; }

        /* Phones: update banner at the top, install card just above the bottom navigation. */
        .gi-pwa-update { top: calc(var(--safe-top) + 12px); left: 12px; right: 12px; }
        .gi-pwa-install { left: 12px; right: 12px; bottom: calc(var(--safe-bottom) + 68px); }

        @media (min-width: 769px) {
          .gi-pwa-update { left: 0; right: 0; margin: 0 auto; width: 420px; }
          .gi-pwa-install { left: auto; right: 20px; bottom: 20px; width: 360px; }
        }

        @keyframes gi-pwa-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .gi-pwa-card { animation: none; }
        }
      `}</style>
    </>
  );
}