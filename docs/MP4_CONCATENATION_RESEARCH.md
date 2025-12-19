# MP4 Video Concatenation Research Document

## Executive Summary

This document catalogs all attempts at client-side MP4 video concatenation without re-encoding, specifically targeting QuickTime and iOS Photos compatibility.

**✅ SOLVED:** The solution was adding an **Edit List (elst)** box combined with proper **ctts (composition time)** handling.

---

## Final Working Solution

### Key Components

1. **Edit List Box (`edts` → `elst`)** - Maps presentation timeline to media timeline
2. **Composition Time Offsets (`ctts`)** - Collected from all source files for B-frame timing
3. **Normal File Order** - `ftyp` + `mdat` + `moov` (not fast-start)
4. **Single `stsc` Entry** - One entry covering all chunks

### Working File Structure

```
ftyp (28 bytes) - isom/mp41
mdat (variable) - All video/audio data concatenated
moov (variable) - Rebuilt metadata
  ├── mvhd - duration: 12000, timescale: 1000
  └── trak
      ├── tkhd - duration: 12000
      ├── edts                    ← KEY: Edit List Container
      │   └── elst                ← Maps full duration to media
      │       └── entry:
      │           - segment_duration: 12000
      │           - media_time: 0
      │           - media_rate: 1.0
      └── mdia
          ├── mdhd - duration: 196608, timescale: 16384
          └── minf/stbl
              ├── stsd - Sample description
              ├── stsz - 192 sample sizes (all files combined)
              ├── stco - 4 chunk offsets (one per source file)
              ├── stsc - 1 entry: {firstChunk:1, samplesPerChunk:48}
              ├── stts - Time-to-sample entries
              ├── stss - 4 sync samples (keyframes)
              └── ctts - Composition time offsets (if B-frames)
```

### Implementation Code

```javascript
/**
 * Build an Edit List (elst) box
 * This maps presentation time to media time - REQUIRED for QuickTime
 */
function buildElst(segmentDuration, mediaTime = 0) {
  const entryCount = 1;
  const size = 16 + entryCount * 12; // header (16) + entries (12 each for v0)
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x65; result[5] = 0x6C; result[6] = 0x73; result[7] = 0x74; // elst
  view.setUint32(8, 0); // version 0 + flags
  view.setUint32(12, entryCount);
  
  // Entry: Map entire duration
  view.setUint32(16, segmentDuration);  // segment_duration in movie timescale
  view.setInt32(20, mediaTime);          // media_time (0 = start from beginning)
  view.setInt16(24, 1);                  // media_rate_integer (1x speed)
  view.setInt16(26, 0);                  // media_rate_fraction

  return result;
}

function buildEdts(segmentDuration, mediaTime = 0) {
  const elst = buildElst(segmentDuration, mediaTime);
  return wrapBox('edts', elst);
}
```

### Compatibility

| Player | Status |
|--------|--------|
| VLC Player | ✅ Works |
| QuickTime Player | ✅ Works |
| macOS Preview | ✅ Works |
| iOS Photos App | ✅ Works |
| Windows Media Player | ✅ Works |

---

## Problem Statement

**Goal:** Combine multiple 3-second H.264/AAC MP4 transition videos into a single MP4 file that plays correctly in all major players.

**Constraints:**
- Must be client-side (JavaScript in browser)
- Must be fast (no re-encoding)
- Videos are guaranteed identical codec settings (H.264/AAC, same dimensions, same timescale)

---

## Technical Background

### MP4 File Structure

```
┌─────────────────────────────┐
│ ftyp (file type)            │  ← Declares MP4 format
├─────────────────────────────┤
│ moov (movie atom)           │  ← Metadata container
│ ├── mvhd (movie header)     │  ← Overall duration, timescale
│ └── trak (track)            │  
│     ├── tkhd (track header) │  ← Track duration
│     ├── edts (edit)         │  ← REQUIRED: Edit list container
│     │   └── elst            │  ← Maps presentation to media time
│     └── mdia (media)        │
│         ├── mdhd (media hdr)│  ← Media duration, timescale
│         └── minf            │
│             └── stbl        │  ← Sample table
│                 ├── stsz    │  ← Sample sizes
│                 ├── stsc    │  ← Sample-to-chunk mapping
│                 ├── stco    │  ← Chunk offsets
│                 ├── stts    │  ← Time-to-sample
│                 ├── stss    │  ← Sync samples (keyframes)
│                 └── ctts    │  ← Composition time (B-frames)
├─────────────────────────────┤
│ mdat (media data)           │  ← Actual video/audio data
└─────────────────────────────┘
```

### Key Duration Fields

| Box | Field | Description |
|-----|-------|-------------|
| `mvhd` | duration | Movie duration in movie timescale |
| `tkhd` | duration | Track duration in movie timescale |
| `mdhd` | duration | Media duration in media timescale |
| `elst` | segment_duration | Presentation duration in movie timescale |

### Sample Tables

| Box | Purpose |
|-----|---------|
| `stsz` | Size of each sample (frame) in bytes |
| `stco` | Byte offset of each chunk in the file |
| `stsc` | Maps chunks to samples (which samples in which chunk) |
| `stts` | Duration of each sample (time-to-sample) |
| `stss` | Which samples are sync samples (keyframes) |
| `ctts` | Composition time offset (decode vs. display order for B-frames) |

### Timescale Calculations

```
Movie timescale: 1000 (1 second = 1000 units)
Media timescale: 16384 (1 second = 16384 units)

Single clip:
- Movie duration: 3000 (3 seconds)
- Media duration: 49152 (3 seconds × 16384)
- Sample count: 48 (16 fps × 3 seconds)
- Sample delta: 1024 (16384 / 16)

4 clips concatenated:
- Movie duration: 12000 (12 seconds)
- Media duration: 196608 (4 × 49152)
- Sample count: 192 (4 × 48)
- Chunks: 4 (one per source file)
```

---

## Approaches Tried (Historical)

### FFmpeg.wasm (Abandoned)

**Why tried:** FFmpeg is the gold standard for video manipulation.

**Attempts:**
1. Basic FFmpeg.wasm with default CDN
2. Increased timeouts (30s → 60s → 120s)
3. Multi-threaded version (`@ffmpeg/core-mt`)
4. Single-threaded UMD version
5. Various CDN sources (unpkg, jsdelivr)

**Outcome:** ❌ All attempts failed with initialization timeouts

**Root Cause:** FFmpeg.wasm requires SharedArrayBuffer (needs COOP/COEP headers), large WASM downloads (~25MB), and complex worker initialization.

**Lesson:** FFmpeg.wasm is too heavy for simple container-level stitching when videos have identical codecs.

---

### MP4Box.js Strategies

#### Strategies 1-5: Initial Attempts

| Strategy | Approach | Result |
|----------|----------|--------|
| 1: Direct Sample Copy | Used MP4Box onSamples API | ❌ No video output |
| 2: Track Clone | Cloned tracks with new samples | ❌ No video output |
| 3: Fragmented MP4 | Built fMP4 with segments | ❌ No video output |
| 4: Muxer Rebuild | Complete muxer reconstruction | ❌ No video output |
| 5: Raw Binary | Direct binary concatenation | ⚠️ Only first clip |

**Lesson:** MP4Box.js sample-based APIs are complex. Raw binary manipulation is more predictable.

---

#### Strategies 6-10: Binary Concatenation

| Strategy | Approach | Result |
|----------|----------|--------|
| 6: Mdat Append | Append mdat boxes | ⚠️ Only first clip |
| 7: Header Rewrite | Update sizes in headers | ❌ Broken file |
| 8: Fragmented mdat | Multiple mdat boxes | ❌ Broken file |
| 9: Combined mdat | Single merged mdat | ⚠️ Only first clip |
| 10: Chunk Offset Fix | Updated stco offsets | ⚠️ Only first clip |

**Lesson:** Simply appending mdat doesn't work - sample tables only describe first file.

---

#### Strategies 11-15: Sample Table Merging

| Strategy | Approach | Result |
|----------|----------|--------|
| 11: Merge stsz | Combined sample sizes | ❌ No video |
| 12: Merge stco | Added chunk offsets | ❌ No video |
| 13: Merge stss | Extended sync samples | ❌ No video |
| 14: Merge stts | Extended time-to-sample | ❌ No video |
| 15: All Tables | Combined all above | ❌ No video |

**Lesson:** Need to rebuild entire moov box, not just patch individual tables.

---

#### Strategies 16-20: Full moov Rebuild

| Strategy | Approach | Result |
|----------|----------|--------|
| 16: Multiply Identical | Multiply table entries | ⚠️ VLC only |
| 17: Binary Moov Edit | Direct byte manipulation | ⚠️ VLC only |
| 18: Chunk Per File | One chunk per source | ✅ VLC works |
| 19: Extended stsc | Proper stsc entries | ✅ VLC works |
| 20: Fix All Tables | Complete rebuild | ✅ VLC works |

**Result:** VLC worked, but QuickTime/iOS still only played first clip.

---

#### Strategies A-E: QuickTime Focus (Before Solution)

| Strategy | Approach | Result |
|----------|----------|--------|
| A: stsc Explicit | Entry per chunk | ❌ First clip only |
| B: Verify Chunks | Offset verification | ❌ First clip only |
| C: stts Per Chunk | Separate stts entries | ❌ First clip only |
| D: ReadBack Verify | Verify durations | ❌ First clip only |
| E: Baseline | Single stsc entry | ❌ First clip only |

**Observation:** All metadata verified correct, but QuickTime still ignored clips 2-4.

---

#### Final Solution: Edit List + ctts

| Strategy | Approach | Result |
|----------|----------|--------|
| **Edit List** | Added edts/elst box | ✅ QuickTime works! |
| Edit List + ctts | Preserved B-frame timing | ✅ Smooth playback! |

**The Key Discovery:** QuickTime requires an Edit List (`elst`) box to understand the presentation timeline. Without it, QuickTime only reads the first segment regardless of correct duration metadata.

**Additional Fix:** Collecting and preserving `ctts` (composition time) entries from all source files fixed jerky playback in clips 2-4 by maintaining correct B-frame timing.

---

## Key Learnings

### 1. VLC is Forgiving, QuickTime is Strict

VLC plays almost anything with valid video data. QuickTime has stricter requirements for exact metadata structure, specifically requiring the Edit List box.

### 2. Edit List is Essential for QuickTime

The `elst` box explicitly tells QuickTime "here's how long this media should play." Without it, QuickTime may only read the first segment even if duration fields are correct.

### 3. Composition Time (ctts) Matters for B-frames

If source videos use B-frames (bidirectional prediction), the `ctts` box specifies the offset between decode time and display time. Concatenating without preserving these entries causes jerky playback.

### 4. File Order Matters Less Than Expected

We tested both normal order (`ftyp` + `mdat` + `moov`) and fast-start (`ftyp` + `moov` + `mdat`). Both work with the Edit List, but normal order was chosen for simplicity.

### 5. Sample Table Structure

For identical source files, a single `stsc` entry works: `{firstChunk: 1, samplesPerChunk: N}`. This tells the player "starting from chunk 1, all chunks have N samples."

---

## Investigation Tools

### MP4Box CLI (GPAC)

```bash
# Install
brew install gpac

# Dump full box structure
mp4box -info video.mp4

# Detailed track info
mp4box -std video.mp4

# Extract specific boxes
mp4box -dump-box moov video.mp4
```

### FFprobe

```bash
# Detailed format info
ffprobe -v error -show_format -show_streams video.mp4

# Frame-level timing
ffprobe -v error -select_streams v -show_frames video.mp4 | head -100
```

### Hex Editor

For byte-level inspection of box headers and content.

---

## References

- [ISO 14496-12 (MPEG-4 Part 12)](https://www.iso.org/standard/83102.html) - Official MP4 specification
- [Apple QuickTime File Format](https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFPreface/qtffPreface.html) - Apple's format documentation
- [MP4Box.js GitHub](https://github.com/nickrename/mp4box.js) - JavaScript MP4 parser
- [Bento4 MP4 Tools](https://www.bento4.com/) - C++ MP4 manipulation library

---

## Conclusion

Client-side MP4 concatenation without re-encoding is achievable but requires careful attention to container structure. The critical insight is that **QuickTime requires an Edit List (elst) box** to understand concatenated media, even when all other duration metadata is correct.

The final solution:
1. Parse all source MP4 files
2. Combine mdat (media data) from all files
3. Rebuild moov with extended sample tables
4. **Add edts/elst box mapping full duration**
5. **Preserve ctts entries for B-frame timing**
6. Output: `ftyp` + `mdat` + `moov`

This produces files that play correctly in VLC, QuickTime, macOS Preview, iOS Photos, and other standards-compliant players.

---

*Document created: December 19, 2025*
*Last updated: December 19, 2025*
*Status: ✅ SOLVED*
