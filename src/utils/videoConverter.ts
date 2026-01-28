/**
 * Video Converter - Converts WebM to MP4 using FFmpeg WASM
 *
 * Browser recording produces WebM files, but users want MP4.
 * This uses FFmpeg compiled to WebAssembly to do the conversion
 * entirely in the browser - no server needed.
 *
 * Uses single-threaded version for maximum compatibility (no special headers needed).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let loadPromise: Promise<FFmpeg> | null = null;

/**
 * Load FFmpeg WASM (only needs to happen once)
 * Uses single-threaded core for compatibility
 */
async function loadFFmpeg(onProgress?: (message: string) => void): Promise<FFmpeg> {
  // If already loaded, return immediately
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  // If currently loading, wait for that to finish
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  isLoading = true;

  loadPromise = (async () => {
    ffmpeg = new FFmpeg();

    // Log progress
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(progress * 100);
      onProgress?.(`Converting: ${percent}%`);
    });

    onProgress?.('Loading converter...');

    try {
      // Use single-threaded version (no SharedArrayBuffer needed)
      const baseURL = 'https://unpkg.com/@ffmpeg/core-st@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      isLoading = false;
      loadPromise = null;
      throw error;
    }

    return ffmpeg;
  })();

  return loadPromise;
}

/**
 * Convert a WebM blob to MP4
 * @param webmBlob - The WebM video blob from MediaRecorder
 * @param onProgress - Optional callback for progress updates
 * @returns MP4 blob
 */
export async function convertWebMToMP4(
  webmBlob: Blob,
  onProgress?: (message: string) => void
): Promise<Blob> {
  const ff = await loadFFmpeg(onProgress);

  onProgress?.('Preparing video...');

  // Write the WebM file to FFmpeg's virtual filesystem
  const webmData = await fetchFile(webmBlob);
  await ff.writeFile('input.webm', webmData);

  onProgress?.('Converting to MP4...');

  // Convert WebM to MP4 with good quality settings
  // -c:v libx264 = H.264 video codec (universal compatibility)
  // -preset fast = balance between speed and compression
  // -crf 23 = quality level (lower = better, 18-28 is good range)
  // -c:a aac = AAC audio codec
  // -movflags +faststart = optimize for web streaming
  await ff.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    'output.mp4'
  ]);

  onProgress?.('Finalizing...');

  // Read the output MP4 file
  const mp4Data = await ff.readFile('output.mp4');

  // Clean up
  await ff.deleteFile('input.webm');
  await ff.deleteFile('output.mp4');

  // Convert to blob (need to handle the Uint8Array properly)
  const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' });

  onProgress?.('Done!');

  return mp4Blob;
}
