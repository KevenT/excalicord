/**
 * RecordingControls - Draggable record/stop buttons with settings
 */

import { useState, useEffect, useRef } from 'react';
import './RecordingControls.css';

interface RecordingControlsProps {
  isRecording: boolean;
  isPreviewing: boolean;
  isPaused: boolean;
  isConverting: boolean;
  showCursor: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTogglePause: () => void;
  onToggleCursor: () => void;
  onConfirmRecording: () => void;
  onCancelPreview: () => void;
  onOpenSettings: () => void;
  onToggleTeleprompter: () => void;
  showTeleprompter: boolean;
}

function RecordingControls({
  isRecording,
  isPreviewing,
  isPaused,
  isConverting,
  showCursor,
  onStartRecording,
  onStopRecording,
  onTogglePause,
  onToggleCursor,
  onConfirmRecording,
  onCancelPreview,
  onOpenSettings,
  onToggleTeleprompter,
  showTeleprompter
}: RecordingControlsProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [position, setPosition] = useState({ x: window.innerWidth - 200, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });
  const controlsRef = useRef<HTMLDivElement>(null);

  // Timer - pauses when recording is paused
  useEffect(() => {
    if (!isRecording) {
      setElapsedSeconds(0);
      return;
    }
    // Don't count time while paused
    if (isPaused) {
      return;
    }
    const interval = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Constrain position when element size changes or on mount
  useEffect(() => {
    if (controlsRef.current) {
      const rect = controlsRef.current.getBoundingClientRect();
      setPosition(prev => ({
        x: Math.max(10, Math.min(prev.x, window.innerWidth - rect.width - 10)),
        y: Math.max(10, Math.min(prev.y, window.innerHeight - rect.height - 10))
      }));
    }
  }, [isPreviewing, isRecording]);

  // Drag the entire control bar
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    positionStartRef.current = { ...position };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Get actual element dimensions
      const rect = controlsRef.current?.getBoundingClientRect();
      const width = rect?.width || 300;
      const height = rect?.height || 50;

      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - width - 10, positionStartRef.current.x + deltaX)),
        y: Math.max(10, Math.min(window.innerHeight - height - 10, positionStartRef.current.y + deltaY))
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={controlsRef}
      className={`recording-controls ${isDragging ? 'dragging' : ''}`}
      style={{ left: position.x, top: position.y, cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
    >
      {/* Settings button */}
      <button
        className="settings-btn"
        onClick={onOpenSettings}
        title="Recording Settings"
        disabled={isRecording || isConverting || isPreviewing}
      >
        ⚙
      </button>

      {/* Teleprompter toggle */}
      <button
        className={`teleprompter-btn ${showTeleprompter ? 'active' : ''}`}
        onClick={onToggleTeleprompter}
        title="Toggle Teleprompter"
        disabled={isConverting}
      >
        📜
      </button>

      {isConverting ? (
        <div className="converting-status">
          <span className="spinner"></span>
          Converting...
        </div>
      ) : isRecording ? (
        <>
          {/* Cursor toggle - icon button */}
          <button
            className={`cursor-toggle-btn ${showCursor ? 'active' : ''}`}
            onClick={onToggleCursor}
            title={showCursor ? 'Hide cursor effect' : 'Show cursor effect'}
          >
            ◎
          </button>
          <button className="control-button pause-button" onClick={onTogglePause}>
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button className="control-button stop-button" onClick={onStopRecording}>
            ■ Stop
          </button>
          <div className={`recording-timer ${isPaused ? 'paused' : ''}`}>
            <span className={`recording-dot ${isPaused ? 'paused' : ''}`}></span>
            <span>{formatTime(elapsedSeconds)}</span>
          </div>
        </>
      ) : isPreviewing ? (
        <>
          <button className="control-button cancel-button" onClick={onCancelPreview}>
            ✕ Cancel
          </button>
          <button className="control-button confirm-button" onClick={onConfirmRecording}>
            ● Start Recording
          </button>
        </>
      ) : (
        <button className="control-button record-button" onClick={onStartRecording}>
          ● Record
        </button>
      )}
    </div>
  );
}

export default RecordingControls;
