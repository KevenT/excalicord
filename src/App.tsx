/**
 * Excalidraw Recorder - Record whiteboard + webcam videos
 *
 * Features:
 * - Customizable aspect ratios (16:9, 4:3, 9:16, 1:1, custom)
 * - Gradient backgrounds
 * - Adjustable webcam size
 * - Canvas padding
 * - Recording area overlay
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import WebcamBubble from './components/WebcamBubble';
import RecordingControls from './components/RecordingControls';
import SettingsPanel, { ASPECT_RATIOS } from './components/SettingsPanel';
import MobileLanding from './components/MobileLanding';
import WelcomeModal from './components/WelcomeModal';
import type { RecordingSettings } from './components/SettingsPanel';
import { initAnalytics, trackPageView, trackRecordingStarted, trackRecordingCompleted, trackRecordingCancelled, trackRecordingSourceSwitched, trackTeleprompterUsed, trackSettingsChanged } from './utils/analytics';
import { WebCodecsRecorder, isWebCodecsSupported } from './utils/webCodecsRecorder';
import './App.css';

const RECORDING_RENDER_FPS = 30;
const RECORDING_FRAME_INTERVAL_MS = 1000 / RECORDING_RENDER_FPS;
type CompositeVisualSource = 'excalidraw' | 'display';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getAdaptiveVisualDefaults = (next: {
  aspectRatio: string;
  customWidth: number;
  customHeight: number;
}) => {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const base = Math.min(viewportWidth, viewportHeight);
  const portraitLike = (
    next.aspectRatio === '9:16' ||
    next.aspectRatio === '3:4' ||
    (next.aspectRatio === 'custom' && next.customHeight > next.customWidth)
  );
  const ratioScale = portraitLike ? 0.72 : 1;

  return {
    webcamSize: clamp(Math.round(base * 0.2 * ratioScale), 105, 220),
    padding: clamp(Math.round(base * 0.065 * ratioScale), 16, 72),
    cornerRadius: clamp(Math.round(base * 0.018 * ratioScale), 8, 24),
  };
};

const createDefaultSettings = (): RecordingSettings => {
  const adaptiveDefaults = getAdaptiveVisualDefaults({
    aspectRatio: '16:9',
    customWidth: 1920,
    customHeight: 1080,
  });

  return {
    recordingSource: 'composite',
    aspectRatio: '16:9',
    customWidth: 1920,
    customHeight: 1080,
    background: '#ffffff',
    backgroundId: 'none',
    backgroundType: 'solid',
    webcamSize: adaptiveDefaults.webcamSize,
    padding: adaptiveDefaults.padding,
    cornerRadius: adaptiveDefaults.cornerRadius,
    showCursor: true,
    cursorColor: '#ef4444',
    showTitle: false,
    titleText: '',
    titlePosition: 'bottom-left',
    showCamera: true,
    cameraMirror: true,
    recordAudio: true,
    recordSystemAudio: true,
  };
};

// Initialize analytics once when module loads
initAnalytics();

// Detect if user is on a mobile device
const isMobileDevice = () => {
  // Primary check: screen width (works in DevTools device mode)
  const isSmallScreen = window.innerWidth < 768;

  // Secondary check: mobile user agent
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Show mobile landing if screen is small OR it's a mobile browser
  return isSmallScreen || mobileUA;
};

function App() {
  // Check for mobile device - show landing page instead of app
  const [isMobile] = useState(() => isMobileDevice());

  // Track page view on mount
  useEffect(() => {
    trackPageView(isMobile);
  }, [isMobile]);

  // If on mobile, show the landing page with email capture
  if (isMobile) {
    return <MobileLanding />;
  }

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false); // Preview mode before recording
  const [isPaused, setIsPaused] = useState(false); // Pause state during recording
  const [isConverting, setIsConverting] = useState(false);
  const [convertingMessage, setConvertingMessage] = useState('');
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [bubblePosition, setBubblePosition] = useState({ x: 20, y: 100 });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<RecordingSettings>(() => createDefaultSettings());
  const [recordingFrame, setRecordingFrame] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [activeCompositeSource, setActiveCompositeSource] = useState<CompositeVisualSource>('excalidraw');
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [teleprompterText, setTeleprompterText] = useState('');
  const [teleprompterPosition, setTeleprompterPosition] = useState({ x: window.innerWidth - 360, y: 80 });
  const [isTeleprompterDragging, setIsTeleprompterDragging] = useState(false);

  // Refs
  const excalidrawApiRef = useRef<unknown>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const teleprompterRef = useRef<HTMLDivElement | null>(null);
  const cursorIndicatorRef = useRef<HTMLDivElement | null>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const webCodecsRecorderRef = useRef<WebCodecsRecorder | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaRecorderChunksRef = useRef<Blob[]>([]);
  const mediaRecorderStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const desktopMicStreamRef = useRef<MediaStream | null>(null);
  const desktopAudioContextRef = useRef<AudioContext | null>(null);
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const displayCaptureStreamRef = useRef<MediaStream | null>(null);
  const displayCaptureVideoRef = useRef<HTMLVideoElement | null>(null);
  const displayCaptureSystemAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const sourceSwitchCountRef = useRef(0);
  const usedDisplaySourceRef = useRef(false);
  const compositeAudioContextRef = useRef<AudioContext | null>(null);
  const compositeAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const compositeMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const compositeSystemSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const compositeMicGainRef = useRef<GainNode | null>(null);
  const compositeSystemGainRef = useRef<GainNode | null>(null);
  const compositeMixedAudioStreamRef = useRef<MediaStream | null>(null);

  // Refs for animation loop
  const isRecordingRef = useRef(false);
  const activeRecordingSourceRef = useRef<'composite' | 'desktop'>('composite');
  const activeCompositeSourceRef = useRef<CompositeVisualSource>('excalidraw');
  const bubblePositionRef = useRef({ x: 20, y: 100 });
  const settingsRef = useRef(settings);
  const recordingFrameRef = useRef<{x: number, y: number, width: number, height: number} | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const pointerVelocityRef = useRef({ vx: 0, vy: 0, ts: 0 });
  const excalidrawContainerRectRef = useRef<DOMRect | null>(null);
  const excalidrawWrapperRef = useRef<HTMLElement | null>(null);
  const excalidrawContainerRef = useRef<HTMLElement | null>(null);
  const excalidrawCanvasesRef = useRef<HTMLCanvasElement[]>([]);
  const lastSceneQueryTimestampRef = useRef(0);
  const lastRenderTimestampRef = useRef(0);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const backgroundImageLoadedRef = useRef(false);
  const recordingStartTimeRef = useRef<number | null>(null);
  const usedTeleprompterRef = useRef(false);
  const usedPauseRef = useRef(false);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { bubblePositionRef.current = bubblePosition; }, [bubblePosition]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { recordingFrameRef.current = recordingFrame; }, [recordingFrame]);
  useEffect(() => { activeCompositeSourceRef.current = activeCompositeSource; }, [activeCompositeSource]);

  const updateCursorIndicator = useCallback((x: number, y: number) => {
    const indicator = cursorIndicatorRef.current;
    if (!indicator) return;

    const frame = recordingFrameRef.current;
    const currentSettings = settingsRef.current;
    const containerRect = excalidrawContainerRectRef.current;
    const localX = x - (containerRect?.left ?? 0);
    const localY = y - (containerRect?.top ?? 0);

    const shouldShow = Boolean(
      isRecordingRef.current &&
      currentSettings.showCursor &&
      frame &&
      localX >= frame.x &&
      localX <= frame.x + frame.width &&
      localY >= frame.y &&
      localY <= frame.y + frame.height
    );

    if (!shouldShow) {
      indicator.style.opacity = '0';
      return;
    }

    indicator.style.opacity = '1';
    indicator.style.left = `${x}px`;
    indicator.style.top = `${y}px`;
    indicator.style.backgroundColor = `${currentSettings.cursorColor}80`;
  }, []);

  const updatePointerPosition = useCallback((x: number, y: number) => {
    const now = performance.now();
    const prev = mousePositionRef.current;
    const prevTs = pointerVelocityRef.current.ts || now;
    const dt = Math.max(1, now - prevTs);

    pointerVelocityRef.current = {
      vx: (x - prev.x) / dt,
      vy: (y - prev.y) / dt,
      ts: now,
    };

    mousePositionRef.current = { x, y };
    updateCursorIndicator(x, y);
  }, [updateCursorIndicator]);

  // Track pointer position for cursor effect during recording
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      updatePointerPosition(e.clientX, e.clientY);
    };
    const handleMouseMove = (e: MouseEvent) => {
      updatePointerPosition(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [updatePointerPosition]);

  useEffect(() => {
    const { x, y } = mousePositionRef.current;
    updateCursorIndicator(x, y);
  }, [isRecording, recordingFrame, settings.showCursor, settings.cursorColor, updateCursorIndicator]);

  // Load background image when settings change
  useEffect(() => {
    if (settings.backgroundType === 'image' && settings.background.includes('url(')) {
      // Extract URL from url() wrapper
      const urlMatch = settings.background.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (urlMatch && urlMatch[1]) {
        backgroundImageLoadedRef.current = false;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          backgroundImageRef.current = img;
          backgroundImageLoadedRef.current = true;
        };
        img.onerror = () => {
          console.error('Failed to load background image');
          backgroundImageRef.current = null;
          backgroundImageLoadedRef.current = false;
        };
        img.src = urlMatch[1];
      }
    } else {
      backgroundImageRef.current = null;
      backgroundImageLoadedRef.current = false;
    }
  }, [settings.background, settings.backgroundType]);

  // Initialize webcam
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function initWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true
        });
        activeStream = stream;
        setWebcamStream(stream);
      } catch (err) {
        console.error('Failed to access webcam:', err);
        alert('Could not access camera. Please allow permissions and refresh.');
      }
    }
    initWebcam();
    return () => { activeStream?.getTracks().forEach(track => track.stop()); };
  }, []);

  // Calculate recording frame dimensions to fit in viewport while maintaining aspect ratio
  const calculateRecordingFrame = useCallback(() => {
    const container = document.querySelector('.excalidraw-container');
    if (!container) return null;

    const containerRect = container.getBoundingClientRect();
    const { width: targetWidth, height: targetHeight } = getRecordingDimensions();
    const targetAspect = targetWidth / targetHeight;

    // Calculate the largest frame that fits in the container with the target aspect ratio
    let frameWidth, frameHeight;
    const containerAspect = containerRect.width / containerRect.height;

    if (containerAspect > targetAspect) {
      // Container is wider - fit to height
      frameHeight = containerRect.height * 0.9; // 90% of container height
      frameWidth = frameHeight * targetAspect;
    } else {
      // Container is taller - fit to width
      frameWidth = containerRect.width * 0.9; // 90% of container width
      frameHeight = frameWidth / targetAspect;
    }

    // Center the frame
    const x = (containerRect.width - frameWidth) / 2;
    const y = (containerRect.height - frameHeight) / 2;

    return { x, y, width: frameWidth, height: frameHeight };
  }, [settings]);

  // Get recording dimensions from settings
  const getRecordingDimensions = useCallback(() => {
    if (settings.aspectRatio === 'custom') {
      return { width: settings.customWidth, height: settings.customHeight };
    }
    const ratio = ASPECT_RATIOS.find(r => r.id === settings.aspectRatio);
    return ratio ? { width: ratio.width, height: ratio.height } : { width: 1920, height: 1080 };
  }, [settings]);

  const downloadBlob = useCallback((blob: Blob, extension: 'mp4' | 'webm') => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `excalicord-${Date.now()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const getSupportedWebMMimeType = useCallback(() => {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
  }, []);

  const closeDesktopAudioContext = useCallback(async () => {
    const audioContext = desktopAudioContextRef.current;
    desktopAudioContextRef.current = null;

    if (!audioContext || audioContext.state === 'closed') {
      return;
    }

    try {
      await audioContext.close();
    } catch (error) {
      console.warn('[DesktopCapture] Failed to close AudioContext:', error);
    }
  }, []);

  const cleanupDesktopCapture = useCallback(async () => {
    const displayStream = displayStreamRef.current;
    const micStream = desktopMicStreamRef.current;

    if (displayStream) {
      displayStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    }
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
    }

    displayStreamRef.current = null;
    desktopMicStreamRef.current = null;

    await closeDesktopAudioContext();
  }, [closeDesktopAudioContext]);

  const closeCompositeAudioContext = useCallback(async () => {
    const audioContext = compositeAudioContextRef.current;
    compositeAudioContextRef.current = null;

    if (!audioContext || audioContext.state === 'closed') {
      return;
    }

    try {
      await audioContext.close();
    } catch (error) {
      console.warn('[Composite] Failed to close AudioContext:', error);
    }
  }, []);

  const detachCompositeSystemAudio = useCallback(() => {
    compositeSystemSourceRef.current?.disconnect();
    compositeSystemGainRef.current?.disconnect();
    compositeSystemSourceRef.current = null;
    compositeSystemGainRef.current = null;
    displayCaptureSystemAudioTrackRef.current = null;
  }, []);

  const cleanupCompositeAudioPipeline = useCallback(async () => {
    detachCompositeSystemAudio();
    compositeMicSourceRef.current?.disconnect();
    compositeMicGainRef.current?.disconnect();
    compositeMicSourceRef.current = null;
    compositeMicGainRef.current = null;
    compositeAudioDestinationRef.current = null;
    compositeMixedAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
    compositeMixedAudioStreamRef.current = null;
    await closeCompositeAudioContext();
  }, [closeCompositeAudioContext, detachCompositeSystemAudio]);

  const createCompositeAudioPipeline = useCallback(async (
    includeMic: boolean,
    includeSystemAudio: boolean
  ): Promise<MediaStream | null> => {
    if ((!includeMic && !includeSystemAudio) || typeof AudioContext === 'undefined') {
      return null;
    }

    await cleanupCompositeAudioPipeline();

    try {
      const audioContext = new AudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const destination = audioContext.createMediaStreamDestination();
      compositeAudioContextRef.current = audioContext;
      compositeAudioDestinationRef.current = destination;
      compositeMixedAudioStreamRef.current = destination.stream;

      if (includeMic) {
        const micTrack = webcamStream?.getAudioTracks().find((track) => track.readyState === 'live');
        if (micTrack) {
          const micSource = audioContext.createMediaStreamSource(new MediaStream([micTrack]));
          const micGain = audioContext.createGain();
          micGain.gain.value = 1;
          micSource.connect(micGain);
          micGain.connect(destination);
          compositeMicSourceRef.current = micSource;
          compositeMicGainRef.current = micGain;
        } else {
          console.warn('[Composite] Microphone requested but unavailable.');
        }
      }

      const mixedTrack = destination.stream.getAudioTracks()[0] ?? null;
      if (!mixedTrack) {
        await cleanupCompositeAudioPipeline();
        return null;
      }

      return destination.stream;
    } catch (error) {
      console.warn('[Composite] Failed to initialize audio mix pipeline:', error);
      await cleanupCompositeAudioPipeline();
      return null;
    }
  }, [cleanupCompositeAudioPipeline, webcamStream]);

  const attachCompositeSystemAudio = useCallback((systemTrack: MediaStreamTrack | null): boolean => {
    detachCompositeSystemAudio();

    if (!systemTrack || !settingsRef.current.recordSystemAudio) {
      return false;
    }

    const audioContext = compositeAudioContextRef.current;
    const destination = compositeAudioDestinationRef.current;
    if (!audioContext || !destination) {
      return false;
    }

    try {
      const systemSource = audioContext.createMediaStreamSource(new MediaStream([systemTrack]));
      const systemGain = audioContext.createGain();
      systemGain.gain.value = 1;
      systemSource.connect(systemGain);
      systemGain.connect(destination);
      compositeSystemSourceRef.current = systemSource;
      compositeSystemGainRef.current = systemGain;
      displayCaptureSystemAudioTrackRef.current = systemTrack;
      return true;
    } catch (error) {
      console.warn('[Composite] Failed to attach system audio track:', error);
      return false;
    }
  }, [detachCompositeSystemAudio]);

  const cleanupCompositeDisplayCapture = useCallback((stopTracks: boolean) => {
    const stream = displayCaptureStreamRef.current;
    const videoEl = displayCaptureVideoRef.current;

    if (stream && stopTracks) {
      stream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
    } else if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.onended = null;
      });
    }

    if (videoEl) {
      videoEl.pause();
      videoEl.srcObject = null;
    }

    displayCaptureStreamRef.current = null;
    detachCompositeSystemAudio();
  }, [detachCompositeSystemAudio]);

  const startMediaRecorderFromStream = useCallback((
    stream: MediaStream,
    videoBitrate: number
  ) => {
    if (typeof MediaRecorder === 'undefined') {
      return false;
    }

    const mimeType = getSupportedWebMMimeType();

    try {
      const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: videoBitrate };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      if (stream.getAudioTracks().length > 0) {
        recorderOptions.audioBitsPerSecond = 192_000;
      }

      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaRecorderChunksRef.current.push(event.data);
        }
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      mediaRecorderStreamRef.current = stream;
      return true;
    } catch (error) {
      console.error('[Recording] Failed to start MediaRecorder fallback:', error);
      stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      mediaRecorderStreamRef.current = null;
      mediaRecorderChunksRef.current = [];
      return false;
    }
  }, [getSupportedWebMMimeType]);

  const startMediaRecorder = useCallback((
    canvas: HTMLCanvasElement,
    audioStream: MediaStream | null,
    videoBitrate: number
  ) => {
    if (typeof MediaRecorder === 'undefined') {
      return false;
    }

    const stream = canvas.captureStream(30);
    const audioTrack = audioStream?.getAudioTracks().find((track) => track.readyState === 'live');

    if (audioTrack) {
      stream.addTrack(audioTrack.clone());
    }

    return startMediaRecorderFromStream(stream, videoBitrate);
  }, [startMediaRecorderFromStream]);

  const mixDesktopAudioTracks = useCallback(async (
    systemAudioTrack: MediaStreamTrack,
    micAudioTrack: MediaStreamTrack
  ): Promise<MediaStreamTrack | null> => {
    if (typeof AudioContext === 'undefined') {
      return null;
    }

    await closeDesktopAudioContext();

    try {
      const audioContext = new AudioContext();
      desktopAudioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const destination = audioContext.createMediaStreamDestination();
      const systemSource = audioContext.createMediaStreamSource(new MediaStream([systemAudioTrack]));
      const micSource = audioContext.createMediaStreamSource(new MediaStream([micAudioTrack]));
      const systemGain = audioContext.createGain();
      const micGain = audioContext.createGain();

      systemGain.gain.value = 1;
      micGain.gain.value = 1;

      systemSource.connect(systemGain);
      micSource.connect(micGain);
      systemGain.connect(destination);
      micGain.connect(destination);

      const mixedTrack = destination.stream.getAudioTracks()[0] ?? null;
      if (!mixedTrack) {
        await closeDesktopAudioContext();
      }

      return mixedTrack;
    } catch (error) {
      console.warn('[DesktopCapture] Audio mixing unavailable, falling back to a single track:', error);
      await closeDesktopAudioContext();
      return null;
    }
  }, [closeDesktopAudioContext]);

  const stopMediaRecorder = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current;
    const stream = mediaRecorderStreamRef.current;

    const cleanup = () => {
      stream?.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      mediaRecorderStreamRef.current = null;
    };

    if (!recorder) {
      cleanup();
      return null;
    }

    const buildBlob = () => {
      const chunks = mediaRecorderChunksRef.current;
      if (chunks.length === 0) return null;
      return new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    };

    if (recorder.state === 'inactive') {
      const blob = buildBlob();
      cleanup();
      return blob;
    }

    return new Promise((resolve) => {
      const onStop = () => {
        const blob = buildBlob();
        cleanup();
        resolve(blob);
      };

      recorder.addEventListener('stop', onStop, { once: true });

      try {
        recorder.stop();
      } catch (error) {
        console.error('[Recording] Failed to stop MediaRecorder fallback:', error);
        recorder.removeEventListener('stop', onStop);
        cleanup();
        resolve(null);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      void cleanupDesktopCapture();
      cleanupCompositeDisplayCapture(true);
      void cleanupCompositeAudioPipeline();
    };
  }, [cleanupCompositeAudioPipeline, cleanupCompositeDisplayCapture, cleanupDesktopCapture]);

  // Parse gradient for canvas drawing
  const parseGradient = (ctx: CanvasRenderingContext2D, gradientStr: string, width: number, height: number) => {
    if (!gradientStr.includes('gradient')) {
      return gradientStr;
    }

    const match = gradientStr.match(/linear-gradient\((\d+)deg,\s*([^,]+)\s+\d+%,\s*([^)]+)\s+\d+%/);
    if (!match) return '#ffffff';

    const angle = parseInt(match[1]);
    const color1 = match[2].trim();
    const color2 = match[3].trim().split(' ')[0];

    const angleRad = (angle - 90) * Math.PI / 180;
    const x1 = width / 2 - Math.cos(angleRad) * width;
    const y1 = height / 2 - Math.sin(angleRad) * height;
    const x2 = width / 2 + Math.cos(angleRad) * width;
    const y2 = height / 2 + Math.sin(angleRad) * height;

    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    return gradient;
  };

  // Render loop
  const renderCompositeFrame = useCallback((rafTimestamp?: number) => {
    const canvas = compositeCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const currentSettings = settingsRef.current;
    const frame = recordingFrameRef.current;
    const now = typeof rafTimestamp === 'number' ? rafTimestamp : performance.now();

    if (!canvas || !ctx) {
      if (isRecordingRef.current) {
        animationFrameRef.current = requestAnimationFrame(renderCompositeFrame);
      }
      return;
    }

    // Limit expensive compositing to target FPS during recording.
    if (isRecordingRef.current && typeof rafTimestamp === 'number') {
      const elapsed = now - lastRenderTimestampRef.current;
      if (lastRenderTimestampRef.current && elapsed < RECORDING_FRAME_INTERVAL_MS) {
        animationFrameRef.current = requestAnimationFrame(renderCompositeFrame);
        return;
      }
      lastRenderTimestampRef.current = now;
    }

    const padding = currentSettings.padding;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Cache expensive DOM queries and refresh periodically.
    if (!excalidrawWrapperRef.current || !excalidrawContainerRef.current || (now - lastSceneQueryTimestampRef.current) > 300) {
      excalidrawWrapperRef.current = document.querySelector('.excalidraw');
      excalidrawContainerRef.current = document.querySelector('.excalidraw-container');
      excalidrawCanvasesRef.current = excalidrawWrapperRef.current
        ? Array.from(excalidrawWrapperRef.current.querySelectorAll('canvas'))
        : [];
      lastSceneQueryTimestampRef.current = now;
    }

    const excalidrawWrapper = excalidrawWrapperRef.current;
    const container = excalidrawContainerRef.current;
    const containerRect = container?.getBoundingClientRect();
    if (containerRect) {
      excalidrawContainerRectRef.current = containerRect;
    }

    // Draw background (image, gradient, solid, or none)
    if (currentSettings.backgroundType === 'none' || currentSettings.background === 'none') {
      // No wallpaper - just clear to white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (currentSettings.backgroundType === 'image' && backgroundImageRef.current && backgroundImageLoadedRef.current) {
      // Draw background image, cover the canvas
      const img = backgroundImageRef.current;
      const imgAspect = img.width / img.height;
      const canvasAspect = canvas.width / canvas.height;

      let drawWidth, drawHeight, drawX, drawY;
      if (imgAspect > canvasAspect) {
        // Image is wider - fit to height
        drawHeight = canvas.height;
        drawWidth = drawHeight * imgAspect;
        drawX = (canvas.width - drawWidth) / 2;
        drawY = 0;
      } else {
        // Image is taller - fit to width
        drawWidth = canvas.width;
        drawHeight = drawWidth / imgAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    } else {
      // Draw gradient or solid color
      const bgFill = parseGradient(ctx, currentSettings.background, canvas.width, canvas.height);
      ctx.fillStyle = bgFill;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const cornerRadius = currentSettings.cornerRadius;
    const contentX = padding;
    const contentY = padding;
    const contentW = canvas.width - padding * 2;
    const contentH = canvas.height - padding * 2;

    // Helper function to draw rounded rectangle path
    const roundedRectPath = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // Draw drop shadow for content area (only if there's padding)
    if (padding > 0) {
      const shadowBlur = isRecordingRef.current ? 14 : 80;
      const shadowOffsetY = isRecordingRef.current ? 4 : 20;
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = shadowOffsetY;
      ctx.fillStyle = '#ffffff';
      roundedRectPath(contentX, contentY, contentW, contentH, cornerRadius);
      ctx.fill();
      ctx.restore();
    }

    // Draw white content area with rounded corners
    ctx.fillStyle = '#ffffff';
    roundedRectPath(contentX, contentY, contentW, contentH, cornerRadius);
    ctx.fill();

    // Clip to rounded rectangle for Excalidraw content
    ctx.save();
    roundedRectPath(contentX, contentY, contentW, contentH, cornerRadius);
    ctx.clip();

    const activeSource = activeCompositeSourceRef.current;
    const displayVideo = displayCaptureVideoRef.current;
    const canDrawDisplaySource = Boolean(
      activeSource === 'display' &&
      displayVideo &&
      displayVideo.readyState >= 2 &&
      displayVideo.videoWidth > 0 &&
      displayVideo.videoHeight > 0
    );

    // Draw selected visual source into the recording surface
    if (canDrawDisplaySource && displayVideo) {
      const srcAspect = displayVideo.videoWidth / displayVideo.videoHeight;
      const dstAspect = contentW / contentH;
      let srcX = 0;
      let srcY = 0;
      let srcW = displayVideo.videoWidth;
      let srcH = displayVideo.videoHeight;

      if (srcAspect > dstAspect) {
        srcW = displayVideo.videoHeight * dstAspect;
        srcX = (displayVideo.videoWidth - srcW) / 2;
      } else if (srcAspect < dstAspect) {
        srcH = displayVideo.videoWidth / dstAspect;
        srcY = (displayVideo.videoHeight - srcH) / 2;
      }

      ctx.drawImage(displayVideo, srcX, srcY, srcW, srcH, contentX, contentY, contentW, contentH);
    } else if (excalidrawWrapper && frame && containerRect) {
      const canvases = excalidrawCanvasesRef.current;

      canvases.forEach((srcCanvas) => {
        if (srcCanvas.width > 0 && srcCanvas.height > 0) {
          // Scale factors between source canvas and container
          const scaleX = srcCanvas.width / containerRect.width;
          const scaleY = srcCanvas.height / containerRect.height;

          // Source rectangle in canvas coordinates
          const srcX = frame.x * scaleX;
          const srcY = frame.y * scaleY;
          const srcW = frame.width * scaleX;
          const srcH = frame.height * scaleY;

          // Destination is the recording canvas (minus padding)
          ctx.drawImage(srcCanvas, srcX, srcY, srcW, srcH, contentX, contentY, contentW, contentH);
        }
      });
    }

    // Excalidraw text editing happens in a DOM textarea overlay, not in canvas.
    // Draw it manually so typing-in-progress is captured in recordings.
    if (!canDrawDisplaySource && frame && containerRect) {
      const activeTextEditor = document.querySelector('.excalidraw textarea.excalidraw-wysiwyg') as HTMLTextAreaElement | null;

      if (activeTextEditor && activeTextEditor.value) {
        const editorRect = activeTextEditor.getBoundingClientRect();
        if (editorRect.width > 0 && editorRect.height > 0) {
          const scaleX = contentW / frame.width;
          const scaleY = contentH / frame.height;
          const textScale = Math.min(scaleX, scaleY);

          const editorX = contentX + (editorRect.left - containerRect.left - frame.x) * scaleX;
          const editorY = contentY + (editorRect.top - containerRect.top - frame.y) * scaleY;
          const editorW = editorRect.width * scaleX;
          const editorH = editorRect.height * scaleY;

          const styles = window.getComputedStyle(activeTextEditor);
          const fontSize = (parseFloat(styles.fontSize) || 20) * textScale;
          const rawLineHeight = parseFloat(styles.lineHeight);
          const lineHeight = (Number.isFinite(rawLineHeight) ? rawLineHeight : parseFloat(styles.fontSize) * 1.35) * textScale;
          const padLeft = (parseFloat(styles.paddingLeft) || 0) * scaleX;
          const padRight = (parseFloat(styles.paddingRight) || 0) * scaleX;
          const padTop = (parseFloat(styles.paddingTop) || 0) * scaleY;
          const maxLineWidth = Math.max(8, editorW - padLeft - padRight);
          const textColor = styles.color || '#1c1917';
          const fontStyle = styles.fontStyle || 'normal';
          const fontWeight = styles.fontWeight || '400';
          const fontFamily = styles.fontFamily || 'sans-serif';

          ctx.save();
          ctx.fillStyle = textColor;
          ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
          ctx.textBaseline = 'top';

          const paragraphs = activeTextEditor.value.replace(/\r\n/g, '\n').split('\n');
          let drawY = editorY + padTop;
          const maxY = editorY + editorH;
          const drawX = editorX + padLeft;

          for (const paragraph of paragraphs) {
            if (drawY > maxY) break;

            if (!paragraph) {
              drawY += lineHeight;
              continue;
            }

            let line = '';
            for (const char of paragraph) {
              const testLine = line + char;
              if (line && ctx.measureText(testLine).width > maxLineWidth) {
                ctx.fillText(line, drawX, drawY);
                drawY += lineHeight;
                line = char;
              } else {
                line = testLine;
              }

              if (drawY > maxY) break;
            }

            if (line && drawY <= maxY) {
              ctx.fillText(line, drawX, drawY);
              drawY += lineHeight;
            }
          }

          ctx.restore();
        }
      }
    }

    ctx.restore(); // Remove clipping

    // Draw webcam bubble (only if camera is enabled)
    const videoEl = webcamVideoRef.current;
    const pos = bubblePositionRef.current;
    const size = currentSettings.webcamSize;

    if (currentSettings.showCamera && videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0 && frame) {
      // Convert bubble position from screen to recording canvas coordinates
      const scaleX = (canvas.width - padding * 2) / frame.width;
      const scaleY = (canvas.height - padding * 2) / frame.height;

      // Bubble position relative to the recording frame
      const relX = pos.x - frame.x;
      const relY = pos.y - frame.y;

      const x = padding + relX * scaleX;
      const y = padding + relY * scaleY;
      const scaledSize = size * Math.min(scaleX, scaleY);

      // Crop webcam for aspect ratio
      const videoWidth = videoEl.videoWidth;
      const videoHeight = videoEl.videoHeight;
      const videoAspect = videoWidth / videoHeight;

      let srcX = 0, srcY = 0, srcW = videoWidth, srcH = videoHeight;
      if (videoAspect > 1) {
        srcW = videoHeight;
        srcX = (videoWidth - srcW) / 2;
      } else {
        srcH = videoWidth;
        srcY = (videoHeight - srcH) / 2;
      }

      // Draw circular webcam
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + scaledSize/2, y + scaledSize/2, scaledSize/2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      if (currentSettings.cameraMirror) {
        ctx.translate(x + scaledSize, y);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, srcX, srcY, srcW, srcH, 0, 0, scaledSize, scaledSize);
      } else {
        ctx.drawImage(videoEl, srcX, srcY, srcW, srcH, x, y, scaledSize, scaledSize);
      }
      ctx.restore();

    }

    // Draw cursor effect if enabled - minimalist transparent circle
    if (currentSettings.showCursor && frame) {
      const mousePos = mousePositionRef.current;
      const velocity = pointerVelocityRef.current;
      const leadMs = 18;
      const predictedMouseX = mousePos.x + velocity.vx * leadMs;
      const predictedMouseY = mousePos.y + velocity.vy * leadMs;
      const localMouseX = predictedMouseX - (containerRect?.left ?? 0);
      const localMouseY = predictedMouseY - (containerRect?.top ?? 0);

      // Check if mouse is within the recording frame
      if (localMouseX >= frame.x && localMouseX <= frame.x + frame.width &&
          localMouseY >= frame.y && localMouseY <= frame.y + frame.height) {

        // Convert mouse position to canvas coordinates
        const scaleX = contentW / frame.width;
        const scaleY = contentH / frame.height;
        const cursorX = contentX + (localMouseX - frame.x) * scaleX;
        const cursorY = contentY + (localMouseY - frame.y) * scaleY;

        // Simple transparent filled circle
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, 18, 0, Math.PI * 2);
        ctx.fillStyle = currentSettings.cursorColor + '80'; // 50% opacity
        ctx.fill();
      }
    }

    // Draw title overlay if enabled
    if (currentSettings.showTitle && currentSettings.titleText) {
      const titlePadding = 20;
      const titleMargin = 36;
      const isLeft = currentSettings.titlePosition === 'bottom-left';

      // Measure text to size the banner
      ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const textWidth = ctx.measureText(currentSettings.titleText).width;
      const bannerWidth = textWidth + titlePadding * 2;
      const bannerHeight = 48;

      // Position
      const bannerX = isLeft ? titleMargin : canvas.width - bannerWidth - titleMargin;
      const bannerY = canvas.height - bannerHeight - titleMargin;

      // Draw banner background - warm cream style
      ctx.save();

      // Subtle shadow
      ctx.shadowColor = 'rgba(28, 25, 23, 0.15)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;

      // Warm semi-transparent background
      ctx.fillStyle = 'rgba(254, 252, 249, 0.92)';
      ctx.beginPath();
      ctx.roundRect(bannerX, bannerY, bannerWidth, bannerHeight, 10);
      ctx.fill();

      // Subtle border
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text
      ctx.fillStyle = '#1c1917';
      ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(currentSettings.titleText, bannerX + titlePadding, bannerY + bannerHeight / 2);

      ctx.restore();
    }

    // Add frame to WebCodecs recorder if recording
    if (isRecordingRef.current && webCodecsRecorderRef.current && canvas) {
      try {
        webCodecsRecorderRef.current.addFrame(canvas);
      } catch (error) {
        console.error('[Recording] Failed to encode frame:', error);
      }
    }

    if (isRecordingRef.current) {
      animationFrameRef.current = requestAnimationFrame(renderCompositeFrame);
    }
  }, []);

  // Helper function to snap bubble into a frame
  const snapBubbleToFrame = useCallback((frame: {x: number, y: number, width: number, height: number}) => {
    const size = settingsRef.current.webcamSize;
    const currentPos = bubblePositionRef.current;
    const constrainedX = Math.max(frame.x, Math.min(currentPos.x, frame.x + frame.width - size));
    const constrainedY = Math.max(frame.y, Math.min(currentPos.y, frame.y + frame.height - size));
    setBubblePosition({ x: constrainedX, y: constrainedY });
  }, []);

  const setCompositeSource = useCallback((source: CompositeVisualSource) => {
    activeCompositeSourceRef.current = source;
    setActiveCompositeSource(source);
  }, []);

  const switchCompositeToExcalidraw = useCallback((trigger: 'control_button' | 'auto_fallback') => {
    const from = activeCompositeSourceRef.current;
    if (from === 'excalidraw') {
      return;
    }

    setCompositeSource('excalidraw');
    cleanupCompositeDisplayCapture(true);
    sourceSwitchCountRef.current += 1;
    trackRecordingSourceSwitched({
      from,
      to: 'excalidraw',
      trigger,
      success: true,
    });
  }, [cleanupCompositeDisplayCapture, setCompositeSource]);

  const attachCompositeDisplaySource = useCallback(async (trigger: 'control_button' | 'auto_fallback') => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert('Screen sharing is not supported in this browser.');
      trackRecordingSourceSwitched({
        from: activeCompositeSourceRef.current,
        to: 'display',
        trigger,
        success: false,
      });
      return false;
    }

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: settingsRef.current.recordSystemAudio,
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        alert('Failed to start screen sharing. Please try again.');
      }
      trackRecordingSourceSwitched({
        from: activeCompositeSourceRef.current,
        to: 'display',
        trigger,
        success: false,
      });
      return false;
    }

    const displayVideoTrack = displayStream.getVideoTracks().find((track) => track.readyState === 'live');
    if (!displayVideoTrack) {
      displayStream.getTracks().forEach((track) => track.stop());
      alert('No shared video track detected. Please choose a screen, window, or tab.');
      trackRecordingSourceSwitched({
        from: activeCompositeSourceRef.current,
        to: 'display',
        trigger,
        success: false,
      });
      return false;
    }

    cleanupCompositeDisplayCapture(true);
    displayCaptureStreamRef.current = displayStream;

    let displayVideo = displayCaptureVideoRef.current;
    if (!displayVideo) {
      displayVideo = document.createElement('video');
      displayVideo.muted = true;
      displayVideo.playsInline = true;
      displayVideo.autoplay = true;
      displayCaptureVideoRef.current = displayVideo;
    }

    displayVideo.srcObject = displayStream;
    try {
      await displayVideo.play();
    } catch {
      // Playback may require user interaction in some browsers; rendering checks readyState.
    }

    const systemAudioTrack = settingsRef.current.recordSystemAudio
      ? displayStream.getAudioTracks().find((track) => track.readyState === 'live') ?? null
      : null;
    if (settingsRef.current.recordSystemAudio && systemAudioTrack) {
      const attached = attachCompositeSystemAudio(systemAudioTrack);
      if (!attached && settingsRef.current.recordAudio) {
        alert('Could not mix system audio. Recording microphone audio only.');
      }
    } else {
      detachCompositeSystemAudio();
      if (settingsRef.current.recordSystemAudio) {
        alert('No system audio track was provided by this share target.');
      }
    }

    displayVideoTrack.onended = () => {
      if (!isRecordingRef.current || activeRecordingSourceRef.current !== 'composite') {
        cleanupCompositeDisplayCapture(true);
        return;
      }
      switchCompositeToExcalidraw('auto_fallback');
      alert('Screen sharing stopped. Switched back to Excalidraw recording.');
    };

    const from = activeCompositeSourceRef.current;
    setCompositeSource('display');
    usedDisplaySourceRef.current = true;
    if (from !== 'display') {
      sourceSwitchCountRef.current += 1;
    }

    trackRecordingSourceSwitched({
      from,
      to: 'display',
      trigger,
      success: true,
    });

    return true;
  }, [attachCompositeSystemAudio, cleanupCompositeDisplayCapture, detachCompositeSystemAudio, setCompositeSource, switchCompositeToExcalidraw]);

  const startDesktopCaptureRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert('Desktop capture is not supported in this browser.');
      return;
    }

    await cleanupDesktopCapture();

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: settings.recordSystemAudio
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        console.error('[DesktopCapture] Failed to start display capture:', error);
        alert('Failed to start desktop capture. Please try again.');
      }
      return;
    }

    displayStreamRef.current = displayStream;

    const displayVideoTrack = displayStream.getVideoTracks().find((track) => track.readyState === 'live');
    if (!displayVideoTrack) {
      await cleanupDesktopCapture();
      alert('No video track was captured. Please choose a screen, window, or tab.');
      return;
    }

    let micAudioTrack: MediaStreamTrack | null = null;
    if (settings.recordAudio) {
      micAudioTrack = webcamStream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;

      if (!micAudioTrack) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          desktopMicStreamRef.current = micStream;
          micAudioTrack = micStream.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
        } catch (error) {
          console.warn('[DesktopCapture] Microphone unavailable:', error);
        }
      }
    }

    const systemAudioTrack = settings.recordSystemAudio
      ? displayStream.getAudioTracks().find((track) => track.readyState === 'live') ?? null
      : null;

    const recordingStream = new MediaStream([displayVideoTrack]);
    let recorderAudioTrack: MediaStreamTrack | null = null;

    if (settings.recordAudio && settings.recordSystemAudio && micAudioTrack && systemAudioTrack) {
      recorderAudioTrack = await mixDesktopAudioTracks(systemAudioTrack, micAudioTrack);
      if (!recorderAudioTrack) {
        recorderAudioTrack = micAudioTrack.clone();
        alert('Could not mix system audio and microphone. Recording microphone only.');
      }
    }

    if (!recorderAudioTrack) {
      if (settings.recordAudio && micAudioTrack) {
        recorderAudioTrack = micAudioTrack.clone();
      } else if (settings.recordSystemAudio && systemAudioTrack) {
        recorderAudioTrack = systemAudioTrack.clone();
      }
    }

    if (recorderAudioTrack) {
      recordingStream.addTrack(recorderAudioTrack);
    } else if (settings.recordAudio || settings.recordSystemAudio) {
      alert('No audio track is available for this capture. Recording will continue without audio.');
    }

    const trackSettings = displayVideoTrack.getSettings();
    const width = trackSettings.width ?? 1920;
    const height = trackSettings.height ?? 1080;
    const targetVideoBitrate = Math.min(24_000_000, Math.max(10_000_000, Math.round((width * height * 30) / 5)));

    const mediaRecorderStarted = startMediaRecorderFromStream(recordingStream, targetVideoBitrate);
    if (!mediaRecorderStarted) {
      await cleanupDesktopCapture();
      alert('Failed to start recording. Please try again.');
      return;
    }

    displayVideoTrack.onended = () => {
      if (isRecordingRef.current) {
        void stopRecordingRef.current?.();
      }
    };

    activeRecordingSourceRef.current = 'desktop';
    recordingStartTimeRef.current = Date.now();
    usedTeleprompterRef.current = showTeleprompter;
    usedPauseRef.current = false;
    setIsPreviewing(false);
    setRecordingFrame(null);
    setIsPaused(false);
    setIsRecording(true);

    trackRecordingStarted({
      aspectRatio: settings.aspectRatio,
      background: 'desktop_capture',
      webcamEnabled: false,
      webcamPosition: 'none',
      recordingSource: 'desktop',
    });
  }, [cleanupDesktopCapture, mixDesktopAudioTracks, settings, showTeleprompter, startMediaRecorderFromStream, webcamStream]);

  // Enter preview mode - show frame for positioning before recording
  const enterPreviewMode = useCallback(() => {
    const frame = calculateRecordingFrame();
    if (!frame) return;
    setRecordingFrame(frame);
    recordingFrameRef.current = frame;

    // Snap webcam bubble into the recording frame
    snapBubbleToFrame(frame);

    setIsPreviewing(true);
  }, [calculateRecordingFrame, snapBubbleToFrame]);

  const startRecording = useCallback(() => {
    if (settings.recordingSource === 'desktop') {
      void startDesktopCaptureRecording();
      return;
    }
    enterPreviewMode();
  }, [enterPreviewMode, settings.recordingSource, startDesktopCaptureRecording]);

  // Cancel preview mode
  const cancelPreview = useCallback(() => {
    trackRecordingCancelled('preview');
    setIsPreviewing(false);
    setRecordingFrame(null);
  }, []);

  // Actually start recording (after preview/positioning)
  const confirmRecording = useCallback(async () => {
    const { width, height } = getRecordingDimensions();
    const targetVideoBitrate = Math.min(24_000_000, Math.max(10_000_000, Math.round((width * height * 30) / 5)));

    setIsPreviewing(false);
    activeRecordingSourceRef.current = 'composite';
    setCompositeSource('excalidraw');
    sourceSwitchCountRef.current = 0;
    usedDisplaySourceRef.current = false;
    cleanupCompositeDisplayCapture(true);

    let canvas = compositeCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      compositeCanvasRef.current = canvas;
    }
    canvas.width = width;
    canvas.height = height;

    let compositeAudioStream = await createCompositeAudioPipeline(
      settings.recordAudio,
      settings.recordSystemAudio
    );
    if (!compositeAudioStream && settings.recordAudio) {
      const micTrack = webcamStream?.getAudioTracks().find((track) => track.readyState === 'live');
      if (micTrack) {
        compositeAudioStream = new MediaStream([micTrack.clone()]);
      }
    }

    // Check if WebCodecs is supported (Chrome, Edge, Safari 16.4+)
    const useWebCodecs = isWebCodecsSupported();
    console.log('[Recording] WebCodecs supported:', useWebCodecs);
    let webCodecsStarted = false;

    if (useWebCodecs) {
      // Use WebCodecs for direct MP4 recording (fast, no conversion needed)
      const recorder = new WebCodecsRecorder({
        width,
        height,
        frameRate: 30,
        videoBitrate: targetVideoBitrate,
        audioStream: compositeAudioStream || undefined,
      });

      webCodecsRecorderRef.current = recorder;

      try {
        await recorder.start();
        webCodecsStarted = true;
        console.log('[Recording] WebCodecs recorder started');
      } catch (error) {
        console.error('[Recording] WebCodecs failed to start:', error);
        webCodecsRecorderRef.current = null;
      }
    }

    // Always start MediaRecorder as compatibility fallback
    const mediaRecorderStarted = startMediaRecorder(canvas, compositeAudioStream, targetVideoBitrate);

    if (!webCodecsStarted && !mediaRecorderStarted) {
      alert('Failed to start recording. Please check browser permissions and try again.');
      return;
    }

    if (!webCodecsStarted) {
      console.log('[Recording] Using MediaRecorder fallback (WebM)');
      alert('Your browser is using fallback recording. Video will be saved as WebM.');
    }

    lastRenderTimestampRef.current = 0;

    // Start rendering loop
    setIsRecording(true);

    // Track recording started
    recordingStartTimeRef.current = Date.now();
    usedTeleprompterRef.current = showTeleprompter;
    usedPauseRef.current = false;
    trackRecordingStarted({
      aspectRatio: settings.aspectRatio,
      background: settings.backgroundId || 'custom',
      webcamEnabled: settings.showCamera,
      webcamPosition: 'bottom-right',
      recordingSource: 'composite',
      compositeInitialSource: 'excalidraw',
    });

    // Render a few frames before starting
    const preRenderFrames = () => {
      renderCompositeFrame();
      renderCompositeFrame();
      renderCompositeFrame();
    };

    setTimeout(() => {
      preRenderFrames();
      animationFrameRef.current = requestAnimationFrame(renderCompositeFrame);
    }, 100);
  }, [cleanupCompositeDisplayCapture, createCompositeAudioPipeline, getRecordingDimensions, renderCompositeFrame, setCompositeSource, settings, showTeleprompter, startMediaRecorder, webcamStream]);

  // Handle dragging the recording frame during preview
  const handleFrameDrag = useCallback((e: React.MouseEvent) => {
    if (!isPreviewing || !recordingFrame) return;
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startFrame = { ...recordingFrame };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const container = document.querySelector('.excalidraw-container');
      if (!container) return;
      const containerRect = container.getBoundingClientRect();

      // Constrain to container bounds
      let newX = Math.max(0, Math.min(startFrame.x + deltaX, containerRect.width - startFrame.width));
      let newY = Math.max(0, Math.min(startFrame.y + deltaY, containerRect.height - startFrame.height));

      const newFrame = { ...startFrame, x: newX, y: newY };
      setRecordingFrame(newFrame);
      recordingFrameRef.current = newFrame;

      // Snap webcam bubble to stay within frame
      snapBubbleToFrame(newFrame);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [isPreviewing, recordingFrame, snapBubbleToFrame]);

  // Handle resizing the recording frame (maintains aspect ratio)
  const handleFrameResize = useCallback((e: React.MouseEvent, corner: string) => {
    if (!isPreviewing || !recordingFrame) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startFrame = { ...recordingFrame };
    const aspectRatio = startFrame.width / startFrame.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Note: We only use deltaX and maintain aspect ratio

      const container = document.querySelector('.excalidraw-container');
      if (!container) return;
      const containerRect = container.getBoundingClientRect();

      let newWidth = startFrame.width;
      let newHeight = startFrame.height;
      let newX = startFrame.x;
      let newY = startFrame.y;

      // Calculate new size based on which corner is being dragged
      if (corner === 'se') {
        // Southeast - expand from bottom-right
        newWidth = Math.max(200, startFrame.width + deltaX);
        newHeight = newWidth / aspectRatio;
      } else if (corner === 'sw') {
        // Southwest - expand from bottom-left
        newWidth = Math.max(200, startFrame.width - deltaX);
        newHeight = newWidth / aspectRatio;
        newX = startFrame.x + startFrame.width - newWidth;
      } else if (corner === 'ne') {
        // Northeast - expand from top-right
        newWidth = Math.max(200, startFrame.width + deltaX);
        newHeight = newWidth / aspectRatio;
        newY = startFrame.y + startFrame.height - newHeight;
      } else if (corner === 'nw') {
        // Northwest - expand from top-left
        newWidth = Math.max(200, startFrame.width - deltaX);
        newHeight = newWidth / aspectRatio;
        newX = startFrame.x + startFrame.width - newWidth;
        newY = startFrame.y + startFrame.height - newHeight;
      }

      // Constrain to container bounds
      if (newX < 0) {
        newX = 0;
        newWidth = startFrame.x + startFrame.width;
        newHeight = newWidth / aspectRatio;
      }
      if (newY < 0) {
        newY = 0;
        newHeight = startFrame.y + startFrame.height;
        newWidth = newHeight * aspectRatio;
      }
      if (newX + newWidth > containerRect.width) {
        newWidth = containerRect.width - newX;
        newHeight = newWidth / aspectRatio;
      }
      if (newY + newHeight > containerRect.height) {
        newHeight = containerRect.height - newY;
        newWidth = newHeight * aspectRatio;
      }

      const newFrame = { x: newX, y: newY, width: newWidth, height: newHeight };
      setRecordingFrame(newFrame);
      recordingFrameRef.current = newFrame;

      // Snap webcam bubble to stay within frame
      snapBubbleToFrame(newFrame);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [isPreviewing, recordingFrame, snapBubbleToFrame]);

  // Pause/Resume recording
  const togglePause = useCallback(() => {
    const webCodecsRecorder = webCodecsRecorderRef.current;
    const mediaRecorder = mediaRecorderRef.current;

    if (isPaused) {
      webCodecsRecorder?.resume();
      if (mediaRecorder?.state === 'paused') {
        mediaRecorder.resume();
      }
      setIsPaused(false);
    } else {
      // Pause recording - track that pause was used
      usedPauseRef.current = true;
      webCodecsRecorder?.pause();
      if (mediaRecorder?.state === 'recording') {
        mediaRecorder.pause();
      }
      setIsPaused(true);
    }
  }, [isPaused]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) {
      return;
    }
    isRecordingRef.current = false;

    const recordingSource = activeRecordingSourceRef.current;

    // Track recording completed with duration
    if (recordingStartTimeRef.current) {
      const durationSeconds = Math.round((Date.now() - recordingStartTimeRef.current) / 1000);
      trackRecordingCompleted({
        durationSeconds,
        aspectRatio: settingsRef.current.aspectRatio,
        background: recordingSource === 'desktop' ? 'desktop_capture' : settingsRef.current.backgroundId || 'custom',
        webcamEnabled: recordingSource === 'composite' ? settingsRef.current.showCamera : false,
        usedTeleprompter: usedTeleprompterRef.current,
        usedPause: usedPauseRef.current,
        recordingSource,
        usedDisplaySource: recordingSource === 'composite' ? usedDisplaySourceRef.current : undefined,
        sourceSwitchCount: recordingSource === 'composite' ? sourceSwitchCountRef.current : undefined,
      });
      recordingStartTimeRef.current = null;
    }

    setIsRecording(false);
    setIsPaused(false);
    setRecordingFrame(null);
    lastRenderTimestampRef.current = 0;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setIsConverting(true);
    setConvertingMessage('Finalizing video...');

    if (recordingSource === 'desktop') {
      const desktopBlob = await stopMediaRecorder();
      await cleanupDesktopCapture();
      cleanupCompositeDisplayCapture(true);
      await cleanupCompositeAudioPipeline();
      setCompositeSource('excalidraw');

      if (desktopBlob) {
        downloadBlob(desktopBlob, 'webm');
        console.log('[Recording] Desktop WebM saved, size:', (desktopBlob.size / 1024 / 1024).toFixed(2), 'MB');
      } else {
        alert('Failed to save recording. Please try again.');
      }

      setIsConverting(false);
      setConvertingMessage('');
      return;
    }

    const recorder = webCodecsRecorderRef.current;
    let mp4Blob: Blob | null = null;
    let mp4Error: unknown = null;
    let webCodecsHasAudio = false;

    if (recorder && recorder.recording) {
      try {
        webCodecsHasAudio = recorder.audioEnabled;
        mp4Blob = await recorder.stop();
      } catch (error) {
        mp4Error = error;
        console.error('[Recording] Failed to finalize MP4 with WebCodecs:', error);
      } finally {
        webCodecsRecorderRef.current = null;
      }
    }

    const fallbackBlob = await stopMediaRecorder();
    const prefersAudioFallback = settingsRef.current.recordAudio && !webCodecsHasAudio;

    if (mp4Blob && !(prefersAudioFallback && fallbackBlob)) {
      downloadBlob(mp4Blob, 'mp4');
      console.log('[Recording] MP4 saved, size:', (mp4Blob.size / 1024 / 1024).toFixed(2), 'MB');
    } else if (fallbackBlob) {
      downloadBlob(fallbackBlob, 'webm');
      if (mp4Error) {
        alert('MP4 finalize failed, saved a WebM fallback instead.');
      } else if (prefersAudioFallback) {
        alert('Saved WebM to preserve microphone audio on this browser.');
      }
      console.log('[Recording] WebM fallback saved, size:', (fallbackBlob.size / 1024 / 1024).toFixed(2), 'MB');
    } else {
      alert('Failed to save recording. Please try again.');
    }

    setIsConverting(false);
    setConvertingMessage('');
    cleanupCompositeDisplayCapture(true);
    await cleanupCompositeAudioPipeline();
    setCompositeSource('excalidraw');
  }, [cleanupCompositeAudioPipeline, cleanupCompositeDisplayCapture, cleanupDesktopCapture, downloadBlob, setCompositeSource, stopMediaRecorder]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const handleBubbleDrag = useCallback((pos: { x: number; y: number }) => {
    const frame = recordingFrameRef.current;
    const size = settingsRef.current.webcamSize;

    // If we have a recording frame (preview or recording), constrain bubble to it
    if (frame) {
      const constrainedX = Math.max(frame.x, Math.min(pos.x, frame.x + frame.width - size));
      const constrainedY = Math.max(frame.y, Math.min(pos.y, frame.y + frame.height - size));
      setBubblePosition({ x: constrainedX, y: constrainedY });
    } else {
      setBubblePosition(pos);
    }
  }, []);

  // Teleprompter drag handler
  const handleTeleprompterDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...teleprompterPosition };

    setIsTeleprompterDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const teleprompterRect = teleprompterRef.current?.getBoundingClientRect();
      const width = teleprompterRect?.width || 340;
      const height = teleprompterRect?.height || 320;

      setTeleprompterPosition({
        x: Math.max(10, Math.min(window.innerWidth - width - 10, startPos.x + deltaX)),
        y: Math.max(10, Math.min(window.innerHeight - height - 10, startPos.y + deltaY))
      });
    };

    const handleMouseUp = () => {
      setIsTeleprompterDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [teleprompterPosition]);

  return (
    <div className="app-container">
      <WelcomeModal />
      <RecordingControls
        isRecording={isRecording}
        isPreviewing={isPreviewing}
        isPaused={isPaused}
        isConverting={isConverting}
        convertingMessage={convertingMessage}
        showCursor={settings.showCursor}
        showSourceSwitch={isRecording && settings.recordingSource === 'composite'}
        activeCompositeSource={activeCompositeSource}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onTogglePause={togglePause}
        onToggleCursor={() => setSettings(prev => ({ ...prev, showCursor: !prev.showCursor }))}
        onSwitchToExcalidraw={() => switchCompositeToExcalidraw('control_button')}
        onSwitchToDisplay={() => {
          void attachCompositeDisplaySource('control_button');
        }}
        onConfirmRecording={confirmRecording}
        onCancelPreview={cancelPreview}
        onOpenSettings={() => setShowSettings(true)}
        onToggleTeleprompter={() => {
          const newState = !showTeleprompter;
          setShowTeleprompter(newState);
          trackTeleprompterUsed(newState ? 'opened' : 'closed');
          if (newState && isRecording) {
            usedTeleprompterRef.current = true;
          }
        }}
        showTeleprompter={showTeleprompter}
      />

      <SettingsPanel
        isOpen={showSettings}
        settings={settings}
        onSettingsChange={(newSettings) => {
          let finalSettings = newSettings;

          if (newSettings.aspectRatio !== settings.aspectRatio) {
            const adaptiveDefaults = getAdaptiveVisualDefaults(newSettings);
            finalSettings = {
              ...newSettings,
              ...adaptiveDefaults,
            };
          }

          // Track significant setting changes
          if (newSettings.aspectRatio !== settings.aspectRatio) {
            trackSettingsChanged('aspect_ratio', newSettings.aspectRatio);
          }
          if (newSettings.backgroundId !== settings.backgroundId) {
            trackSettingsChanged('background', newSettings.backgroundId || 'custom');
          }
          if (newSettings.showCamera !== settings.showCamera) {
            trackSettingsChanged('webcam', newSettings.showCamera ? 'enabled' : 'disabled');
          }
          if (newSettings.recordAudio !== settings.recordAudio) {
            trackSettingsChanged('audio', newSettings.recordAudio ? 'enabled' : 'disabled');
          }
          if (newSettings.recordingSource !== settings.recordingSource) {
            trackSettingsChanged('recording_source', newSettings.recordingSource);
          }
          if (newSettings.recordSystemAudio !== settings.recordSystemAudio) {
            trackSettingsChanged('system_audio', newSettings.recordSystemAudio ? 'enabled' : 'disabled');
          }
          if (newSettings.cameraMirror !== settings.cameraMirror) {
            trackSettingsChanged('camera_mirror', newSettings.cameraMirror ? 'enabled' : 'disabled');
          }
          setSettings(finalSettings);
        }}
        onClose={() => setShowSettings(false)}
      />

      <div className="excalidraw-container">
        <Excalidraw
          excalidrawAPI={(api) => { excalidrawApiRef.current = api; }}
          theme="light"
        />

        {/* Recording frame overlay - shows the area being recorded */}
        {recordingFrame && (isRecording || isPreviewing) && (
          <>
            {/* Darkened areas outside the recording frame */}
            <div className="recording-overlay recording-overlay-top" style={{
              height: recordingFrame.y,
            }} />
            <div className="recording-overlay recording-overlay-bottom" style={{
              top: recordingFrame.y + recordingFrame.height,
              height: `calc(100% - ${recordingFrame.y + recordingFrame.height}px)`,
            }} />
            <div className="recording-overlay recording-overlay-left" style={{
              top: recordingFrame.y,
              width: recordingFrame.x,
              height: recordingFrame.height,
            }} />
            <div className="recording-overlay recording-overlay-right" style={{
              top: recordingFrame.y,
              left: recordingFrame.x + recordingFrame.width,
              width: `calc(100% - ${recordingFrame.x + recordingFrame.width}px)`,
              height: recordingFrame.height,
            }} />
            {/* Recording frame border */}
            <div
              className={`recording-frame-border ${isPreviewing ? 'preview-mode' : ''}`}
              style={{
                left: recordingFrame.x,
                top: recordingFrame.y,
                width: recordingFrame.width,
                height: recordingFrame.height,
                cursor: isPreviewing ? 'move' : 'default',
              }}
              onMouseDown={isPreviewing ? handleFrameDrag : undefined}
            >
              {isRecording && <span className="recording-badge">● REC</span>}
              {isPreviewing && (
                <>
                  <div className="preview-instructions">
                    <span className="preview-hint">Drag to move · Corners to resize</span>
                  </div>
                  {/* Resize handles */}
                  <div
                    className="resize-handle resize-handle-corner resize-handle-nw"
                    onMouseDown={(e) => handleFrameResize(e, 'nw')}
                  />
                  <div
                    className="resize-handle resize-handle-corner resize-handle-ne"
                    onMouseDown={(e) => handleFrameResize(e, 'ne')}
                  />
                  <div
                    className="resize-handle resize-handle-corner resize-handle-sw"
                    onMouseDown={(e) => handleFrameResize(e, 'sw')}
                  />
                  <div
                    className="resize-handle resize-handle-corner resize-handle-se"
                    onMouseDown={(e) => handleFrameResize(e, 'se')}
                  />
                </>
              )}
            </div>
          </>
        )}

        {/* Teleprompter */}
        {showTeleprompter && (
          <div
            ref={teleprompterRef}
            className={`teleprompter ${isTeleprompterDragging ? 'dragging' : ''}`}
            style={{
              left: teleprompterPosition.x,
              top: teleprompterPosition.y,
              cursor: 'default',
            }}
          >
            <div
              className="teleprompter-header"
              style={{ cursor: isTeleprompterDragging ? 'grabbing' : 'grab' }}
              onMouseDown={handleTeleprompterDrag}
            >
              <span>📜 Teleprompter</span>
              <button
                className="teleprompter-close"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setShowTeleprompter(false)}
              >
                ×
              </button>
            </div>
            <textarea
              className="teleprompter-text"
              value={teleprompterText}
              onChange={(e) => setTeleprompterText(e.target.value)}
              placeholder="Paste your script here...&#10;&#10;This text is only visible to you and will NOT appear in the recording."
            />
          </div>
        )}

        {webcamStream && settings.showCamera && (
          <WebcamBubble
            stream={webcamStream}
            position={bubblePosition}
            size={settings.webcamSize}
            mirrored={settings.cameraMirror}
            onDrag={handleBubbleDrag}
            videoRef={webcamVideoRef}
          />
        )}

        {/* Live cursor indicator (updated via refs to avoid re-render on every mouse move) */}
        <div ref={cursorIndicatorRef} className="cursor-indicator" />
      </div>
    </div>
  );
}

export default App;
