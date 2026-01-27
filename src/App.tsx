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
import type { RecordingSettings } from './components/SettingsPanel';
import './App.css';

// Detect if user is on a mobile device
const isMobileDevice = () => {
  // Primary check: screen width (works in DevTools device mode)
  const isSmallScreen = window.innerWidth < 768;

  // Secondary check: mobile user agent
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Show mobile landing if screen is small OR it's a mobile browser
  return isSmallScreen || mobileUA;
};

// Default settings
const DEFAULT_SETTINGS: RecordingSettings = {
  aspectRatio: '16:9',
  customWidth: 1920,
  customHeight: 1080,
  background: '#ffffff',
  backgroundId: 'none',
  backgroundType: 'solid',
  webcamSize: 180,
  padding: 60,
  cornerRadius: 16,
  showCursor: true,
  cursorColor: '#ef4444',
  showTitle: false,
  titleText: '',
  titlePosition: 'bottom-left',
  showCamera: true,
};

function App() {
  // Check for mobile device - show landing page instead of app
  const [isMobile] = useState(() => isMobileDevice());

  // If on mobile, show the landing page with email capture
  if (isMobile) {
    return <MobileLanding />;
  }

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false); // Preview mode before recording
  const [isPaused, setIsPaused] = useState(false); // Pause state during recording
  const [isConverting] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [bubblePosition, setBubblePosition] = useState({ x: 20, y: 100 });
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<RecordingSettings>(DEFAULT_SETTINGS);
  const [recordingFrame, setRecordingFrame] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [showTeleprompter, setShowTeleprompter] = useState(false);
  const [teleprompterText, setTeleprompterText] = useState('');
  const [teleprompterPosition, setTeleprompterPosition] = useState({ x: window.innerWidth - 360, y: 80 });
  const [isTeleprompterDragging, setIsTeleprompterDragging] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Refs
  const excalidrawApiRef = useRef<unknown>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Refs for animation loop
  const isRecordingRef = useRef(false);
  const bubblePositionRef = useRef({ x: 20, y: 100 });
  const settingsRef = useRef(settings);
  const recordingFrameRef = useRef<{x: number, y: number, width: number, height: number} | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const backgroundImageLoadedRef = useRef(false);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { bubblePositionRef.current = bubblePosition; }, [bubblePosition]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { recordingFrameRef.current = recordingFrame; }, [recordingFrame]);

  // Track mouse position for cursor effect during recording
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };
      // Also update state for live visual indicator (only during recording to avoid unnecessary renders)
      if (isRecordingRef.current) {
        setMousePosition({ x: e.clientX, y: e.clientY });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

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
    async function initWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true
        });
        setWebcamStream(stream);
      } catch (err) {
        console.error('Failed to access webcam:', err);
        alert('Could not access camera. Please allow permissions and refresh.');
      }
    }
    initWebcam();
    return () => { webcamStream?.getTracks().forEach(track => track.stop()); };
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
  const renderCompositeFrame = useCallback(() => {
    const canvas = compositeCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const currentSettings = settingsRef.current;
    const frame = recordingFrameRef.current;

    if (!canvas || !ctx) {
      if (isRecordingRef.current) {
        animationFrameRef.current = requestAnimationFrame(renderCompositeFrame);
      }
      return;
    }

    const padding = currentSettings.padding;

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
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 80;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 20;
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

    // Draw Excalidraw content - capture from the visible frame area
    const excalidrawWrapper = document.querySelector('.excalidraw');
    if (excalidrawWrapper && frame) {
      const canvases = excalidrawWrapper.querySelectorAll('canvas');

      canvases.forEach((srcCanvas) => {
        if (srcCanvas.width > 0 && srcCanvas.height > 0) {
          // Calculate source rectangle (what part of Excalidraw canvas to capture)
          // This maps the recording frame position to the source canvas
          const container = document.querySelector('.excalidraw-container');
          if (!container) return;

          const containerRect = container.getBoundingClientRect();

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

      ctx.translate(x + scaledSize, y);
      ctx.scale(-1, 1);
      ctx.drawImage(videoEl, srcX, srcY, srcW, srcH, 0, 0, scaledSize, scaledSize);
      ctx.restore();

    }

    // Draw cursor effect if enabled - minimalist transparent circle
    if (currentSettings.showCursor && frame) {
      const mousePos = mousePositionRef.current;

      // Check if mouse is within the recording frame
      if (mousePos.x >= frame.x && mousePos.x <= frame.x + frame.width &&
          mousePos.y >= frame.y && mousePos.y <= frame.y + frame.height) {

        // Convert mouse position to canvas coordinates
        const scaleX = contentW / frame.width;
        const scaleY = contentH / frame.height;
        const cursorX = contentX + (mousePos.x - frame.x) * scaleX;
        const cursorY = contentY + (mousePos.y - frame.y) * scaleY;

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

  // Cancel preview mode
  const cancelPreview = useCallback(() => {
    setIsPreviewing(false);
    setRecordingFrame(null);
  }, []);

  // Actually start recording (after preview/positioning)
  const confirmRecording = useCallback(async () => {
    const { width, height } = getRecordingDimensions();

    setIsPreviewing(false);

    let canvas = compositeCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      compositeCanvasRef.current = canvas;
    }
    canvas.width = width;
    canvas.height = height;

    const canvasStream = canvas.captureStream(30);
    const audioTracks = webcamStream?.getAudioTracks() || [];
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks
    ]);

    let mimeType = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
      mimeType = 'video/webm;codecs=vp9,opus';
    }

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 4000000
    });

    mediaRecorderRef.current = mediaRecorder;
    recordedChunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const isMP4 = mimeType.includes('mp4');
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const extension = isMP4 ? 'mp4' : 'webm';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `excalicord-${Date.now()}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);

      if (!isMP4) {
        setTimeout(() => {
          alert('Video saved as WebM. To convert to MP4:\n\n' +
            '• Mac: Open with QuickTime → File → Export As → 1080p\n' +
            '• Or use cloudconvert.com\n' +
            '• Or VLC can play WebM directly');
        }, 500);
      }
    };

    // Start rendering loop first to ensure we have frames ready
    setIsRecording(true);

    // Render a few frames before starting the recorder to avoid black first frame
    const preRenderFrames = () => {
      renderCompositeFrame();
      renderCompositeFrame();
      renderCompositeFrame();
    };

    setTimeout(() => {
      preRenderFrames();
      animationFrameRef.current = requestAnimationFrame(renderCompositeFrame);
      // Small delay after pre-rendering to ensure canvas has content
      setTimeout(() => {
        mediaRecorder.start(1000);
      }, 100);
    }, 100);
  }, [webcamStream, renderCompositeFrame, getRecordingDimensions]);

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
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      // Resume recording
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    } else {
      // Pause recording
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, [isPaused]);

  // Stop recording
  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    setRecordingFrame(null);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

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
    if ((e.target as HTMLElement).closest('textarea') || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...teleprompterPosition };

    setIsTeleprompterDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      setTeleprompterPosition({
        x: Math.max(10, Math.min(window.innerWidth - 350, startPos.x + deltaX)),
        y: Math.max(10, Math.min(window.innerHeight - 200, startPos.y + deltaY))
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
      <RecordingControls
        isRecording={isRecording}
        isPreviewing={isPreviewing}
        isPaused={isPaused}
        isConverting={isConverting}
        showCursor={settings.showCursor}
        onStartRecording={enterPreviewMode}
        onStopRecording={stopRecording}
        onTogglePause={togglePause}
        onToggleCursor={() => setSettings(prev => ({ ...prev, showCursor: !prev.showCursor }))}
        onConfirmRecording={confirmRecording}
        onCancelPreview={cancelPreview}
        onOpenSettings={() => setShowSettings(true)}
        onToggleTeleprompter={() => setShowTeleprompter(!showTeleprompter)}
        showTeleprompter={showTeleprompter}
      />

      <SettingsPanel
        isOpen={showSettings}
        settings={settings}
        onSettingsChange={setSettings}
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
                    <span className="preview-badge">Position Recording Area</span>
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
            className={`teleprompter ${isTeleprompterDragging ? 'dragging' : ''}`}
            style={{
              left: teleprompterPosition.x,
              top: teleprompterPosition.y,
              cursor: isTeleprompterDragging ? 'grabbing' : 'default',
            }}
            onMouseDown={handleTeleprompterDrag}
          >
            <div className="teleprompter-header" style={{ cursor: 'grab' }}>
              <span>📜 Teleprompter</span>
              <button className="teleprompter-close" onClick={() => setShowTeleprompter(false)}>×</button>
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
            onDrag={handleBubbleDrag}
            videoRef={webcamVideoRef}
          />
        )}

        {/* Live cursor indicator - shows during recording when cursor effect is on */}
        {isRecording && settings.showCursor && recordingFrame &&
         mousePosition.x >= recordingFrame.x &&
         mousePosition.x <= recordingFrame.x + recordingFrame.width &&
         mousePosition.y >= recordingFrame.y &&
         mousePosition.y <= recordingFrame.y + recordingFrame.height && (
          <div
            className="cursor-indicator"
            style={{
              left: mousePosition.x,
              top: mousePosition.y,
              backgroundColor: settings.cursorColor + '80',
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;
