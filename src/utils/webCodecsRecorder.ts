/**
 * WebCodecs Recorder - Records canvas directly to MP4
 *
 * Uses the WebCodecs API for fast, native video encoding
 * and mp4-muxer to write directly to MP4 format.
 *
 * This is 10x faster than MediaRecorder + FFmpeg conversion.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// Check if WebCodecs is supported
export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined';
}

export interface WebCodecsRecorderOptions {
  width: number;
  height: number;
  frameRate?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  audioStream?: MediaStream; // For webcam audio
}

export class WebCodecsRecorder {
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private videoEncoder: VideoEncoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;

  private width: number;
  private height: number;
  private frameRate: number;
  private videoBitrate: number;
  private audioBitrate: number;
  private audioStream: MediaStream | null;

  private frameCount: number = 0;
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private audioSampleRate: number = 48000;
  private warmupFrames: number = 5; // Skip first few frames for encoder warmup
  private audioTimestamp: number = 0;
  private hasAudio: boolean = false;

  constructor(options: WebCodecsRecorderOptions) {
    this.width = options.width;
    this.height = options.height;
    this.frameRate = options.frameRate || 30;
    this.videoBitrate = options.videoBitrate || 5_000_000; // 5 Mbps
    this.audioBitrate = options.audioBitrate || 128_000; // 128 kbps
    this.audioStream = options.audioStream || null;
  }

  async start(): Promise<void> {
    const videoCodec = await this.selectVideoCodec();
    this.hasAudio = await this.shouldEnableAudio();

    // Create the MP4 muxer
    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: this.width,
        height: this.height,
      },
      audio: this.hasAudio ? {
        codec: 'aac',
        numberOfChannels: 1,
        sampleRate: this.audioSampleRate,
      } : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });

    // Create video encoder
    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        this.muxer?.addVideoChunk(chunk, meta);
      },
      error: (e) => console.error('VideoEncoder error:', e),
    });

    // Configure video encoder with H.264
    // Try a codec explicitly reported as supported by the browser.
    this.videoEncoder.configure({
      codec: videoCodec,
      width: this.width,
      height: this.height,
      bitrate: this.videoBitrate,
      framerate: this.frameRate,
      latencyMode: 'realtime', // Optimize for live recording
    });

    // Wait for encoder to be ready
    await this.videoEncoder.flush();

    // Set up audio encoding only when a live audio track exists and encoder support is confirmed.
    if (this.hasAudio) {
      await this.setupAudioEncoder();
    }

    this.frameCount = 0;
    this.isRecording = true;
    this.isPaused = false;
    this.audioTimestamp = 0;

    console.log('[WebCodecsRecorder] Started recording', this.width, 'x', this.height, 'audio:', this.hasAudio);
  }

  private async selectVideoCodec(): Promise<string> {
    const candidates = [
      'avc1.640028', // H.264 High Profile Level 4.0
      'avc1.4d4028', // H.264 Main Profile Level 4.0
      'avc1.42E028', // H.264 Baseline Profile Level 4.0
    ];

    const supportsFn = typeof VideoEncoder.isConfigSupported === 'function';
    if (!supportsFn) {
      return candidates[0];
    }

    for (const codec of candidates) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width: this.width,
          height: this.height,
          bitrate: this.videoBitrate,
          framerate: this.frameRate,
          latencyMode: 'realtime',
        });
        if (support.supported) {
          return codec;
        }
      } catch {
        // Try the next candidate.
      }
    }

    throw new Error('No supported H.264 codec configuration found for WebCodecs');
  }

  private async shouldEnableAudio(): Promise<boolean> {
    if (!this.audioStream || typeof AudioEncoder === 'undefined') {
      return false;
    }

    const audioTrack = this.audioStream.getAudioTracks().find((track) => track.readyState === 'live');
    if (!audioTrack) {
      return false;
    }

    const supportsFn = typeof AudioEncoder.isConfigSupported === 'function';
    if (!supportsFn) {
      return true;
    }

    try {
      const support = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        numberOfChannels: 1,
        sampleRate: this.audioSampleRate,
        bitrate: this.audioBitrate,
      });
      return Boolean(support.supported);
    } catch {
      return false;
    }
  }

  private async setupAudioEncoder(): Promise<void> {
    if (!this.audioStream) return;

    const audioTrack = this.audioStream.getAudioTracks().find((track) => track.readyState === 'live');
    if (!audioTrack) {
      console.warn('[WebCodecsRecorder] No live audio track found');
      return;
    }

    // Create audio encoder
    this.audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        this.muxer?.addAudioChunk(chunk, meta);
      },
      error: (e) => console.error('AudioEncoder error:', e),
    });

    this.audioEncoder.configure({
      codec: 'mp4a.40.2', // AAC-LC
      numberOfChannels: 1,
      sampleRate: this.audioSampleRate,
      bitrate: this.audioBitrate,
    });

    // Set up audio capture using AudioContext
    this.audioContext = new AudioContext({ sampleRate: this.audioSampleRate });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create media stream source
    const audioOnlyStream = new MediaStream([audioTrack]);
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(audioOnlyStream);

    // Use ScriptProcessorNode for audio capture (simpler than AudioWorklet)
    const bufferSize = 4096;
    const scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.scriptProcessorNode = scriptNode;

    scriptNode.onaudioprocess = (event) => {
      if (!this.isRecording || this.isPaused || !this.audioEncoder) return;

      const inputData = event.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Create AudioData
      const audioData = new AudioData({
        format: 's16',
        sampleRate: this.audioSampleRate,
        numberOfFrames: int16Data.length,
        numberOfChannels: 1,
        timestamp: this.audioTimestamp,
        data: int16Data,
      });

      this.audioTimestamp += (int16Data.length / this.audioSampleRate) * 1_000_000;

      try {
        this.audioEncoder.encode(audioData);
      } catch (e) {
        console.error('Audio encode error:', e);
      }

      audioData.close();
    };

    this.mediaStreamSource.connect(scriptNode);
    scriptNode.connect(this.audioContext.destination);
  }

  // Call this for each frame with the canvas
  addFrame(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    if (!this.isRecording || this.isPaused || !this.videoEncoder) return;

    // Skip warmup frames to let encoder initialize
    if (this.frameCount < this.warmupFrames) {
      this.frameCount++;
      return;
    }

    // Calculate timestamp in microseconds (offset by warmup frames)
    const adjustedFrame = this.frameCount - this.warmupFrames;
    const timestamp = (adjustedFrame * 1_000_000) / this.frameRate;

    // Create VideoFrame from canvas
    const frame = new VideoFrame(canvas, {
      timestamp,
      duration: 1_000_000 / this.frameRate,
    });

    // Encode the frame
    // First frame and every 2 seconds should be keyframes
    const keyFrame = adjustedFrame === 0 || adjustedFrame % (this.frameRate * 2) === 0;
    this.videoEncoder.encode(frame, { keyFrame });

    frame.close();
    this.frameCount++;
  }

  pause(): void {
    if (!this.isRecording || this.isPaused) return;
    this.isPaused = true;
    console.log('[WebCodecsRecorder] Paused');
  }

  resume(): void {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    console.log('[WebCodecsRecorder] Resumed');
  }

  async stop(): Promise<Blob> {
    if (!this.isRecording) {
      throw new Error('Not recording');
    }

    this.isRecording = false;
    console.log('[WebCodecsRecorder] Stopping, frames:', this.frameCount);

    // Flush encoders
    if (this.videoEncoder) {
      await this.videoEncoder.flush();
      this.videoEncoder.close();
    }

    if (this.audioEncoder) {
      await this.audioEncoder.flush();
      this.audioEncoder.close();
    }

    // Clean up audio
    this.scriptProcessorNode?.disconnect();
    this.mediaStreamSource?.disconnect();
    this.scriptProcessorNode = null;
    this.mediaStreamSource = null;

    if (this.audioContext) {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.audioEncoder = null;

    this.videoEncoder = null;

    // Finalize the muxer
    if (!this.muxer) {
      throw new Error('Muxer not initialized');
    }

    this.muxer.finalize();

    // Get the MP4 data
    const { buffer } = this.muxer.target;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    this.muxer = null;

    console.log('[WebCodecsRecorder] Finished, size:', (blob.size / 1024 / 1024).toFixed(2), 'MB');

    return blob;
  }

  get recording(): boolean {
    return this.isRecording;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get audioEnabled(): boolean {
    return this.hasAudio;
  }
}
