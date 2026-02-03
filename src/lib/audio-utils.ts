// Audio conversion utilities for whisper.cpp speech-to-text
// Converts browser-recorded audio (WebM/Opus) to WAV PCM format

/** Target sample rate for whisper.cpp (16kHz mono) */
const WHISPER_SAMPLE_RATE = 16000;

/**
 * Convert an audio Blob (WebM/Opus from MediaRecorder) to WAV format
 * suitable for whisper.cpp (16-bit PCM, 16kHz, mono).
 */
export async function convertBlobToWav(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const pcmData = resampleToMono(audioBuffer);
    return encodeWav(pcmData, WHISPER_SAMPLE_RATE);
  } finally {
    await audioContext.close();
  }
}

/**
 * Mix an AudioBuffer down to a mono Float32Array.
 * Resampling is handled by AudioContext — this just averages channels.
 */
export function resampleToMono(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i];
    }
  }

  if (numChannels > 1) {
    for (let i = 0; i < length; i++) {
      mono[i] /= numChannels;
    }
  }

  return mono;
}

/**
 * Encode PCM float samples as a WAV file (16-bit PCM).
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numSamples = samples.length;
  const bitsPerSample = 16;
  const numChannels = 1;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples (clamp float [-1, 1] to int16)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
