/**
 * MobileLanding - Shown to mobile users instead of the main app
 *
 * Since the recorder needs a desktop browser (webcam positioning, canvas recording),
 * we show mobile users a nice landing page where they can send themselves a link.
 */

import { useState, useEffect } from 'react';
import './MobileLanding.css';

function MobileLanding() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const appUrl = window.location.href;

  // Override global overflow:hidden to allow scrolling on mobile
  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

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

        {/* Preview image - shows what the recorded video looks like */}
        <div className="mobile-preview">
          <div className="preview-mockup">
            <div className="mockup-canvas">
              {/* Excalidraw-style hand-drawn whiteboard content */}
              <svg className="whiteboard-content" viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Wobbly rectangle - hand drawn style */}
                <path d="M32 35 C35 34 70 32 100 33 C130 34 155 31 170 33 C172 50 173 75 171 95 C170 97 140 99 100 98 C60 97 35 100 33 98 C31 80 30 55 32 35" stroke="#1e1e1e" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                {/* Wobbly text lines */}
                <path d="M45 50 C55 49 75 51 105 50" stroke="#1e1e1e" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M45 62 C60 63 90 61 120 62" stroke="#1e1e1e" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M45 74 C52 73 70 75 90 74" stroke="#1e1e1e" strokeWidth="1.5" strokeLinecap="round"/>
                {/* Wobbly arrow */}
                <path d="M178 65 C190 64 210 60 235 48" stroke="#1e1e1e" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                <path d="M225 45 C228 46 234 47 236 49 C234 51 230 55 228 58" stroke="#1e1e1e" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                {/* Wobbly circle */}
                <path d="M255 38 C268 36 280 42 281 55 C282 68 270 78 257 77 C244 76 234 66 235 53 C236 42 245 37 255 38" stroke="#e03131" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
                {/* Wobbly underline */}
                <path d="M35 130 C60 133 100 127 140 131 C170 128 190 132 210 129" stroke="#1971c2" strokeWidth="2" fill="none" strokeLinecap="round"/>
                {/* Small dots for texture */}
                <circle cx="260" cy="57" r="2" fill="#e03131"/>
              </svg>

              {/* Notion-style black & white person avatar */}
              <div className="mockup-avatar">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* White background */}
                  <circle cx="40" cy="40" r="39" fill="white" stroke="#1e1e1e" strokeWidth="1.5"/>
                  {/* Simple hair */}
                  <path d="M20 32 C20 18 28 12 40 12 C52 12 60 18 60 32 C60 34 58 35 56 34 L56 26 C56 18 50 14 40 14 C30 14 24 18 24 26 L24 34 C22 35 20 34 20 32" fill="#1e1e1e"/>
                  {/* Face outline */}
                  <ellipse cx="40" cy="36" rx="16" ry="17" fill="white" stroke="#1e1e1e" strokeWidth="1.5"/>
                  {/* Eyes - simple dots */}
                  <circle cx="34" cy="34" r="2" fill="#1e1e1e"/>
                  <circle cx="46" cy="34" r="2" fill="#1e1e1e"/>
                  {/* Simple smile */}
                  <path d="M34 43 C37 47 43 47 46 43" stroke="#1e1e1e" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  {/* Neck */}
                  <path d="M35 52 L35 58 L45 58 L45 52" stroke="#1e1e1e" strokeWidth="1.5" fill="white"/>
                  {/* Shoulders/body - simple lines */}
                  <path d="M18 78 C18 65 28 58 40 58 C52 58 62 65 62 78" stroke="#1e1e1e" strokeWidth="1.5" fill="white"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MobileLanding;
