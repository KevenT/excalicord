/**
 * WelcomeModal - Shows once on first visit to explain what the app does
 *
 * Stored in localStorage so returning users go straight to the app.
 */

import { useState, useEffect } from 'react';
import './WelcomeModal.css';

const STORAGE_KEY = 'excalicord_welcomed';

function WelcomeModal() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has seen the welcome modal before
    const hasSeenWelcome = localStorage.getItem(STORAGE_KEY);
    if (!hasSeenWelcome) {
      setIsVisible(true);
    }
  }, []);

  // Dismiss on Escape key
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="welcome-overlay" onClick={handleDismiss}>
      <div className="welcome-modal" onClick={e => e.stopPropagation()}>
        {/* App icon */}
        <div className="welcome-icon">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="8" width="40" height="28" rx="4" stroke="currentColor" strokeWidth="2.5"/>
            <circle cx="36" cy="32" r="8" fill="#ef4444"/>
            <circle cx="36" cy="32" r="4" fill="white"/>
            <path d="M12 18h16M12 24h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        <h1 className="welcome-title">Welcome to Excalicord</h1>

        <p className="welcome-subtitle">
          Record beautiful whiteboard videos with your face in the corner. Perfect for tutorials, explanations, and async communication.
        </p>

        {/* Quick feature list */}
        <div className="welcome-features">
          <div className="welcome-feature">
            <span className="feature-icon">🎨</span>
            <span>Draw on the whiteboard</span>
          </div>
          <div className="welcome-feature">
            <span className="feature-icon">📹</span>
            <span>Your webcam appears in the corner</span>
          </div>
          <div className="welcome-feature">
            <span className="feature-icon">⚙️</span>
            <span>Customize backgrounds & aspect ratio</span>
          </div>
          <div className="welcome-feature">
            <span className="feature-icon">⏺️</span>
            <span>Hit Record when ready</span>
          </div>
        </div>

        {/* CTA */}
        <button className="welcome-cta" onClick={handleDismiss}>
          Got it, let's go
        </button>

        <p className="welcome-hint">
          Press <kbd>Esc</kbd> or click anywhere to dismiss
        </p>
      </div>
    </div>
  );
}

export default WelcomeModal;
