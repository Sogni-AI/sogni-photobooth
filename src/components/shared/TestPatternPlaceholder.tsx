import React, { useMemo } from 'react';

interface TestPatternPlaceholderProps {
  width: number;
  height: number;
}

function buildTestPatternSvg(width: number, height: number): string {
  const barCount = 7;
  const barWidth = width / barCount;

  const topColors = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const bottomColors = ['#0000c0', '#181828', '#c000c0', '#181828', '#00c0c0', '#181828', '#c0c0c0'];

  // SMPTE-style bottom row: -I, white, +Q, black, sub-black (PLUGE), black, mid-gray
  const bottomRowColors = ['#00214c', '#ffffff', '#320064', '#131313', '#090909', '#131313', '#1d1d1d'];

  const mainHeight = height * 0.67;
  const castTop = mainHeight;
  const castHeight = height * 0.15;
  const bottomTop = castTop + castHeight;
  const bottomHeight = height - bottomTop;

  const cx = width / 2;
  const cy = mainHeight / 2;
  const r = Math.min(width, mainHeight) * 0.16;
  const fontSize = Math.max(height * 0.035, 10);

  const topBars = topColors.map((fill, i) =>
    `<rect x="${i * barWidth}" y="0" width="${barWidth + 0.5}" height="${mainHeight}" fill="${fill}" opacity="0.7"/>`
  ).join('');

  const castBars = bottomColors.map((fill, i) =>
    `<rect x="${i * barWidth}" y="${castTop}" width="${barWidth + 0.5}" height="${castHeight}" fill="${fill}" opacity="0.6"/>`
  ).join('');

  const bottomBars = bottomRowColors.map((fill, i) =>
    `<rect x="${i * barWidth}" y="${bottomTop}" width="${barWidth + 0.5}" height="${bottomHeight + 1}" fill="${fill}" opacity="0.5"/>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${topBars}
${castBars}
${bottomBars}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>
<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
<text x="${cx}" y="${bottomTop + bottomHeight * 0.65}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" fill="rgba(255,255,255,0.4)" letter-spacing="3">NOT YET GENERATED</text>
</svg>`;
}

/**
 * Retro TV test pattern rendered as an <img> via data URI so it sizes
 * identically to any other image in the container.
 */
const TestPatternPlaceholder: React.FC<TestPatternPlaceholderProps> = ({ width, height }) => {
  const dataUri = useMemo(() => {
    const svg = buildTestPatternSvg(width, height);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [width, height]);

  return (
    <img
      src={dataUri}
      alt="No image generated yet"
      style={{ opacity: 0.6, width: '100%', height: '100%', objectFit: 'contain' }}
      width={width}
      height={height}
    />
  );
};

export default TestPatternPlaceholder;
