/**
 * MobileLanding - Shown to mobile users instead of the main app
 *
 * Since the recorder needs a desktop browser (webcam positioning, canvas recording),
 * we show mobile users a nice landing page where they can send themselves a link.
 */

import { useState } from 'react';
import './MobileLanding.css';

function MobileLanding() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const appUrl = window.location.href;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email');
      setStatus('error');
      return;
    }

    setStatus('sending');

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, url: appUrl }),
      });

      if (response.ok) {
        setStatus('sent');
      } else {
        const data = await response.json();
        setErrorMessage(data.error || 'Failed to send email');
        setStatus('error');
      }
    } catch {
      setErrorMessage('Network error. Try the share button instead.');
      setStatus('error');
    }
  };

  const handleShare = async () => {
    if ('share' in navigator) {
      try {
        await navigator.share({
          title: 'Excalicord',
          text: 'Record beautiful whiteboard videos with your webcam',
          url: appUrl,
        });
      } catch {
        // User cancelled or share failed - that's fine
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      alert('Link copied!');
    } catch {
      // Fallback for older browsers
      prompt('Copy this link:', appUrl);
    }
  };

  return (
    <div className="mobile-landing">
      {/* Ambient background */}
      <div className="mobile-bg" />

      <div className="mobile-content">
        {/* Logo / Icon */}
        <div className="mobile-icon">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="6" width="40" height="30" rx="4" stroke="currentColor" strokeWidth="2.5"/>
            <circle cx="34" cy="26" r="7" fill="#ef4444"/>
            <circle cx="34" cy="26" r="3" fill="white"/>
            <path d="M12 16h14M12 22h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Headline */}
        <h1 className="mobile-headline">
          Excalicord
        </h1>

        <p className="mobile-subheadline">
          Record beautiful whiteboard videos with your webcam. Like Loom, but for visual explanations.
        </p>

        {/* Desktop only notice */}
        <div className="mobile-notice">
          <span className="notice-icon">💻</span>
          <span>Desktop browser required</span>
        </div>

        {/* Email form or success state */}
        {status === 'sent' ? (
          <div className="mobile-success">
            <span className="success-icon">✓</span>
            <p>Link sent! Check your inbox.</p>
          </div>
        ) : (
          <form className="mobile-form" onSubmit={handleSubmit}>
            <p className="form-label">Send the link to your computer</p>
            <div className="form-row">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                className={status === 'error' ? 'input-error' : ''}
                disabled={status === 'sending'}
              />
              <button type="submit" disabled={status === 'sending'}>
                {status === 'sending' ? '...' : 'Send'}
              </button>
            </div>
            {status === 'error' && (
              <p className="form-error">{errorMessage}</p>
            )}
          </form>
        )}

        {/* Alternative actions */}
        <div className="mobile-alternatives">
          <span className="alt-divider">or</span>
          <div className="alt-buttons">
            {'share' in navigator && (
              <button className="alt-btn" onClick={handleShare}>
                <span>↗</span> Share
              </button>
            )}
            <button className="alt-btn" onClick={handleCopy}>
              <span>⎘</span> Copy link
            </button>
          </div>
        </div>

        {/* Preview image */}
        <div className="mobile-preview">
          <div className="preview-mockup">
            <div className="mockup-toolbar">
              <span className="mockup-dot" />
              <span className="mockup-dot" />
              <span className="mockup-dot" />
            </div>
            <div className="mockup-content">
              <div className="mockup-canvas">
                <div className="mockup-drawing" />
                <div className="mockup-webcam" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MobileLanding;
