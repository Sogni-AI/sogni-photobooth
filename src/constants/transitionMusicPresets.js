import urls from '../config/urls';

// Preset music tracks for transition videos
// MP3 files are transcoded to M4A by the backend at download time
// These are from the Winter Photobooth event playlist
export const TRANSITION_MUSIC_PRESETS = [
  {
    id: 'winter-theme',
    url: `${urls.assetUrl}/music/Winter%2002%20-%20This%20Season%20(Sogni%20Winter%20Theme).mp3`,
    title: 'This Season (Winter Theme)',
    artist: 'Sogni',
    duration: '3:24'
  },
  {
    id: 'snowflow',
    url: `${urls.assetUrl}/music/Winter%2001%20-%20Slothi%20on%20the%20Snowflow.mp3`,
    title: 'Slothi on the Snowflow',
    artist: 'Sogni',
    duration: '2:58'
  },
  {
    id: 'photobooth',
    url: `${urls.assetUrl}/music/Winter%2003%20-%20Trapped%20in%20the%20Photobooth%20Part%201.mp3`,
    title: 'Trapped in the Photobooth',
    artist: 'Sogni',
    duration: '3:12'
  },
  {
    id: 'sogni-swing',
    url: `${urls.assetUrl}/music/Winter%2004%20-%20Sogni%20Swing.mp3`,
    title: 'Sogni Swing',
    artist: 'Sogni',
    duration: '2:45'
  },
  {
    id: 'render-riot',
    url: `${urls.assetUrl}/music/Winter%2005%20-%20Winter%20Render%20Riot.mp3`,
    title: 'Winter Render Riot',
    artist: 'Sogni',
    duration: '3:30'
  },
  {
    id: 'render-things',
    url: `${urls.assetUrl}/music/Winter%2006%20-%20My%20Winter%20Render%20Things.mp3`,
    title: 'My Winter Render Things',
    artist: 'Sogni',
    duration: '2:52'
  }
];

