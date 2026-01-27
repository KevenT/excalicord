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
              {/* Excalidraw-style whiteboard content */}
              <svg className="whiteboard-content" viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Hand-drawn style rectangle */}
                <path d="M40 40 L180 38 L182 100 L42 102 Z" stroke="#1e1e1e" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{strokeDasharray: '0'}} />
                {/* Hand-drawn arrow */}
                <path d="M190 70 Q220 70 250 50" stroke="#1e1e1e" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d="M245 42 L250 50 L242 52" stroke="#1e1e1e" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                {/* Text lines inside box */}
                <path d="M55 55 L120 55" stroke="#1e1e1e" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                <path d="M55 70 L140 70" stroke="#1e1e1e" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                <path d="M55 85 L100 85" stroke="#1e1e1e" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
                {/* Small circle with text */}
                <circle cx="270" cy="45" r="18" stroke="#e03131" strokeWidth="2" fill="none" />
                <path d="M265 45 L275 45" stroke="#e03131" strokeWidth="1.5" strokeLinecap="round" />
                {/* Loose scribble/underline */}
                <path d="M40 130 Q90 135 140 128 Q180 125 200 130" stroke="#1971c2" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>

              {/* Notion-style person avatar in corner */}
              <div className="mockup-avatar">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Background circle */}
                  <circle cx="40" cy="40" r="40" fill="#FEF3E2"/>
                  {/* Face */}
                  <circle cx="40" cy="35" r="18" fill="#FFDAB3"/>
                  {/* Hair */}
                  <path d="M22 30 Q22 15 40 15 Q58 15 58 30 Q58 35 55 35 L55 28 Q55 20 40 20 Q25 20 25 28 L25 35 Q22 35 22 30Z" fill="#4A3728"/>
                  {/* Eyes */}
                  <circle cx="34" cy="33" r="2.5" fill="#1e1e1e"/>
                  <circle cx="46" cy="33" r="2.5" fill="#1e1e1e"/>
                  {/* Friendly smile */}
                  <path d="M34 42 Q40 47 46 42" stroke="#1e1e1e" strokeWidth="2" fill="none" strokeLinecap="round"/>
                  {/* Body/shoulders */}
                  <path d="M20 80 Q20 58 40 55 Q60 58 60 80" fill="#7C9ED9"/>
                  {/* Neck */}
                  <rect x="35" y="50" width="10" height="8" fill="#FFDAB3"/>
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
