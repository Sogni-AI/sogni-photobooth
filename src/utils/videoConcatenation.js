/**
 * Video Concatenation using MP4Box.js
 * Fast client-side MP4 container stitching without re-encoding
 *
 * Supports optional M4A audio track muxing (Beta feature)
 * Supports preserving source audio from videos with embedded audio tracks
 */

import { fetchWithRetry } from './index';

/**
 * @param {Array} videos - Array of {url, filename} objects
 * @param {Function} onProgress - Progress callback (current, total, message)
 * @param {Object} audioOptions - Optional audio track to add
 * @param {ArrayBuffer} audioOptions.buffer - M4A file buffer
 * @param {number} audioOptions.startOffset - Start offset in seconds (default 0)
 * @param {boolean|Object} preserveSourceAudio - If true, preserve audio from all source videos
 *        If object: { enabled: true, sourceIndices: [0, 2, 4] } to specify which videos have audio
 *        This is useful for infinite loop stitch where only main videos (not transitions) have audio
 */
export async function concatenateVideos(videos, onProgress = null, audioOptions = null, preserveSourceAudio = false) {

  if (!videos || videos.length === 0) throw new Error('No videos');

  if (videos.length === 1 && !audioOptions) {
    if (onProgress) onProgress(1, 1, 'Downloading video...');
    const response = await fetchWithRetry(videos[0].url, undefined, {
      context: 'Video Download',
      maxRetries: 2,
      initialDelay: 1000
    });
    return await response.blob();
  }

  if (onProgress) onProgress(0, videos.length, 'Downloading videos...');

  const videoBuffers = [];
  for (let i = 0; i < videos.length; i++) {
    if (onProgress) onProgress(i, videos.length, `Downloading ${i + 1}/${videos.length}...`);
    try {
      const response = await fetchWithRetry(videos[i].url, undefined, {
        context: `Video ${i + 1} Download`,
        maxRetries: 2,
        initialDelay: 1000
      });
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

  // Use the working strategy: Extract + combine ctts for B-frame support
  let result = await concatenateMP4s_WithEditList(videoBuffers, 'CO');
  
  // If preserveSourceAudio is requested, try to extract and concatenate audio from source videos
  if (preserveSourceAudio && !audioOptions) {
    if (onProgress) onProgress(videos.length, videos.length, 'Preserving audio tracks...');
    try {
      // Determine which buffers to extract audio from
      let audioBuffers = videoBuffers;
      let loopAudioToFullDuration = false;
      
      if (typeof preserveSourceAudio === 'object' && preserveSourceAudio.sourceIndices) {
        // Only extract audio from specified indices (e.g., main videos in infinite loop stitch)
        audioBuffers = preserveSourceAudio.sourceIndices.map(i => videoBuffers[i]);
        loopAudioToFullDuration = true; // Loop audio to fill transitions
        console.log(`[Concatenate] Extracting audio from ${audioBuffers.length} source videos (indices: ${preserveSourceAudio.sourceIndices.join(', ')})`);
      }
      
      const concatenatedAudio = concatenateSourceAudioTracks(audioBuffers);
      if (concatenatedAudio) {
        console.log('[Concatenate] Extracted audio from source videos, muxing into result...');
        // If we're looping audio (infinite loop stitch), pass null to let muxConcatenatedAudio
        // determine the video duration and loop audio to fill it
        result = muxConcatenatedAudio(result, concatenatedAudio, loopAudioToFullDuration ? null : null);
        console.log('[Concatenate] Audio successfully preserved' + (loopAudioToFullDuration ? ' (looped to fill full duration)' : ''));
      } else {
        console.log('[Concatenate] No audio tracks found in source videos, proceeding video-only');
      }
    } catch (error) {
      console.warn('[Concatenate] Failed to preserve source audio:', error.message);
      // Continue without audio rather than failing completely
    }
  }
  
  // If audio options provided, mux the audio track (Beta feature - external audio file)
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
async function concatenateMP4s_WithEditList(buffers, strategy = 'CO') {
  const options = {
    // CO strategy: Extract video+audio samples, combine ctts entries for B-frame support
    extractedWithProperCtts: true,
  };
  
  // Legacy strategy support (CO is the working solution)
  if (strategy !== 'CO') {
    console.warn(`[Concatenate] Strategy ${strategy} is deprecated, using CO`);
  }
  
  console.log('[Concatenate] Using CO strategy (extract + ctts)');
  const result = await concatenateMP4s_Base(buffers, options);
  return result;
}

// Base function for MP4 concatenation (uses CO strategy - extract + ctts)
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
      // Store the original buffer for video sample extraction
      parsed.originalBuffer = buffers[i];
      parsedFiles.push(parsed);
    } catch (error) {
      throw new Error(`Failed to parse video ${i + 1}: ${error.message}`);
    }
  }

  const firstParsed = parsedFiles[0];
  const firstTables = parseSampleTables(firstParsed.moov, options.useVideoTrackDetection);
  
  if (!firstTables || firstTables.sampleCount === 0) {
    throw new Error('First video has no samples');
  }

  // =====================================================================
  // NEW STRATEGIES CO-CS: Fix Preview stutter via ctts handling
  // B-frames need ctts (composition time to sample) for correct display order
  // =====================================================================

  // Strategy CO: CF + extract and combine ctts entries
  if (options.extractedWithProperCtts) {
    console.log('[Strategy CO] Extracted video + audio + proper ctts');
    
    const file1 = parsedFiles[0];
    const file1MoovBuffer = file1.moov.buffer.slice(file1.moov.byteOffset, file1.moov.byteOffset + file1.moov.byteLength);
    
    const mvhd = findBox(file1MoovBuffer, 8, file1MoovBuffer.byteLength, 'mvhd');
    const mvhdView = new DataView(file1MoovBuffer, mvhd.start, mvhd.size);
    const movieTimescale = mvhdView.getUint8(8) === 0 ? mvhdView.getUint32(20) : mvhdView.getUint32(28);
    
    const videoTrak = findVideoTrak(file1MoovBuffer);
    const audioTrak = findAudioTrak(file1MoovBuffer);
    const videoMdia = findBox(file1MoovBuffer, videoTrak.contentStart, videoTrak.end, 'mdia');
    const videoMdhd = findBox(file1MoovBuffer, videoMdia.contentStart, videoMdia.end, 'mdhd');
    const videoMdhdView = new DataView(file1MoovBuffer, videoMdhd.start, videoMdhd.size);
    const videoTimescale = videoMdhdView.getUint8(8) === 0 ? videoMdhdView.getUint32(20) : videoMdhdView.getUint32(28);
    
    // Extract video samples AND ctts entries
    const allVideoSizes = [];
    const allVideoSamples = [];
    const allCttsEntries = []; // Array of {sampleCount, sampleOffset}
    
    for (let fileIdx = 0; fileIdx < parsedFiles.length; fileIdx++) {
      const p = parsedFiles[fileIdx];
      const moovBuf = p.moov.buffer.slice(p.moov.byteOffset, p.moov.byteOffset + p.moov.byteLength);
      const origBuf = new Uint8Array(buffers[fileIdx]);
      
      const vTrak = findVideoTrak(moovBuf);
      if (!vTrak) continue;
      
      const stbl = findNestedBoxInRange(moovBuf, vTrak.contentStart, vTrak.end, ['mdia', 'minf', 'stbl']);
      const stsz = findBox(moovBuf, stbl.contentStart, stbl.end, 'stsz');
      const stco = findBox(moovBuf, stbl.contentStart, stbl.end, 'stco');
      const stsc = findBox(moovBuf, stbl.contentStart, stbl.end, 'stsc');
      const ctts = findBox(moovBuf, stbl.contentStart, stbl.end, 'ctts');
      
      // Extract ctts entries for this file
      if (ctts) {
        const cttsView = new DataView(moovBuf, ctts.start, ctts.size);
        const entryCount = cttsView.getUint32(12);
        console.log(`[CO] File ${fileIdx} has ${entryCount} ctts entries`);
        for (let i = 0; i < entryCount; i++) {
          allCttsEntries.push({
            sampleCount: cttsView.getUint32(16 + i * 8),
            sampleOffset: cttsView.getInt32(20 + i * 8) // Can be negative in version 1
          });
        }
      } else {
        console.log(`[CO] File ${fileIdx} has NO ctts box`);
      }
      
      const stszView = new DataView(moovBuf, stsz.start, stsz.size);
      const stcoView = new DataView(moovBuf, stco.start, stco.size);
      const sampleCount = stszView.getUint32(16);
      const chunkCount = stcoView.getUint32(12);
      
      const sampleSizes = [];
      for (let i = 0; i < sampleCount; i++) sampleSizes.push(stszView.getUint32(20 + i * 4));
      const chunkOffsets = [];
      for (let i = 0; i < chunkCount; i++) chunkOffsets.push(stcoView.getUint32(16 + i * 4));
      
      const stscEntries = [];
      if (stsc) {
        const stscView = new DataView(moovBuf, stsc.start, stsc.size);
        const entryCount = stscView.getUint32(12);
        for (let i = 0; i < entryCount; i++) {
          stscEntries.push({
            firstChunk: stscView.getUint32(16 + i * 12),
            samplesPerChunk: stscView.getUint32(20 + i * 12)
          });
        }
      }
      
      let sampleIdx = 0;
      for (let chunkIdx = 0; chunkIdx < chunkCount && sampleIdx < sampleCount; chunkIdx++) {
        let samplesInChunk = 1;
        for (const entry of stscEntries) {
          if (entry.firstChunk <= chunkIdx + 1) samplesInChunk = entry.samplesPerChunk;
        }
        let byteOffset = chunkOffsets[chunkIdx];
        for (let s = 0; s < samplesInChunk && sampleIdx < sampleCount; s++) {
          const sampleSize = sampleSizes[sampleIdx];
          if (byteOffset + sampleSize <= origBuf.length) {
            allVideoSamples.push(origBuf.slice(byteOffset, byteOffset + sampleSize));
            allVideoSizes.push(sampleSize);
          }
          byteOffset += sampleSize;
          sampleIdx++;
        }
      }
    }
    
    // Extract audio samples
    const allAudioSizes = [];
    const allAudioSamples = [];
    let audioSampleDelta = 1024;
    let audioTimescale = 44100;
    
    if (audioTrak) {
      const audioMdia = findBox(file1MoovBuffer, audioTrak.contentStart, audioTrak.end, 'mdia');
      const audioMdhd = findBox(file1MoovBuffer, audioMdia.contentStart, audioMdia.end, 'mdhd');
      const audioMdhdView = new DataView(file1MoovBuffer, audioMdhd.start, audioMdhd.size);
      audioTimescale = audioMdhdView.getUint8(8) === 0 ? audioMdhdView.getUint32(20) : audioMdhdView.getUint32(28);
      
      for (let fileIdx = 0; fileIdx < parsedFiles.length; fileIdx++) {
        const p = parsedFiles[fileIdx];
        const moovBuf = p.moov.buffer.slice(p.moov.byteOffset, p.moov.byteOffset + p.moov.byteLength);
        const origBuf = new Uint8Array(buffers[fileIdx]);
        const aTrak = findAudioTrak(moovBuf);
        if (!aTrak) continue;
        
        const stbl = findNestedBoxInRange(moovBuf, aTrak.contentStart, aTrak.end, ['mdia', 'minf', 'stbl']);
        const stsz = findBox(moovBuf, stbl.contentStart, stbl.end, 'stsz');
        const stco = findBox(moovBuf, stbl.contentStart, stbl.end, 'stco');
        const stsc = findBox(moovBuf, stbl.contentStart, stbl.end, 'stsc');
        const stts = findBox(moovBuf, stbl.contentStart, stbl.end, 'stts');
        
        if (stts) {
          const v = new DataView(moovBuf, stts.start, stts.size);
          if (v.getUint32(12) > 0) audioSampleDelta = v.getUint32(20);
        }
        
        // Check for edit list to determine:
        // 1. media_time: encoder priming samples to skip at the START
        // 2. segment_duration: total playable duration (to trim trailing samples at END)
        // This is critical for seamless audio concatenation between clips
        let samplesToSkip = 0;
        let maxSamplesToInclude = Infinity; // By default, include all samples after skipping
        
        // Get movie timescale (not used for concatenation, but keeping for consistency)
        const mvhd = findBox(moovBuf, 8, moovBuf.byteLength, 'mvhd');
        if (mvhd) {
          const mvhdView = new DataView(moovBuf, mvhd.start, mvhd.size);
          const mvhdVersion = mvhdView.getUint8(8);
          const fileMovieTimescale = mvhdVersion === 0 ? mvhdView.getUint32(20) : mvhdView.getUint32(28);
          console.log(`[CO] File ${fileIdx + 1} movie timescale: ${fileMovieTimescale}`);
        }
        
        const edts = findBox(moovBuf, aTrak.contentStart, aTrak.end, 'edts');
        if (edts) {
          const elst = findBox(moovBuf, edts.contentStart, edts.end, 'elst');
          if (elst) {
            const elstView = new DataView(moovBuf, elst.start, elst.size);
            const elstVersion = elstView.getUint8(8);
            const entryCount = elstView.getUint32(12);
            
            if (entryCount > 0) {
              let segmentDuration, mediaTime;
              if (elstVersion === 0) {
                segmentDuration = elstView.getUint32(16);
                mediaTime = elstView.getInt32(20);
              } else {
                segmentDuration = Number(elstView.getBigUint64(16));
                mediaTime = Number(elstView.getBigInt64(24));
              }
              
              // Skip encoder priming samples at the start
              // media_time is in audio track's media timescale units
              if (mediaTime > 0) {
                // Convert media_time from timescale units to sample count
                samplesToSkip = Math.round(mediaTime / audioSampleDelta);
                console.log(`[CO] File ${fileIdx + 1} media_time=${mediaTime} (audioTimescale=${audioTimescale}, sampleDelta=${audioSampleDelta}) -> skip ${samplesToSkip} samples`);
              }
              
              // For concatenation, don't trim based on segment_duration
              // The segment_duration is meant for playback in a single file, but when concatenating
              // we want the full audio content (after skipping priming) to blend seamlessly
              // Trimming at the end can create gaps between clips
              if (segmentDuration > 0) {
                console.log(`[CO] File ${fileIdx + 1} segment_duration=${segmentDuration} - NOT trimming for concatenation`);
              }
            }
          }
        }
        
        const stszView = new DataView(moovBuf, stsz.start, stsz.size);
        const stcoView = new DataView(moovBuf, stco.start, stco.size);
        const sampleCount = stszView.getUint32(16);
        const chunkCount = stcoView.getUint32(12);
        
        const sampleSizes = [];
        for (let i = 0; i < sampleCount; i++) sampleSizes.push(stszView.getUint32(20 + i * 4));
        const chunkOffsets = [];
        for (let i = 0; i < chunkCount; i++) chunkOffsets.push(stcoView.getUint32(16 + i * 4));
        
        const stscEntries = [];
        if (stsc) {
          const v = new DataView(moovBuf, stsc.start, stsc.size);
          const c = v.getUint32(12);
          for (let i = 0; i < c; i++) {
            stscEntries.push({
              firstChunk: v.getUint32(16 + i * 12),
              samplesPerChunk: v.getUint32(20 + i * 12)
            });
          }
        }
        
        let sampleIdx = 0;
        let skippedCount = 0;
        let includedCount = 0;
        const samplesBeforeThisFile = allAudioSamples.length;
        
        for (let chunkIdx = 0; chunkIdx < chunkCount && sampleIdx < sampleCount; chunkIdx++) {
          let samplesInChunk = 1;
          for (const entry of stscEntries) {
            if (entry.firstChunk <= chunkIdx + 1) samplesInChunk = entry.samplesPerChunk;
          }
          let byteOffset = chunkOffsets[chunkIdx];
          for (let s = 0; s < samplesInChunk && sampleIdx < sampleCount; s++) {
            const sampleSize = sampleSizes[sampleIdx];
            
            // Skip encoder priming samples (as indicated by edit list media_time)
            if (skippedCount < samplesToSkip) {
              skippedCount++;
              byteOffset += sampleSize;
              sampleIdx++;
              continue;
            }
            
            // Stop if we've included enough samples (as indicated by edit list segment_duration)
            if (includedCount >= maxSamplesToInclude) {
              sampleIdx++;
              byteOffset += sampleSize;
              continue;
            }
            
            if (byteOffset + sampleSize <= origBuf.length) {
              allAudioSamples.push(origBuf.slice(byteOffset, byteOffset + sampleSize));
              allAudioSizes.push(sampleSize);
              includedCount++;
            }
            byteOffset += sampleSize;
            sampleIdx++;
          }
        }
        
        const extractedFromFile = allAudioSamples.length - samplesBeforeThisFile;
        if (samplesToSkip > 0 || maxSamplesToInclude < Infinity) {
          console.log(`[CO] File ${fileIdx + 1}: Extracted ${extractedFromFile} samples (skipped ${skippedCount} start, limit ${maxSamplesToInclude})`);
        }
      }
    }
    
    console.log(`[CO] Video: ${allVideoSizes.length} samples, Audio: ${allAudioSizes.length} samples`);
    console.log(`[CO] Total ctts entries: ${allCttsEntries.length}`);
    
    // Calculate durations to check if audio needs looping
    const file1Tables = parseSampleTables(file1.moov, true);
    const videoMediaDuration = allVideoSizes.length * file1Tables.sampleDelta;
    const videoMovieDuration = Math.round(videoMediaDuration * movieTimescale / videoTimescale);
    
    // Calculate expected audio duration in audio timescale units to match video
    const videoDurationSeconds = videoMediaDuration / videoTimescale;
    const expectedAudioSamples = Math.ceil(videoDurationSeconds * audioTimescale / audioSampleDelta);
    
    // Loop audio if it's shorter than video (e.g., infinite loop stitch with transitions)
    if (allAudioSizes.length > 0 && allAudioSizes.length < expectedAudioSamples) {
      const originalAudioSizes = [...allAudioSizes];
      const originalAudioSamples = [...allAudioSamples];
      const originalSampleCount = originalAudioSizes.length;
      
      console.log(`[CO] Audio needs looping: have ${originalSampleCount} samples, need ${expectedAudioSamples} samples`);
      
      // Loop until we have enough samples
      while (allAudioSizes.length < expectedAudioSamples) {
        const samplesToAdd = Math.min(originalSampleCount, expectedAudioSamples - allAudioSizes.length);
        for (let i = 0; i < samplesToAdd; i++) {
          allAudioSizes.push(originalAudioSizes[i]);
          allAudioSamples.push(originalAudioSamples[i]);
        }
      }
      
      console.log(`[CO] Audio looped: now have ${allAudioSizes.length} samples`);
    }
    
    // Build combined mdat
    const combinedVideoData = concatArrays(allVideoSamples);
    const combinedAudioData = concatArrays(allAudioSamples);
    const combinedMdatData = concatArrays([combinedVideoData, combinedAudioData]);
    const newMdat = buildMdat(combinedMdatData);
    
    // Recalculate audio duration after looping
    const audioMediaDuration = allAudioSizes.length * audioSampleDelta;
    const audioMovieDuration = Math.round(audioMediaDuration * movieTimescale / audioTimescale);
    
    // Single chunk for simplicity
    const ftypSize = file1.ftyp.byteLength;
    const videoChunkOffsets = [ftypSize + 8];
    const audioChunkOffsets = [ftypSize + 8 + combinedVideoData.byteLength];
    
    // Build ctts box from collected entries
    const buildCttsFromEntriesCO = (entries) => {
      if (entries.length === 0) return null;
      const size = 16 + entries.length * 8;
      const ctts = new Uint8Array(size);
      const view = new DataView(ctts.buffer);
      view.setUint32(0, size);
      ctts[4] = 0x63; ctts[5] = 0x74; ctts[6] = 0x74; ctts[7] = 0x73; // 'ctts'
      view.setUint32(8, 0); // version 0, flags
      view.setUint32(12, entries.length);
      for (let i = 0; i < entries.length; i++) {
        view.setUint32(16 + i * 8, entries[i].sampleCount);
        view.setInt32(20 + i * 8, entries[i].sampleOffset);
      }
      return ctts;
    }
    
    const newVideoStsz = buildStsz(allVideoSizes);
    const newVideoStco = buildStco(videoChunkOffsets);
    const newVideoStsc = buildStsc([{ firstChunk: 1, samplesPerChunk: allVideoSizes.length, sampleDescriptionIndex: 1 }]);
    const newVideoStts = buildStts(allVideoSizes.length, file1Tables.sampleDelta);
    const videoSyncSamples = [1];
    let sOff = file1Tables.sampleCount;
    for (let i = 1; i < parsedFiles.length; i++) {
      videoSyncSamples.push(sOff + 1);
      sOff += parseSampleTables(parsedFiles[i].moov, true).sampleCount;
    }
    const newVideoStss = buildStss(videoSyncSamples);
    const newVideoCtts = buildCttsFromEntriesCO(allCttsEntries);
    
    // Build video stbl with ctts
    const videoHdlr = findBox(file1MoovBuffer, videoMdia.contentStart, videoMdia.end, 'hdlr');
    const videoMinf = findBox(file1MoovBuffer, videoMdia.contentStart, videoMdia.end, 'minf');
    const vmhd = findBox(file1MoovBuffer, videoMinf.contentStart, videoMinf.end, 'vmhd');
    const videoDinf = findBox(file1MoovBuffer, videoMinf.contentStart, videoMinf.end, 'dinf');
    const videoStbl = findBox(file1MoovBuffer, videoMinf.contentStart, videoMinf.end, 'stbl');
    const videoStsd = findBox(file1MoovBuffer, videoStbl.contentStart, videoStbl.end, 'stsd');
    
    const videoStsdBytes = new Uint8Array(file1MoovBuffer, videoStsd.start, videoStsd.size);
    const stblParts = [videoStsdBytes, newVideoStts, newVideoStsc, newVideoStsz, newVideoStco, newVideoStss];
    if (newVideoCtts) {
      stblParts.push(newVideoCtts);
      console.log(`[CO] Added ctts box: ${newVideoCtts.byteLength} bytes`);
    }
    const newVideoStbl = wrapBox('stbl', concatArrays(stblParts));
    
    const vmhdBytes = new Uint8Array(file1MoovBuffer, vmhd.start, vmhd.size);
    const videoDinfBytes = new Uint8Array(file1MoovBuffer, videoDinf.start, videoDinf.size);
    const newVideoMinf = wrapBox('minf', concatArrays([vmhdBytes, videoDinfBytes, newVideoStbl]));
    const videoHdlrBytes = new Uint8Array(file1MoovBuffer, videoHdlr.start, videoHdlr.size);
    const newVideoMdhd = updateMdhdDuration(new Uint8Array(file1MoovBuffer, videoMdhd.start, videoMdhd.size), videoMediaDuration);
    const newVideoMdia = wrapBox('mdia', concatArrays([newVideoMdhd, videoHdlrBytes, newVideoMinf]));
    const videoTkhd = findBox(file1MoovBuffer, videoTrak.contentStart, videoTrak.end, 'tkhd');
    const newVideoTkhd = updateTkhdDuration(new Uint8Array(file1MoovBuffer, videoTkhd.start, videoTkhd.size), videoMovieDuration);
    const newVideoTrak = wrapBox('trak', concatArrays([newVideoTkhd, newVideoMdia]));
    
    // Build audio track
    let newAudioTrak = null;
    if (audioTrak && allAudioSizes.length > 0) {
      const audioMdia = findBox(file1MoovBuffer, audioTrak.contentStart, audioTrak.end, 'mdia');
      const audioMdhd = findBox(file1MoovBuffer, audioMdia.contentStart, audioMdia.end, 'mdhd');
      const audioHdlr = findBox(file1MoovBuffer, audioMdia.contentStart, audioMdia.end, 'hdlr');
      const audioMinf = findBox(file1MoovBuffer, audioMdia.contentStart, audioMdia.end, 'minf');
      const smhd = findBox(file1MoovBuffer, audioMinf.contentStart, audioMinf.end, 'smhd');
      const audioDinf = findBox(file1MoovBuffer, audioMinf.contentStart, audioMinf.end, 'dinf');
      const audioStbl = findBox(file1MoovBuffer, audioMinf.contentStart, audioMinf.end, 'stbl');
      const audioStsd = findBox(file1MoovBuffer, audioStbl.contentStart, audioStbl.end, 'stsd');
      
      const newAudioStsz = buildStsz(allAudioSizes);
      const newAudioStco = buildStco(audioChunkOffsets);
      const newAudioStsc = buildStsc([{ firstChunk: 1, samplesPerChunk: allAudioSizes.length, sampleDescriptionIndex: 1 }]);
      const newAudioStts = buildStts(allAudioSizes.length, audioSampleDelta);
      
      const audioStsdBytes = new Uint8Array(file1MoovBuffer, audioStsd.start, audioStsd.size);
      const newAudioStbl = wrapBox('stbl', concatArrays([audioStsdBytes, newAudioStts, newAudioStsc, newAudioStsz, newAudioStco]));
      const smhdBytes = smhd ? new Uint8Array(file1MoovBuffer, smhd.start, smhd.size) : null;
      const audioDinfBytes = new Uint8Array(file1MoovBuffer, audioDinf.start, audioDinf.size);
      const newAudioMinf = wrapBox('minf', concatArrays(smhdBytes ? [smhdBytes, audioDinfBytes, newAudioStbl] : [audioDinfBytes, newAudioStbl]));
      const audioHdlrBytes = new Uint8Array(file1MoovBuffer, audioHdlr.start, audioHdlr.size);
      const newAudioMdhd = updateMdhdDuration(new Uint8Array(file1MoovBuffer, audioMdhd.start, audioMdhd.size), audioMediaDuration);
      const newAudioMdia = wrapBox('mdia', concatArrays([newAudioMdhd, audioHdlrBytes, newAudioMinf]));
      const audioTkhd = findBox(file1MoovBuffer, audioTrak.contentStart, audioTrak.end, 'tkhd');
      const newAudioTkhd = updateTkhdDuration(new Uint8Array(file1MoovBuffer, audioTkhd.start, audioTkhd.size), audioMovieDuration);
      newAudioTrak = wrapBox('trak', concatArrays([newAudioTkhd, newAudioMdia]));
    }
    
    const newMvhd = updateMvhdDuration(new Uint8Array(file1MoovBuffer, mvhd.start, mvhd.size), videoMovieDuration);
    const moovParts = [newMvhd, newVideoTrak];
    if (newAudioTrak) moovParts.push(newAudioTrak);
    const newMoov = wrapBox('moov', concatArrays(moovParts));
    
    console.log(`[CO] Built moov: ${newMoov.byteLength} bytes`);
    return concatArrays([file1.ftyp, newMdat, newMoov]);
  }
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

function parseSampleTables(moovData, useVideoTrackDetection = false) {
  const buffer = moovData.buffer.slice(moovData.byteOffset, moovData.byteOffset + moovData.byteLength);
  const result = {
    sampleSizes: [],
    sampleCount: 0,
    chunkOffsets: [],
    chunkCount: 0,
    syncSamples: [],
    sttsEntries: [], // Time-to-sample entries
    stscEntries: [], // Sample-to-chunk entries
    cttsEntries: [], // Composition time offsets (for B-frames)
    duration: 0,
    timescale: 1000,
    sampleDelta: 512,
    width: 0,
    height: 0,
    avcC: null,
    hasAudioTrack: false, // Flag to indicate if source has audio
  };

  // Check if there's an audio track
  const audioTrak = findAudioTrak(buffer);
  result.hasAudioTrack = !!audioTrak;
  
  if (result.hasAudioTrack) {
    console.log('[MP4 Parse] Source video has audio track');
  }
  
  // Find stbl - optionally use video track detection (Strategy B, D)
  let stbl;
  if (useVideoTrackDetection) {
    const videoTrak = findVideoTrak(buffer);
    if (videoTrak) {
      stbl = findNestedBoxInRange(buffer, videoTrak.contentStart, videoTrak.end, ['mdia', 'minf', 'stbl']);
      console.log('[MP4 Parse] Using video track detection - found video trak');
    }
  }
  if (!stbl) {
    // Fallback to first trak (original behavior)
    stbl = findNestedBox(buffer, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
  }
  
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

  // Parse stsc (sample-to-chunk)
  const stsc = findBox(buffer, stbl.contentStart, stbl.end, 'stsc');
  if (stsc) {
    const v = new DataView(buffer, stsc.start, stsc.size);
    const entryCount = v.getUint32(12);
    let offset = 16;
    for (let i = 0; i < entryCount; i++) {
      const firstChunk = v.getUint32(offset);
      const samplesPerChunk = v.getUint32(offset + 4);
      const sampleDescriptionIndex = v.getUint32(offset + 8);
      result.stscEntries.push({ firstChunk, samplesPerChunk, sampleDescriptionIndex });
      offset += 12;
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

function updateMvhdDuration(mvhdData, newDuration) {
  const result = new Uint8Array(mvhdData);
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  const version = view.getUint8(8);
  if (version === 0) {
    view.setUint32(24, newDuration);
  }
  return result;
}

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

// ========== SOURCE AUDIO PRESERVATION ==========

/**
 * Extract and concatenate audio tracks from multiple source video buffers
 * Used for preserving audio when stitching videos that have embedded audio (e.g., animate-move)
 * 
 * @param {ArrayBuffer[]} videoBuffers - Array of source video ArrayBuffers
 * @returns {Object|null} - Concatenated audio track info, or null if no audio found
 */
function concatenateSourceAudioTracks(videoBuffers) {
  const audioTracks = [];
  
  // Extract audio from each source video
  for (let i = 0; i < videoBuffers.length; i++) {
    const audioTrack = extractAudioTrackWithSamples(videoBuffers[i]);
    if (audioTrack) {
      audioTracks.push(audioTrack);
      console.log(`[Audio Concat] Video ${i + 1}: Found audio - ${audioTrack.sampleSizes.length} samples, timescale: ${audioTrack.timescale}`);
    } else {
      console.log(`[Audio Concat] Video ${i + 1}: No audio track found`);
      // If ANY video lacks audio, we can't concatenate properly
      // Return null to fall back to video-only
      return null;
    }
  }
  
  if (audioTracks.length === 0) {
    return null;
  }
  
  // Verify all audio tracks have compatible formats (same timescale)
  const firstTimescale = audioTracks[0].timescale;
  const firstSampleDelta = audioTracks[0].sampleDelta;
  for (let i = 1; i < audioTracks.length; i++) {
    if (audioTracks[i].timescale !== firstTimescale) {
      console.warn(`[Audio Concat] Timescale mismatch: video 1 has ${firstTimescale}, video ${i + 1} has ${audioTracks[i].timescale}`);
      // For now, we'll proceed anyway - most animate-move videos should have same audio params
    }
  }
  
  // Concatenate all audio samples
  const allSampleSizes = [];
  const allMdatData = [];
  let totalDuration = 0;
  
  for (const track of audioTracks) {
    allSampleSizes.push(...track.sampleSizes);
    allMdatData.push(track.audioMdatData);
    totalDuration += track.duration;
  }
  
  // Combine audio mdat data
  const combinedMdatData = concatArrays(allMdatData);
  
  return {
    sampleSizes: allSampleSizes,
    mdatData: combinedMdatData,
    timescale: firstTimescale,
    sampleDelta: firstSampleDelta,
    duration: totalDuration,
    stsdBox: audioTracks[0].stsdBox // Use first video's audio format descriptor
  };
}

/**
 * Extract audio track with actual audio sample data from a video buffer
 * This properly extracts just the audio bytes from the mdat, not the whole mdat
 * 
 * IMPORTANT: Respects edit list (elst) to skip encoder priming samples.
 * AAC encoders add ~2048 samples of delay that need to be skipped for seamless concatenation.
 * 
 * @param {ArrayBuffer} buffer - Source video buffer
 * @returns {Object|null} - Audio track info with extracted samples, or null
 */
function extractAudioTrackWithSamples(buffer) {
  const parsed = parseMP4(buffer);
  if (!parsed.moov || !parsed.mdatData) return null;
  
  const moovBuffer = parsed.moov.buffer.slice(
    parsed.moov.byteOffset,
    parsed.moov.byteOffset + parsed.moov.byteLength
  );
  
  // Find audio track
  const audioTrak = findAudioTrak(moovBuffer);
  if (!audioTrak) return null;
  
  // Find audio stbl within the audio trak
  const stbl = findNestedBoxInRange(moovBuffer, audioTrak.contentStart, audioTrak.end, ['mdia', 'minf', 'stbl']);
  if (!stbl) return null;
  
  // Parse sample sizes
  const stsz = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stsz');
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
  
  if (sampleSizes.length === 0) return null;
  
  // Parse chunk offsets (these are absolute file offsets)
  const stco = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stco');
  const chunkOffsets = [];
  if (stco) {
    const v = new DataView(moovBuffer, stco.start, stco.size);
    const count = v.getUint32(12);
    for (let i = 0; i < count; i++) {
      chunkOffsets.push(v.getUint32(16 + i * 4));
    }
  }
  
  // Parse sample-to-chunk mapping
  const stsc = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stsc');
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
  
  // Parse stts for sample delta
  const stts = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stts');
  let sampleDelta = 1024; // Default for AAC
  if (stts) {
    const v = new DataView(moovBuffer, stts.start, stts.size);
    if (v.getUint32(12) > 0) {
      sampleDelta = v.getUint32(20); // First entry's delta
    }
  }
  
  // Get stsd box for audio format
  const stsd = findBox(moovBuffer, stbl.contentStart, stbl.end, 'stsd');
  let stsdBox = null;
  if (stsd) {
    stsdBox = new Uint8Array(moovBuffer, stsd.start, stsd.size);
  }
  
  // Get mdhd for timescale
  const mdhd = findNestedBoxInRange(moovBuffer, audioTrak.contentStart, audioTrak.end, ['mdia', 'mdhd']);
  let timescale = 44100;
  if (mdhd) {
    const v = new DataView(moovBuffer, mdhd.start, mdhd.size);
    const version = v.getUint8(8);
    timescale = version === 0 ? v.getUint32(20) : v.getUint32(28);
  }
  
  // Check for edit list (elst) to determine:
  // 1. media_time: encoder priming samples to skip at START
  // 2. segment_duration: max playable duration (to trim at END)
  let samplesToSkip = 0;
  let maxSamplesToInclude = sampleSizes.length; // Default: all samples
  
  // Get movie timescale (not used for concatenation, but keeping for consistency)
  const mvhd = findBox(moovBuffer, 8, moovBuffer.byteLength, 'mvhd');
  if (mvhd) {
    const mvhdView = new DataView(moovBuffer, mvhd.start, mvhd.size);
    const mvhdVersion = mvhdView.getUint8(8);
    const movieTimescale = mvhdVersion === 0 ? mvhdView.getUint32(20) : mvhdView.getUint32(28);
    console.log(`[Audio Extract] Movie timescale: ${movieTimescale}`);
  }
  
  const edts = findBox(moovBuffer, audioTrak.contentStart, audioTrak.end, 'edts');
  if (edts) {
    const elst = findBox(moovBuffer, edts.contentStart, edts.end, 'elst');
    if (elst) {
      const elstView = new DataView(moovBuffer, elst.start, elst.size);
      const elstVersion = elstView.getUint8(8);
      const entryCount = elstView.getUint32(12);
      
      if (entryCount > 0) {
        let segmentDuration, mediaTime;
        if (elstVersion === 0) {
          segmentDuration = elstView.getUint32(16);
          mediaTime = elstView.getInt32(20);
        } else {
          segmentDuration = Number(elstView.getBigUint64(16));
          mediaTime = Number(elstView.getBigInt64(24));
        }
        
        // Skip encoder priming samples at the start
        // media_time is in audio track's media timescale units
        if (mediaTime > 0) {
          // Convert media_time from timescale units to sample count
          samplesToSkip = Math.round(mediaTime / sampleDelta);
          console.log(`[Audio Extract] media_time=${mediaTime} (timescale=${timescale}, sampleDelta=${sampleDelta}) -> skip ${samplesToSkip} samples`);
        }
        
        // For concatenation, don't trim based on segment_duration
        // The segment_duration is meant for playback in a single file, but when concatenating
        // we want the full audio content (after skipping priming) to blend seamlessly
        if (segmentDuration > 0) {
          console.log(`[Audio Extract] segment_duration=${segmentDuration} - NOT trimming for concatenation`);
        }
      }
    }
  }
  
  // Now extract the actual audio sample bytes from the file
  // We need to use chunk offsets and sample sizes to find audio data
  const audioBytes = extractAudioSamplesFromMdat(
    buffer,
    chunkOffsets,
    stscEntries,
    sampleSizes,
    samplesToSkip, // Samples to skip at start for encoder priming
    maxSamplesToInclude // Max samples to include (for segment duration limit)
  );
  
  if (!audioBytes || audioBytes.byteLength === 0) {
    console.warn('[Audio Extract] Could not extract audio sample data');
    return null;
  }
  
  // Calculate actual samples extracted
  const actualSamplesExtracted = Math.min(sampleSizes.length - samplesToSkip, maxSamplesToInclude);
  
  // Adjust sample sizes array to match extracted samples
  const adjustedSampleSizes = sampleSizes.slice(samplesToSkip, samplesToSkip + actualSamplesExtracted);
  
  // Adjust duration to account for actual samples
  const adjustedDuration = actualSamplesExtracted * sampleDelta;
  
  return {
    sampleSizes: adjustedSampleSizes,
    audioMdatData: audioBytes,
    timescale,
    sampleDelta,
    duration: adjustedDuration,
    stsdBox,
    skippedSamples: samplesToSkip // Track for debugging
  };
}

/**
 * Extract audio sample bytes from an MP4 file using chunk offsets
 * 
 * @param {ArrayBuffer} fileBuffer - The entire MP4 file
 * @param {number[]} chunkOffsets - Absolute file offsets for each chunk
 * @param {Object[]} stscEntries - Sample-to-chunk mapping
 * @param {number[]} sampleSizes - Size of each sample
 * @param {number} samplesToSkip - Number of samples to skip at the start (encoder priming)
 * @param {number} maxSamplesToInclude - Maximum samples to include (for segment duration trimming)
 * @returns {Uint8Array} - Extracted audio sample data
 */
function extractAudioSamplesFromMdat(fileBuffer, chunkOffsets, stscEntries, sampleSizes, samplesToSkip = 0, maxSamplesToInclude = Infinity) {
  if (chunkOffsets.length === 0 || sampleSizes.length === 0) {
    return null;
  }
  
  // Calculate actual number of samples to extract
  const availableSamples = sampleSizes.length - samplesToSkip;
  const samplesToExtract = Math.min(availableSamples, maxSamplesToInclude);
  
  // Calculate total audio size for samples we'll extract
  let totalSize = 0;
  for (let i = samplesToSkip; i < samplesToSkip + samplesToExtract; i++) {
    totalSize += sampleSizes[i];
  }
  
  if (totalSize === 0) {
    console.warn(`[Audio Extract] No audio data after skipping ${samplesToSkip} samples`);
    return null;
  }
  
  const audioData = new Uint8Array(totalSize);
  
  // Build a map of which samples are in which chunk
  // stsc tells us: starting from chunk X, each chunk has Y samples
  let sampleIndex = 0;
  let writeOffset = 0;
  let skippedCount = 0;
  let includedCount = 0;
  
  for (let chunkIdx = 0; chunkIdx < chunkOffsets.length; chunkIdx++) {
    // Find the stsc entry for this chunk
    let samplesInChunk = 1;
    for (let i = stscEntries.length - 1; i >= 0; i--) {
      if (chunkIdx + 1 >= stscEntries[i].firstChunk) {
        samplesInChunk = stscEntries[i].samplesPerChunk;
        break;
      }
    }
    
    // Read samples from this chunk
    let chunkReadOffset = chunkOffsets[chunkIdx];
    for (let s = 0; s < samplesInChunk && sampleIndex < sampleSizes.length; s++) {
      const sampleSize = sampleSizes[sampleIndex];
      
      // Skip encoder priming samples
      if (skippedCount < samplesToSkip) {
        skippedCount++;
        chunkReadOffset += sampleSize;
        sampleIndex++;
        continue;
      }
      
      // Stop if we've included enough samples (segment duration limit)
      if (includedCount >= samplesToExtract) {
        break;
      }
      
      // Copy sample data from file buffer to audio data
      const sampleData = new Uint8Array(fileBuffer, chunkReadOffset, sampleSize);
      audioData.set(sampleData, writeOffset);
      
      chunkReadOffset += sampleSize;
      writeOffset += sampleSize;
      sampleIndex++;
      includedCount++;
    }
    
    // Exit outer loop if we've extracted enough
    if (includedCount >= samplesToExtract) {
      break;
    }
  }
  
  if (samplesToSkip > 0 || maxSamplesToInclude < Infinity) {
    console.log(`[Audio Extract] Skipped ${skippedCount} start, extracted ${includedCount} samples (${writeOffset} bytes), limit was ${maxSamplesToInclude}`);
  }
  
  return audioData;
}

/**
 * Loop audio samples to fill a target duration
 * Used for infinite loop stitch where we need audio to cover transitions too
 * 
 * @param {Object} audioInfo - Audio track info from concatenateSourceAudioTracks
 * @param {number} targetDurationSeconds - Target duration to fill
 * @returns {Object} - Extended audio track info
 */
function loopAudioToFillDuration(audioInfo, targetDurationSeconds) {
  const sourceDurationSeconds = audioInfo.duration / audioInfo.timescale;
  
  if (sourceDurationSeconds >= targetDurationSeconds) {
    // Source audio is long enough, trim it
    const samplesNeeded = Math.ceil(targetDurationSeconds * audioInfo.timescale / audioInfo.sampleDelta);
    const trimmedSampleSizes = audioInfo.sampleSizes.slice(0, samplesNeeded);
    
    // Calculate byte length for trimmed samples
    let byteLength = 0;
    for (let i = 0; i < trimmedSampleSizes.length; i++) {
      byteLength += trimmedSampleSizes[i];
    }
    
    const trimmedMdatData = new Uint8Array(audioInfo.mdatData.buffer, audioInfo.mdatData.byteOffset, byteLength);
    
    return {
      sampleSizes: trimmedSampleSizes,
      mdatData: trimmedMdatData,
      timescale: audioInfo.timescale,
      sampleDelta: audioInfo.sampleDelta,
      duration: trimmedSampleSizes.length * audioInfo.sampleDelta,
      stsdBox: audioInfo.stsdBox
    };
  }
  
  // Need to loop the audio to fill the target duration
  const loopsNeeded = Math.ceil(targetDurationSeconds / sourceDurationSeconds);
  console.log(`[Audio Loop] Source: ${sourceDurationSeconds.toFixed(2)}s, Target: ${targetDurationSeconds.toFixed(2)}s, Loops: ${loopsNeeded}`);
  
  // Calculate how many total samples we need
  const totalSamplesNeeded = Math.ceil(targetDurationSeconds * audioInfo.timescale / audioInfo.sampleDelta);
  
  // Build looped sample sizes and data
  const loopedSampleSizes = [];
  const loopedDataParts = [];
  let samplesAdded = 0;
  
  while (samplesAdded < totalSamplesNeeded) {
    const samplesThisLoop = Math.min(audioInfo.sampleSizes.length, totalSamplesNeeded - samplesAdded);
    
    // Add sample sizes
    for (let i = 0; i < samplesThisLoop; i++) {
      loopedSampleSizes.push(audioInfo.sampleSizes[i]);
    }
    
    // Calculate byte length for this loop's samples
    let byteLength = 0;
    for (let i = 0; i < samplesThisLoop; i++) {
      byteLength += audioInfo.sampleSizes[i];
    }
    
    // Add audio data for this loop
    loopedDataParts.push(new Uint8Array(audioInfo.mdatData.buffer, audioInfo.mdatData.byteOffset, byteLength));
    
    samplesAdded += samplesThisLoop;
  }
  
  // Combine all looped data
  const loopedMdatData = concatArrays(loopedDataParts);
  
  return {
    sampleSizes: loopedSampleSizes,
    mdatData: loopedMdatData,
    timescale: audioInfo.timescale,
    sampleDelta: audioInfo.sampleDelta,
    duration: loopedSampleSizes.length * audioInfo.sampleDelta,
    stsdBox: audioInfo.stsdBox
  };
}

/**
 * Mux concatenated audio into a video-only MP4 result
 * 
 * @param {Uint8Array} videoData - The concatenated video MP4 (video-only)
 * @param {Object} audioInfo - Concatenated audio track info from concatenateSourceAudioTracks
 * @param {number} targetDurationSeconds - Optional target duration (for looping audio to fill)
 * @returns {Uint8Array} - Combined video+audio MP4
 */
function muxConcatenatedAudio(videoData, audioInfo, targetDurationSeconds = null) {
  // Parse the video MP4
  const videoArrayBuffer = videoData.buffer.slice(
    videoData.byteOffset,
    videoData.byteOffset + videoData.byteLength
  );
  const video = parseMP4(videoArrayBuffer);
  
  if (!video.ftyp || !video.moov || !video.mdatData) {
    throw new Error('Invalid video MP4 structure');
  }
  
  // Get video duration from moov
  const videoDurations = getOriginalDurations(video.moov);
  const videoTimescale = getMovieTimescaleFromMoov(video.moov) || 1000;
  const movieDuration = videoDurations.movieDuration;
  const videoDurationSeconds = movieDuration / videoTimescale;
  
  // Determine the audio to use - loop if target duration requires it
  let finalAudio = audioInfo;
  const effectiveTargetDuration = targetDurationSeconds || videoDurationSeconds;
  
  // Loop/trim audio to match the target duration
  finalAudio = loopAudioToFillDuration(audioInfo, effectiveTargetDuration);
  console.log(`[Mux Audio] Video duration: ${videoDurationSeconds.toFixed(2)}s, Audio duration: ${(finalAudio.duration / finalAudio.timescale).toFixed(2)}s`);
  
  // Build new mdat with video + audio data
  const combinedMdatData = concatArrays([video.mdatData, finalAudio.mdatData]);
  const newMdat = buildMdat(combinedMdatData);
  
  // Calculate audio chunk offset (after ftyp + mdat header + video mdat)
  const audioChunkOffset = video.ftyp.byteLength + 8 + video.mdatData.byteLength;
  
  // Build new moov with both video and audio tracks
  const newMoov = rebuildMoovWithAudio(
    video.moov,
    { stsdBox: finalAudio.stsdBox }, // Original audio track info (for format)
    finalAudio, // Audio track (looped/trimmed to match video)
    audioChunkOffset,
    movieDuration
  );
  
  // Combine everything: ftyp + mdat + moov
  return concatArrays([video.ftyp, newMdat, newMoov]);
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
 * Find video trak in moov (handler type 'vide')
 * CRITICAL: Must use this instead of findNestedBox for videos that may have audio tracks
 */
function findVideoTrak(buffer) {
  const view = new DataView(buffer);
  let offset = 8; // Skip moov header
  
  while (offset < buffer.byteLength - 8) {
    const size = view.getUint32(offset);
    const type = getBoxType(view, offset + 4);
    
    if (size === 0 || offset + size > buffer.byteLength) break;
    
    if (type === 'trak') {
      // Check if this is a video track by looking at hdlr
      const hdlr = findNestedBoxInRange(buffer, offset + 8, offset + size, ['mdia', 'hdlr']);
      if (hdlr) {
        const hdlrView = new DataView(buffer, hdlr.start, hdlr.size);
        // Handler type is at offset 16 (after header + version/flags + pre_defined)
        const handlerType = getBoxType(hdlrView, 16);
        if (handlerType === 'vide') {
          return { start: offset, size, end: offset + size, contentStart: offset + 8 };
        }
      }
    }
    
    offset += size;
  }
  
  return null;
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
 * Build dinf (data information) box
 */
function buildDinf() {
  // Build dref with one url entry
  const url = new Uint8Array(12);
  const urlView = new DataView(url.buffer);
  urlView.setUint32(0, 12);
  urlView.setUint32(4, 0x75726C20); // 'url '
  urlView.setUint32(8, 1); // flags = self-contained
  
  const dref = new Uint8Array(16 + url.length);
  const drefView = new DataView(dref.buffer);
  drefView.setUint32(0, 16 + url.length);
  drefView.setUint32(4, 0x64726566); // 'dref'
  drefView.setUint32(8, 0); // version + flags
  drefView.setUint32(12, 1); // entry_count
  dref.set(url, 16);
  
  const dinf = new Uint8Array(8 + dref.length);
  const dinfView = new DataView(dinf.buffer);
  dinfView.setUint32(0, 8 + dref.length);
  dinfView.setUint32(4, 0x64696E66); // 'dinf'
  dinf.set(dref, 8);
  
  return dinf;
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
