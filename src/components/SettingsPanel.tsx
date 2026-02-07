/**
 * SettingsPanel - Customize recording appearance
 */

import { useState } from 'react';
import './SettingsPanel.css';

// Background categories
const BACKGROUND_CATEGORIES = ['All', 'Vibrant', 'Pastel', 'Dark', 'Minimal'] as const;

// Background presets - using Unsplash gradient images
const GRADIENT_PRESETS = [
  // === NO WALLPAPER ===
  {
    id: 'no-wallpaper',
    name: 'No Wallpaper',
    value: 'none',
    preview: 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 12px 12px',
    type: 'none',
    category: 'Minimal'
  },
  {
    id: 'white',
    name: 'Clean White',
    value: '#ffffff',
    preview: '#ffffff',
    type: 'solid',
    category: 'Minimal'
  },
  {
    id: 'dark',
    name: 'Dark',
    value: '#1a1a1a',
    preview: '#1a1a1a',
    type: 'solid',
    category: 'Minimal'
  },

  // === VIBRANT (Unsplash images) ===
  {
    id: 'vibrant-1',
    name: 'Purple Pink Waves',
    value: 'url(https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=200&q=60)',
    type: 'image',
    category: 'Vibrant'
  },
  {
    id: 'vibrant-2',
    name: 'Rainbow Gradient',
    value: 'url(https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=200&q=60)',
    type: 'image',
    category: 'Vibrant'
  },
  {
    id: 'vibrant-3',
    name: 'Blue Purple Mesh',
    value: 'url(https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1557683316-973673baf926?w=200&q=60)',
    type: 'image',
    category: 'Vibrant'
  },
  {
    id: 'vibrant-4',
    name: 'Colorful Abstract',
    value: 'url(https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&q=60)',
    type: 'image',
    category: 'Vibrant'
  },
  {
    id: 'vibrant-5',
    name: 'Pink Orange Swirl',
    value: 'url(https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1558591710-4b4a1ae0f04d?w=200&q=60)',
    type: 'image',
    category: 'Vibrant'
  },
  {
    id: 'vibrant-6',
    name: 'Neon Glow',
    value: 'url(https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=200&q=60)',
    type: 'image',
    category: 'Vibrant'
  },
  {
    id: 'vibrant-7',
    name: 'Liquid Colors',
    value: 'url(https://images.unsplash.com/photo-1614851099175-e5b30eb6f696?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1614851099175-e5b30eb6f696?w=200&q=60)',
    type: 'image',
    category: 'Vibrant'
  },
  {
    id: 'vibrant-8',
    name: 'Holographic',
    value: 'url(https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1620121692029-d088224ddc74?w=200&q=60)',
    type: 'image',
    category: 'Vibrant'
  },

  // === PASTEL ===
  {
    id: 'pastel-1',
    name: 'Soft Pink Blue',
    value: 'url(https://images.unsplash.com/photo-1557682224-5b8590cd9ec5?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1557682224-5b8590cd9ec5?w=200&q=60)',
    type: 'image',
    category: 'Pastel'
  },
  {
    id: 'pastel-2',
    name: 'Dreamy Clouds',
    value: 'url(https://images.unsplash.com/photo-1557683311-eac922347aa1?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1557683311-eac922347aa1?w=200&q=60)',
    type: 'image',
    category: 'Pastel'
  },
  {
    id: 'pastel-3',
    name: 'Cotton Candy',
    value: 'url(https://images.unsplash.com/photo-1579546929662-711aa81148cf?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1579546929662-711aa81148cf?w=200&q=60)',
    type: 'image',
    category: 'Pastel'
  },
  {
    id: 'pastel-4',
    name: 'Soft Gradient',
    value: 'url(https://images.unsplash.com/photo-1557682260-96773eb01377?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1557682260-96773eb01377?w=200&q=60)',
    type: 'image',
    category: 'Pastel'
  },
  {
    id: 'pastel-5',
    name: 'Lavender Dream',
    value: 'url(https://images.unsplash.com/photo-1618556450994-a6a128ef0d9d?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1618556450994-a6a128ef0d9d?w=200&q=60)',
    type: 'image',
    category: 'Pastel'
  },
  {
    id: 'pastel-6',
    name: 'Peachy',
    value: 'url(https://images.unsplash.com/photo-1618556450991-2f1af64e8191?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1618556450991-2f1af64e8191?w=200&q=60)',
    type: 'image',
    category: 'Pastel'
  },

  // === DARK ===
  {
    id: 'dark-1',
    name: 'Deep Purple',
    value: 'url(https://images.unsplash.com/photo-1557683304-673a23048d34?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1557683304-673a23048d34?w=200&q=60)',
    type: 'image',
    category: 'Dark'
  },
  {
    id: 'dark-2',
    name: 'Midnight Blue',
    value: 'url(https://images.unsplash.com/photo-1557682268-e3955ed5d83f?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1557682268-e3955ed5d83f?w=200&q=60)',
    type: 'image',
    category: 'Dark'
  },
  {
    id: 'dark-3',
    name: 'Galaxy',
    value: 'url(https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=200&q=60)',
    type: 'image',
    category: 'Dark'
  },
  {
    id: 'dark-4',
    name: 'Aurora Dark',
    value: 'url(https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?w=1920&q=80)',
    preview: 'url(https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?w=200&q=60)',
    type: 'image',
    category: 'Dark'
  },
];

// Aspect ratio presets
const ASPECT_RATIOS = [
  { id: '16:9', name: '16:9', desc: 'YouTube', width: 1920, height: 1080 },
  { id: '4:3', name: '4:3', desc: 'Classic', width: 1440, height: 1080 },
  { id: '3:4', name: '3:4', desc: 'RedNote', width: 1080, height: 1440 },
  { id: '9:16', name: '9:16', desc: 'TikTok', width: 1080, height: 1920 },
  { id: '1:1', name: '1:1', desc: 'Square', width: 1080, height: 1080 },
  { id: 'custom', name: 'Custom', desc: 'Your size', width: 1920, height: 1080 },
];

export interface RecordingSettings {
  recordingSource: 'composite' | 'desktop';
  aspectRatio: string;
  customWidth: number;
  customHeight: number;
  background: string;
  backgroundId: string;
  backgroundType: 'solid' | 'gradient' | 'image' | 'none';
  webcamSize: number;
  padding: number;
  cornerRadius: number;
  showCursor: boolean;
  cursorColor: string;
  // Title overlay settings
  showTitle: boolean;
  titleText: string;
  titlePosition: 'bottom-left' | 'bottom-right';
  // Camera settings
  showCamera: boolean;
  // Audio settings
  recordAudio: boolean;
  recordSystemAudio: boolean;
}

interface SettingsPanelProps {
  isOpen: boolean;
  settings: RecordingSettings;
  onSettingsChange: (settings: RecordingSettings) => void;
  onClose: () => void;
}

const CURSOR_COLORS = [
  { id: 'red', color: '#ef4444' },
  { id: 'orange', color: '#f97316' },
  { id: 'yellow', color: '#eab308' },
  { id: 'green', color: '#22c55e' },
  { id: 'blue', color: '#3b82f6' },
  { id: 'purple', color: '#a855f7' },
  { id: 'pink', color: '#ec4899' },
];

function SettingsPanel({ isOpen, settings, onSettingsChange, onClose }: SettingsPanelProps) {
  const [customWidth, setCustomWidth] = useState(settings.customWidth);
  const [customHeight, setCustomHeight] = useState(settings.customHeight);
  const [bgCategory, setBgCategory] = useState<typeof BACKGROUND_CATEGORIES[number]>('All');

  if (!isOpen) return null;

  // Filter backgrounds by category
  const filteredBackgrounds = bgCategory === 'All'
    ? GRADIENT_PRESETS
    : GRADIENT_PRESETS.filter(g => g.category === bgCategory);

  // Pick a random background
  const pickRandomBackground = () => {
    const randomIndex = Math.floor(Math.random() * GRADIENT_PRESETS.length);
    const randomBg = GRADIENT_PRESETS[randomIndex];
    onSettingsChange({
      ...settings,
      background: randomBg.value,
      backgroundId: randomBg.id,
      backgroundType: randomBg.type as 'solid' | 'gradient' | 'image' | 'none',
    });
  };

  const handleAspectChange = (ratioId: string) => {
    const ratio = ASPECT_RATIOS.find(r => r.id === ratioId);
    if (ratio) {
      onSettingsChange({
        ...settings,
        aspectRatio: ratioId,
        customWidth: ratio.width,
        customHeight: ratio.height,
      });
      setCustomWidth(ratio.width);
      setCustomHeight(ratio.height);
    }
  };

  const handleCustomDimension = (dimension: 'width' | 'height', value: number) => {
    if (dimension === 'width') {
      setCustomWidth(value);
      onSettingsChange({ ...settings, customWidth: value, aspectRatio: 'custom' });
    } else {
      setCustomHeight(value);
      onSettingsChange({ ...settings, customHeight: value, aspectRatio: 'custom' });
    }
  };

  const handleBackgroundChange = (gradientId: string) => {
    const gradient = GRADIENT_PRESETS.find(g => g.id === gradientId);
    if (gradient) {
      onSettingsChange({
        ...settings,
        background: gradient.value,
        backgroundId: gradientId,
        backgroundType: gradient.type as 'solid' | 'gradient' | 'image' | 'none',
      });
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Recording Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Recording Source */}
        <div className="settings-section">
          <h3>Recording Source</h3>
          <div className="source-grid">
            <button
              className={`source-btn ${settings.recordingSource === 'composite' ? 'active' : ''}`}
              onClick={() => onSettingsChange({ ...settings, recordingSource: 'composite' })}
            >
              <span className="source-name">Composite</span>
              <span className="source-desc">Excalidraw + Camera</span>
            </button>
            <button
              className={`source-btn ${settings.recordingSource === 'desktop' ? 'active' : ''}`}
              onClick={() => onSettingsChange({ ...settings, recordingSource: 'desktop' })}
            >
              <span className="source-name">Desktop Capture</span>
              <span className="source-desc">Screen / Window / Tab</span>
            </button>
          </div>
          {settings.recordingSource === 'desktop' && (
            <p className="desktop-mode-note">
              Desktop mode records the shared screen directly. Background, corner radius, cursor effect,
              title overlay, and camera bubble are ignored. You will choose the screen/window/tab each time.
            </p>
          )}
        </div>

        {/* Aspect Ratio */}
        <div className="settings-section">
          <h3>Aspect Ratio</h3>
          <div className="aspect-grid">
            {ASPECT_RATIOS.map(ratio => (
              <button
                key={ratio.id}
                className={`aspect-btn ${settings.aspectRatio === ratio.id ? 'active' : ''}`}
                onClick={() => handleAspectChange(ratio.id)}
              >
                <span className="ratio-name">{ratio.name}</span>
                <span className="ratio-desc">{ratio.desc}</span>
              </button>
            ))}
          </div>

          {settings.aspectRatio === 'custom' && (
            <div className="custom-dimensions">
              <label>
                Width
                <input
                  type="number"
                  value={customWidth}
                  onChange={e => handleCustomDimension('width', parseInt(e.target.value) || 1920)}
                  min={640}
                  max={3840}
                />
              </label>
              <span className="dimension-x">×</span>
              <label>
                Height
                <input
                  type="number"
                  value={customHeight}
                  onChange={e => handleCustomDimension('height', parseInt(e.target.value) || 1080)}
                  min={480}
                  max={2160}
                />
              </label>
            </div>
          )}
        </div>

        {/* Background */}
        <div className="settings-section">
          <h3>Background</h3>

          {/* Category tabs */}
          <div className="bg-category-tabs">
            {BACKGROUND_CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`bg-category-tab ${bgCategory === cat ? 'active' : ''}`}
                onClick={() => setBgCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Random picker */}
          <button className="random-bg-btn" onClick={pickRandomBackground}>
            ✨ Pick random wallpaper
          </button>

          <div className="gradient-grid">
            {filteredBackgrounds.map(gradient => (
              <button
                key={gradient.id}
                className={`gradient-btn ${settings.backgroundId === gradient.id ? 'active' : ''}`}
                style={{ background: gradient.preview }}
                onClick={() => handleBackgroundChange(gradient.id)}
                title={gradient.name}
              >
                {settings.backgroundId === gradient.id && <span className="check">✓</span>}
              </button>
            ))}
          </div>
          <p className="gradient-name">{GRADIENT_PRESETS.find(g => g.id === settings.backgroundId)?.name || 'None'}</p>
        </div>

        {/* Corner Radius */}
        <div className="settings-section">
          <h3>Corner Radius: {settings.cornerRadius}px</h3>
          <input
            type="range"
            min={0}
            max={40}
            value={settings.cornerRadius}
            onChange={e => onSettingsChange({ ...settings, cornerRadius: parseInt(e.target.value) })}
            className="slider"
          />
          <div className="slider-labels">
            <span>Sharp</span>
            <span>Rounded</span>
          </div>
        </div>

        {/* Camera Settings */}
        <div className="settings-section">
          <h3>Camera</h3>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.showCamera}
              onChange={e => onSettingsChange({ ...settings, showCamera: e.target.checked })}
            />
            <span className="toggle-switch"></span>
            Show camera bubble in recording
          </label>

          {settings.showCamera && (
            <div className="webcam-size-slider">
              <div className="slider-header">Size: {settings.webcamSize}px</div>
              <input
                type="range"
                min={100}
                max={300}
                value={settings.webcamSize}
                onChange={e => onSettingsChange({ ...settings, webcamSize: parseInt(e.target.value) })}
                className="slider"
              />
              <div className="slider-labels">
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>
          )}
        </div>

        {/* Audio Settings */}
        <div className="settings-section">
          <h3>Audio</h3>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.recordAudio}
              onChange={e => onSettingsChange({ ...settings, recordAudio: e.target.checked })}
            />
            <span className="toggle-switch"></span>
            Record microphone audio
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.recordSystemAudio}
              onChange={e => onSettingsChange({ ...settings, recordSystemAudio: e.target.checked })}
            />
            <span className="toggle-switch"></span>
            Record system audio (desktop mode)
          </label>
        </div>

        {/* Padding */}
        <div className="settings-section">
          <h3>Canvas Padding: {settings.padding}px</h3>
          <input
            type="range"
            min={0}
            max={120}
            value={settings.padding}
            onChange={e => onSettingsChange({ ...settings, padding: parseInt(e.target.value) })}
            className="slider"
          />
          <div className="slider-labels">
            <span>None</span>
            <span>Large</span>
          </div>
        </div>

        {/* Cursor Effect */}
        <div className="settings-section">
          <h3>Mouse Cursor Effect</h3>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.showCursor}
              onChange={e => onSettingsChange({ ...settings, showCursor: e.target.checked })}
            />
            <span className="toggle-switch"></span>
            Show cursor highlight in recording
          </label>

          {settings.showCursor && (
            <div className="cursor-colors">
              <span className="color-label">Cursor color:</span>
              {CURSOR_COLORS.map(c => (
                <button
                  key={c.id}
                  className={`color-btn ${settings.cursorColor === c.color ? 'active' : ''}`}
                  style={{ background: c.color }}
                  onClick={() => onSettingsChange({ ...settings, cursorColor: c.color })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Title Overlay */}
        <div className="settings-section">
          <h3>Title Overlay</h3>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={settings.showTitle}
              onChange={e => onSettingsChange({ ...settings, showTitle: e.target.checked })}
            />
            <span className="toggle-switch"></span>
            Show name banner in recording
          </label>

          {settings.showTitle && (
            <div className="title-settings">
              <label className="text-input-label">
                Display Text
                <input
                  type="text"
                  value={settings.titleText}
                  onChange={e => onSettingsChange({ ...settings, titleText: e.target.value })}
                  placeholder="Your Name · Title"
                  className="text-input"
                />
              </label>
              <div className="position-toggle">
                <span className="color-label">Position:</span>
                <button
                  className={`position-btn ${settings.titlePosition === 'bottom-left' ? 'active' : ''}`}
                  onClick={() => onSettingsChange({ ...settings, titlePosition: 'bottom-left' })}
                >
                  ↙ Left
                </button>
                <button
                  className={`position-btn ${settings.titlePosition === 'bottom-right' ? 'active' : ''}`}
                  onClick={() => onSettingsChange({ ...settings, titlePosition: 'bottom-right' })}
                >
                  ↘ Right
                </button>
              </div>
            </div>
          )}
        </div>

        <button className="done-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

export default SettingsPanel;
export { GRADIENT_PRESETS, ASPECT_RATIOS };
