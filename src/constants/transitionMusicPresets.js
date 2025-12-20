import { WINTER_PLAYLIST } from './winterMusicPlaylist';
import { PLAYLIST as HALLOWEEN_PLAYLIST } from './musicPlaylist';

// Additional metadata for transition presets (duration, id mapping)
const PRESET_METADATA = {
  // Winter tracks
  'This Season 🤗 (Winter Booth Theme)': { id: 'winter-theme', duration: '3:24', category: 'winter' },
  'Slothi on the Snowflow': { id: 'snowflow', duration: '2:58', category: 'winter' },
  'Trapped in the Photobooth Part 1': { id: 'photobooth', duration: '3:12', category: 'winter' },
  'Sogni Swing': { id: 'sogni-swing', duration: '2:45', category: 'winter' },
  'Winter Render Riot': { id: 'render-riot', duration: '3:30', category: 'winter' },
  'My Winter Render Things': { id: 'render-things', duration: '2:52', category: 'winter' },
  
  // Halloween tracks
  'Render Bash': { id: 'render-bash', duration: '1:30', category: 'halloween' },
  'Sogni Smash': { id: 'sogni-smash', duration: '3:42', category: 'halloween' },
  'Can I Get a Render?': { id: 'can-i-get-render', duration: '2:32', category: 'halloween' },
  'Spice Must Flow (Acapella)': { id: 'spice-must-flow', duration: '4:41', category: 'halloween' },
  'Power to Earn': { id: 'power-to-earn', duration: '4:14', category: 'halloween' },
  'Slothi in the Booth': { id: 'slothi-booth', duration: '2:31', category: 'halloween' },
  'We Spark Again': { id: 'we-spark-again', duration: '3:01', category: 'halloween' },
  'Decentralized': { id: 'decentralized', duration: '2:59', category: 'halloween' },
  '40k Sparks': { id: '40k-sparks', duration: '3:40', category: 'halloween' },
  'In the Room Where It Renders': { id: 'room-where-renders', duration: '4:21', category: 'halloween' },
  'Render Bash (Reprise)': { id: 'render-bash-reprise', duration: '3:40', category: 'halloween' }
};

// Helper to create preset from track
const createPreset = (track, index, defaultCategory) => {
  const metadata = PRESET_METADATA[track.title] || { 
    id: `track-${defaultCategory}-${index}`, 
    duration: '3:00',
    category: defaultCategory
  };
  
  return {
    id: metadata.id,
    url: track.url,
    title: track.title.replace(' 🤗', ''), // Clean up emoji for dropdown display
    artist: 'Sogni',
    duration: metadata.duration,
    category: metadata.category
  };
};

// Combine Winter and Halloween playlists
// Winter tracks first (current season), then Halloween tracks
const winterPresets = WINTER_PLAYLIST.map((track, index) => createPreset(track, index, 'winter'));
const halloweenPresets = HALLOWEEN_PLAYLIST.map((track, index) => createPreset(track, index, 'halloween'));

// Preset music tracks for transition videos
// MP3 files are transcoded to M4A by the backend at download time
export const TRANSITION_MUSIC_PRESETS = [...winterPresets, ...halloweenPresets];

// Export grouped by category for potential future UI use
export const WINTER_PRESETS = winterPresets;
export const HALLOWEEN_PRESETS = halloweenPresets;
