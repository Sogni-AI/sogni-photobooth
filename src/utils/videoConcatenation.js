/**
 * Video Concatenation using MP4Box.js
 * Fast client-side MP4 container stitching without re-encoding
 * 
 * Supports optional M4A audio track muxing (Beta feature)
 */

/**
 * @param {Array} videos - Array of {url, filename} objects
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @param {Object} audioOptions - Optional audio track to add
 * @param {ArrayBuffer} audioOptions.buffer - M4A file buffer
 * @param {number} audioOptions.startOffset - Start offset in seconds (default 0)
 */
export async function concatenateVideos(videos, onProgress = null, audioOptions = null) {

  if (!videos || videos.length === 0) throw new Error('No videos');

  if (videos.length === 1 && !audioOptions) {
    if (onProgress) onProgress(1, 1, 'Downloading video...');
    const response = await fetch(videos[0].url);
    return await response.blob();
  }

  if (onProgress) onProgress(0, videos.length, 'Downloading videos...');

  const videoBuffers = [];
  for (let i = 0; i < videos.length; i++) {
    if (onProgress) onProgress(i, videos.length, `Downloading ${i + 1}/${videos.length}...`);
    try {
      const response = await fetch(videos[i].url);
      if (!response.ok) {
        throw new Error(`Failed to download video ${i + 1}: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('video') && !contentType.includes('mp4') && contentType !== '') {
        console.warn(`Video ${i + 1} has unexpected content-type: ${contentType}`);
      }
      
      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(`Video ${i + 1} downloaded but is empty`);
      }
      
      // Verify it's actually an MP4 by checking for ftyp box at the start
      const view = new DataView(buffer, 0, Math.min(12, buffer.byteLength));
      const size = view.getUint32(0);
      const type = String.fromCharCode(
        view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
      );
      
      if (type !== 'ftyp' || size < 8) {
        throw new Error(`Video ${i + 1} is not a valid MP4 file (missing ftyp box)`);
      }
      
      videoBuffers.push(buffer);
    } catch (error) {
      throw new Error(`Error downloading video ${i + 1} (${videos[i].url}): ${error.message}`);
    }
  }

  if (videoBuffers.length === 0) {
    throw new Error('No videos were successfully downloaded');
  }

  if (videoBuffers.length !== videos.length) {
    throw new Error(`Expected ${videos.length} videos but only downloaded ${videoBuffers.length}`);
  }

  if (onProgress) onProgress(videos.length, videos.length, 'Concatenating...');

  // Use the working strategy: Edit List with normal file order
  let result = await concatenateMP4s_WithEditList(videoBuffers);
  
  // If audio options provided, mux the audio track (Beta feature)
  if (audioOptions && audioOptions.buffer) {
    if (onProgress) onProgress(videos.length, videos.length, 'Adding music track...');
    try {
      result = await muxAudioTrack(result, audioOptions.buffer, audioOptions.startOffset || 0);
    } catch (error) {
      console.error('Failed to add audio track:', error);
      // Continue without audio rather than failing completely
    }
  }
  
  return new Blob([result], { type: 'video/mp4' });
}

/**
 * Concatenate MP4 files with Edit List for QuickTime/iOS compatibility
 * Uses normal file order (ftyp + mdat + moov) with edit list to map timeline
 */
async function concatenateMP4s_WithEditList(buffers) {
  const result = await concatenateMP4s_Base(buffers, {
    fastStart: false,  // Normal order: ftyp + mdat + moov
    singleStscEntry: true,
    addEditList: true,
  });
  return result;
}

// Base function with options for different strategies
async function concatenateMP4s_Base(buffers, options = {}) {
  if (!buffers || buffers.length === 0) {
    throw new Error('No video buffers provided');
  }

  // Parse all files first and validate
  const parsedFiles = [];
  for (let i = 0; i < buffers.length; i++) {
    try {
      const parsed = parseMP4(buffers[i]);
      if (!parsed.ftyp || !parsed.moov || !parsed.mdatData) {
        throw new Error(`Video ${i + 1} is missing required boxes (ftyp, moov, or mdat)`);
      }
      if (parsed.mdatData.byteLength === 0) {
        throw new Error(`Video ${i + 1} has empty mdat data`);
      }
      parsedFiles.push(parsed);
    } catch (error) {
      throw new Error(`Failed to parse video ${i + 1}: ${error.message}`);
    }
  }

  const firstParsed = parsedFiles[0];
  const firstTables = parseSampleTables(firstParsed.moov);
  
  if (!firstTables || firstTables.sampleCount === 0) {
    throw new Error('First video has no samples');
  }

  // Combine mdat
  const mdatParts = parsedFiles.map(p => p.mdatData);
  const combinedMdat = concatArrays(mdatParts);
  const mdat = buildMdat(combinedMdat);

  const ftypSize = firstParsed.ftyp.byteLength;
  const samplesPerFile = firstTables.sampleCount;

  // Build extended tables
  const allSampleSizes = [];
  const chunkOffsets = [];
  const allSttsEntries = []; // Collect stts entries from all files
  const allCttsEntries = []; // Collect ctts entries from all files (for B-frames)
  
  // Calculate base offset - depends on fast start
  // For fast start: ftyp + moov + mdat header
  // For normal: ftyp + mdat header
  // We'll calculate moov size later, so start with a placeholder
  let baseOffset;
  if (options.fastStart) {
    // Will be calculated after moov is built
    baseOffset = null; // Placeholder
  } else {
    baseOffset = ftypSize + 8; // ftyp + mdat header
  }
  
  let mdatDataOffset = 0; // Offset within mdat data
  for (let i = 0; i < parsedFiles.length; i++) {
    const p = parsedFiles[i];
    const t = parseSampleTables(p.moov);
    
    if (!t || !t.sampleSizes || t.sampleSizes.length === 0) {
      throw new Error(`Video ${i + 1} has no sample sizes`);
    }
    
    allSampleSizes.push(...t.sampleSizes);
    
    if (options.fastStart) {
      // For fast start, we'll calculate offsets after moov is built
      chunkOffsets.push(null); // Placeholder
    } else {
      chunkOffsets.push(baseOffset + mdatDataOffset);
    }
    
    mdatDataOffset += p.mdatData.byteLength;
    
    // Collect stts entries if we need them
    if (options.explicitStts || options.rebuildStts || options.preserveOriginalStts) {
      if (t.sttsEntries && t.sttsEntries.length > 0) {
        allSttsEntries.push(...t.sttsEntries);
      } else {
        // Create default stts entry
        allSttsEntries.push({
          count: t.sampleCount,
          delta: t.sampleDelta
        });
      }
    }
    
    // Collect ctts entries from all files
    if (t.cttsEntries && t.cttsEntries.length > 0) {
      allCttsEntries.push(...t.cttsEntries);
    }
  }

  if (allSampleSizes.length === 0) {
    throw new Error('No samples found in any video');
  }

  if (chunkOffsets.length !== parsedFiles.length) {
    throw new Error(`Mismatch: ${chunkOffsets.length} chunks but ${parsedFiles.length} videos`);
  }

  // Build stsc entries
  let stscEntries;
  if (options.stscExplicitRange) {
    // Explicit range format - entries for chunks 1, 2, 3, 4 to make it crystal clear
    // This ensures QuickTime sees there are 4 chunks
    stscEntries = chunkOffsets.map((_, i) => ({
      firstChunk: i + 1,
      samplesPerChunk: samplesPerFile,
      sampleDescriptionIndex: 1,
    }));
  } else if (options.singleStscEntry) {
    // Single entry covering all chunks - QuickTime might prefer this format
    stscEntries = [{
      firstChunk: 1,
      samplesPerChunk: samplesPerFile,
      sampleDescriptionIndex: 1,
    }];
  } else if (options.stscRange) {
    // Explicit range: chunk 1 to last chunk all have same samples
    // Single entry covering all chunks (MP4 spec: applies until next entry or end)
    stscEntries = [{
      firstChunk: 1,
      samplesPerChunk: samplesPerFile,
      sampleDescriptionIndex: 1,
    }];
  } else if (options.stscExplicit || options.oneChunkPerFile || options.stscPerChunk) {
    // Explicit entry for each chunk
    stscEntries = chunkOffsets.map((_, i) => ({
      firstChunk: i + 1,
      samplesPerChunk: samplesPerFile,
      sampleDescriptionIndex: 1,
    }));
  } else {
    // Default: single entry for all chunks
    stscEntries = [{
      firstChunk: 1,
      samplesPerChunk: samplesPerFile,
      sampleDescriptionIndex: 1,
    }];
  }

  // Calculate durations
  const originalDurations = getOriginalDurations(firstParsed.moov);
  const numFiles = parsedFiles.length;
  
  let totalMovieDuration, totalMediaDuration;
  
  if (options.calculateDurationFromSamples) {
    // Calculate from actual sample count and delta
    const totalSamples = allSampleSizes.length;
    const mediaTimescale = firstTables.timescale;
    const movieTimescale = getMovieTimescaleFromMoov(firstParsed.moov) || mediaTimescale;
    
    totalMediaDuration = totalSamples * firstTables.sampleDelta;
    totalMovieDuration = Math.floor(totalMediaDuration * movieTimescale / mediaTimescale);
  } else {
    // Simple multiply
    totalMovieDuration = originalDurations.movieDuration * numFiles;
    totalMediaDuration = originalDurations.mediaDuration * numFiles;
  }

  // Build stts based on strategy
  let sttsEntries;
  if (options.sttsPerChunk) {
    // Separate stts entry for each chunk/file - QuickTime might need this
    sttsEntries = parsedFiles.map(() => ({
      count: samplesPerFile,
      delta: firstTables.sampleDelta
    }));
  } else if (options.preserveOriginalStts && allSttsEntries.length > 0) {
    // Preserve original stts structure from all files
    sttsEntries = allSttsEntries;
  } else if (options.explicitStts && allSttsEntries.length > 0) {
    // Use explicit entries from all files
    sttsEntries = allSttsEntries;
  } else if (options.rebuildStts) {
    // Rebuild as single entry with total count
    sttsEntries = [{
      count: allSampleSizes.length,
      delta: firstTables.sampleDelta
    }];
  } else {
    // Default: single entry with total sample count
    sttsEntries = [{
      count: allSampleSizes.length,
      delta: firstTables.sampleDelta
    }];
  }

  // For fast start, we need to build moov first to know its size
  // Then calculate chunk offsets, then rebuild moov with correct offsets
  let finalChunkOffsets = chunkOffsets;
  
  if (options.fastStart) {
    // Build moov temporarily to get its size
    const tempMoov = rebuildMoovFull(firstParsed.moov, {
      sampleSizes: allSampleSizes,
      chunkOffsets: chunkOffsets.map(() => 0), // Temporary offsets
      stsc: stscEntries,
      sttsEntries: sttsEntries,
      duration: totalMovieDuration,
      mediaDuration: totalMediaDuration,
      timescale: firstTables.timescale,
      sampleDelta: firstTables.sampleDelta,
      syncSamples: buildSyncSamples(firstTables.syncSamples, samplesPerFile, numFiles),
      useCo64: false, // Don't use co64 for temp calculation
    });
    
    const moovSize = tempMoov.byteLength;
    const mdatHeaderSize = 8;
    const baseOffset = ftypSize + moovSize + mdatHeaderSize;
    
    // Calculate actual chunk offsets
    finalChunkOffsets = [];
    let mdatOffset = 0;
    for (let i = 0; i < parsedFiles.length; i++) {
      finalChunkOffsets.push(baseOffset + mdatOffset);
      mdatOffset += parsedFiles[i].mdatData.byteLength;
    }
  } else {
    // For normal layout, ensure offsets are correct
    // Offsets should be: ftyp size + mdat header (8) + offset within mdat
    if (options.verifyChunks) {
      const mdatHeaderSize = 8;
      const expectedBase = ftypSize + mdatHeaderSize;
      let expectedOffset = 0;
      for (let i = 0; i < finalChunkOffsets.length; i++) {
        const expected = expectedBase + expectedOffset;
        if (finalChunkOffsets[i] !== expected) {
          console.warn(`[VerifyChunks] Chunk ${i + 1} offset mismatch: expected ${expected}, got ${finalChunkOffsets[i]}`);
          finalChunkOffsets[i] = expected;
        }
        expectedOffset += parsedFiles[i].mdatData.byteLength;
      }
    }
  }
  
  // Build sync samples for all concatenated files
  const allSyncSamples = buildSyncSamples(firstTables.syncSamples, samplesPerFile, numFiles);

  const newMoov = rebuildMoovFull(firstParsed.moov, {
    sampleSizes: allSampleSizes,
    chunkOffsets: finalChunkOffsets,
    stsc: stscEntries,
    sttsEntries: sttsEntries,
    cttsEntries: allCttsEntries.length > 0 ? allCttsEntries : null,
    duration: totalMovieDuration,
    mediaDuration: totalMediaDuration,
    timescale: firstTables.timescale,
    sampleDelta: firstTables.sampleDelta,
    syncSamples: allSyncSamples,
    addEditList: options.addEditList,
  });

  // Return correct file structure
  let result;
  if (options.fastStart) {
    // Fast start: ftyp + moov + mdat
    result = concatArrays([firstParsed.ftyp, newMoov, mdat]);
  } else {
    // Normal: ftyp + mdat + moov
    result = concatArrays([firstParsed.ftyp, mdat, newMoov]);
  }
  
  // Final validation
  const totalInputSize = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  if (result.byteLength < totalInputSize * 0.5) {
    throw new Error(`Concatenated video is suspiciously small: ${result.byteLength} bytes`);
  }
  
  const resultView = new DataView(result.buffer, result.byteOffset, Math.min(12, result.byteLength));
  const resultType = String.fromCharCode(
    resultView.getUint8(4), resultView.getUint8(5), resultView.getUint8(6), resultView.getUint8(7)
  );
  if (resultType !== 'ftyp') {
    throw new Error('Concatenated result is not a valid MP4 file');
  }
  
  // Verify chunk offsets point to valid locations
  if (options.verifyChunks || options.verifyDataIntegrity) {
    for (let i = 0; i < finalChunkOffsets.length; i++) {
      const offset = finalChunkOffsets[i];
      if (offset < 0 || offset >= result.byteLength) {
        console.warn(`[VerifyChunks] Chunk ${i + 1} offset ${offset} is out of bounds (file size: ${result.byteLength})`);
      } else {
        // Check if offset points to mdat data (not header)
        const view = new DataView(result.buffer, result.byteOffset + offset, 4);
        // Should be valid data, not box header
        const isValid = view.getUint32(0) !== 0;
        if (!isValid && offset > 100) { // Allow some tolerance
          console.warn(`[VerifyChunks] Chunk ${i + 1} offset ${offset} may not point to valid data`);
        }
      }
    }
  }
  
  // Verify data integrity - check sample counts and chunk data
  if (options.verifyDataIntegrity) {
    const expectedTotalSamples = samplesPerFile * numFiles;
    if (allSampleSizes.length !== expectedTotalSamples) {
      console.error(`[VerifyData] Sample count mismatch: expected ${expectedTotalSamples}, got ${allSampleSizes.length}`);
    }
    
    // Verify chunk offsets are sequential and correct
    if (options.fastStart) {
      const moovSize = newMoov.byteLength;
      const mdatHeaderSize = 8;
      const expectedBase = ftypSize + moovSize + mdatHeaderSize;
      let expectedOffset = 0;
      for (let i = 0; i < finalChunkOffsets.length; i++) {
        const expected = expectedBase + expectedOffset;
        if (finalChunkOffsets[i] !== expected) {
          console.error(`[VerifyData] Chunk ${i + 1} offset wrong: expected ${expected}, got ${finalChunkOffsets[i]}`);
        }
        expectedOffset += parsedFiles[i].mdatData.byteLength;
      }
    }
    
    // Verify total sample size matches mdat data size
    const totalSampleSize = allSampleSizes.reduce((sum, size) => sum + size, 0);
    const mdatDataSize = combinedMdat.byteLength;
    if (Math.abs(totalSampleSize - mdatDataSize) > 100) { // Allow some tolerance
      console.warn(`[VerifyData] Sample size mismatch: stsz says ${totalSampleSize} bytes, mdat has ${mdatDataSize} bytes`);
    }
  }
  
  // Verify chunk data is accessible at the specified offsets
  if (options.verifyChunkData) {
    for (let i = 0; i < finalChunkOffsets.length; i++) {
      const offset = finalChunkOffsets[i];
      const expectedDataSize = parsedFiles[i].mdatData.byteLength;
      
      if (offset < 0 || offset >= result.byteLength) {
        console.error(`[VerifyChunkData] Chunk ${i + 1} offset ${offset} is out of bounds (file size: ${result.byteLength})`);
      } else {
        // Check if we can read data at this offset
        const availableBytes = result.byteLength - (result.byteOffset + offset);
        if (availableBytes < expectedDataSize) {
          console.error(`[VerifyChunkData] Chunk ${i + 1} offset ${offset}: only ${availableBytes} bytes available, expected ${expectedDataSize}`);
        } else {
          // Verify the data matches what we expect (check first few bytes)
          const view = new DataView(result.buffer, result.byteOffset + offset, Math.min(16, expectedDataSize));
          const hasData = view.getUint32(0) !== 0 || view.getUint32(4) !== 0;
          if (!hasData) {
            console.warn(`[VerifyChunkData] Chunk ${i + 1} offset ${offset}: data appears to be zeros`);
          } else {
            console.log(`[VerifyChunkData] Chunk ${i + 1} offset ${offset}: ✓ ${expectedDataSize} bytes accessible`);
          }
        }
      }
    }
  }
  
  // Read back and verify durations were written correctly
  if (options.readBackVerify) {
    try {
      // Convert Uint8Array to ArrayBuffer for parsing
      const resultBuffer = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
      const parsed = parseMP4(resultBuffer);
      if (parsed.moov) {
        const readBackDurations = getOriginalDurations(parsed.moov);
        const readBackTables = parseSampleTables(parsed.moov);
        
        console.log(`[ReadBack] mvhd duration: ${readBackDurations.movieDuration} (expected ${totalMovieDuration})`);
        console.log(`[ReadBack] mdhd duration: ${readBackDurations.mediaDuration} (expected ${totalMediaDuration})`);
        console.log(`[ReadBack] Sample count: ${readBackTables.sampleCount} (expected ${allSampleSizes.length})`);
        console.log(`[ReadBack] Chunk count: ${readBackTables.chunkCount} (expected ${finalChunkOffsets.length})`);
        
        if (readBackDurations.movieDuration !== totalMovieDuration) {
          console.error(`[ReadBack] MOVIE DURATION MISMATCH! Written: ${totalMovieDuration}, Read back: ${readBackDurations.movieDuration}`);
        }
        if (readBackDurations.mediaDuration !== totalMediaDuration) {
          console.error(`[ReadBack] MEDIA DURATION MISMATCH! Written: ${totalMediaDuration}, Read back: ${readBackDurations.mediaDuration}`);
        }
        if (readBackTables.sampleCount !== allSampleSizes.length) {
          console.error(`[ReadBack] SAMPLE COUNT MISMATCH! Written: ${allSampleSizes.length}, Read back: ${readBackTables.sampleCount}`);
        }
        if (readBackTables.chunkCount !== finalChunkOffsets.length) {
          console.error(`[ReadBack] CHUNK COUNT MISMATCH! Written: ${finalChunkOffsets.length}, Read back: ${readBackTables.chunkCount}`);
        }
      }
    } catch (error) {
      console.error(`[ReadBack] Failed to parse result:`, error);
    }
  }
  
  return result;
}

// Helper to get movie timescale from moov
function getMovieTimescaleFromMoov(moovData) {
  const buffer = moovData.buffer.slice(moovData.byteOffset, moovData.byteOffset + moovData.byteLength);
  const mvhd = findBox(buffer, 8, buffer.byteLength, 'mvhd');
  if (mvhd) {
    const view = new DataView(buffer, mvhd.start, mvhd.size);
    const version = view.getUint8(8);
    if (version === 0) {
      return view.getUint32(20); // mvhd v0: timescale at offset 20
    } else {
      return view.getUint32(28); // mvhd v1: timescale at offset 28
    }
  }
  return null;
}

// ========== PARSING ==========

function parseMP4(buffer) {
  const view = new DataView(buffer);
  const result = { ftyp: null, moov: null, mdat: null, mdatData: null, mdatStart: 0 };

  let offset = 0;
  while (offset < buffer.byteLength - 8) {
    let size = view.getUint32(offset);
    const type = getBoxType(view, offset + 4);
    
    // Handle extended size (size == 1 means 64-bit size follows)
    let headerSize = 8;
    if (size === 1 && offset + 16 <= buffer.byteLength) {
      // 64-bit size is at offset + 8
      const highBits = view.getUint32(offset + 8);
      const lowBits = view.getUint32(offset + 12);
      // For safety, if high bits are non-zero, clamp to buffer length
      if (highBits > 0) {
        size = buffer.byteLength - offset;
      } else {
        size = lowBits;
      }
      headerSize = 16;
    }
    
    // Safety: size must be at least header size
    if (size < headerSize) break;
    
    // Safety: don't read past end of buffer
    const boxEnd = Math.min(offset + size, buffer.byteLength);
    const actualSize = boxEnd - offset;

    if (type === 'ftyp') {
      result.ftyp = new Uint8Array(buffer, offset, actualSize);
    } else if (type === 'moov') {
      result.moov = new Uint8Array(buffer, offset, actualSize);
    } else if (type === 'mdat') {
      result.mdat = new Uint8Array(buffer, offset, actualSize);
      const dataSize = actualSize - headerSize;
      if (dataSize > 0) {
        result.mdatData = new Uint8Array(buffer, offset + headerSize, dataSize);
      } else {
        result.mdatData = new Uint8Array(0);
      }
      result.mdatStart = offset;
    }

    offset += actualSize;
  }

  return result;
}

function parseSampleTables(moovData) {
  const buffer = moovData.buffer.slice(moovData.byteOffset, moovData.byteOffset + moovData.byteLength);
  const result = {
    sampleSizes: [],
    sampleCount: 0,
    chunkOffsets: [],
    chunkCount: 0,
    syncSamples: [],
    sttsEntries: [], // Time-to-sample entries
    cttsEntries: [], // Composition time offsets (for B-frames)
    duration: 0,
    timescale: 1000,
    sampleDelta: 512,
    width: 0,
    height: 0,
    avcC: null,
  };

  // Find stbl
  const stbl = findNestedBox(buffer, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
  if (!stbl) return result;

  // Parse stsz
  const stsz = findBox(buffer, stbl.contentStart, stbl.end, 'stsz');
  if (stsz) {
    const v = new DataView(buffer, stsz.start, stsz.size);
    const uniformSize = v.getUint32(12);
    const count = v.getUint32(16);
    result.sampleCount = count;

    if (uniformSize === 0) {
      for (let i = 0; i < count; i++) {
        result.sampleSizes.push(v.getUint32(20 + i * 4));
      }
    } else {
      for (let i = 0; i < count; i++) {
        result.sampleSizes.push(uniformSize);
      }
    }
  }

  // Parse stco
  const stco = findBox(buffer, stbl.contentStart, stbl.end, 'stco');
  if (stco) {
    const v = new DataView(buffer, stco.start, stco.size);
    const count = v.getUint32(12);
    result.chunkCount = count;
    for (let i = 0; i < count; i++) {
      result.chunkOffsets.push(v.getUint32(16 + i * 4));
    }
  }

  // Parse stss (sync samples)
  const stss = findBox(buffer, stbl.contentStart, stbl.end, 'stss');
  if (stss) {
    const v = new DataView(buffer, stss.start, stss.size);
    const count = v.getUint32(12);
    for (let i = 0; i < count; i++) {
      result.syncSamples.push(v.getUint32(16 + i * 4));
    }
  }

  // Parse stts
  const stts = findBox(buffer, stbl.contentStart, stbl.end, 'stts');
  if (stts) {
    const v = new DataView(buffer, stts.start, stts.size);
    const entryCount = v.getUint32(12);
    let offset = 16;
    for (let i = 0; i < entryCount; i++) {
      const count = v.getUint32(offset);
      const delta = v.getUint32(offset + 4);
      result.sttsEntries.push({ count, delta });
      if (i === 0) {
        result.sampleDelta = delta; // First entry's delta
      }
      offset += 8;
    }
  }

  // Parse ctts (composition time to sample) - needed for B-frames
  const ctts = findBox(buffer, stbl.contentStart, stbl.end, 'ctts');
  if (ctts) {
    const v = new DataView(buffer, ctts.start, ctts.size);
    const version = v.getUint8(8);
    const entryCount = v.getUint32(12);
    let offset = 16;
    for (let i = 0; i < entryCount; i++) {
      const count = v.getUint32(offset);
      // In version 0, offset is unsigned. In version 1, it's signed.
      const ctOffset = version === 0 ? v.getUint32(offset + 4) : v.getInt32(offset + 4);
      result.cttsEntries.push({ count, offset: ctOffset });
      offset += 8;
    }
  }

  // Parse mvhd for timescale/duration
  const mvhd = findBox(buffer, 0, buffer.byteLength, 'mvhd');
  if (mvhd) {
    const v = new DataView(buffer, mvhd.start, mvhd.size);
    const version = v.getUint8(8);
    if (version === 0) {
      result.timescale = v.getUint32(20);
      result.duration = v.getUint32(24);
    }
  }

  // Parse mdhd for media timescale
  const mdhd = findNestedBox(buffer, ['moov', 'trak', 'mdia', 'mdhd']);
  if (mdhd) {
    const v = new DataView(buffer, mdhd.start, mdhd.size);
    const version = v.getUint8(8);
    if (version === 0) {
      result.timescale = v.getUint32(20);
    }
  }

  // Parse avcC
  const stsd = findBox(buffer, stbl.contentStart, stbl.end, 'stsd');
  if (stsd) {
    const avcC = findBox(buffer, stsd.start + 16, stsd.end, 'avcC');
    if (avcC) {
      result.avcC = new Uint8Array(buffer, avcC.start, avcC.size);
    }
  }

  return result;
}

function findBox(buffer, start, end, type) {
  const view = new DataView(buffer);
  let offset = start;

  while (offset < end - 8) {
    const size = view.getUint32(offset);
    const boxType = getBoxType(view, offset + 4);
    if (size === 0 || offset + size > end) break;
    if (boxType === type) {
      return { start: offset, size, end: offset + size, contentStart: offset + 8 };
    }
    offset += size;
  }
  return null;
}

function findNestedBox(buffer, path) {
  // The buffer is the moov box itself, so skip 'moov' in path if present
  let pathStart = 0;
  if (path[0] === 'moov') {
    pathStart = 1;
  }

  // Start at offset 8 (after moov header)
  let current = { start: 0, end: buffer.byteLength, contentStart: 8 };

  for (let i = pathStart; i < path.length; i++) {
    const found = findBox(buffer, current.contentStart, current.end, path[i]);
    if (!found) return null;
    current = found;
  }

  return current;
}

function getBoxType(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function getOriginalDurations(moovData) {
  const buffer = moovData.buffer.slice(moovData.byteOffset, moovData.byteOffset + moovData.byteLength);

  let movieDuration = 0;
  let mediaDuration = 0;

  // Get mvhd duration
  const mvhd = findBox(buffer, 8, buffer.byteLength, 'mvhd');
  if (mvhd) {
    const view = new DataView(buffer, mvhd.start, mvhd.size);
    const version = view.getUint8(8);
    movieDuration = version === 0 ? view.getUint32(24) : Number(view.getBigUint64(32));
  }

  // Get mdhd duration
  const mdhd = findNestedBox(buffer, ['moov', 'trak', 'mdia', 'mdhd']);
  if (mdhd) {
    const view = new DataView(buffer, mdhd.start, mdhd.size);
    const version = view.getUint8(8);
    mediaDuration = version === 0 ? view.getUint32(24) : Number(view.getBigUint64(32));
  }

  return { movieDuration, mediaDuration };
}

// ========== BUILDING ==========

function buildMdat(data) {
  const size = data.byteLength + 8;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  view.setUint32(0, size);
  result[4] = 0x6D; result[5] = 0x64; result[6] = 0x61; result[7] = 0x74; // mdat
  result.set(data, 8);
  return result;
}

function buildSyncSamples(firstFileSyncs, samplesPerFile, numFiles) {
  const result = [];
  for (let f = 0; f < numFiles; f++) {
    const offset = f * samplesPerFile;
    if (firstFileSyncs && firstFileSyncs.length > 0) {
      for (const sync of firstFileSyncs) {
        result.push(offset + sync);
      }
    } else {
      result.push(offset + 1); // First sample of each file
    }
  }
  return result;
}

function rebuildMoovFull(originalMoov, params) {
  const buffer = originalMoov.buffer.slice(originalMoov.byteOffset, originalMoov.byteOffset + originalMoov.byteLength);
  const originalTables = parseSampleTables(originalMoov);

  // Build new boxes
  const stsz = buildStsz(params.sampleSizes);
  
  // Use co64 (64-bit) only if explicitly requested
  // Don't auto-detect - QuickTime may not like co64 when stco would work
  const useCo64 = params.useCo64 === true;
  const chunkOffsetBox = useCo64 ? buildCo64(params.chunkOffsets) : buildStco(params.chunkOffsets);
  
  const stsc = buildStsc(params.stsc || [{ firstChunk: 1, samplesPerChunk: params.sampleSizes.length, sampleDescriptionIndex: 1 }]);
  
  // Build stts - use custom entries if provided, otherwise default
  let stts;
  if (params.sttsEntries && params.sttsEntries.length > 0) {
    stts = buildSttsFromEntries(params.sttsEntries);
  } else {
    stts = buildStts(params.sampleSizes.length, params.sampleDelta || originalTables.sampleDelta);
  }
  
  const stss = params.syncSamples ? buildStss(params.syncSamples) : null;
  
  // Build ctts (composition time to sample) if provided
  const ctts = params.cttsEntries ? buildCtts(params.cttsEntries) : null;

  // Find original box positions
  const stbl = findNestedBox(buffer, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
  if (!stbl) throw new Error('No stbl found');

  const origStsz = findBox(buffer, stbl.contentStart, stbl.end, 'stsz');
  const origStco = findBox(buffer, stbl.contentStart, stbl.end, 'stco');
  const origCo64 = findBox(buffer, stbl.contentStart, stbl.end, 'co64');
  const origStsc = findBox(buffer, stbl.contentStart, stbl.end, 'stsc');
  const origStts = findBox(buffer, stbl.contentStart, stbl.end, 'stts');
  const origStss = findBox(buffer, stbl.contentStart, stbl.end, 'stss');
  const origCtts = findBox(buffer, stbl.contentStart, stbl.end, 'ctts');

  // Build stbl content with new tables
  const stblParts = [];
  let pos = stbl.contentStart;

  // Copy everything before first replaced box, replacing boxes as we go
  // Handle both stco and co64 - replace whichever exists
  const chunkOffsetOrig = origCo64 || origStco;
  
  // For ctts: if we have new entries, use them; if not and original exists, copy original
  let cttsToUse = ctts;
  if (!cttsToUse && origCtts) {
    // Copy original ctts as-is (preserving B-frame timing from first file only)
    cttsToUse = new Uint8Array(buffer, origCtts.start, origCtts.size);
  }
  
  const boxesToReplace = [
    { orig: origStsz, new: stsz, type: 'stsz' },
    { orig: chunkOffsetOrig, new: chunkOffsetBox, type: useCo64 ? 'co64' : 'stco' },
    { orig: origStsc, new: stsc, type: 'stsc' },
    { orig: origStts, new: stts, type: 'stts' },
    { orig: origStss, new: stss, type: 'stss' },
    { orig: origCtts, new: cttsToUse, type: 'ctts' },
  ].filter(b => b.orig).sort((a, b) => a.orig.start - b.orig.start);
  
  // If we're switching from stco to co64 or vice versa, remove the old one
  if (useCo64 && origStco && !origCo64) {
    // Remove stco from boxesToReplace and add co64
    const stcoIndex = boxesToReplace.findIndex(b => b.orig === origStco);
    if (stcoIndex >= 0) {
      boxesToReplace.splice(stcoIndex, 1);
    }
  } else if (!useCo64 && origCo64 && !origStco) {
    // Remove co64 from boxesToReplace and add stco
    const co64Index = boxesToReplace.findIndex(b => b.orig === origCo64);
    if (co64Index >= 0) {
      boxesToReplace.splice(co64Index, 1);
    }
  }

  pos = stbl.contentStart;
  for (const box of boxesToReplace) {
    if (box.orig.start > pos) {
      stblParts.push(new Uint8Array(buffer, pos, box.orig.start - pos));
    }
    if (box.new) {
      stblParts.push(box.new);
    }
    pos = box.orig.end;
  }

  // Copy remainder of stbl
  if (pos < stbl.end) {
    stblParts.push(new Uint8Array(buffer, pos, stbl.end - pos));
  }

  const newStblContent = concatArrays(stblParts);
  const newStbl = wrapBox('stbl', newStblContent);

  // Rebuild minf with new stbl
  const minf = findNestedBox(buffer, ['moov', 'trak', 'mdia', 'minf']);
  const minfParts = [];
  pos = minf.contentStart;

  // Copy minf content before stbl
  if (stbl.start > pos) {
    minfParts.push(new Uint8Array(buffer, pos, stbl.start - pos));
  }
  minfParts.push(newStbl);
  pos = stbl.end;
  if (pos < minf.end) {
    minfParts.push(new Uint8Array(buffer, pos, minf.end - pos));
  }

  const newMinf = wrapBox('minf', concatArrays(minfParts));

  // Rebuild mdia with new minf and updated mdhd
  const mdia = findNestedBox(buffer, ['moov', 'trak', 'mdia']);
  const mdiaParts = [];
  pos = mdia.contentStart;

  // Update mdhd duration
  const mdhd = findBox(buffer, mdia.contentStart, mdia.end, 'mdhd');
  if (mdhd && mdhd.start >= pos) {
    if (mdhd.start > pos) {
      mdiaParts.push(new Uint8Array(buffer, pos, mdhd.start - pos));
    }
    const mediaDuration = params.mediaDuration || params.duration;
    const newMdhd = updateMdhdDuration(new Uint8Array(buffer, mdhd.start, mdhd.size), mediaDuration);
    mdiaParts.push(newMdhd);
    pos = mdhd.end;
  }

  if (minf.start > pos) {
    mdiaParts.push(new Uint8Array(buffer, pos, minf.start - pos));
  }
  mdiaParts.push(newMinf);
  pos = minf.end;
  if (pos < mdia.end) {
    mdiaParts.push(new Uint8Array(buffer, pos, mdia.end - pos));
  }

  const newMdia = wrapBox('mdia', concatArrays(mdiaParts));

  // Rebuild trak with new mdia and updated tkhd
  const trak = findNestedBox(buffer, ['moov', 'trak']);
  const trakParts = [];
  pos = trak.contentStart;

  // Update tkhd duration
  const tkhd = findBox(buffer, trak.contentStart, trak.end, 'tkhd');
  if (tkhd && tkhd.start >= pos) {
    if (tkhd.start > pos) {
      trakParts.push(new Uint8Array(buffer, pos, tkhd.start - pos));
    }
    const newTkhd = updateTkhdDuration(new Uint8Array(buffer, tkhd.start, tkhd.size), params.duration);
    trakParts.push(newTkhd);
    pos = tkhd.end;
  }

  // Check for existing edts box
  const existingEdts = findBox(buffer, trak.contentStart, trak.end, 'edts');
  
  // Add or replace edts box with edit list if requested
  if (params.addEditList) {
    // Skip existing edts if present
    if (existingEdts && existingEdts.start >= pos && existingEdts.start < mdia.start) {
      if (existingEdts.start > pos) {
        trakParts.push(new Uint8Array(buffer, pos, existingEdts.start - pos));
      }
      pos = existingEdts.end;
    }
    
    // Add new edts box with edit list
    // The segment duration should be in movie timescale
    const newEdts = buildEdts(params.duration, 0);
    trakParts.push(newEdts);
  } else if (existingEdts && existingEdts.start >= pos && existingEdts.start < mdia.start) {
    // Copy existing edts as-is
    if (existingEdts.start > pos) {
      trakParts.push(new Uint8Array(buffer, pos, existingEdts.start - pos));
    }
    trakParts.push(new Uint8Array(buffer, existingEdts.start, existingEdts.size));
    pos = existingEdts.end;
  }

  if (mdia.start > pos) {
    trakParts.push(new Uint8Array(buffer, pos, mdia.start - pos));
  }
  trakParts.push(newMdia);
  pos = mdia.end;
  if (pos < trak.end) {
    trakParts.push(new Uint8Array(buffer, pos, trak.end - pos));
  }

  const newTrak = wrapBox('trak', concatArrays(trakParts));

  // Rebuild moov with new trak and updated mvhd
  const moovParts = [];
  pos = 8; // After moov header

  // Update mvhd duration - search from offset 8 (after moov header) to find child boxes
  const mvhd = findBox(buffer, 8, buffer.byteLength, 'mvhd');
  if (mvhd) {
    const newMvhd = updateMvhdDuration(new Uint8Array(buffer, mvhd.start, mvhd.size), params.duration);
    if (mvhd.start > pos) {
      moovParts.push(new Uint8Array(buffer, pos, mvhd.start - pos));
    }
    moovParts.push(newMvhd);
    pos = mvhd.end;
  }

  if (trak.start > pos) {
    moovParts.push(new Uint8Array(buffer, pos, trak.start - pos));
  }
  moovParts.push(newTrak);
  pos = trak.end;
  if (pos < buffer.byteLength) {
    moovParts.push(new Uint8Array(buffer, pos, buffer.byteLength - pos));
  }

  const newMoov = wrapBox('moov', concatArrays(moovParts));
  
  // Verify durations if requested
  if (params.verifyDurations) {
    const verifyBuffer = newMoov.buffer.slice(newMoov.byteOffset, newMoov.byteOffset + newMoov.byteLength);
    
    // Verify mvhd
    const verifyMvhd = findBox(verifyBuffer, 8, verifyBuffer.byteLength, 'mvhd');
    if (verifyMvhd) {
      const v = new DataView(verifyBuffer, verifyMvhd.start, verifyMvhd.size);
      const version = v.getUint8(8);
      const duration = version === 0 ? v.getUint32(24) : Number(v.getBigUint64(32));
      if (duration !== params.duration) {
        console.warn(`[Verify] mvhd duration mismatch: expected ${params.duration}, got ${duration}`);
      }
    }
    
    // Verify tkhd
    const verifyTkhd = findNestedBox(verifyBuffer, ['moov', 'trak', 'tkhd']);
    if (verifyTkhd) {
      const v = new DataView(verifyBuffer, verifyTkhd.start, verifyTkhd.size);
      const version = v.getUint8(8);
      const duration = version === 0 ? v.getUint32(28) : Number(v.getBigUint64(36));
      if (duration !== params.duration) {
        console.warn(`[Verify] tkhd duration mismatch: expected ${params.duration}, got ${duration}`);
      }
    }
    
    // Verify mdhd
    const verifyMdhd = findNestedBox(verifyBuffer, ['moov', 'trak', 'mdia', 'mdhd']);
    if (verifyMdhd) {
      const v = new DataView(verifyBuffer, verifyMdhd.start, verifyMdhd.size);
      const version = v.getUint8(8);
      const mediaDuration = params.mediaDuration || params.duration;
      const duration = version === 0 ? v.getUint32(24) : Number(v.getBigUint64(32));
      if (duration !== mediaDuration) {
        console.warn(`[Verify] mdhd duration mismatch: expected ${mediaDuration}, got ${duration}`);
      }
    }
  }
  
  return newMoov;
}

/**
 * Build an Edit List (elst) box
 * This maps presentation time to media time
 * Structure (version 0):
 *   - 4 bytes: size
 *   - 4 bytes: 'elst'
 *   - 1 byte: version (0)
 *   - 3 bytes: flags (0)
 *   - 4 bytes: entry count
 *   - For each entry:
 *     - 4 bytes: segment duration (in movie timescale)
 *     - 4 bytes: media time (start in media timescale, or -1 for empty edit)
 *     - 2 bytes: media rate integer (usually 1)
 *     - 2 bytes: media rate fraction (usually 0)
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
  
  // Entry 1: Map entire duration
  view.setUint32(16, segmentDuration);  // segment_duration in movie timescale
  view.setInt32(20, mediaTime);          // media_time (0 = start from beginning)
  view.setInt16(24, 1);                  // media_rate_integer (1x speed)
  view.setInt16(26, 0);                  // media_rate_fraction

  return result;
}

/**
 * Build an Edit (edts) container box containing an elst
 */
function buildEdts(segmentDuration, mediaTime = 0) {
  const elst = buildElst(segmentDuration, mediaTime);
  return wrapBox('edts', elst);
}

function buildStsz(sizes) {
  const size = 20 + sizes.length * 4;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x73; result[5] = 0x74; result[6] = 0x73; result[7] = 0x7A; // stsz
  view.setUint32(8, 0); // version/flags
  view.setUint32(12, 0); // uniform size (0 = variable)
  view.setUint32(16, sizes.length);

  for (let i = 0; i < sizes.length; i++) {
    view.setUint32(20 + i * 4, sizes[i]);
  }

  return result;
}

function buildStco(offsets) {
  const size = 16 + offsets.length * 4;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x73; result[5] = 0x74; result[6] = 0x63; result[7] = 0x6F; // stco
  view.setUint32(8, 0); // version/flags
  view.setUint32(12, offsets.length);

  for (let i = 0; i < offsets.length; i++) {
    view.setUint32(16 + i * 4, offsets[i]);
  }

  return result;
}

function buildCo64(offsets) {
  const size = 16 + offsets.length * 8; // 8 bytes per offset (64-bit)
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x63; result[5] = 0x6F; result[6] = 0x36; result[7] = 0x34; // co64
  view.setUint32(8, 0); // version/flags
  view.setUint32(12, offsets.length);

  for (let i = 0; i < offsets.length; i++) {
    view.setBigUint64(16 + i * 8, BigInt(offsets[i]));
  }

  return result;
}

function buildStsc(entries) {
  const size = 16 + entries.length * 12;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x73; result[5] = 0x74; result[6] = 0x73; result[7] = 0x63; // stsc
  view.setUint32(8, 0); // version/flags
  view.setUint32(12, entries.length);

  for (let i = 0; i < entries.length; i++) {
    view.setUint32(16 + i * 12, entries[i].firstChunk);
    view.setUint32(20 + i * 12, entries[i].samplesPerChunk);
    view.setUint32(24 + i * 12, entries[i].sampleDescriptionIndex);
  }

  return result;
}

function buildStts(sampleCount, delta) {
  const size = 24;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x73; result[5] = 0x74; result[6] = 0x74; result[7] = 0x73; // stts
  view.setUint32(8, 0); // version/flags
  view.setUint32(12, 1); // entry count
  view.setUint32(16, sampleCount);
  view.setUint32(20, delta);

  return result;
}

function buildSttsFromEntries(entries) {
  const size = 16 + entries.length * 8; // header + entries (count + delta each)
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x73; result[5] = 0x74; result[6] = 0x74; result[7] = 0x73; // stts
  view.setUint32(8, 0); // version/flags
  view.setUint32(12, entries.length); // entry count
  
  let offset = 16;
  for (const entry of entries) {
    view.setUint32(offset, entry.count);
    view.setUint32(offset + 4, entry.delta);
    offset += 8;
  }

  return result;
}

function buildStss(syncSamples) {
  const size = 16 + syncSamples.length * 4;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x73; result[5] = 0x74; result[6] = 0x73; result[7] = 0x73; // stss
  view.setUint32(8, 0); // version/flags
  view.setUint32(12, syncSamples.length);

  for (let i = 0; i < syncSamples.length; i++) {
    view.setUint32(16 + i * 4, syncSamples[i]);
  }

  return result;
}

/**
 * Build ctts (composition time to sample) box
 * This is needed when videos have B-frames
 */
function buildCtts(entries) {
  if (!entries || entries.length === 0) return null;
  
  const size = 16 + entries.length * 8;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  result[4] = 0x63; result[5] = 0x74; result[6] = 0x74; result[7] = 0x73; // ctts
  view.setUint32(8, 0); // version 0 + flags
  view.setUint32(12, entries.length);

  let offset = 16;
  for (const entry of entries) {
    view.setUint32(offset, entry.count);
    view.setUint32(offset + 4, entry.offset);
    offset += 8;
  }

  return result;
}

function updateMvhdDuration(mvhdData, newDuration) {
  const result = new Uint8Array(mvhdData.length);
  result.set(mvhdData);
  const view = new DataView(result.buffer);
  const version = view.getUint8(8);

  if (version === 0) {
    view.setUint32(24, newDuration); // mvhd v0: duration at offset 24
  } else {
    view.setBigUint64(32, BigInt(newDuration)); // mvhd v1: duration at offset 32
  }

  return result;
}

function updateTkhdDuration(tkhdData, newDuration) {
  const result = new Uint8Array(tkhdData.length);
  result.set(tkhdData);
  const view = new DataView(result.buffer);
  const version = view.getUint8(8);

  if (version === 0) {
    view.setUint32(28, newDuration); // tkhd v0: duration at offset 28
  } else {
    view.setBigUint64(36, BigInt(newDuration)); // tkhd v1: duration at offset 36
  }

  return result;
}

function updateMdhdDuration(mdhdData, newDuration) {
  const result = new Uint8Array(mdhdData.length);
  result.set(mdhdData);
  const view = new DataView(result.buffer);
  const version = view.getUint8(8);

  if (version === 0) {
    view.setUint32(24, newDuration); // mdhd v0: duration at offset 24
  } else {
    view.setBigUint64(32, BigInt(newDuration)); // mdhd v1: duration at offset 32
  }

  return result;
}

function wrapBox(type, content) {
  const size = 8 + content.byteLength;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);

  view.setUint32(0, size);
  for (let i = 0; i < 4; i++) {
    result[4 + i] = type.charCodeAt(i);
  }
  result.set(content, 8);

  return result;
}

function concatArrays(arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.byteLength;
  }
  return result;
}

// ========== AUDIO MUXING (Beta) ==========

/**
 * Mux an audio track from an M4A file into a video MP4
 * Beta feature: Only supports M4A/AAC audio files
 * 
 * @param {Uint8Array} videoData - The concatenated video MP4
 * @param {ArrayBuffer} audioBuffer - The M4A audio file
 * @param {number} startOffset - Audio start offset in seconds
 * @returns {Uint8Array} - Combined video+audio MP4
 */
async function muxAudioTrack(videoData, audioBuffer, startOffset = 0) {
  // Parse the video MP4
  const videoArrayBuffer = videoData.buffer.slice(
    videoData.byteOffset,
    videoData.byteOffset + videoData.byteLength
  );
  const video = parseMP4(videoArrayBuffer);
  
  if (!video.ftyp || !video.moov || !video.mdatData) {
    throw new Error('Invalid video MP4 structure');
  }
  
  // Parse the M4A audio file
  const audio = parseMP4(audioBuffer);
  
  if (!audio.moov || !audio.mdatData) {
    throw new Error('Invalid M4A file - missing moov or mdat');
  }
  
  // Extract audio track from M4A
  const audioTrack = extractAudioTrack(audioBuffer);
  
  if (!audioTrack) {
    throw new Error('Could not extract audio track from M4A file');
  }
  
  // Get video duration from moov
  const videoDurations = getOriginalDurations(video.moov);
  const videoTimescale = getMovieTimescaleFromMoov(video.moov) || 1000;
  const videoDurationSeconds = videoDurations.movieDuration / videoTimescale;
  
  // Calculate how much audio we need (video duration)
  // And apply the start offset
  const audioTimescale = audioTrack.timescale || 44100;
  const startOffsetUnits = Math.floor(startOffset * audioTimescale);
  
  // Trim audio samples to match video duration and apply offset
  const trimmedAudio = trimAudioSamples(
    audioTrack,
    startOffsetUnits,
    videoDurationSeconds,
    audioTimescale
  );
  
  // Build new mdat with video + audio data
  const combinedMdatData = concatArrays([video.mdatData, trimmedAudio.mdatData]);
  const newMdat = buildMdat(combinedMdatData);
  
  // Calculate audio chunk offset (after ftyp + mdat header + video mdat)
  const audioChunkOffset = video.ftyp.byteLength + 8 + video.mdatData.byteLength;
  
  // Build new moov with both video and audio tracks
  const newMoov = rebuildMoovWithAudio(
    video.moov,
    audioTrack,
    trimmedAudio,
    audioChunkOffset,
    videoDurations.movieDuration
  );
  
  // Combine: ftyp + mdat + moov
  return concatArrays([video.ftyp, newMdat, newMoov]);
}

/**
 * Extract audio track information from an M4A file
 */
function extractAudioTrack(buffer) {
  const parsed = parseMP4(buffer);
  if (!parsed.moov) return null;
  
  const moovBuffer = parsed.moov.buffer.slice(
    parsed.moov.byteOffset,
    parsed.moov.byteOffset + parsed.moov.byteLength
  );
  
  // Find audio track (trak with mdia/hdlr type 'soun')
  const trak = findAudioTrak(moovBuffer);
  if (!trak) return null;
  
  // Extract stbl (sample table)
  const stbl = findNestedBox(moovBuffer, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
  if (!stbl) return null;
  
  // Parse sample tables
  const stsz = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stsz');
  const stco = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stco');
  const stsc = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stsc');
  const stts = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stts');
  const stsd = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stsd');
  
  // Get sample sizes
  const sampleSizes = [];
  if (stsz) {
    const v = new DataView(moovBuffer, stsz.start, stsz.size);
    const uniformSize = v.getUint32(12);
    const count = v.getUint32(16);
    
    if (uniformSize === 0) {
      for (let i = 0; i < count; i++) {
        sampleSizes.push(v.getUint32(20 + i * 4));
      }
    } else {
      for (let i = 0; i < count; i++) {
        sampleSizes.push(uniformSize);
      }
    }
  }
  
  // Get chunk offsets
  const chunkOffsets = [];
  if (stco) {
    const v = new DataView(moovBuffer, stco.start, stco.size);
    const count = v.getUint32(12);
    for (let i = 0; i < count; i++) {
      chunkOffsets.push(v.getUint32(16 + i * 4));
    }
  }
  
  // Get sample-to-chunk mapping
  const stscEntries = [];
  if (stsc) {
    const v = new DataView(moovBuffer, stsc.start, stsc.size);
    const count = v.getUint32(12);
    for (let i = 0; i < count; i++) {
      stscEntries.push({
        firstChunk: v.getUint32(16 + i * 12),
        samplesPerChunk: v.getUint32(20 + i * 12),
        sampleDescriptionIndex: v.getUint32(24 + i * 12)
      });
    }
  }
  
  // Get time-to-sample
  const sttsEntries = [];
  let sampleDelta = 1024; // Default for AAC
  if (stts) {
    const v = new DataView(moovBuffer, stts.start, stts.size);
    const count = v.getUint32(12);
    for (let i = 0; i < count; i++) {
      const sampleCount = v.getUint32(16 + i * 8);
      const delta = v.getUint32(20 + i * 8);
      sttsEntries.push({ count: sampleCount, delta });
      if (i === 0) sampleDelta = delta;
    }
  }
  
  // Get audio format from stsd
  let stsdBox = null;
  if (stsd) {
    stsdBox = new Uint8Array(moovBuffer, stsd.start, stsd.size);
  }
  
  // Get mdhd for timescale
  const mdhd = findNestedBox(moovBuffer, ['moov', 'trak', 'mdia', 'mdhd']);
  let timescale = 44100;
  let duration = 0;
  if (mdhd) {
    const v = new DataView(moovBuffer, mdhd.start, mdhd.size);
    const version = v.getUint8(8);
    if (version === 0) {
      timescale = v.getUint32(20);
      duration = v.getUint32(24);
    } else {
      timescale = v.getUint32(28);
      duration = Number(v.getBigUint64(32));
    }
  }
  
  // Extract the audio trak box for later use
  const trakBox = new Uint8Array(moovBuffer, trak.start, trak.size);
  
  // Get raw audio data from mdat
  const mdatData = parsed.mdatData;
  
  return {
    trakBox,
    stsdBox,
    sampleSizes,
    chunkOffsets,
    stscEntries,
    sttsEntries,
    sampleDelta,
    timescale,
    duration,
    mdatData
  };
}

/**
 * Find audio trak in moov (handler type 'soun')
 */
function findAudioTrak(buffer) {
  const view = new DataView(buffer);
  let offset = 8; // Skip moov header
  
  while (offset < buffer.byteLength - 8) {
    const size = view.getUint32(offset);
    const type = getBoxType(view, offset + 4);
    
    if (size === 0 || offset + size > buffer.byteLength) break;
    
    if (type === 'trak') {
      // Check if this is an audio track by looking at hdlr
      const hdlr = findNestedBoxInRange(buffer, offset + 8, offset + size, ['mdia', 'hdlr']);
      if (hdlr) {
        const hdlrView = new DataView(buffer, hdlr.start, hdlr.size);
        // Handler type is at offset 16 (after header + version/flags + pre_defined)
        const handlerType = getBoxType(hdlrView, 16);
        if (handlerType === 'soun') {
          return { start: offset, size, end: offset + size, contentStart: offset + 8 };
        }
      }
    }
    
    offset += size;
  }
  
  return null;
}

/**
 * Find a nested box within a specific range
 */
function findNestedBoxInRange(buffer, start, end, path) {
  let current = { start, end, contentStart: start };
  
  for (const boxType of path) {
    const found = findBox(buffer, current.contentStart, current.end, boxType);
    if (!found) return null;
    current = found;
  }
  
  return current;
}

/**
 * Trim audio samples to fit video duration with offset
 */
function trimAudioSamples(audioTrack, startOffsetUnits, videoDurationSeconds, audioTimescale) {
  const samplesNeeded = Math.ceil(videoDurationSeconds * audioTimescale / audioTrack.sampleDelta);
  const startSample = Math.floor(startOffsetUnits / audioTrack.sampleDelta);
  
  // Calculate which samples to include
  const totalSamples = audioTrack.sampleSizes.length;
  const endSample = Math.min(startSample + samplesNeeded, totalSamples);
  const actualStartSample = Math.min(startSample, totalSamples - 1);
  
  // Get the sample sizes for the range we need
  const trimmedSampleSizes = audioTrack.sampleSizes.slice(actualStartSample, endSample);
  
  // Calculate byte offsets for the samples we need
  // This is simplified - assumes contiguous samples in mdat
  let byteStart = 0;
  for (let i = 0; i < actualStartSample; i++) {
    byteStart += audioTrack.sampleSizes[i];
  }
  
  let byteLength = 0;
  for (let i = actualStartSample; i < endSample; i++) {
    byteLength += audioTrack.sampleSizes[i];
  }
  
  // Extract the audio data for these samples
  const trimmedMdatData = new Uint8Array(
    audioTrack.mdatData.buffer,
    audioTrack.mdatData.byteOffset + byteStart,
    Math.min(byteLength, audioTrack.mdatData.byteLength - byteStart)
  );
  
  // Calculate new duration
  const newDuration = trimmedSampleSizes.length * audioTrack.sampleDelta;
  
  return {
    sampleSizes: trimmedSampleSizes,
    mdatData: trimmedMdatData,
    duration: newDuration,
    timescale: audioTrack.timescale,
    sampleDelta: audioTrack.sampleDelta,
    stsdBox: audioTrack.stsdBox
  };
}

/**
 * Rebuild moov with both video and audio tracks
 */
function rebuildMoovWithAudio(videoMoov, originalAudioTrack, trimmedAudio, audioOffset, movieDuration) {
  const videoBuffer = videoMoov.buffer.slice(
    videoMoov.byteOffset,
    videoMoov.byteOffset + videoMoov.byteLength
  );
  
  // Build a new audio trak box
  const audioTrak = buildAudioTrak(
    originalAudioTrack,
    trimmedAudio,
    audioOffset,
    movieDuration
  );
  
  // Find the end of the last trak in the original moov
  const view = new DataView(videoBuffer);
  let lastTrakEnd = 8; // After moov header
  let offset = 8;
  
  while (offset < videoBuffer.byteLength - 8) {
    const size = view.getUint32(offset);
    const type = getBoxType(view, offset + 4);
    
    if (size === 0 || offset + size > videoBuffer.byteLength) break;
    
    if (type === 'trak') {
      lastTrakEnd = offset + size;
    }
    
    offset += size;
  }
  
  // Build new moov: everything up to last trak end + new audio trak + remainder
  const beforeAudioTrak = new Uint8Array(videoBuffer, 0, lastTrakEnd);
  const afterAudioTrak = new Uint8Array(videoBuffer, lastTrakEnd, videoBuffer.byteLength - lastTrakEnd);
  
  const newMoovContent = concatArrays([
    new Uint8Array(beforeAudioTrak.buffer, beforeAudioTrak.byteOffset + 8, beforeAudioTrak.byteLength - 8), // Skip moov header
    audioTrak,
    afterAudioTrak
  ]);
  
  return wrapBox('moov', newMoovContent);
}

/**
 * Build audio trak box with correct sample tables
 */
function buildAudioTrak(originalAudioTrack, trimmedAudio, chunkOffset, movieDuration) {
  // Build tkhd (track header)
  const tkhd = buildAudioTkhd(movieDuration, 2); // Track ID 2 for audio
  
  // Build mdia (media container)
  const mdia = buildAudioMdia(originalAudioTrack, trimmedAudio, chunkOffset);
  
  // Build edts with elst for the audio track
  const edts = buildEdts(movieDuration, 0);
  
  // Combine into trak
  const trakContent = concatArrays([tkhd, edts, mdia]);
  return wrapBox('trak', trakContent);
}

/**
 * Build audio tkhd (track header)
 */
function buildAudioTkhd(duration, trackId) {
  // tkhd v0: 92 bytes
  const size = 92;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  
  view.setUint32(0, size);
  result[4] = 0x74; result[5] = 0x6B; result[6] = 0x68; result[7] = 0x64; // tkhd
  
  // Version 0, flags 0x000007 (track enabled, in movie, in preview)
  view.setUint32(8, 0x00000007);
  
  // Creation/modification time (0 for simplicity)
  view.setUint32(12, 0);
  view.setUint32(16, 0);
  
  // Track ID
  view.setUint32(20, trackId);
  
  // Reserved
  view.setUint32(24, 0);
  
  // Duration
  view.setUint32(28, duration);
  
  // Reserved (8 bytes)
  view.setUint32(32, 0);
  view.setUint32(36, 0);
  
  // Layer and alternate group
  view.setInt16(40, 0);
  view.setInt16(42, 0);
  
  // Volume (1.0 for audio)
  view.setInt16(44, 0x0100);
  
  // Reserved
  view.setInt16(46, 0);
  
  // Matrix (identity) - 36 bytes
  const matrix = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];
  for (let i = 0; i < 9; i++) {
    view.setInt32(48 + i * 4, matrix[i]);
  }
  
  // Width and height (0 for audio)
  view.setUint32(84, 0);
  view.setUint32(88, 0);
  
  return result;
}

/**
 * Build audio mdia container
 */
function buildAudioMdia(originalAudioTrack, trimmedAudio, chunkOffset) {
  // Build mdhd
  const mdhd = buildAudioMdhd(trimmedAudio.duration, trimmedAudio.timescale);
  
  // Build hdlr
  const hdlr = buildAudioHdlr();
  
  // Build minf
  const minf = buildAudioMinf(originalAudioTrack, trimmedAudio, chunkOffset);
  
  const mdiaContent = concatArrays([mdhd, hdlr, minf]);
  return wrapBox('mdia', mdiaContent);
}

/**
 * Build audio mdhd (media header)
 */
function buildAudioMdhd(duration, timescale) {
  const size = 32;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  
  view.setUint32(0, size);
  result[4] = 0x6D; result[5] = 0x64; result[6] = 0x68; result[7] = 0x64; // mdhd
  
  // Version 0, flags 0
  view.setUint32(8, 0);
  
  // Creation/modification time
  view.setUint32(12, 0);
  view.setUint32(16, 0);
  
  // Timescale
  view.setUint32(20, timescale);
  
  // Duration
  view.setUint32(24, duration);
  
  // Language (und) and pre_defined
  view.setUint16(28, 0x55C4); // 'und' packed
  view.setUint16(30, 0);
  
  return result;
}

/**
 * Build audio hdlr (handler reference)
 */
function buildAudioHdlr() {
  const size = 37;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  
  view.setUint32(0, size);
  result[4] = 0x68; result[5] = 0x64; result[6] = 0x6C; result[7] = 0x72; // hdlr
  
  // Version 0, flags 0
  view.setUint32(8, 0);
  
  // Pre-defined
  view.setUint32(12, 0);
  
  // Handler type: 'soun'
  result[16] = 0x73; result[17] = 0x6F; result[18] = 0x75; result[19] = 0x6E;
  
  // Reserved (12 bytes)
  view.setUint32(20, 0);
  view.setUint32(24, 0);
  view.setUint32(28, 0);
  
  // Name (null-terminated string)
  result[32] = 0x53; // 'S'
  result[33] = 0x6F; // 'o'
  result[34] = 0x75; // 'u'
  result[35] = 0x6E; // 'n'
  result[36] = 0x00; // null terminator
  
  return result;
}

/**
 * Build audio minf container
 */
function buildAudioMinf(originalAudioTrack, trimmedAudio, chunkOffset) {
  // Build smhd (sound media header)
  const smhd = buildSmhd();
  
  // Build dinf (data information)
  const dinf = buildDinf();
  
  // Build stbl (sample table)
  const stbl = buildAudioStbl(originalAudioTrack, trimmedAudio, chunkOffset);
  
  const minfContent = concatArrays([smhd, dinf, stbl]);
  return wrapBox('minf', minfContent);
}

/**
 * Build smhd (sound media header)
 */
function buildSmhd() {
  const size = 16;
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  
  view.setUint32(0, size);
  result[4] = 0x73; result[5] = 0x6D; result[6] = 0x68; result[7] = 0x64; // smhd
  
  // Version 0, flags 0
  view.setUint32(8, 0);
  
  // Balance (0 = center) and reserved
  view.setInt16(12, 0);
  view.setInt16(14, 0);
  
  return result;
}

/**
 * Build dinf (data information)
 */
function buildDinf() {
  // Build dref with a single 'url ' entry
  const urlEntry = new Uint8Array(12);
  const urlView = new DataView(urlEntry.buffer);
  urlView.setUint32(0, 12);
  urlEntry[4] = 0x75; urlEntry[5] = 0x72; urlEntry[6] = 0x6C; urlEntry[7] = 0x20; // 'url '
  urlView.setUint32(8, 0x00000001); // Self-contained flag
  
  const drefContent = new Uint8Array(8 + urlEntry.length);
  const drefView = new DataView(drefContent.buffer);
  drefView.setUint32(0, 0); // version/flags
  drefView.setUint32(4, 1); // entry count
  drefContent.set(urlEntry, 8);
  
  const dref = wrapBox('dref', drefContent);
  return wrapBox('dinf', dref);
}

/**
 * Build audio stbl (sample table)
 */
function buildAudioStbl(originalAudioTrack, trimmedAudio, chunkOffset) {
  // Use the original stsd if available, otherwise build a basic one
  const stsd = originalAudioTrack.stsdBox || buildBasicAudioStsd(trimmedAudio.timescale);
  
  // Build stsz
  const stsz = buildStsz(trimmedAudio.sampleSizes);
  
  // Build stco (single chunk at the offset)
  const stco = buildStco([chunkOffset]);
  
  // Build stsc (all samples in one chunk)
  const stsc = buildStsc([{
    firstChunk: 1,
    samplesPerChunk: trimmedAudio.sampleSizes.length,
    sampleDescriptionIndex: 1
  }]);
  
  // Build stts
  const stts = buildStts(trimmedAudio.sampleSizes.length, trimmedAudio.sampleDelta);
  
  const stblContent = concatArrays([stsd, stsz, stco, stsc, stts]);
  return wrapBox('stbl', stblContent);
}

/**
 * Build a basic audio stsd for AAC
 */
function buildBasicAudioStsd(sampleRate) {
  // This is a simplified stsd for AAC audio
  // In practice, we should copy from the source M4A
  const mp4aSize = 36;
  const stsdSize = 16 + mp4aSize;
  
  const result = new Uint8Array(stsdSize);
  const view = new DataView(result.buffer);
  
  // stsd header
  view.setUint32(0, stsdSize);
  result[4] = 0x73; result[5] = 0x74; result[6] = 0x73; result[7] = 0x64; // stsd
  view.setUint32(8, 0); // version/flags
  view.setUint32(12, 1); // entry count
  
  // mp4a entry (simplified)
  const mp4aOffset = 16;
  view.setUint32(mp4aOffset, mp4aSize);
  result[mp4aOffset + 4] = 0x6D; result[mp4aOffset + 5] = 0x70;
  result[mp4aOffset + 6] = 0x34; result[mp4aOffset + 7] = 0x61; // mp4a
  
  // Reserved (6 bytes) + data reference index
  view.setUint16(mp4aOffset + 14, 1);
  
  // Audio specific
  view.setUint16(mp4aOffset + 24, 2); // Channel count
  view.setUint16(mp4aOffset + 26, 16); // Sample size
  view.setUint32(mp4aOffset + 32, sampleRate << 16); // Sample rate (fixed point)
  
  return result;
}

export function isFFmpegSupported() {
  return true;
}
