# FORZARA: Excalicord

**A Loom-style video recording app that combines whiteboard drawing with your webcam**

---

## The Big Picture: What Is This Thing?

Imagine you're a teacher with a digital whiteboard and a camera pointing at your face. Excalicord combines both into one polished video - like Loom, but for whiteboard explanations.

Here's the magic trick: **we're not actually recording your screen.** Instead, we're:
1. Capturing pixels from the Excalidraw whiteboard canvas
2. Capturing frames from your webcam
3. Painting both onto a *new* canvas (like a painter combining two photos)
4. Recording that composite canvas as a video

Think of it like a TV news broadcast: the camera operator isn't just pointing a camera at the anchor - they're mixing multiple feeds (the anchor, the weather map, the lower-third graphics) into one final output.

---

## The Architecture: A Restaurant Kitchen Analogy

Let's think of this app as a restaurant:

| App Component | Restaurant Equivalent |
|---------------|----------------------|
| **App.tsx** | The head chef - coordinates everything |
| **WebcamBubble** | The sous chef handling the webcam "ingredient" |
| **RecordingControls** | The waiter taking orders (record, stop, pause) |
| **SettingsPanel** | The menu - lets you customize your order |
| **Excalidraw** | A supplier delivering the whiteboard canvas |
| **MediaRecorder** | The delivery driver packaging the final meal |

### The Data Flow (How an Order Gets Made)

```
1. User clicks "Record"
   ↓
2. Preview mode activates (position your recording frame)
   ↓
3. User clicks "Start Recording"
   ↓
4. A render loop begins (60 times per second):
   │
   ├── Draw background (gradient/image/solid)
   ├── Draw Excalidraw canvas content
   ├── Draw webcam feed (circular bubble)
   ├── Draw cursor effect (if enabled)
   └── Draw title overlay (if enabled)
   ↓
5. MediaRecorder captures the composite canvas as video
   ↓
6. User clicks "Stop"
   ↓
7. Video blob gets packaged and downloaded
```

---

## Codebase Structure: The Tour

```
excalidraw-recorder/
├── src/
│   ├── main.tsx          # 🚪 The front door - React entry point
│   ├── App.tsx           # 🧠 The brain - all core logic lives here
│   ├── App.css           # 🎨 Styles for App + recording overlays
│   ├── index.css         # 🌍 Global CSS reset
│   │
│   └── components/
│       ├── WebcamBubble.tsx     # 📹 Draggable webcam circle
│       ├── WebcamBubble.css
│       ├── RecordingControls.tsx # 🎛️ Record/Stop/Pause buttons
│       ├── RecordingControls.css
│       ├── SettingsPanel.tsx    # ⚙️ Settings modal
│       └── SettingsPanel.css
│
├── package.json          # Dependencies & scripts
└── vite.config.ts        # Build configuration
```

### What Each File Does

**`main.tsx`** - The bouncer at the door. It says "Here's the root element, render the App component inside it." That's literally all it does.

**`App.tsx`** (857 lines) - The heavyweight champion. Contains:
- All recording state management
- The render loop that composites everything
- Frame positioning and resizing logic
- Webcam initialization
- MediaRecorder setup
- Teleprompter functionality

**`WebcamBubble.tsx`** - A self-contained draggable component. Knows how to:
- Display a video stream in a circle
- Track drag events
- Report position changes to its parent

**`RecordingControls.tsx`** - The floating control bar. Manages:
- Record/Stop/Pause buttons
- Timer display
- Settings and teleprompter toggles
- Its own draggable position

**`SettingsPanel.tsx`** - The customization modal. Contains:
- Aspect ratio presets (16:9, 4:3, 9:16, 1:1, custom)
- Background gallery (Unsplash images!)
- Webcam size slider
- Padding and corner radius
- Cursor effect toggle
- Title overlay settings
- Camera on/off toggle

---

## Technologies Used & Why We Chose Them

### React + TypeScript + Vite

**Why React?** Because we need reactive UI updates - when the user drags the webcam bubble, the position should update instantly. React's state management makes this natural.

**Why TypeScript?** Catching bugs before they happen. When you have complex settings objects being passed around, TypeScript tells you "hey, you forgot the `showCamera` property" before you waste 20 minutes debugging.

**Why Vite?** It's fast. Like, *really* fast. Hot module reload in <100ms. The old Create React App would take 10+ seconds to rebuild.

### @excalidraw/excalidraw

This is the open-source whiteboard library that powers excalidraw.com. We're embedding it as a React component. The beauty is we didn't have to build drawing tools - we just use theirs.

**Why not build our own canvas?** Are you kidding? Excalidraw has years of engineering behind it - smooth lines, shape recognition, multi-user support. We get all that for free.

### Canvas API + MediaRecorder API

These are browser-native APIs, no library needed:

- **Canvas API**: Lets us draw pixels programmatically. We use `drawImage()` to composite multiple sources.
- **MediaRecorder API**: Records a video stream directly in the browser. No server needed!

**Why not use FFmpeg.wasm?** We actually have FFmpeg in our dependencies (check `package.json`), but we don't use it for the core recording. MediaRecorder is simpler and doesn't require loading a 25MB WASM file. FFmpeg would only be needed for format conversion.

### Unsplash for Backgrounds

Free, high-quality gradient images. We're using their CDN URLs directly with `?w=1920&q=80` parameters to get appropriately sized images.

---

## Lessons Learned: The Good Stuff

### Bug #1: The Black First Frame

**What happened:** Every recorded video started with a black frame. Super annoying.

**Root cause:** We were starting the MediaRecorder before the canvas had any content. The first frame captured was empty.

**The fix:**
```typescript
// Pre-render frames before starting the recorder
const preRenderFrames = () => {
  renderCompositeFrame();
  renderCompositeFrame();
  renderCompositeFrame();
};

setTimeout(() => {
  preRenderFrames();
  animationFrameRef.current = requestAnimationFrame(renderCompositeFrame);
  setTimeout(() => {
    mediaRecorder.start(1000);
  }, 100);  // Extra delay to ensure canvas has content
}, 100);
```

**Lesson:** When dealing with async rendering, sometimes you need strategic delays. It feels hacky, but it works.

---

### Bug #2: Function Used Before Declaration

**What happened:** The app showed a blank white screen. No errors in the console at first glance.

**Root cause:** JavaScript hoisting is tricky. We had:
```typescript
snapBubbleToFrame(frame);  // Called here

// ... 200 lines later ...

const snapBubbleToFrame = useCallback(() => { ... });  // Defined here
```

**The fix:** Move the function definition *before* its first use.

**Lesson:** In React, the order of your `useCallback` definitions matters! They're not hoisted like regular function declarations.

---

### Bug #3: Recording Frame Not Draggable

**What happened:** User reported they couldn't drag the recording area during preview mode.

**Root cause:** CSS `pointer-events: none` was blocking all mouse interactions. We needed it to let users click through the darkened overlay, but it was also blocking the frame itself.

**The fix:**
```css
.recording-frame-border.preview-mode {
  pointer-events: auto;  /* Allow interactions in preview mode */
}
```

**Lesson:** `pointer-events: none` is infectious - child elements inherit it. Be explicit about which elements should receive clicks.

---

### Bug #4: Webcam Bubble Escaping the Recording Frame

**What happened:** You could drag the webcam bubble outside the recording area, meaning part of your face would be cut off in the final video.

**The fix:** Constrain the bubble position whenever the frame moves or resizes:
```typescript
const snapBubbleToFrame = useCallback((frame) => {
  const constrainedX = Math.max(frame.x, Math.min(currentPos.x, frame.x + frame.width - size));
  const constrainedY = Math.max(frame.y, Math.min(currentPos.y, frame.y + frame.height - size));
  setBubblePosition({ x: constrainedX, y: constrainedY });
}, []);
```

**Lesson:** When you have multiple draggable elements with relationships, think about edge cases. What happens when element A moves? Does element B need to respond?

---

### Bug #5: CORS Errors with Unsplash Images

**What happened:** Background images loaded in CSS but caused errors when drawn to canvas.

**Root cause:** Canvas `drawImage()` from a cross-origin image "taints" the canvas, making it unreadable. The browser blocks this for security.

**The fix:**
```typescript
const img = new Image();
img.crossOrigin = 'anonymous';  // This magic line
img.src = urlMatch[1];
```

**Lesson:** When loading images for canvas manipulation, always set `crossOrigin = 'anonymous'`. The server also needs proper CORS headers (Unsplash has them).

---

## Engineering Patterns Worth Remembering

### Pattern 1: Refs for Animation Loops

React state triggers re-renders, which is expensive during a 60fps animation. Solution: use refs for values that change frequently but don't need to update the UI:

```typescript
const settingsRef = useRef(settings);
useEffect(() => { settingsRef.current = settings; }, [settings]);

// In the render loop, read from ref (no re-render)
const currentSettings = settingsRef.current;
```

This is a common pattern in animation-heavy React apps.

### Pattern 2: The Preview Mode Pattern

Instead of immediately starting recording, we:
1. Enter "preview mode" - show the frame, let user position it
2. User confirms they're happy
3. *Then* start recording

This is much better UX than recording a video you didn't want.

### Pattern 3: Composite Canvas Rendering

We're not screen-recording - we're *painting* a video frame by frame:

```typescript
// Each frame:
ctx.fillRect(...)           // Background
ctx.drawImage(excalidraw)   // Whiteboard
ctx.drawImage(webcam)       // Face
ctx.arc(...); ctx.fill()    // Cursor effect
ctx.fillText(...)           // Title overlay
```

This gives us total control over the output. We can add padding, rounded corners, drop shadows - things you can't do with screen recording.

### Pattern 4: Aspect Ratio Maintenance During Resize

When resizing the recording frame, we only track horizontal movement and calculate height from width:

```typescript
newWidth = Math.max(200, startFrame.width + deltaX);
newHeight = newWidth / aspectRatio;  // Maintain ratio
```

This ensures the aspect ratio is *always* preserved, no matter how the user drags.

---

## How to Run This

### Prerequisites
- Node.js 18+
- A webcam
- A browser that supports MediaRecorder (Chrome, Firefox, Edge)

### Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Testing It Works
1. Allow camera/microphone permissions when prompted
2. You should see Excalidraw with your webcam bubble in the corner
3. Click the ⚙ button to open settings
4. Click "Record" → position the frame → "Start Recording"
5. Draw something, talk, then click "Stop"
6. A video file should download automatically

---

## What a Senior Engineer Would Do Differently

1. **Error boundaries**: Right now, if Excalidraw crashes, the whole app goes blank. We should wrap it in an error boundary.

2. **Service worker for offline**: The Unsplash images require internet. A service worker could cache them.

3. **Progressive enhancement**: If MediaRecorder isn't supported, show a helpful message instead of just breaking.

4. **State machine**: The recording states (idle → preview → recording → paused → stopped) would be cleaner as a finite state machine (XState or similar).

5. **Testing**: There are no tests. At minimum, we should test the settings state management.

6. **Accessibility**: The controls work with mouse, but keyboard navigation is missing.

---

## New Concepts Explained

### `requestAnimationFrame`
The browser's way of saying "call this function right before the next screen repaint." It's the gold standard for smooth animations - typically 60 times per second.

### `captureStream()`
A Canvas method that creates a MediaStream from the canvas content. It's how we "record" the canvas - we turn it into a stream that MediaRecorder can consume.

### `MediaRecorder`
Browser API for recording media streams. You give it a stream, call `start()`, and it fires `ondataavailable` events with video chunks. When you `stop()`, you combine the chunks into a Blob.

### `useCallback` vs `useMemo`
- `useCallback`: Memoizes a *function* so it doesn't get recreated on every render
- `useMemo`: Memoizes a *value* (the result of a computation)

We use `useCallback` heavily for event handlers that get passed to child components.

### Canvas Clipping
`ctx.clip()` creates an invisible mask. After clipping, anything you draw only appears *inside* the clipped region. We use it for the rounded corners on the content area.

---

## The "Warm Studio" Aesthetic

We deliberately chose a design language that avoids the typical "AI slop" look (purple gradients on white, Inter font, generic shadows). Instead:

- **Colors**: Warm cream (#fefcf9), stone grays, charcoal accents
- **Fonts**: DM Sans (body) + Fraunces (headers) - distinctive but readable
- **Shadows**: Soft, diffuse, realistic
- **Corners**: Generous radius (12-16px)
- **Animations**: Subtle, purposeful (no gratuitous bouncing)

The goal: feels like a premium Mac app, not a generic web tool.

---

## Final Thoughts

This project demonstrates that you don't need a backend to build powerful media tools. Everything happens in the browser:
- Webcam access via `getUserMedia`
- Canvas compositing via 2D context
- Video encoding via `MediaRecorder`
- File download via `Blob` + `URL.createObjectURL`

The hardest parts weren't technical - they were UX decisions:
- When should the frame appear? (Preview mode!)
- How should resizing work? (Maintain aspect ratio)
- What happens to the webcam when you resize the frame? (Auto-snap)

Good engineering is often about handling the edge cases that users will definitely hit but didn't consciously think about. Make the obvious path the correct path, and your app will feel "magical."

---

*Built with Claude Code and a lot of iterative refinement. Every bug was a lesson.*
