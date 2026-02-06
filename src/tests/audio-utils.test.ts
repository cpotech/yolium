import { describe, it, expect } from 'vitest'
import { encodeWav, resampleToMono } from '@shared/lib/audio-utils'

// ============================================================================
// encodeWav tests
// ============================================================================

describe('encodeWav', () => {
  it('produces a valid WAV header for empty samples', () => {
    const wav = encodeWav(new Float32Array(0), 16000)
    // WAV header is always 44 bytes
    expect(wav.length).toBe(44)

    const view = new DataView(wav.buffer)
    // RIFF magic
    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe('RIFF')
    // File size = 36 + data size (0)
    expect(view.getUint32(4, true)).toBe(36)
    // WAVE magic
    expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe('WAVE')
  })

  it('writes correct fmt sub-chunk', () => {
    const wav = encodeWav(new Float32Array(100), 16000)
    const view = new DataView(wav.buffer)

    // fmt magic
    expect(String.fromCharCode(wav[12], wav[13], wav[14], wav[15])).toBe('fmt ')
    // Sub-chunk size
    expect(view.getUint32(16, true)).toBe(16)
    // Audio format: PCM = 1
    expect(view.getUint16(20, true)).toBe(1)
    // Num channels: mono = 1
    expect(view.getUint16(22, true)).toBe(1)
    // Sample rate
    expect(view.getUint32(24, true)).toBe(16000)
    // Byte rate = sampleRate * numChannels * bytesPerSample = 16000 * 1 * 2
    expect(view.getUint32(28, true)).toBe(32000)
    // Block align = numChannels * bytesPerSample = 1 * 2
    expect(view.getUint16(32, true)).toBe(2)
    // Bits per sample
    expect(view.getUint16(34, true)).toBe(16)
  })

  it('writes correct data sub-chunk header', () => {
    const samples = new Float32Array(100)
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)

    // data magic
    expect(String.fromCharCode(wav[36], wav[37], wav[38], wav[39])).toBe('data')
    // Data size = numSamples * 2 bytes
    expect(view.getUint32(40, true)).toBe(200)
  })

  it('produces correct total file size', () => {
    const samples = new Float32Array(500)
    const wav = encodeWav(samples, 16000)
    // 44 header + 500 samples * 2 bytes = 1044
    expect(wav.length).toBe(1044)
  })

  it('encodes silence as zeros', () => {
    const samples = new Float32Array(10) // all zeros
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)

    for (let i = 0; i < 10; i++) {
      expect(view.getInt16(44 + i * 2, true)).toBe(0)
    }
  })

  it('encodes max positive sample correctly', () => {
    const samples = new Float32Array([1.0])
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)
    // 1.0 * 0x7FFF = 32767
    expect(view.getInt16(44, true)).toBe(32767)
  })

  it('encodes max negative sample correctly', () => {
    const samples = new Float32Array([-1.0])
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)
    // -1.0 * 0x8000 = -32768
    expect(view.getInt16(44, true)).toBe(-32768)
  })

  it('clamps values above 1.0', () => {
    const samples = new Float32Array([2.5])
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)
    // Clamped to 1.0 → 32767
    expect(view.getInt16(44, true)).toBe(32767)
  })

  it('clamps values below -1.0', () => {
    const samples = new Float32Array([-3.0])
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)
    // Clamped to -1.0 → -32768
    expect(view.getInt16(44, true)).toBe(-32768)
  })

  it('encodes a mid-range value correctly', () => {
    const samples = new Float32Array([0.5])
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)
    // 0.5 * 0x7FFF = 16383.5, truncated to 16383
    expect(view.getInt16(44, true)).toBe(Math.floor(0.5 * 0x7FFF))
  })

  it('encodes negative mid-range value correctly', () => {
    const samples = new Float32Array([-0.5])
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)
    // -0.5 * 0x8000 = -16384
    expect(view.getInt16(44, true)).toBe(Math.floor(-0.5 * 0x8000))
  })

  it('supports different sample rates', () => {
    const wav = encodeWav(new Float32Array(10), 44100)
    const view = new DataView(wav.buffer)
    expect(view.getUint32(24, true)).toBe(44100)
    expect(view.getUint32(28, true)).toBe(88200) // byte rate = 44100 * 1 * 2
  })

  it('RIFF file size field matches actual file size minus 8', () => {
    const samples = new Float32Array(256)
    const wav = encodeWav(samples, 16000)
    const view = new DataView(wav.buffer)
    // RIFF size = total - 8 (for 'RIFF' + size field)
    expect(view.getUint32(4, true)).toBe(wav.length - 8)
  })
})

// ============================================================================
// resampleToMono tests
// ============================================================================

describe('resampleToMono', () => {
  // Helper to create a mock AudioBuffer
  function createMockAudioBuffer(channels: Float32Array[]): AudioBuffer {
    const length = channels[0]?.length ?? 0
    return {
      numberOfChannels: channels.length,
      length,
      sampleRate: 16000,
      duration: length / 16000,
      getChannelData: (ch: number) => channels[ch],
    } as unknown as AudioBuffer
  }

  it('returns mono unchanged for single channel input', () => {
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4])
    const buffer = createMockAudioBuffer([input])
    const result = resampleToMono(buffer)
    expect(result.length).toBe(4)
    expect(result[0]).toBeCloseTo(0.1)
    expect(result[1]).toBeCloseTo(0.2)
    expect(result[2]).toBeCloseTo(0.3)
    expect(result[3]).toBeCloseTo(0.4)
  })

  it('averages two stereo channels', () => {
    const left = new Float32Array([1.0, 0.0, -1.0])
    const right = new Float32Array([0.0, 1.0, -1.0])
    const buffer = createMockAudioBuffer([left, right])
    const result = resampleToMono(buffer)
    expect(result.length).toBe(3)
    expect(result[0]).toBeCloseTo(0.5)  // (1.0 + 0.0) / 2
    expect(result[1]).toBeCloseTo(0.5)  // (0.0 + 1.0) / 2
    expect(result[2]).toBeCloseTo(-1.0) // (-1.0 + -1.0) / 2
  })

  it('averages three channels correctly', () => {
    const ch1 = new Float32Array([0.3])
    const ch2 = new Float32Array([0.6])
    const ch3 = new Float32Array([0.9])
    const buffer = createMockAudioBuffer([ch1, ch2, ch3])
    const result = resampleToMono(buffer)
    expect(result[0]).toBeCloseTo(0.6) // (0.3 + 0.6 + 0.9) / 3
  })

  it('handles empty buffer', () => {
    const buffer = createMockAudioBuffer([new Float32Array(0)])
    const result = resampleToMono(buffer)
    expect(result.length).toBe(0)
  })

  it('preserves silence', () => {
    const silence = new Float32Array(100) // all zeros
    const buffer = createMockAudioBuffer([silence, silence])
    const result = resampleToMono(buffer)
    for (let i = 0; i < 100; i++) {
      expect(result[i]).toBe(0)
    }
  })
})
