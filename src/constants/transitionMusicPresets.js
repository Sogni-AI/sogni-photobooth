import { WINTER_PLAYLIST } from './winterMusicPlaylist';
import { PLAYLIST as HALLOWEEN_PLAYLIST } from './musicPlaylist';

// Sample audio tracks from S2V (Sound-to-Video) - shared across features
const SAMPLE_AUDIO_CDN = 'https://cdn.sogni.ai/audio-samples';
const S2V_TRACKS = [
  { id: 'grandpa-on-retro', title: 'Grandpa on Retro', duration: '0:35' },
  { id: 'hank-hill-hotdog', title: 'Hank Hill Hotdog', duration: '0:42' },
  { id: 'ylvis-the-fox', title: 'Ylvis The Fox', duration: '0:32' },
  { id: 'look-at-that-cat', title: 'Look at That Cat', duration: '0:45' },
  { id: 'im-a-snake', title: "I'm a Snake", duration: '1:03' },
  { id: 'mii-theme-trap-remix', title: 'Mii Theme Trap Remix', duration: '0:31' },
  { id: 'have-you-ever-had-a-dream', title: 'Have You Ever Had a Dream', duration: '0:19' },
  { id: 'louis-theroux-jiggle-giggle', title: 'Louis Theroux Jiggle Giggle', duration: '0:22' },
  { id: 'jet-2-holiday-jingle', title: 'Jet 2 Holiday Jingle', duration: '0:13' },
  { id: 'beez-in-the-trap', title: 'Beez in the Trap', duration: '0:22' },
  { id: 'about-you', title: 'About You', duration: '1:17' },
  { id: 'all-eyes-on-me', title: 'All Eyes on Me', duration: '0:32' },
  { id: 'eclipse-philosophy', title: 'Eclipse Philosophy', duration: '0:45' },
  { id: 'big-bad-john', title: 'Big Bad John', duration: '0:58' },
  { id: 'brutus', title: 'Brutus', duration: '1:07' },
  { id: 'mic-check', title: 'Mic Check', duration: '1:01' },
  { id: 'down-with-the-sickness', title: 'Down with the Sickness', duration: '0:59' },
  { id: 'dtmf', title: 'DTMF', duration: '0:33' },
  { id: 'good-places', title: 'Good Places', duration: '0:59' },
  { id: 'hitchhiker-11', title: 'Hitchhiker 11', duration: '1:02' },
  { id: 'kill-jill', title: 'Kill Jill', duration: '0:28' },
  { id: 'once-in-a-lifetime', title: 'Once in a Lifetime', duration: '0:41' },
  { id: 'panda', title: 'Panda', duration: '0:44' },
  { id: 'peter-pan', title: 'Peter Pan', duration: '0:51' },
  { id: 'suff-gucci', title: 'Suff Gucci', duration: '0:23' },
  { id: 'terrorize-my-heart', title: 'Terrorize My Heart', duration: '1:06' },
  { id: 'thats-all-right', title: "That's All Right", duration: '0:48' },
  { id: 'trouble', title: 'Trouble', duration: '0:45' },
  { id: 'turn-it-down-for-what', title: 'Turn It Down for What', duration: '0:39' },
  { id: 'welcome-to-derry', title: 'Welcome to Derry', duration: '1:05' },
  { id: 'who-put-the-bomb', title: 'Who Put the Bomb', duration: '0:48' },
  { id: '6-feet', title: '6 Feet', duration: '0:28' },
  { id: '8-ball', title: '8 Ball', duration: '0:21' },
  { id: 'fast-as-f', title: 'Fast as F', duration: '0:16' },
  { id: 'hoist-the-colors', title: 'Hoist the Colors', duration: '0:29' },
  { id: 'hurricane-katrina', title: 'Hurricane Katrina', duration: '0:24' },
  { id: 'kitty-bed', title: 'Kitty Bed', duration: '0:18' },
  { id: 'listen-to-me-now', title: 'Listen to Me Now', duration: '0:10' },
  { id: 'n-95', title: 'N-95', duration: '0:17' },
  { id: 'noone-is-going-to-know', title: 'No One is Going to Know', duration: '0:24' },
  { id: 'o-fortuna', title: 'O Fortuna', duration: '0:31' },
  { id: 'peter-axel-f', title: 'Peter Axel F', duration: '0:09' },
  { id: 'priceless', title: 'Priceless', duration: '0:14' },
  { id: 'runnin-through-the-6', title: 'Runnin Through the 6', duration: '0:16' },
  { id: 'runnin-up-that-hill', title: 'Runnin Up That Hill', duration: '1:10' },
  { id: 'spider-man-2099', title: 'Spider-Man 2099', duration: '0:29' },
  { id: 'surround-sound', title: 'Surround Sound', duration: '0:24' }
];

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

// S2V audio sample presets
const samplePresets = S2V_TRACKS.map(track => ({
  id: `sample-${track.id}`,
  url: `${SAMPLE_AUDIO_CDN}/${track.id}.m4a`,
  title: track.title,
  artist: 'Sample',
  duration: track.duration,
  category: 'samples'
}));

// Preset music tracks for transition videos
// MP3 files are transcoded to M4A by the backend at download time
export const TRANSITION_MUSIC_PRESETS = [...samplePresets, ...winterPresets, ...halloweenPresets];

// Export grouped by category for potential future UI use
export const WINTER_PRESETS = winterPresets;
export const HALLOWEEN_PRESETS = halloweenPresets;
export const SAMPLE_PRESETS = samplePresets;
