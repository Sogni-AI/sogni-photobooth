/**
 * Video Concatenation using MP4Box.js
 * Fast client-side MP4 container stitching without re-encoding
 */

export async function concatenateVideos(videos, onProgress = null) {

  if (!videos || videos.length === 0) throw new Error('No videos');

  if (videos.length === 1) {
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

  const result = await concatenateMP4s(videoBuffers);

  return new Blob([result], { type: 'video/mp4' });
}

/**
 * Concatenate MP4 files by rebuilding the container structure
 * Combines mdat data and rebuilds moov with correct sample tables
 */
async function concatenateMP4s(buffers) {
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
  let offset = ftypSize + 8; // ftyp + mdat header

  for (let i = 0; i < parsedFiles.length; i++) {
    const p = parsedFiles[i];
    const t = parseSampleTables(p.moov);
    
    if (!t || !t.sampleSizes || t.sampleSizes.length === 0) {
      throw new Error(`Video ${i + 1} has no sample sizes`);
    }
    
    // Verify all files have same sample count (they should for transition videos)
    if (t.sampleCount !== samplesPerFile) {
      console.warn(`File ${i + 1} has ${t.sampleCount} samples, expected ${samplesPerFile} - continuing anyway`);
    }
    
    allSampleSizes.push(...t.sampleSizes);
    chunkOffsets.push(offset);
    offset += p.mdatData.byteLength;
  }

  if (allSampleSizes.length === 0) {
    throw new Error('No samples found in any video');
  }

  if (chunkOffsets.length !== parsedFiles.length) {
    throw new Error(`Mismatch: ${chunkOffsets.length} chunks but ${parsedFiles.length} videos`);
  }

  // Use single stsc entry since all chunks have same samples per chunk
  // This tells the player: "Starting from chunk 1, all chunks have samplesPerFile samples"
  const stscEntries = [{
    firstChunk: 1,
    samplesPerChunk: samplesPerFile,
    sampleDescriptionIndex: 1,
  }];

  // Get ORIGINAL durations from first file (these are in correct timescales)
  const originalDurations = getOriginalDurations(firstParsed.moov);

  // Simply multiply by number of files
  const numFiles = parsedFiles.length;
  const totalMovieDuration = originalDurations.movieDuration * numFiles;
  const totalMediaDuration = originalDurations.mediaDuration * numFiles;

  const newMoov = rebuildMoovFull(firstParsed.moov, {
    sampleSizes: allSampleSizes,
    chunkOffsets: chunkOffsets,
    stsc: stscEntries,
    duration: totalMovieDuration,        // For mvhd/tkhd (movie timescale)
    mediaDuration: totalMediaDuration,   // For mdhd (media timescale)
    timescale: firstTables.timescale,
    sampleDelta: firstTables.sampleDelta,
    syncSamples: buildSyncSamples(firstTables.syncSamples, samplesPerFile, numFiles),
  });

  const result = concatArrays([firstParsed.ftyp, mdat, newMoov]);
  
  // Final validation - ensure result is reasonable size
  const totalInputSize = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  if (result.byteLength < totalInputSize * 0.5) {
    throw new Error(`Concatenated video is suspiciously small: ${result.byteLength} bytes (expected ~${totalInputSize} bytes)`);
  }
  
  // Verify result starts with ftyp box
  const resultView = new DataView(result.buffer, result.byteOffset, Math.min(12, result.byteLength));
  const resultType = String.fromCharCode(
    resultView.getUint8(4), resultView.getUint8(5), resultView.getUint8(6), resultView.getUint8(7)
  );
  if (resultType !== 'ftyp') {
    throw new Error('Concatenated result is not a valid MP4 file');
  }
  
  return result;
}

// ========== PARSING ==========

function parseMP4(buffer) {
  const view = new DataView(buffer);
  const result = { ftyp: null, moov: null, mdat: null, mdatData: null, mdatStart: 0 };

  let offset = 0;
  while (offset < buffer.byteLength - 8) {
    const size = view.getUint32(offset);
    const type = getBoxType(view, offset + 4);
    if (size === 0) break;

    if (type === 'ftyp') result.ftyp = new Uint8Array(buffer, offset, size);
    else if (type === 'moov') result.moov = new Uint8Array(buffer, offset, size);
    else if (type === 'mdat') {
      result.mdat = new Uint8Array(buffer, offset, size);
      result.mdatData = new Uint8Array(buffer, offset + 8, size - 8);
      result.mdatStart = offset;
    }

    offset += size;
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
    if (entryCount > 0) {
      result.sampleDelta = v.getUint32(20); // First entry's delta
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
    if (!found) {
      console.log(`[findNestedBox] Could not find ${path[i]} in path ${path.join('/')}`);
      return null;
    }
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
  const stco = buildStco(params.chunkOffsets);
  const stsc = buildStsc(params.stsc || [{ firstChunk: 1, samplesPerChunk: params.sampleSizes.length, sampleDescriptionIndex: 1 }]);
  const stts = buildStts(params.sampleSizes.length, params.sampleDelta || originalTables.sampleDelta);
  const stss = params.syncSamples ? buildStss(params.syncSamples) : null;

  // Find original box positions
  const stbl = findNestedBox(buffer, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
  if (!stbl) throw new Error('No stbl found');

  const origStsz = findBox(buffer, stbl.contentStart, stbl.end, 'stsz');
  const origStco = findBox(buffer, stbl.contentStart, stbl.end, 'stco');
  const origStsc = findBox(buffer, stbl.contentStart, stbl.end, 'stsc');
  const origStts = findBox(buffer, stbl.contentStart, stbl.end, 'stts');
  const origStss = findBox(buffer, stbl.contentStart, stbl.end, 'stss');

  // Build stbl content with new tables
  const stblParts = [];
  let pos = stbl.contentStart;

  // Copy everything before first replaced box, replacing boxes as we go
  const boxesToReplace = [
    { orig: origStsz, new: stsz, type: 'stsz' },
    { orig: origStco, new: stco, type: 'stco' },
    { orig: origStsc, new: stsc, type: 'stsc' },
    { orig: origStts, new: stts, type: 'stts' },
    { orig: origStss, new: stss, type: 'stss' },
  ].filter(b => b.orig).sort((a, b) => a.orig.start - b.orig.start);

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

  return wrapBox('moov', concatArrays(moovParts));
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

export function isFFmpegSupported() {
  return true;
}
