import React, { useMemo, useCallback, useEffect, useState, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';

import PropTypes from 'prop-types';
import urls from '../../config/urls';
import '../../styles/film-strip.css'; // Using film-strip.css which contains the gallery styles
import '../../styles/components/PhotoGallery.css';
import { createPolaroidImage } from '../../utils/imageProcessing';
import { downloadImageMobile, enableMobileImageDownload } from '../../utils/mobileDownload';
import { isMobile, styleIdToDisplay } from '../../utils/index';
import promptsDataRaw from '../../prompts.json';
import { THEME_GROUPS, getDefaultThemeGroupState, getEnabledPrompts } from '../../constants/themeGroups';
import { getThemeGroupPreferences, saveThemeGroupPreferences, getFavoriteImages, toggleFavoriteImage, saveFavoriteImages, getBlockedPrompts, blockPrompt, hasSeenBatchVideoTip, markBatchVideoTipShown } from '../../utils/cookies';
import { getAttributionText } from '../../config/ugcAttributions';
import { isFluxKontextModel, SAMPLE_GALLERY_CONFIG, getQRWatermarkConfig, DEFAULT_SETTINGS } from '../../constants/settings';
import { TRANSITION_MUSIC_PRESETS } from '../../constants/transitionMusicPresets';
import { themeConfigService } from '../../services/themeConfig';
import { useApp } from '../../context/AppContext';
import { trackDownloadWithStyle } from '../../services/analyticsService';
import { downloadImagesAsZip, downloadVideosAsZip } from '../../utils/bulkDownload';
import { concatenateVideos } from '../../utils/videoConcatenation';
import { isWebShareSupported } from '../../services/WebShare';
import CustomPromptPopup from './CustomPromptPopup';
import ShareMenu from './ShareMenu';
import GallerySubmissionConfirm from './GallerySubmissionConfirm';
import GalleryCarousel from './GalleryCarousel';
import StyleDropdown from './StyleDropdown';
import { useSogniAuth } from '../../services/sogniAuth';
import { useWallet } from '../../hooks/useWallet';
import { useCostEstimation } from '../../hooks/useCostEstimation.ts';
import { useVideoCostEstimation } from '../../hooks/useVideoCostEstimation.ts';
import { getTokenLabel } from '../../services/walletService';
import { useToastContext } from '../../context/ToastContext';
import { generateGalleryFilename, getPortraitFolderWithFallback } from '../../utils/galleryLoader';
import { generateVideo, cancelVideoGeneration, downloadVideo } from '../../services/VideoGenerator.ts';
import { hasSeenVideoIntro, hasGeneratedVideo, formatVideoDuration, hasSeenVideoTip, markVideoTipShown, BASE_HERO_PROMPT } from '../../constants/videoSettings.ts';
import VideoIntroPopup from './VideoIntroPopup.tsx';
import { playSonicLogo, warmUpAudio } from '../../utils/sonicLogos';
import CustomVideoPromptPopup from './CustomVideoPromptPopup';
import BaseHeroConfirmationPopup from './BaseHeroConfirmationPopup';
import PromptVideoConfirmationPopup from './PromptVideoConfirmationPopup';

// Random video completion messages
const VIDEO_READY_MESSAGES = [
  { title: '🎬 Action!', message: 'Your masterpiece is ready for its premiere!' },
  { title: '✨ Magic Complete!', message: 'AI wizardry has transformed your photo!' },
  { title: '🚀 Liftoff!', message: 'Your video has landed. Time to share!' },
  { title: '🎉 Nailed It!', message: 'Looking good! Your video is ready to roll.' },
  { title: '🔥 Fresh & Hot!', message: 'Straight from the AI oven. Enjoy!' },
  { title: '💫 Showtime!', message: 'Lights, camera, your video is ready!' },
  { title: '🎯 Bullseye!', message: 'Perfect timing. Your video awaits!' },
  { title: '⚡ Zap!', message: 'Lightning fast! Your video is done.' }
];

const getRandomVideoMessage = () => {
  return VIDEO_READY_MESSAGES[Math.floor(Math.random() * VIDEO_READY_MESSAGES.length)];
};

// Track which motion emojis have been used for video generation
const USED_MOTIONS_KEY = 'sogni_used_motion_emojis';

const getUsedMotionEmojis = () => {
  try {
    const stored = localStorage.getItem(USED_MOTIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const markMotionEmojiUsed = (emoji) => {
  try {
    const used = getUsedMotionEmojis();
    if (!used.includes(emoji)) {
      used.push(emoji);
      localStorage.setItem(USED_MOTIONS_KEY, JSON.stringify(used));
    }
  } catch {
    // Silently fail if localStorage is not available
  }
};

const hasUsedMotionEmoji = (emoji) => {
  return getUsedMotionEmojis().includes(emoji);
};

// Motion templates for video generation - 8 categories × 20 templates each = 160 total
// Key I2V principles: Can only animate what EXISTS in the image - expressions, movements, camera, effects
const MOTION_CATEGORIES = [
  {
    name: 'Camera',
    emoji: '🎥',
    templates: [
      { emoji: '🔅', label: 'Blur', prompt: 'image goes soft and blurry, dreamy out of focus effect, hazy vision' },
      { emoji: '🎥', label: 'Dolly', prompt: 'camera smoothly glides forward or backward, cinematic dolly movement' },
      { emoji: '📸', label: 'Flash', prompt: 'bright camera flashes pop, paparazzi strobe lighting effect' },
      { emoji: '🙃', label: 'Flip', prompt: 'entire view rotates upside down, world flips, disorienting inversion' },
      { emoji: '🎯', label: 'Focus Pull', prompt: 'focus shifts dramatically from blurry to sharp, cinematic rack focus' },
      { emoji: '📺', label: 'Glitch', prompt: 'digital glitch distortion, RGB split, screen tears and static interference' },
      { emoji: '🔄', label: 'Look Around', prompt: 'head turns left then right curiously, eyes scan around, returns to center' },
      { emoji: '🌀', label: 'Orbit', prompt: 'camera orbits smoothly around subject, cinematic rotation' },
      { emoji: '↔️', label: 'Pan', prompt: 'camera pans slowly across scene, smooth horizontal motion' },
      { emoji: '↕️', label: 'Tilt', prompt: 'camera tilts up or down smoothly, vertical panning motion' },
      { emoji: '🤳', label: 'Selfie', prompt: 'arm extends holding phone, selfie pose, duck lips, finding the angle' },
      { emoji: '🎬', label: 'Shake', prompt: 'camera shakes with impact, dramatic handheld movement' },
      { emoji: '💡', label: 'Strobe', prompt: 'strobe light flashes rapidly, freeze frame snapshots, club lighting' },
      { emoji: '🫨', label: 'Vibrate', prompt: 'rapid shaking vibration effect, buzzing tremor, phone vibration feel' },
      { emoji: '🔍', label: 'Zoom In', prompt: 'slow dramatic camera push in toward face, intense focus' },
      { emoji: '🔭', label: 'Zoom Out', prompt: 'camera slowly pulls back revealing scene, epic reveal' },
      { emoji: '🐠', label: 'Fisheye', prompt: 'extreme wide angle fisheye distortion, bulging curved edges, dramatic perspective' },
      { emoji: '⏱️', label: 'Time-lapse', prompt: 'rapid time-lapse effect, clouds race by, shadows move quickly, sped up time' },
      { emoji: '📹', label: 'Tracking', prompt: 'camera tracks subject smoothly, following movement, steady cam glide' },
      { emoji: '📱', label: 'Split Screen', prompt: 'screen splits into multiple views, multi-angle perspective, divided frames' },
    ]
  },
  {
    name: 'Chaos',
    emoji: '💥',
    templates: [
      { emoji: '🧪', label: 'Acid', prompt: 'acid drips and sizzles, corrosive burns spread, dissolving effect' },
      { emoji: '🕳️', label: 'Black Hole', prompt: 'swirling black hole vortex forms behind, everything gets pulled toward it' },
      { emoji: '☠️', label: 'Death', prompt: 'skull face transformation, eyes go hollow, grim reaper vibes, mortality' },
      { emoji: '⚫', label: 'Disintegrate', prompt: 'body crumbles to dust, particles scatter in wind, fading away' },
      { emoji: '💧', label: 'Drip', prompt: 'face slowly drips and distorts downward, melting like liquid wax' },
      { emoji: '🌍', label: 'Earthquake', prompt: 'everything shakes violently, ground cracks, destruction tremors' },
      { emoji: '💥', label: 'Explode', prompt: 'head explodes dramatically, pieces scatter everywhere, total destruction' },
      { emoji: '🌀', label: 'Implode', prompt: 'everything collapses inward, implosion effect, crushing force' },
      { emoji: '🌋', label: 'Lava', prompt: 'molten lava drips down, skin cracks revealing glowing magma underneath' },
      { emoji: '🫠', label: 'Melt', prompt: 'face slowly melts downward like wax, features droop and ooze, liquifying' },
      { emoji: '🔥', label: 'On Fire', prompt: 'flames engulf and spread across, fire burns intensely, everything ablaze' },
      { emoji: '💩', label: 'Poop', prompt: 'poop emoji rains down chaotically, gross explosion, total mess' },
      { emoji: '💔', label: 'Shatter', prompt: 'face cracks like glass, pieces break apart, shattering into fragments' },
      { emoji: '☀️', label: 'Solar Flare', prompt: 'intense sun rays blast outward, blinding golden light, solar energy' },
      { emoji: '🔌', label: 'Electrocute', prompt: 'electric shock jolts through body, sparks fly, hair stands on end, electrical surge' },
      { emoji: '💨', label: 'Vaporize', prompt: 'body turns to vapor, steam rises, evaporating into mist' },
      { emoji: '🗜️', label: 'Crush', prompt: 'everything gets compressed and crushed, walls close in, crushing pressure' },
      { emoji: '💣', label: 'Bomb', prompt: 'bomb explodes dramatically, massive blast, shockwave radiates outward, explosive destruction' },
      { emoji: '🎮', label: 'Pixelate', prompt: 'image pixelates and breaks apart, digital degradation, retro game effect' },
      { emoji: '🌪️', label: 'Torn', prompt: 'face tears apart like paper, ripping effect, torn edges, splitting apart' },
    ]
  },
  {
    name: 'Disguise',
    emoji: '🥸',
    templates: [
      { emoji: '👽', label: 'Alien', prompt: 'eyes turn large and black, skin turns grey, alien transformation' },
      { emoji: '😇', label: 'Angel', prompt: 'glowing halo appears above head, wings unfold, divine light radiates' },
      { emoji: '🤡', label: 'Clown', prompt: 'colorful clown makeup appears, red nose, wild hair, exaggerated smile' },
      { emoji: '🦾', label: 'Cyborg', prompt: 'half face becomes robotic, glowing eye, metal plates appear, circuits visible' },
      { emoji: '👹', label: 'Demon', prompt: 'horns sprout from forehead, eyes glow, demonic transformation, snarling' },
      { emoji: '🥸', label: 'Disguise', prompt: 'fake glasses and mustache appear, going incognito, silly disguise' },
      { emoji: '🐸', label: 'Frog', prompt: 'face turns green and amphibian, eyes bulge outward, tongue flicks out, ribbit' },
      { emoji: '👻', label: 'Ghost', prompt: 'body turns translucent and ghostly, fades partially, floats eerily' },
      { emoji: '🥷', label: 'Ninja', prompt: 'ninja mask covers face, eyes narrow, stealthy pose, warrior stance' },
      { emoji: '👮‍♀️', label: 'Police', prompt: 'police hat appears, badge flashes, stern authoritative expression, cop transformation' },
      { emoji: '🤰', label: 'Pregnant', prompt: 'belly grows and expands rapidly, hand rests on stomach, glowing expectant' },
      { emoji: '🤖', label: 'Robot', prompt: 'skin turns metallic, robotic parts appear, mechanical transformation' },
      { emoji: '💀', label: 'Skeleton', prompt: 'face transforms into skeleton skull, flesh fades away revealing bones' },
      { emoji: '🧛', label: 'Vampire', prompt: 'fangs extend from mouth, eyes glow red, menacing expression, pale skin' },
      { emoji: '🐺', label: 'Werewolf', prompt: 'fur sprouts across face, ears become pointed, fangs grow, eyes glow yellow, howling' },
      { emoji: '🧟', label: 'Zombie', prompt: 'skin turns grey and rotting, eyes go white, zombie transformation, arms reach forward' },
      { emoji: '🧙', label: 'Mummy', prompt: 'bandages wrap around face, ancient mummy transformation, wrapped in cloth' },
      { emoji: '🏴‍☠️', label: 'Pirate', prompt: 'pirate hat appears, eye patch covers one eye, beard grows, swashbuckling transformation' },
      { emoji: '🦸', label: 'Superhero', prompt: 'cape flows behind, mask appears, heroic pose, superpowers activate, saving the day' },
      { emoji: '🧙‍♂️', label: 'Wizard', prompt: 'pointed wizard hat appears, beard grows long, staff materializes, magical transformation' },
    ]
  },
  {
    name: 'Emotions',
    emoji: '😊',
    templates: [
      { emoji: '🥰', label: 'Adore', prompt: 'face softens lovingly, hearts surround, blushing cheeks, warm affection' },
      { emoji: '😳', label: 'Blush', prompt: 'cheeks flush bright red, face turns pink with embarrassment, shy smile' },
      { emoji: '😎', label: 'Cool', prompt: 'sunglasses appear, confident smirk, head tilts back slightly, too cool' },
      { emoji: '😢', label: 'Cry', prompt: 'face crumples sadly, tears well up, lip quivers, sniffles' },
      { emoji: '😈', label: 'Devious', prompt: 'eyes narrow mischievously, slow sinister grin spreads across face' },
      { emoji: '🤤', label: 'Drool', prompt: 'excessive drool pours from mouth, slobbering mess, dripping everywhere' },
      { emoji: '😮', label: 'Gasp', prompt: 'mouth opens in surprise, eyes widen, sharp inhale, hand to chest' },
      { emoji: '🤗', label: 'Hug', prompt: 'arms open wide for embrace, warm welcoming smile, wholesome happiness' },
      { emoji: '😍', label: 'Love', prompt: 'heart eyes appear, hearts float up from head, lovestruck dreamy expression' },
      { emoji: '🤯', label: 'Mind Blown', prompt: 'head explodes dramatically, brain bursts out, mind literally blown, pieces scatter' },
      { emoji: '😡', label: 'Rage', prompt: 'face turns red with anger, steam shoots from ears, veins bulge, furious' },
      { emoji: '🤣', label: 'ROFL', prompt: 'laughs hysterically, falls over laughing, tears streaming, can barely breathe' },
      { emoji: '😱', label: 'Scream', prompt: 'mouth opens wide screaming, eyes bulge, head shakes with terror' },
      { emoji: '😊', label: 'Smile', prompt: 'breaks into warm genuine smile, eyes crinkle with joy, cheeks rise' },
      { emoji: '🤬', label: 'Swearing', prompt: 'face contorts with anger, mouth moves rapidly, symbols appear, furious cursing' },
      { emoji: '🤔', label: 'Think', prompt: 'eyebrows furrow, eyes look up thinking, hand touches chin' },
      { emoji: '😰', label: 'Anxious', prompt: 'face shows worry, sweat beads form, nervous expression, tense and uneasy' },
      { emoji: '😕', label: 'Confused', prompt: 'head tilts sideways, eyebrows raise, puzzled expression, questioning look' },
      { emoji: '😤', label: 'Proud', prompt: 'chest puffs out, chin raises confidently, proud smile, accomplished expression' },
      { emoji: '😴', label: 'Sleepy', prompt: 'eyes droop heavily, yawns widely, head nods, falling asleep, drowsy' },
    ]
  },
  {
    name: 'Magic',
    emoji: '✨',
    templates: [
      { emoji: '🌌', label: 'Aurora', prompt: 'northern lights dance across sky, colorful aurora borealis waves' },
      { emoji: '🌬️', label: 'Blow', prompt: 'cheeks puff up, blows air outward, magical breath, wind streams from mouth' },
      { emoji: '🫧', label: 'Bubbles', prompt: 'iridescent soap bubbles float up and around, dreamy magical atmosphere' },
      { emoji: '💎', label: 'Crystal', prompt: 'crystalline structures grow and spread, diamond-like reflections, ice crystals' },
      { emoji: '🔮', label: 'Crystal Ball', prompt: 'mystical glowing aura, magical energy swirls, fortune teller vibes' },
      { emoji: '🫥', label: 'Disappear', prompt: 'body fades to invisible, transparency spreads, vanishing into nothing' },
      { emoji: '🌟', label: 'Glow', prompt: 'soft ethereal light radiates outward, angelic glow effect' },
      { emoji: '🪄', label: 'Magic Wand', prompt: 'magic wand waves, sparkles trail behind, spell is cast, enchantment swirls' },
      { emoji: '💜', label: 'Neon', prompt: 'vibrant neon lights pulse and glow, cyberpunk colors, synthwave aesthetic' },
      { emoji: '✊', label: 'Power Up', prompt: 'fist clenches, energy surges, power aura builds, charging up strength' },
      { emoji: '🙌', label: 'Praise', prompt: 'hands raise up glowing, rays of light beam down, blessed moment, hallelujah' },
      { emoji: '🌈', label: 'Rainbow', prompt: 'vibrant rainbow colors wash across, prismatic light beams everywhere' },
      { emoji: '✨', label: 'Sparkle', prompt: 'magical sparkles float around, twinkling lights dance everywhere' },
      { emoji: '⭐', label: 'Stardust', prompt: 'glittering stardust swirls around, cosmic particles float, galaxy backdrop' },
      { emoji: '💫', label: 'Supernova', prompt: 'blinding explosion of light and energy radiates outward, cosmic blast' },
      { emoji: '👁️', label: 'Third Eye', prompt: 'glowing third eye opens on forehead, mystical energy radiates, enlightenment' },
      { emoji: '🧚', label: 'Enchant', prompt: 'magical sparkles surround, enchanting aura glows, spellbinding transformation' },
      { emoji: '🕴️', label: 'Levitate', prompt: 'body floats upward, defying gravity, hovering in air, mystical levitation' },
      { emoji: '🚪', label: 'Portal', prompt: 'mystical portal opens behind, swirling vortex appears, magical gateway' },
      { emoji: '🌐', label: 'Teleport', prompt: 'body fades and reappears, teleportation effect, instant transportation, magical blink' },
    ]
  },
  {
    name: 'Nature',
    emoji: '🌅',
    templates: [
      { emoji: '🌺', label: 'Bloom', prompt: 'flowers bloom and grow around, petals open, nature flourishes' },
      { emoji: '🦋', label: 'Butterfly', prompt: 'butterflies flutter around, land on face, magical nature effect' },
      { emoji: '🤸‍♀️', label: 'Cartwheel', prompt: 'body flips in cartwheel motion, acrobatic spin, energetic tumble' },
      { emoji: '🌫️', label: 'Fog', prompt: 'thick fog rolls in, mysterious mist surrounds, visibility fades' },
      { emoji: '🥶', label: 'Freeze', prompt: 'face turns blue, ice crystals form on skin, freezing solid, frost spreads' },
      { emoji: '⚡', label: 'Lightning', prompt: 'lightning crackles around dramatically, electric energy surges' },
      { emoji: '🌿', label: 'Overgrown', prompt: 'vines and plants grow rapidly, nature takes over, jungle spreads' },
      { emoji: '🌧️', label: 'Rain', prompt: 'rain pours down heavily, water droplets splash, getting soaked' },
      { emoji: '❄️', label: 'Snow', prompt: 'snowflakes drift down, frost forms, breath becomes visible, shivering' },
      { emoji: '🌻', label: 'Sunflower', prompt: 'sunflowers grow and bloom around, petals unfold toward light, golden warmth' },
      { emoji: '🌅', label: 'Sunrise', prompt: 'golden sunrise light washes over, warm rays beam, dawn breaks' },
      { emoji: '🏄‍♂️', label: 'Surfing', prompt: 'riding a wave, ocean spray, balanced surf pose, gnarly vibes' },
      { emoji: '🌪️', label: 'Tornado', prompt: 'violent tornado swirls around, debris flies everywhere, intense destruction' },
      { emoji: '🌊', label: 'Tsunami', prompt: 'massive wave crashes in from behind, water engulfs everything, underwater' },
      { emoji: '🐟', label: 'Underwater', prompt: 'bubbles rise up, hair floats weightlessly, underwater submersion effect' },
      { emoji: '💨', label: 'Wind', prompt: 'hair blows wildly in strong wind, clothes whip around dramatically' },
      { emoji: '🏜️', label: 'Dust Storm', prompt: 'dust storm swirls around, sand and debris fly everywhere, visibility drops, windy chaos' },
      { emoji: '🍃', label: 'Leaves', prompt: 'autumn leaves swirl and fall around, colorful foliage dances in wind, leaf storm' },
      { emoji: '🌙', label: 'Moonbeam', prompt: 'moonbeam shines down from above, silvery light sweeps across face, mystical lunar glow' },
      { emoji: '🌇', label: 'Sunset Glow', prompt: 'warm sunset light sweeps across face, golden hour rays beam, vibrant colors wash over' },
    ]
  },
  {
    name: 'Party',
    emoji: '🎉',
    templates: [
      { emoji: '🎸', label: 'Air Guitar', prompt: 'shreds invisible guitar, head bangs, rocks out intensely' },
      { emoji: '🥳', label: 'Celebrate', prompt: 'throws head back laughing, huge smile, eyes squeeze with joy' },
      { emoji: '🎊', label: 'Confetti', prompt: 'colorful confetti rains down everywhere, celebration explosion' },
      { emoji: '🪩', label: 'Disco', prompt: 'disco ball lights sweep across face, colorful reflections dance, party vibes' },
      { emoji: '😵‍💫', label: 'Dizzy', prompt: 'eyes spiral dizzily, head wobbles, stars circle around head, disoriented' },
      { emoji: '💃', label: 'Groove', prompt: 'shoulders bounce to beat, head bobs rhythmically, feeling the music' },
      { emoji: '🎤', label: 'Karaoke', prompt: 'belts out song dramatically, head tilts back, passionate performance' },
      { emoji: '🤑', label: 'Money', prompt: 'dollar signs in eyes, money rains down, cash flies everywhere, rich vibes' },
      { emoji: '🎨', label: 'Paint Splash', prompt: 'colorful paint splatters across face, drips down, artistic explosion' },
      { emoji: '🥧', label: 'Pie Face', prompt: 'cream pie smashes into face, splat impact, whipped cream drips down' },
      { emoji: '🍕', label: 'Pizza', prompt: 'pizza slices rain down from above, cheese stretches and drips, mouth opens wide' },
      { emoji: '🤟', label: 'Rock On', prompt: 'throws up rock horns, headbangs slightly, rocks out' },
      { emoji: '🤪', label: 'Silly', prompt: 'eyes cross briefly, tongue pokes out, head wobbles playfully' },
      { emoji: '🤧', label: 'Sneeze', prompt: 'face scrunches up, massive sneeze explodes out, dramatic achoo' },
      { emoji: '💦', label: 'Spit Take', prompt: 'liquid sprays out of mouth in shock, dramatic spit take reaction' },
      { emoji: '😜', label: 'Wacky', prompt: 'tongue sticks out sideways, one eye winks, totally goofy face' },
      { emoji: '🎈', label: 'Balloon', prompt: 'colorful balloons float up around, party balloons bounce, celebration balloons' },
      { emoji: '🍾', label: 'Champagne', prompt: 'champagne cork pops, bubbly sprays everywhere, celebration toast, festive fizz' },
      { emoji: '🕺', label: 'Dance', prompt: 'body moves in dance rhythm, grooving to music, dancing moves, party dancing' },
      { emoji: '🎩', label: 'Party Hat', prompt: 'party hat appears on head, confetti streams, festive celebration, birthday vibes' },
    ]
  },
  {
    name: 'Reactions',
    emoji: '👀',
    templates: [
      { emoji: '👏', label: 'Clap', prompt: 'hands clap together enthusiastically, appreciative applause, nodding approval' },
      { emoji: '🙄', label: 'Eye Roll', prompt: 'eyes roll back hard, head tilts with attitude, sighs dramatically' },
      { emoji: '🤭', label: 'Gossip', prompt: 'hand covers mouth, eyes dart sideways, leans in secretively' },
      { emoji: '💋', label: 'Kiss', prompt: 'puckers lips, blows kiss toward camera, winks flirtatiously' },
      { emoji: '🫦', label: 'Lip Bite', prompt: 'teeth bite lower lip seductively, eyes smolder, flirty expression' },
      { emoji: '👍', label: 'Nod Yes', prompt: 'head nods up and down agreeing, thumb raises up in approval, warm smile, eyes brighten' },
      { emoji: '🫣', label: 'Peek', prompt: 'hands slowly part from face, one eye peeks through nervously' },
      { emoji: '🫵', label: 'Point', prompt: 'finger points directly at viewer, intense eye contact, calling you out' },
      { emoji: '🙏', label: 'Prayer', prompt: 'hands press together in prayer, eyes close peacefully, serene namaste' },
      { emoji: '🫡', label: 'Salute', prompt: 'hand snaps to forehead in salute, stands at attention, serious face' },
      { emoji: '👎', label: 'Shake No', prompt: 'head shakes side to side disagreeing, thumb points down, slight frown, eyes narrow' },
      { emoji: '🤫', label: 'Shush', prompt: 'finger raises to lips, eyes widen, secretive expression' },
      { emoji: '👀', label: 'Side Eye', prompt: 'eyes shift suspiciously to the side, eyebrow raises slowly' },
      { emoji: '💅', label: 'Slay', prompt: 'chin raises confidently, eyes narrow fiercely, hair tosses back' },
      { emoji: '👋', label: 'Wave', prompt: 'hand raises waving hello, friendly smile, head tilts warmly' },
      { emoji: '😉', label: 'Wink', prompt: 'winks playfully, slight head tilt, charming smile spreads' },
      { emoji: '🤦', label: 'Facepalm', prompt: 'hand slaps forehead in disbelief, exasperated expression, why did I do that' },
      { emoji: '👊', label: 'Fist Bump', prompt: 'fist extends for bump, friendly gesture, cool greeting, fist meets fist' },
      { emoji: '✋', label: 'High Five', prompt: 'hand raises for high five, celebratory slap, enthusiastic greeting, success moment' },
      { emoji: '👌', label: 'OK', prompt: 'hand forms OK sign, approving gesture, everything is good, positive signal' },
    ]
  },
];

// Flatten categories into a single array for backwards compatibility
const MOTION_TEMPLATES = MOTION_CATEGORIES.flatMap(category => category.templates);

// Render a motion template button with tooltip showing prompt
const renderMotionButton = (template, index, handleGenerateVideo, setShowVideoDropdown, setShowCustomVideoPromptPopup) => (
  <button
    key={template.label}
    onClick={() => handleGenerateVideo(template.prompt, null, template.emoji)}
    title={template.prompt}
    style={{
      padding: '8px 4px',
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      color: 'white',
      fontSize: '10px',
      fontWeight: '500',
      cursor: 'pointer',
      borderRadius: '8px',
      textAlign: 'center',
      transition: 'all 0.2s ease',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2px',
      minHeight: window.innerWidth < 768 ? '44px' : '54px'
    }}
    onMouseOver={e => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
      e.currentTarget.style.transform = 'translateY(-1px)';
    }}
    onMouseOut={e => {
      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
  >
    <span style={{ fontSize: window.innerWidth < 768 ? '24px' : '18px' }}>{template.emoji}</span>
    {window.innerWidth >= 768 && <span>{template.label}</span>}
  </button>
);

// Custom button for the motion grid - contrasting color on yellow background
const renderCustomButton = (setShowVideoDropdown, setShowCustomVideoPromptPopup) => (
  <button
    key="custom"
    onClick={() => {
      setShowVideoDropdown(false);
      setShowCustomVideoPromptPopup(true);
    }}
    title="Create your own custom motion prompt - full creative control!"
    style={{
      width: window.innerWidth < 768 ? '100%' : 'auto',
      padding: '10px 20px',
      background: '#ff5252',
      border: 'none',
      color: '#ffffff',
      fontFamily: '"Permanent Marker", cursive',
      fontSize: '14px',
      fontWeight: '400',
      cursor: 'pointer',
      borderRadius: '6px',
      textAlign: 'center',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      boxShadow: '0 2px 8px rgba(255, 82, 82, 0.4)'
    }}
    onMouseOver={e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 82, 82, 0.5)';
      e.currentTarget.style.background = '#ff6b6b';
    }}
    onMouseOut={e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 82, 82, 0.4)';
      e.currentTarget.style.background = '#ff5252';
    }}
  >
    <span style={{ fontSize: '16px' }}>✨</span>
    <span>Custom Prompt</span>
  </button>
);

// Calculate square-ish grid dimensions (same cols/rows or rows = cols + 1)
// Now also considers available height to ensure no scrolling
// Compact polaroid button - pixel-perfect polaroid proportions
const renderCompactPolaroid = ({ emoji, label, onClick, index, rotation = 0, title = '', size = 'normal', showUsedIndicator = false }) => {
  const isMobile = window.innerWidth < 768;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isMobilePortrait = isMobile && isPortrait;
  const isLarge = size === 'large';
  
  // Check if this emoji has been used before (only for non-category items)
  const hasBeenUsed = showUsedIndicator && hasUsedMotionEmoji(emoji);
  
  // Polaroid frame dimensions - THICK borders for categories, normal for templates
  // Bigger frames and text on mobile portrait for templates
  const framePad = isLarge 
    ? (isMobilePortrait ? 6 : (isMobile ? 10 : 14)) 
    : (isMobilePortrait ? 6 : (isMobile ? 4 : 5));
  const bottomPad = isLarge 
    ? (isMobilePortrait ? 22 : (isMobile ? 32 : 42)) 
    : (isMobilePortrait ? 24 : (isMobile ? 20 : 26));
  
  return (
    <button
      key={label}
      onClick={onClick}
      title={title || label}
      style={{
        background: '#ffffff',
        border: 'none',
        borderRadius: '3px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.12)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        transform: `rotate(${rotation}deg)`,
        animation: `polaroidDrop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.02}s both`,
        boxSizing: 'border-box',
        // Padding creates the white frame: equal on top/left/right, larger on bottom
        padding: `${framePad}px ${framePad}px ${bottomPad}px ${framePad}px`,
        // Fill grid cell
        width: '100%',
        height: '100%',
      }}
      onMouseOver={e => {
        e.currentTarget.style.transform = `translateY(-4px) rotate(${rotation - 0.5}deg) scale(1.03)`;
        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.28), 0 4px 8px rgba(0,0,0,0.15)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.transform = `rotate(${rotation}deg)`;
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.12)';
      }}
      onMouseDown={e => {
        e.currentTarget.style.transform = `scale(0.97) rotate(${rotation}deg)`;
      }}
      onMouseUp={e => {
        e.currentTarget.style.transform = `translateY(-4px) rotate(${rotation - 0.5}deg) scale(1.03)`;
      }}
    >
      {/* Photo area - fills remaining space after padding, with inner shadow */}
      <div style={{
        flex: '1 1 auto',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #fafafa 0%, #eeeeee 100%)',
        borderRadius: '1px',
        minHeight: 0,
        boxShadow: 'inset 0 0 6px 2px rgba(0, 0, 0, 0.08), inset 0 0 4px 1px rgba(180, 180, 180, 0.15)',
      }}>
        <span style={{ 
          fontSize: isLarge 
            ? (isMobilePortrait ? '32px' : (isMobile ? '42px' : '56px')) 
            : (isMobilePortrait ? '32px' : (isMobile ? '28px' : '38px')),
          lineHeight: 1,
        }}>{emoji}</span>
      </div>
      {/* Label in the thick bottom white area - vertically centered */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: framePad,
        right: framePad,
        height: bottomPad,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Permanent Marker", cursive',
        fontSize: isLarge 
          ? (isMobilePortrait ? '10px' : (isMobile ? '13px' : '15px')) 
          : (isMobilePortrait ? '12px' : (isMobile ? '10px' : '12px')),
        color: '#333',
        textAlign: 'center',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{label}</div>
      
      {/* Used indicator checkmark - bottom right corner */}
      {hasBeenUsed && (
        <div style={{
          position: 'absolute',
          bottom: isMobilePortrait ? (isLarge ? '2px' : '3px') : '3px',
          right: isMobilePortrait ? (isLarge ? '2px' : '3px') : '3px',
          width: isMobilePortrait ? (isLarge ? '12px' : '14px') : '16px',
          height: isMobilePortrait ? (isLarge ? '12px' : '14px') : '16px',
          borderRadius: '50%',
          background: '#4CAF50',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          zIndex: 2,
        }}>
          <span style={{
            color: '#fff',
            fontSize: isMobilePortrait ? (isLarge ? '8px' : '9px') : '10px',
            fontWeight: 'bold',
            lineHeight: 1,
          }}>✓</span>
        </div>
      )}
    </button>
  );
};

// Render the motion picker with category navigation
// CRITICAL: Both views maintain same container size - categories use larger tiles
const renderMotionPicker = (selectedCategory, setSelectedCategory, handleGenerateVideo, setShowVideoDropdown, setShowCustomVideoPromptPopup) => {
  const isMobile = window.innerWidth < 768;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isMobilePortrait = isMobile && isPortrait;
  
  // Inject keyframe animations
  if (typeof document !== 'undefined' && !document.getElementById('polaroid-button-animations')) {
    const style = document.createElement('style');
    style.id = 'polaroid-button-animations';
    style.textContent = `
      @keyframes polaroidDrop {
        0% { opacity: 0; transform: translateY(-15px) rotate(-4deg) scale(0.92); }
        60% { opacity: 1; transform: translateY(2px) rotate(0.5deg) scale(1.01); }
        100% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
      }
      @keyframes slideInFromRight {
        0% { opacity: 0; transform: translateX(15px); }
        100% { opacity: 1; transform: translateX(0); }
      }
      @keyframes fadeScaleIn {
        0% { opacity: 0; transform: scale(0.96); }
        100% { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Grid config: mobile portrait uses 2 cols for categories, otherwise 4 cols
  // Categories: 8 items = 2x4 on mobile portrait, 4x2 otherwise
  // Templates: 20 items = 5x4 on desktop (landscape), 4x5 on mobile portrait
  const categoryCols = isMobilePortrait ? 2 : 4;
  const templateCols = isMobilePortrait ? 4 : 5;
  const templateRows = isMobilePortrait ? 5 : 4;
  
  // Category view: 8 items in 2x4 grid on mobile portrait, 4x2 otherwise
  if (!selectedCategory) {
    return (
      <div 
        key="categories"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${categoryCols}, 1fr)`,
          gridTemplateRows: `repeat(${8 / categoryCols}, 1fr)`,
          gap: isMobilePortrait ? '6px' : (isMobile ? '8px' : '12px'),
          padding: isMobilePortrait ? '6px' : (isMobile ? '10px' : '14px'),
          flex: '1 1 auto',
          overflow: 'hidden',
          minHeight: 0,
          animation: 'fadeScaleIn 0.2s ease-out',
        }}>
        {MOTION_CATEGORIES.map((category, index) => 
          renderCompactPolaroid({
            emoji: category.emoji,
            label: category.name,
            onClick: () => setSelectedCategory(category.name),
            index,
            rotation: 0,
            title: `${category.templates.length} effects`,
            size: 'large',
          })
        )}
      </div>
    );
  }

  // Template view: 20 items in 5x4 grid (desktop) or 4x5 grid (mobile portrait)
  const category = MOTION_CATEGORIES.find(c => c.name === selectedCategory);
  if (!category) return null;

  return (
    <div 
      key={`category-${selectedCategory}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 auto',
        minHeight: 0,
        animation: 'slideInFromRight 0.2s ease-out',
      }}>
      {/* Compact back header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: isMobilePortrait ? '6px' : '8px',
        padding: isMobilePortrait ? '4px 8px' : (isMobile ? '6px 10px' : '8px 14px'),
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setSelectedCategory(null)}
          style={{
            padding: isMobilePortrait ? '3px 6px' : (isMobile ? '4px 8px' : '5px 10px'),
            background: '#333',
            border: 'none',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            color: '#fff',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: isMobilePortrait ? '9px' : (isMobile ? '10px' : '11px'),
            cursor: 'pointer',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            transition: 'all 0.15s ease'
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#444'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#333'; }}
        >
          <span>←</span>
          <span>Back</span>
        </button>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontFamily: '"Permanent Marker", cursive',
          fontSize: isMobilePortrait ? '11px' : (isMobile ? '12px' : '14px'),
          color: '#1a1a1a'
        }}>
          <span style={{ fontSize: isMobilePortrait ? '12px' : (isMobile ? '14px' : '16px') }}>{category.emoji}</span>
          <span>{category.name}</span>
        </div>
      </div>
      
      {/* Templates 5x4 grid (desktop) or 4x5 grid (mobile portrait) - square polaroids, centered */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flex: '1 1 auto',
          overflow: 'hidden',
          minHeight: 0,
          padding: isMobilePortrait ? '8px' : (isMobile ? '8px' : '12px'),
        }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${templateCols}, 1fr)`,
          gridTemplateRows: `repeat(${templateRows}, 1fr)`,
          gap: isMobilePortrait ? '10px' : (isMobile ? '6px' : '10px'),
          // Responsive grid: 5x4 on desktop (landscape), 4x5 on mobile portrait
          height: '100%',
          aspectRatio: isMobilePortrait ? '4 / 5' : '5 / 4',
          maxWidth: '100%',
        }}>
        {category.templates.map((template, index) => 
          renderCompactPolaroid({
            emoji: template.emoji,
            label: template.label,
            onClick: () => handleGenerateVideo(template.prompt, null, template.emoji),
            index,
            rotation: ((index % 5) - 2) * 0.4,
            title: template.prompt,
            size: 'normal',
            showUsedIndicator: true,
          })
        )}
        </div>
      </div>
    </div>
  );
};

// Memoized placeholder image component to prevent blob reloading
const PlaceholderImage = memo(({ placeholderUrl }) => {

  
  if (!placeholderUrl) return null;
  
  return (
    <img
      src={placeholderUrl}
      alt="Original reference"
      className="placeholder"
      onLoad={e => {
        // Enable mobile-optimized download functionality when image loads
        enableMobileImageDownload(e.target);
      }}
      onContextMenu={e => {
        // Allow native context menu for image downloads
        e.stopPropagation();
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        position: 'relative',
        top: 0,
        left: 0,
        opacity: 0.25,
        zIndex: 1
      }}
    />
  );
}, (prevProps, nextProps) => {
  // Only re-render if the actual URL changes
  return prevProps.placeholderUrl === nextProps.placeholderUrl;
});

PlaceholderImage.displayName = 'PlaceholderImage';

PlaceholderImage.propTypes = {
  placeholderUrl: PropTypes.string
};

const PhotoGallery = ({
  photos,
  selectedPhotoIndex,
  setSelectedPhotoIndex,
  showPhotoGrid,
  handleBackToCamera,
  handlePhotoViewerClick,
  handleOpenImageAdjusterForNextBatch,
  handleShowControlOverlay,
  isGenerating,
  keepOriginalPhoto,
  lastPhotoData,
  activeProjectReference,
  isSogniReady,
  toggleNotesModal,
  setPhotos,
  selectedStyle,
  stylePrompts,
  enhancePhoto,
  undoEnhancement,
  redoEnhancement,
  sogniClient,
  desiredWidth,
  desiredHeight,
  selectedSubIndex = 0,
  outputFormat = 'png',
  handleShareToX,
  handleShareViaWebShare,
  handleShareQRCode,
  slothicornAnimationEnabled,
  backgroundAnimationsEnabled = false,
  tezdevTheme = 'off',
  aspectRatio = null,
  handleRetryPhoto,
  onPreGenerateFrame, // New prop to handle frame pre-generation from parent
  onFramedImageCacheUpdate, // New prop to expose framed image cache to parent
  onClearQrCode, // New prop to clear QR codes when images change
  onClearMobileShareCache, // New prop to clear mobile share cache when images change
  onRegisterFrameCacheClear, // New prop to register frame cache clearing function
  qrCodeData,
  onCloseQR,
  onUseGalleryPrompt, // New prop to handle using a gallery prompt
  // New props for prompt selector mode
  isPromptSelectorMode = false,
  selectedModel = null,
  onPromptSelect = null,
  onRandomMixSelect = null,
  onRandomSingleSelect = null,
  onOneOfEachSelect = null,
  onCustomSelect = null,
  onThemeChange = null,
  initialThemeGroupState = null,
  onSearchChange = null,
  initialSearchTerm = '',
  portraitType = 'medium',
  onPortraitTypeChange = null,
  // eslint-disable-next-line no-unused-vars
  numImages = 1, // Intentionally unused - ImageAdjuster handles batch count selection
  authState = null,
  handleRefreshPhoto = null,
  onOutOfCredits = null, // Callback to trigger out of credits popup
  // New props for Copy image style feature (currently disabled - Coming soon)
  // eslint-disable-next-line no-unused-vars
  onCopyImageStyleSelect = null,
  styleReferenceImage = null,
  // eslint-disable-next-line no-unused-vars
  onRemoveStyleReference = null,
  // eslint-disable-next-line no-unused-vars
  onEditStyleReference = null, // Callback to open existing style reference in adjuster
  // New props for vibe selector widget
  updateStyle = null, // Function to update selected style
  switchToModel = null, // Function to switch AI model
  onNavigateToVibeExplorer = null, // Function to navigate to full vibe explorer
  onRegisterVideoIntroTrigger = null // Callback to register function that triggers video intro popup
}) => {
  // Get settings from context
  const { settings, updateSetting } = useApp();
  const { isAuthenticated } = useSogniAuth();
  const { tokenType } = useWallet();
  const tokenLabel = getTokenLabel(tokenType);

  // Helper function to format cost - shows token cost with USD in parentheses
  const formatCost = (tokenCost, usdCost) => {
    // Handle null, undefined, or dash placeholder
    if (tokenCost === null || tokenCost === undefined || tokenCost === '—' || tokenCost === '') return null;
    
    // Parse if it's a string number
    const costValue = typeof tokenCost === 'string' ? parseFloat(tokenCost) : tokenCost;
    if (isNaN(costValue)) return null;
    
    let result = `${costValue.toFixed(2)} ${tokenLabel}`;
    
    // Add USD in parentheses if available
    if (usdCost !== null && usdCost !== undefined && !isNaN(usdCost)) {
      const roundedUSD = Math.round(usdCost * 100) / 100;
      result += ` (~$${roundedUSD.toFixed(2)})`;
    }
    
    return result;
  };

  // Cost estimation for Krea enhancement (one-click image enhance)
  // Krea uses the image as a guide/starting image for enhancement
  const { loading: kreaLoading, formattedCost: kreaCost, costInUSD: kreaUSD } = useCostEstimation({
    model: 'flux1-krea-dev_fp8_scaled',
    imageCount: 1,
    stepCount: 24, // Krea uses 24 steps (from PhotoEnhancer)
    guidance: 5.5, // Krea uses 5.5 guidance (from PhotoEnhancer)
    scheduler: 'DPM++ SDE',
    network: 'fast',
    previewCount: 0, // Krea typically has no previews
    contextImages: 0, // Not using Flux Kontext
    cnEnabled: false, // Not using ControlNet
    guideImage: true, // Using guide/starting image for enhancement
    denoiseStrength: 0.75 // Starting image strength (1 - 0.75 = 0.25 denoise)
  });

  // Cost estimation for Kontext enhancement (AI-guided enhancement)
  // Kontext uses the image as a context/reference image
  const { loading: kontextLoading, formattedCost: kontextCost, costInUSD: kontextUSD } = useCostEstimation({
    model: 'flux1-dev-kontext_fp8_scaled',
    imageCount: 1,
    stepCount: 24, // Kontext uses 24 steps (from PhotoEnhancer)
    guidance: 5.5, // Kontext uses 5.5 guidance (from PhotoEnhancer)
    scheduler: 'DPM++ SDE',
    network: 'fast',
    previewCount: 10,
    contextImages: 1, // Using 1 Flux Kontext reference image
    cnEnabled: false, // Not using ControlNet
    guideImage: false // Not using guide image (uses contextImages instead)
  });

  // Video generation state
  const [showVideoDropdown, setShowVideoDropdown] = useState(false);
  const [showVideoOptionsList, setShowVideoOptionsList] = useState(false); // List of video options (Motion Video, BASE Hero, etc.)
  const [showVideoIntroPopup, setShowVideoIntroPopup] = useState(false);
  const [showVideoNewBadge, setShowVideoNewBadge] = useState(() => !hasGeneratedVideo());
  const [showCustomVideoPromptPopup, setShowCustomVideoPromptPopup] = useState(false);
  const [selectedMotionCategory, setSelectedMotionCategory] = useState(null);
  const [videoTargetPhotoIndex, setVideoTargetPhotoIndex] = useState(null); // Track photo for video generation without selecting it

  // Get selected photo dimensions for video cost estimation
  const selectedPhoto = selectedPhotoIndex !== null ? photos[selectedPhotoIndex] : null;
  
  // Get target photo for video dropdown (from gallery motion button or slideshow)
  const videoTargetPhoto = videoTargetPhotoIndex !== null ? photos[videoTargetPhotoIndex] : selectedPhoto;

  // State for batch action mode (Download or Video) - declared early for use in hooks
  const [batchActionMode, setBatchActionMode] = useState('download'); // 'download', 'video', or 'transition'
  const [showBatchActionDropdown, setShowBatchActionDropdown] = useState(false);
  const [showBatchVideoDropdown, setShowBatchVideoDropdown] = useState(false);
  const [showBatchCustomVideoPromptPopup, setShowBatchCustomVideoPromptPopup] = useState(false);
  const [selectedBatchMotionCategory, setSelectedBatchMotionCategory] = useState(null);
  const [showTransitionVideoPopup, setShowTransitionVideoPopup] = useState(false); // Popup before transition video generation
  const [showBaseHeroPopup, setShowBaseHeroPopup] = useState(false); // Popup before BASE Hero video generation (single)
  const [showBatchBaseHeroPopup, setShowBatchBaseHeroPopup] = useState(false); // Popup before BASE Hero video generation (batch)
  const [showPromptVideoPopup, setShowPromptVideoPopup] = useState(false); // Popup before Prompt Video generation (single)
  const [showBatchPromptVideoPopup, setShowBatchPromptVideoPopup] = useState(false); // Popup before Prompt Video generation (batch)

  // Video cost estimation - include selectedPhotoIndex to bust cache when switching photos
  const { loading: videoLoading, cost: videoCostRaw, costInUSD: videoUSD, refetch: refetchVideoCost } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: settings.videoDuration || 5,
    enabled: isAuthenticated && selectedPhoto !== null,
    // Include photo index to bust cache when switching between photos
    photoId: selectedPhotoIndex
  });

  // Batch video cost estimation - for all batch images (excluding hidden/discarded ones)
  const loadedPhotosCount = photos.filter(
    photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
  ).length;
  
  const { loading: batchVideoLoading, cost: batchVideoCostRaw, costInUSD: batchVideoUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: settings.videoDuration || 5,
    enabled: isAuthenticated && loadedPhotosCount > 0 && showBatchVideoDropdown,
    jobCount: loadedPhotosCount
  });

  // Transition video cost estimation - enabled when popup is shown
  const { loading: transitionVideoLoading, cost: transitionVideoCostRaw, costInUSD: transitionVideoUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: settings.videoDuration || 5,
    enabled: isAuthenticated && loadedPhotosCount > 0 && showTransitionVideoPopup,
    jobCount: loadedPhotosCount
  });

  // BASE Hero video cost estimation (single) - enabled when popup is shown, always 5 seconds
  const { loading: baseHeroLoading, cost: baseHeroCostRaw, costInUSD: baseHeroUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: 5, // BASE Hero videos are always 5 seconds
    enabled: isAuthenticated && selectedPhoto !== null && showBaseHeroPopup,
    photoId: selectedPhotoIndex
  });

  // BASE Hero video cost estimation (batch) - enabled when popup is shown, always 5 seconds
  const { loading: batchBaseHeroLoading, cost: batchBaseHeroCostRaw, costInUSD: batchBaseHeroUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: 5, // BASE Hero videos are always 5 seconds
    enabled: isAuthenticated && loadedPhotosCount > 0 && showBatchBaseHeroPopup,
    jobCount: loadedPhotosCount
  });

  // Prompt Video cost estimation (single) - enabled when popup is shown
  const { loading: promptVideoLoading, cost: promptVideoCostRaw, costInUSD: promptVideoUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: settings.videoDuration || 5,
    enabled: isAuthenticated && selectedPhoto !== null && showPromptVideoPopup,
    photoId: selectedPhotoIndex
  });

  // Prompt Video cost estimation (batch) - enabled when popup is shown
  const { loading: batchPromptVideoLoading, cost: batchPromptVideoCostRaw, costInUSD: batchPromptVideoUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: settings.videoDuration || 5,
    enabled: isAuthenticated && loadedPhotosCount > 0 && showBatchPromptVideoPopup,
    jobCount: loadedPhotosCount
  });
  
  // State for custom prompt popup in Sample Gallery mode
  const [showCustomPromptPopup, setShowCustomPromptPopup] = useState(false);

  // State to track when to show the "more" button during generation
  const [showMoreButtonDuringGeneration, setShowMoreButtonDuringGeneration] = useState(false);

  // Removed complex width measurement - using flexbox container instead

  // State to track concurrent refresh operations
  const [refreshingPhotos, setRefreshingPhotos] = useState(new Set());

  // State to track touch hover in Vibe Explorer (separate from selectedPhotoIndex to avoid slideshow state)
  const [touchHoveredPhotoIndex, setTouchHoveredPhotoIndex] = useState(null);

  // State to show "Coming soon" tooltip for Copy image style feature
  const [showCopyStyleTooltip, setShowCopyStyleTooltip] = useState(false);
  
  // State to track composite framed images for right-click save compatibility
  const [framedImageUrls, setFramedImageUrls] = useState({});
  
  // State to track which photos are currently generating frames to prevent flicker
  const [generatingFrames, setGeneratingFrames] = useState(new Set());
  
  // State to hold the previous framed image during transitions to prevent flicker
  const [previousFramedImage, setPreviousFramedImage] = useState(null);
  const [previousSelectedIndex, setPreviousSelectedIndex] = useState(null);
  
  // State for QR code overlay
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  
  // State for prompt selector mode
  const [themeGroupState, setThemeGroupState] = useState(() => {
    if (isPromptSelectorMode) {
      // Use initialThemeGroupState prop if provided (for auto-reselect functionality)
      if (initialThemeGroupState) {
        return initialThemeGroupState;
      }
      const saved = getThemeGroupPreferences();
      const defaultState = getDefaultThemeGroupState();
      // If no saved preferences exist (empty object), use default state (all enabled)
      return Object.keys(saved).length === 0 ? defaultState : { ...defaultState, ...saved };
    }
    return getDefaultThemeGroupState();
  });
  const [showThemeFilters, setShowThemeFilters] = useState(() => {
    // Auto-open filters if themes parameter exists in URL
    if (isPromptSelectorMode) {
      const urlParams = new URLSearchParams(window.location.search);
      const themesParam = urlParams.get('themes');
      return themesParam !== null;
    }
    return false;
  });
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

  // State for favorites
  const [favoriteImageIds, setFavoriteImageIds] = useState(() => getFavoriteImages());

  // State for blocked prompts
  const [blockedPromptIds, setBlockedPromptIds] = useState(() => getBlockedPrompts());

  // State for vibe selector widget (only show when NOT in prompt selector mode and widget props are provided)
  const [showStyleDropdown, setShowStyleDropdown] = useState(false);

  // State for video overlay - track which photo's video is playing by photo ID (for easter egg videos)
  const [activeVideoPhotoId, setActiveVideoPhotoId] = useState(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  
  // State for AI-generated video playback (separate from easter egg videos)
  // Use a Set to allow multiple videos to play simultaneously (since videos are muted)
  const [playingGeneratedVideoIds, setPlayingGeneratedVideoIds] = useState(new Set());
  
  // State for transition video mode - tracks if we're in transition batch mode and the photo order
  const [transitionVideoQueue, setTransitionVideoQueue] = useState([]);
  const [isTransitionMode, setIsTransitionMode] = useState(false);
  // Track which video each polaroid is currently playing (index into transitionVideoQueue)
  const [currentVideoIndexByPhoto, setCurrentVideoIndexByPhoto] = useState({});
  // Track if all transition videos have finished generating (for sync mode)
  const [allTransitionVideosComplete, setAllTransitionVideosComplete] = useState(false);
  // Track if the user has downloaded the transition video (to suppress confirmation)
  const [transitionVideoDownloaded, setTransitionVideoDownloaded] = useState(false);
  // Counter to force all videos to reset to beginning when sync starts
  const [syncResetCounter, setSyncResetCounter] = useState(0);
  // Store ready-to-share transition video blob (for iOS share sheet after async concat)
  const [readyTransitionVideo, setReadyTransitionVideo] = useState(null);
  
  // State for stitched video overlay
  const [showStitchedVideoOverlay, setShowStitchedVideoOverlay] = useState(false);
  const [stitchedVideoUrl, setStitchedVideoUrl] = useState(null);
  const [isGeneratingStitchedVideo, setIsGeneratingStitchedVideo] = useState(false);
  const [showDownloadTip, setShowDownloadTip] = useState(false);
  
  // Refs to store functions so they're accessible in closures
  const generateStitchedVideoRef = useRef(null);
  const handleProceedDownloadRef = useRef(null);
  
  // Music modal state for adding audio to transition videos
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [musicFile, setMusicFile] = useState(null);
  const [musicStartOffset, setMusicStartOffset] = useState(0);
  const [pendingVideoDownload, setPendingVideoDownload] = useState(null);
  const [audioWaveform, setAudioWaveform] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewPlayhead, setPreviewPlayhead] = useState(0);
  const [isDraggingWaveform, setIsDraggingWaveform] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);
  // Applied music for inline playback (set when user confirms in modal)
  const [appliedMusic, setAppliedMusic] = useState(null); // { file, startOffset, audioUrl }
  const [isInlineAudioMuted, setIsInlineAudioMuted] = useState(false);
  // Preset music selection
  const [selectedPresetId, setSelectedPresetId] = useState(null);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const musicFileInputRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const audioContextRef = useRef(null);
  const playbackAnimationRef = useRef(null);
  const musicStartOffsetRef = useRef(0); // Track current offset for animation frame access
  const musicFileRef = useRef(null); // Track current music file for transition video generation
  const inlineAudioRef = useRef(null); // For playing music with transition videos
  
  // State to track if user wants fullscreen mode in Style Explorer
  const [wantsFullscreen, setWantsFullscreen] = useState(false);
  
  // State to track photos with stuck video ETAs (for flashing animation)
  const [stuckVideoETAs, setStuckVideoETAs] = useState(new Set());
  // Track when each photo's ETA first became stuck at 1 second
  const stuckEtaStartTimeRef = useRef(new Map());
  
  // Helper function to check if a prompt has a video easter egg
  const hasVideoEasterEgg = useCallback((promptKey) => {
    // Check if the promptKey exists in the videos category in prompts.json
    if (!promptKey) return false;
    const videosCategory = promptsDataRaw.videos;
    return videosCategory && videosCategory.prompts && Object.prototype.hasOwnProperty.call(videosCategory.prompts, promptKey);
  }, []);
  
  // Cleanup video and fullscreen when leaving the view
  useEffect(() => {
    if (selectedPhotoIndex === null) {
      setActiveVideoPhotoId(null);
      setCurrentVideoIndex(0);
      setWantsFullscreen(false);
    }
  }, [selectedPhotoIndex]);

  // Reset video index when video is hidden or photo changes
  useEffect(() => {
    if (!activeVideoPhotoId) {
      setCurrentVideoIndex(0);
    }
  }, [activeVideoPhotoId, selectedPhotoIndex]);

  // Monitor video ETAs to detect when they're stuck at 1 second (for flashing animation)
  useEffect(() => {
    const etaCheckInterval = setInterval(() => {
      const newStuckETAs = new Set();
      const now = Date.now();

      photos.forEach((photo, index) => {
        const photoKey = photo.id || index;
        
        if (photo.generatingVideo) {
          // Check if ETA is stuck at 1 second (0:01) or 0 seconds (0:00)
          const isStuckAtOneSecond = photo.videoETA === 1;
          const isStuckAtZero = photo.videoETA === 0;
          
          if (isStuckAtOneSecond || isStuckAtZero) {
            // Track when the ETA first became stuck
            if (!stuckEtaStartTimeRef.current.has(photoKey)) {
              stuckEtaStartTimeRef.current.set(photoKey, now);
            }
            
            // Check if it's been stuck for more than 2 seconds
            const stuckStartTime = stuckEtaStartTimeRef.current.get(photoKey);
            const stuckDuration = (now - stuckStartTime) / 1000; // Convert to seconds
            
            if (stuckDuration >= 2) {
              newStuckETAs.add(photoKey);
              // Debug logging (remove after testing)
              if (!stuckVideoETAs.has(photoKey)) {
                console.log(`[Video ETA] Photo ${photoKey} ETA stuck at ${photo.videoETA} for ${stuckDuration.toFixed(1)}s - enabling flash`);
              }
            }
          } else {
            // ETA is no longer stuck, clear the tracking
            if (stuckEtaStartTimeRef.current.has(photoKey)) {
              stuckEtaStartTimeRef.current.delete(photoKey);
            }
          }
        } else {
          // Video is no longer generating, clear the tracking
          stuckEtaStartTimeRef.current.delete(photoKey);
        }
      });

      // Only update state if the set has changed
      setStuckVideoETAs(prev => {
        const prevArray = Array.from(prev).sort();
        const newArray = Array.from(newStuckETAs).sort();
        if (JSON.stringify(prevArray) !== JSON.stringify(newArray)) {
          return newStuckETAs;
        }
        return prev;
      });
    }, 500); // Check every 500ms for more responsive updates

    return () => clearInterval(etaCheckInterval);
  }, [photos]);

  // Update theme group state when initialThemeGroupState prop changes
  useEffect(() => {
    if (isPromptSelectorMode && initialThemeGroupState) {
      setThemeGroupState(initialThemeGroupState);
    }
  }, [isPromptSelectorMode, initialThemeGroupState]);

  // Update search term when initialSearchTerm prop changes (only from URL/parent, not local changes)
  useEffect(() => {
    if (isPromptSelectorMode) {
      setSearchTerm(initialSearchTerm);
      if (initialSearchTerm) {
        setShowSearchInput(true);
      }
    }
  }, [isPromptSelectorMode, initialSearchTerm]);


  // Keep track of the previous photos array length to detect new batches (for legacy compatibility)
  const [, setPreviousPhotosLength] = useState(0);
  
  // State for enhancement options dropdown and prompt modal
  const [showEnhanceDropdown, setShowEnhanceDropdown] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  // State for bulk download functionality
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState({ current: 0, total: 0, message: '' });

  // State for Download All button dropdown
  const [showMoreDropdown, setShowMoreDropdown] = useState(false);

  // State for batch video mode tutorial tip
  const [showBatchVideoTip, setShowBatchVideoTip] = useState(false);

  // State for gallery submission
  const [showGalleryConfirm, setShowGalleryConfirm] = useState(false);
  const [gallerySubmissionPending, setGallerySubmissionPending] = useState(false);
  
  // Get user authentication state for gallery submissions
  const { user } = useSogniAuth();
  
  // Get toast notification system
  const { showToast } = useToastContext();
  
  // State to track if gallery carousel has entries
  const [hasGalleryEntries, setHasGalleryEntries] = useState(false);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMoreDropdown && !e.target.closest('.batch-action-button') && !e.target.closest('.more-dropdown-menu')) {
        setShowMoreDropdown(false);
      }
      if (showBatchActionDropdown && !e.target.closest('.batch-action-dropdown-container') && !e.target.closest('.batch-action-mode-dropdown')) {
        setShowBatchActionDropdown(false);
      }
      if (showBatchVideoDropdown && !e.target.closest('.batch-action-button') && !e.target.closest('.batch-video-dropdown')) {
        setShowBatchVideoDropdown(false);
      }
      if (showBatchVideoTip && !e.target.closest('.batch-video-tip-tooltip')) {
        setShowBatchVideoTip(false);
        markBatchVideoTipShown();
      }
      if (showVideoOptionsList && !e.target.closest('.video-options-list-dropdown') && !e.target.closest('.video-generate-btn')) {
        setShowVideoOptionsList(false);
      }
    };

    if (showMoreDropdown || showBatchActionDropdown || showBatchVideoDropdown || showBatchVideoTip || showVideoOptionsList) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMoreDropdown, showBatchActionDropdown, showBatchVideoDropdown, showBatchVideoTip, showVideoOptionsList]);
  
  // Refs for dropdown animation buttons to prevent re-triggering animations
  const enhanceButton1Ref = useRef(null);
  const enhanceButton2Ref = useRef(null);
  const animationTriggeredRef = useRef(false);
  const videoButtonRef = useRef(null);
  
  // Auto-dismiss enhancement errors - moved to PhotoEnhancer service to avoid re-renders

  // Handle dropdown animation triggering - only trigger once per dropdown open
  useEffect(() => {
    if (showEnhanceDropdown && !animationTriggeredRef.current) {
      // Trigger animations for both buttons with staggered timing
      const timer1 = setTimeout(() => {
        if (enhanceButton1Ref.current && !enhanceButton1Ref.current.classList.contains('slide-in')) {
          enhanceButton1Ref.current.classList.add('slide-in');
        }
      }, 100);
      
      const timer2 = setTimeout(() => {
        if (enhanceButton2Ref.current && !enhanceButton2Ref.current.classList.contains('slide-in')) {
          enhanceButton2Ref.current.classList.add('slide-in');
        }
      }, 300);
      
      animationTriggeredRef.current = true;
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    } else if (!showEnhanceDropdown) {
      // Reset animation state when dropdown is closed
      animationTriggeredRef.current = false;
    }
  }, [showEnhanceDropdown]);
  
  // Handler for applying custom prompt from popup
  const handleApplyCustomPrompt = useCallback((promptText) => {
    // Don't override copyImageStyle mode when applying custom prompts
    // copyImageStyle has its own special prompt that should not be changed
    if (selectedStyle !== 'copyImageStyle') {
      // Call the onCustomSelect callback with no args - it will set style to custom
      if (onCustomSelect) {
        onCustomSelect();
      }
    }
    
    // Then update the positive prompt separately via App's updateSetting
    // Note: This won't affect copyImageStyle mode since that uses a hardcoded prompt
    updateSetting('positivePrompt', promptText);
  }, [onCustomSelect, updateSetting, selectedStyle]);

  // Clear framed image cache when new photos are generated or theme changes
  // Use a ref to track previous length to avoid effect dependency on photos.length
  const previousPhotosLengthRef = useRef(0);
  
  useEffect(() => {
    const currentLength = photos.length;
    const prevLength = previousPhotosLengthRef.current;
    
    const shouldClearCache = 
      // New batch detected (photos array got smaller, indicating a reset)
      currentLength < prevLength ||
      // Or if we have a significant change in photos (new batch)
      (currentLength > 0 && prevLength > 0 && Math.abs(currentLength - prevLength) >= 3);
    
    if (shouldClearCache) {
      console.log('Clearing framed image cache due to new photo batch');
      // Clean up existing blob URLs
      Object.values(framedImageUrls).forEach(url => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      setFramedImageUrls({});
      
      // Also clean up transition/music state when new batch detected
      console.log('Clearing transition and music state due to new photo batch');
      setIsTransitionMode(false);
      setTransitionVideoQueue([]);
      setAllTransitionVideosComplete(false);
      setCurrentVideoIndexByPhoto({});
      setMusicFile(null);
      setAudioWaveform(null);
      setMusicStartOffset(0);
      setAudioDuration(0);
      setIsPlayingPreview(false);
      setPreviewPlayhead(0);
      setShowMusicModal(false);
      setBatchActionMode('download');
      setSelectedPresetId(null);
      setIsLoadingPreset(false);
      // Note: appliedMusic cleanup is handled in handleMoreButtonClick to properly revoke URL
    }
    
    // Update the previous length ref
    previousPhotosLengthRef.current = currentLength;
    setPreviousPhotosLength(currentLength);
  }, [photos.length]); // Only depend on photos.length, not previousPhotosLength state

  // Clear framed image cache when theme changes
  useEffect(() => {
    // Clean up existing blob URLs
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
  }, [tezdevTheme]);

  // Show batch video tip after first render completion (once in a lifetime)
  useEffect(() => {
    // Only show if user hasn't seen it before
    if (hasSeenBatchVideoTip()) {
      return;
    }

    // Check if we have at least one completed photo (not generating, not loading, has images)
    const hasCompletedPhoto = photos.some(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    // Check if any photos are currently generating
    const hasGeneratingPhoto = photos.some(photo => photo.generating);

    // Show the tip if we have completed photos and nothing is currently generating
    if (hasCompletedPhoto && !hasGeneratingPhoto && !showBatchVideoTip) {
      // Delay showing the tip by 2 seconds after completion
      const showTimer = setTimeout(() => {
        setShowBatchVideoTip(true);
      }, 2000);

      return () => clearTimeout(showTimer);
    }
  }, [photos, showBatchVideoTip]);

  // Auto-dismiss batch video tip after 4 seconds
  useEffect(() => {
    if (showBatchVideoTip) {
      const dismissTimer = setTimeout(() => {
        setShowBatchVideoTip(false);
        markBatchVideoTipShown();
      }, 4000);

      return () => clearTimeout(dismissTimer);
    }
  }, [showBatchVideoTip]);

  // Clear framed image cache when aspect ratio changes
  useEffect(() => {
    // Clean up existing blob URLs
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
  }, [aspectRatio]);

  // Clear framed image cache when QR watermark settings change
  useEffect(() => {
    // Clean up existing blob URLs
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
  }, [settings.sogniWatermark, settings.sogniWatermarkSize, settings.sogniWatermarkMargin, settings.qrCodeUrl]);
  
  // Effect to handle the 5-second timeout for showing the "more" button during generation
  useEffect(() => {
    if (isGenerating && selectedPhotoIndex === null) {
      // Start the 5-second timeout when generation begins
      setShowMoreButtonDuringGeneration(false);
      const timeoutId = setTimeout(() => {
        setShowMoreButtonDuringGeneration(true);
      }, 5000); // 5 seconds

      return () => {
        clearTimeout(timeoutId);
      };
    } else {
      // Reset the state when not generating or when a photo is selected
      setShowMoreButtonDuringGeneration(false);
    }
  }, [isGenerating, selectedPhotoIndex]);


  // Handler for the "more" button that can either generate more or cancel current generation
  const handleMoreButtonClick = useCallback(async () => {
    if (onClearQrCode) {
      onClearQrCode();
    }
    
    // Clear framed image cache when generating more photos
    console.log('Clearing framed image cache due to "More" button click');
    Object.values(framedImageUrls).forEach(url => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    setFramedImageUrls({});
    
    // Clear mobile share cache since photo indices will change
    if (onClearMobileShareCache) {
      console.log('Clearing mobile share cache due to "More" button click');
      onClearMobileShareCache();
    }
    
    // Clean up all transition/music state for new batch
    console.log('Clearing transition and music state for new batch');
    if (appliedMusic?.audioUrl) {
      URL.revokeObjectURL(appliedMusic.audioUrl);
    }
    setAppliedMusic(null);
    setIsTransitionMode(false);
    setTransitionVideoQueue([]);
    setAllTransitionVideosComplete(false);
    setCurrentVideoIndexByPhoto({});
    setMusicFile(null);
    setAudioWaveform(null);
    setMusicStartOffset(0);
    setAudioDuration(0);
    setIsPlayingPreview(false);
    setPreviewPlayhead(0);
    setIsInlineAudioMuted(false);
    setShowMusicModal(false);
    setBatchActionMode('download'); // Reset to default mode
    setSelectedPresetId(null);
    setIsLoadingPreset(false);
    
    // Stop any playing audio
    if (inlineAudioRef.current) {
      inlineAudioRef.current.pause();
      inlineAudioRef.current.src = '';
    }
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current.src = '';
    }
    
    // Reset audio tracking refs
    audioReadyRef.current = false;
    lastAppliedMusicUrlRef.current = null;
    
    if (isGenerating && activeProjectReference.current) {
      // Cancel current project before opening ImageAdjuster
      console.log('Cancelling current project from more button:', activeProjectReference.current);
      try {
        if (sogniClient && sogniClient.cancelProject) {
          await sogniClient.cancelProject(activeProjectReference.current);
        }
        activeProjectReference.current = null;
        // Reset the timeout state
        setShowMoreButtonDuringGeneration(false);
        // Open ImageAdjuster after canceling
        if (handleOpenImageAdjusterForNextBatch) {
          handleOpenImageAdjusterForNextBatch();
        }
      } catch (error) {
        console.warn('Error cancelling project from more button:', error);
        // Even if cancellation fails, open ImageAdjuster
        if (handleOpenImageAdjusterForNextBatch) {
          handleOpenImageAdjusterForNextBatch();
        }
      }
    } else {
      // Open ImageAdjuster for batch configuration
      if (handleOpenImageAdjusterForNextBatch) {
        handleOpenImageAdjusterForNextBatch();
      }
    }
  }, [isGenerating, activeProjectReference, sogniClient, handleOpenImageAdjusterForNextBatch, framedImageUrls, onClearQrCode, onClearMobileShareCache, appliedMusic]);

  // Generate QR code when qrCodeData changes
  useEffect(() => {
    const generateQRCode = async () => {
      if (!qrCodeData || !qrCodeData.shareUrl) {
        setQrCodeDataUrl('');
        return;
      }

      // Handle loading state - don't generate QR for loading placeholder
      if (qrCodeData.shareUrl === 'loading' || qrCodeData.isLoading) {
        setQrCodeDataUrl('loading');
        return;
      }

      try {
        const qrDataUrl = await QRCode.toDataURL(qrCodeData.shareUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        setQrCodeDataUrl(qrDataUrl);
      } catch (error) {
        console.error('Error generating QR code:', error);
        setQrCodeDataUrl('');
      }
    };

    generateQRCode();
  }, [qrCodeData]);

  // Helper function to generate consistent frame keys that include QR settings
  const generateFrameKey = useCallback((photoIndex, subIndex, taipeiFrameNumber) => {
    const qrSettings = settings.sogniWatermark 
      ? `-qr${settings.sogniWatermarkSize || 94}-${settings.sogniWatermarkMargin || 16}-${encodeURIComponent(settings.qrCodeUrl || 'https://qr.sogni.ai')}`
      : '';
    return `${photoIndex}-${subIndex}-${tezdevTheme}-${taipeiFrameNumber}-${outputFormat}-${aspectRatio}${qrSettings}`;
  }, [tezdevTheme, outputFormat, aspectRatio, settings.sogniWatermark, settings.sogniWatermarkSize, settings.sogniWatermarkMargin, settings.qrCodeUrl]);

  // Utility function to clear frame cache for a specific photo
  const clearFrameCacheForPhoto = useCallback((photoIndex) => {
    console.log(`Clearing frame cache for photo #${photoIndex}`);
    setFramedImageUrls(prev => {
      const keysToRemove = Object.keys(prev).filter(key => key.startsWith(`${photoIndex}-`));
      if (keysToRemove.length === 0) return prev;
      // Revoke any blob URLs
      keysToRemove.forEach(key => {
        const url = prev[key];
        if (url && typeof url === 'string' && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch (e) { /* no-op */ }
        }
      });
      const cleaned = { ...prev };
      keysToRemove.forEach(key => delete cleaned[key]);
      return cleaned;
    });
  }, []);
  
  // Function to clear all frame cache
  const clearAllFrameCache = useCallback(() => {
    console.log('Clearing all frame cache');
    setFramedImageUrls(prev => {
      // Revoke all blob URLs
      Object.values(prev).forEach(url => {
        if (url && typeof url === 'string' && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch (e) { /* no-op */ }
        }
      });
      return {};
    });
  }, []);

  // Handler to refresh a single photo - wrapper for the prop function
  const onRefreshPhoto = useCallback(async (photoIndex) => {
    if (!handleRefreshPhoto) {
      console.error('handleRefreshPhoto prop not provided');
      return;
    }

    // Mark this photo as refreshing
    setRefreshingPhotos(prev => new Set(prev).add(photoIndex));

    try {
      await handleRefreshPhoto(photoIndex, authState, refreshingPhotos);
    } finally {
      // Remove from refreshing set after completion (or failure)
      setTimeout(() => {
        setRefreshingPhotos(prev => {
          const newSet = new Set(prev);
          newSet.delete(photoIndex);
          return newSet;
        });
      }, 1000); // Delay to allow state updates to complete
    }
  }, [handleRefreshPhoto, authState, refreshingPhotos]);
  
  // Register frame cache clearing function with parent
  useEffect(() => {
    if (onRegisterFrameCacheClear) {
      onRegisterFrameCacheClear(clearAllFrameCache);
    }
  }, [onRegisterFrameCacheClear, clearAllFrameCache]);

  // Cleanup old framed image cache entries to prevent memory leaks
  const cleanupFramedImageCache = useCallback(() => {
    const minEntries = 16; // Always keep at least 16 framed images for smooth navigation
    const maxEntries = 32; // Start cleanup when we exceed 32 entries
    
    setFramedImageUrls(prev => {
      const entries = Object.entries(prev);
      
      if (entries.length <= maxEntries) {
        return prev; // No cleanup needed
      }
      
      // Create a priority scoring system for cache entries
      const scoredEntries = entries.map(([key, url]) => {
        const [photoIndexStr, subIndexStr] = key.split('-');
        const photoIndex = parseInt(photoIndexStr);
        const subIndex = parseInt(subIndexStr);
        
        let score = 0;
        
        // Higher score for recently viewed photos (closer to current selection)
        if (selectedPhotoIndex !== null) {
          const distance = Math.abs(photoIndex - selectedPhotoIndex);
          score += Math.max(0, 20 - distance); // Photos within 20 indices get higher scores
        }
        
        // Higher score for main images (subIndex 0) vs enhanced images (subIndex -1)
        if (subIndex === 0) {
          score += 5;
        } else if (subIndex === -1) {
          score += 3; // Enhanced images are also important
        }
        
        // Higher score for more recent photos (higher indices)
        score += photoIndex * 0.1;
        
        return { key, url, score, photoIndex };
      });
      
      // Sort by score (descending) to keep highest priority entries
      scoredEntries.sort((a, b) => b.score - a.score);
      
      // Keep at least minEntries, but prioritize by score
      const entriesToKeep = scoredEntries.slice(0, Math.max(minEntries, maxEntries - 8));
      const entriesToRemove = scoredEntries.slice(entriesToKeep.length);
      
      // Revoke blob URLs for removed entries
      entriesToRemove.forEach(({ url }) => {
        if (url && typeof url === 'string' && url.startsWith('blob:')) {
          try { URL.revokeObjectURL(url); } catch (e) { /* no-op */ }
        }
      });
      
      console.log(`Cache cleanup: keeping ${entriesToKeep.length} entries, removing ${entriesToRemove.length} entries`);
      
      return Object.fromEntries(entriesToKeep.map(({ key, url }) => [key, url]));
    });
  }, [selectedPhotoIndex]);
  
  // Run framed image cleanup when cache gets large
  useEffect(() => {
    const entries = Object.keys(framedImageUrls).length;
    if (entries > 32) { // Trigger cleanup when we have more than 32 entries
      cleanupFramedImageCache();
    }
  }, [framedImageUrls]); // Removed cleanupFramedImageCache function from dependencies

  // Clear touch hover when clicking anywhere outside in Vibe Explorer
  useEffect(() => {
    if (!isPromptSelectorMode) return;
    
    const handleGlobalClick = (e) => {
      // Check if click is inside a film-frame or icon
      const clickedFilmFrame = e.target.closest('.film-frame');
      const clickedIcon = e.target.closest('.vibe-icons-container, .photo-favorite-btn, .photo-fullscreen-btn, .photo-video-btn, .photo-block-btn');
      
      if (!clickedFilmFrame && !clickedIcon && touchHoveredPhotoIndex !== null) {
        setTouchHoveredPhotoIndex(null);
      }
    };
    
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [isPromptSelectorMode, touchHoveredPhotoIndex]);

  // Handle enhancement with Krea (default behavior)
  const handleEnhanceWithKrea = useCallback(() => {
    setShowEnhanceDropdown(false);
    
    // Check if we can enhance
    if (selectedPhotoIndex === null) return;
    
    const photo = photos[selectedPhotoIndex];
    if (!photo || photo.enhancing) {
      console.log('[ENHANCE] Already enhancing or no photo, ignoring click');
      return;
    }
    
    // Call enhancePhoto directly without setTimeout - it will handle all state management
    enhancePhoto({
      photo: photo,
      photoIndex: selectedPhotoIndex,
      subIndex: selectedSubIndex || 0,
      width: desiredWidth,
      height: desiredHeight,
      sogniClient,
      setPhotos,
      outputFormat: outputFormat,
      clearFrameCache: clearFrameCacheForPhoto,
      clearQrCode: onClearQrCode, // Pass QR clearing function
      onSetActiveProject: (projectId) => {
        activeProjectReference.current = projectId;
      },
      tokenType: tokenType, // Use user's saved payment preference
      onOutOfCredits: onOutOfCredits // Pass out of credits callback
    });
  }, [selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, outputFormat, clearFrameCacheForPhoto, activeProjectReference, enhancePhoto, photos, onClearQrCode, onOutOfCredits, tokenType]);

  // Handle enhancement with Kontext (with custom prompt)
  const handleEnhanceWithKontext = useCallback(() => {
    setShowEnhanceDropdown(false);
    setShowPromptModal(true);
    setCustomPrompt('');
  }, []);

  // Unified submit handler that supports direct text submission (used by chips)
  const submitPrompt = useCallback((promptText) => {
    const trimmed = (promptText || '').trim();
    if (!trimmed) return;

    setShowPromptModal(false);

    // Check if we can enhance
    if (selectedPhotoIndex === null) return;
    
    const photo = photos[selectedPhotoIndex];
    if (!photo || photo.enhancing) {
      console.log('[ENHANCE] Already enhancing or no photo, ignoring Kontext enhance');
      return;
    }

    // Call enhancePhoto directly without setTimeout - it will handle all state management
    enhancePhoto({
      photo: photo,
      photoIndex: selectedPhotoIndex,
      subIndex: selectedSubIndex || 0,
      width: desiredWidth,
      height: desiredHeight,
      sogniClient,
      setPhotos,
      outputFormat: outputFormat,
      clearFrameCache: clearFrameCacheForPhoto,
      clearQrCode: onClearQrCode, // Pass QR clearing function
      onSetActiveProject: (projectId) => {
        activeProjectReference.current = projectId;
      },
      // Kontext-specific parameters
      useKontext: true,
      customPrompt: trimmed,
      tokenType: tokenType, // Use user's saved payment preference
      onOutOfCredits: onOutOfCredits // Pass out of credits callback
    });
  }, [selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, outputFormat, clearFrameCacheForPhoto, activeProjectReference, enhancePhoto, onClearQrCode, photos, onOutOfCredits, tokenType]);

  // Handle prompt modal submission
  const handlePromptSubmit = useCallback(() => {
    submitPrompt(customPrompt);
  }, [submitPrompt, customPrompt]);

  // Handle prompt modal cancel
  const handlePromptCancel = useCallback(() => {
    setShowPromptModal(false);
    setCustomPrompt('');
  }, []);

  // ============================================
  // Video Generation Handlers
  // ============================================

  // Handle Video button click
  const handleVideoButtonClick = useCallback(() => {
    // Show the video options list instead of the video dropdown directly
    setShowVideoOptionsList(prev => !prev);
  }, []);

  // Handle video intro popup dismiss
  const handleVideoIntroDismiss = useCallback(() => {
    setShowVideoIntroPopup(false);
    setVideoTargetPhotoIndex(null); // Clear target when popup is dismissed
  }, []);

  // Handle video intro popup proceed (user wants to generate)
  const handleVideoIntroProceed = useCallback(() => {
    setShowVideoIntroPopup(false);
    setShowVideoDropdown(true);
  }, []);

  // Register trigger function with parent component (App.jsx)
  useEffect(() => {
    if (onRegisterVideoIntroTrigger) {
      // Function that can be called from parent to trigger video intro popup
      const triggerVideoIntro = () => {
        // Only show if user hasn't seen it before
        if (!hasSeenVideoIntro()) {
          setShowVideoIntroPopup(true);
        }
      };
      onRegisterVideoIntroTrigger(triggerVideoIntro);
    }
  }, [onRegisterVideoIntroTrigger]);

  // Handle opening video settings - works from both Motion and Transition video popups
  const handleOpenVideoSettings = useCallback(() => {
    // Close any video popups that might be open
    setShowVideoDropdown(false);
    setShowTransitionVideoPopup(false);
    // Stop audio preview if playing
    setIsPlayingPreview(false);
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }
    // Open the settings overlay
    handleShowControlOverlay();
    // Expand video section and scroll to it after overlay animation completes
    setTimeout(() => {
      const videoSection = document.getElementById('video-settings-section');
      const scrollContainer = document.querySelector('.control-overlay');
      
      if (videoSection && scrollContainer) {
        // Click on the toggle to expand if not already expanded
        const toggle = videoSection.querySelector('.advanced-toggle-subtle');
        if (toggle) {
          const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
          if (!isExpanded) {
            toggle.click();
          }
        }
        // Give a bit more time for expansion animation, then scroll
        setTimeout(() => {
          // Calculate scroll position - get element position relative to scroll container
          const containerRect = scrollContainer.getBoundingClientRect();
          const elementRect = videoSection.getBoundingClientRect();
          const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 3);
          
          // Scroll the overlay container directly
          scrollContainer.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: 'smooth'
          });
          
          // Add highlight animation
          videoSection.classList.add('video-settings-highlight');
          // Remove highlight after animation completes
          setTimeout(() => {
            videoSection.classList.remove('video-settings-highlight');
          }, 2000);
        }, 200);
      }
    }, 400);
  }, [handleShowControlOverlay]);

  // Handle video generation
  const handleGenerateVideo = useCallback(async (customMotionPrompt = null, customNegativePrompt = null, motionEmoji = null) => {
    setShowVideoDropdown(false);
    setSelectedMotionCategory(null); // Reset category selection

    // Pre-warm audio for iOS - must happen during user gesture
    // This unlocks audio so sonic logo can play when video completes
    warmUpAudio();

    // Use videoTargetPhotoIndex if set (from gallery motion button), otherwise selectedPhotoIndex (from slideshow)
    const targetIndex = videoTargetPhotoIndex !== null ? videoTargetPhotoIndex : selectedPhotoIndex;
    
    // Clear the video target after using it
    setVideoTargetPhotoIndex(null);
    
    if (targetIndex === null) return;

    const photo = photos[targetIndex];
    if (!photo || photo.generatingVideo) {
      return;
    }

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);
    
    // Show tip toast on first video generation (once per user lifetime)
    if (!hasSeenVideoTip()) {
      markVideoTipShown();
      setTimeout(() => {
        showToast({
          title: '💡 Pro Tip',
          message: 'Video in progress! You can start generating a video on another photo while you wait!',
          type: 'info',
          timeout: 8000
        });
      }, 2000);
    }

    // Get the actual image dimensions by loading the image
    const imageUrl = photo.enhancedImageUrl || photo.images?.[selectedSubIndex || 0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({
        title: 'Video Failed',
        message: 'No image available for video generation.',
        type: 'error'
      });
      return;
    }

    // Use custom prompts if provided, otherwise use settings defaults
    const motionPrompt = customMotionPrompt || settings.videoPositivePrompt || '';
    const negativePrompt = customNegativePrompt !== null ? customNegativePrompt : (settings.videoNegativePrompt || '');
    const selectedEmoji = motionEmoji || null; // Store emoji if from template
    
    // Track that this emoji has been used for video generation
    if (selectedEmoji) {
      markMotionEmojiUsed(selectedEmoji);
    }
    
    // Capture the photo index and ID for the onClick handler (don't rely on selectedPhotoIndex which may change)
    const generatingPhotoIndex = targetIndex;
    const generatingPhotoId = photo.id;

    // Load image to get actual dimensions
    const img = new Image();
    
    img.onload = () => {
      const actualWidth = img.naturalWidth || img.width;
      const actualHeight = img.naturalHeight || img.height;
      
      generateVideo({
        photo,
        photoIndex: generatingPhotoIndex,
        subIndex: selectedSubIndex || 0,
        imageWidth: actualWidth,
        imageHeight: actualHeight,
        sogniClient,
        setPhotos,
        resolution: settings.videoResolution || '480p',
        quality: settings.videoQuality || 'fast',
        fps: settings.videoFramerate || 16,
        duration: settings.videoDuration || 5,
        positivePrompt: motionPrompt,
        negativePrompt: negativePrompt,
        motionEmoji: selectedEmoji,
        tokenType: tokenType,
        onComplete: (videoUrl) => {
          // Play sonic logo before auto-play (respects sound settings)
          playSonicLogo(settings.soundEnabled);
          // Auto-play the generated video when completed
          setPlayingGeneratedVideoIds(prev => new Set([...prev, generatingPhotoId]));
          const videoMessage = getRandomVideoMessage();

          console.log('[VIDEO TOAST] Video generation completed:', {
            generatingPhotoId,
            generatingPhotoIndex,
            videoUrl
          });
          
          // Show success toast with click handler to navigate to photo
          showToast({
            title: videoMessage.title,
            message: videoMessage.message,
            type: 'success',
            onClick: () => {
              console.log('[VIDEO TOAST] Toast clicked!');
              console.log('[VIDEO TOAST] Current selectedPhotoIndex:', selectedPhotoIndex);
              console.log('[VIDEO TOAST] Looking for photo with ID:', generatingPhotoId);
              console.log('[VIDEO TOAST] Total photos in array:', photos.length);
              
              // Find current index of the photo that just completed video generation
              const currentIndex = photos.findIndex(p => p.id === generatingPhotoId);
              
              console.log('[VIDEO TOAST] Found photo at index:', currentIndex);
              
              // Always navigate to the photo - this will either:
              // 1. Open slideshow if it's closed
              // 2. Switch to this photo if slideshow is open to a different photo
              // 3. Re-select the same photo if already viewing it (harmless)
              if (currentIndex !== -1) {
                console.log('[VIDEO TOAST] Navigating to index', currentIndex);
                setSelectedPhotoIndex(currentIndex);
              } else {
                console.warn('[VIDEO TOAST] Photo with ID', generatingPhotoId, 'not found in photos array');
              }
            }
          });
        },
        onError: (error) => {
          showToast({
            title: 'Video Failed',
            message: error.message || 'Video generation failed. Please try again.',
            type: 'error'
          });
        },
        onCancel: () => {
          showToast({
            title: 'Video Cancelled',
            message: 'Video generation was cancelled.',
            type: 'info'
          });
        },
        onOutOfCredits: () => {
          console.log('[VIDEO] Triggering out of credits popup from video generation');
          if (onOutOfCredits) {
            onOutOfCredits();
          }
        }
      });
    };
    
    img.onerror = () => {
      // Fallback to generation target dimensions
      const fallbackWidth = desiredWidth || 768;
      const fallbackHeight = desiredHeight || 1024;
      
      generateVideo({
        photo,
        photoIndex: generatingPhotoIndex,
        subIndex: selectedSubIndex || 0,
        imageWidth: fallbackWidth,
        imageHeight: fallbackHeight,
        sogniClient,
        setPhotos,
        resolution: settings.videoResolution || '480p',
        quality: settings.videoQuality || 'fast',
        fps: settings.videoFramerate || 16,
        duration: settings.videoDuration || 5,
        positivePrompt: motionPrompt,
        negativePrompt: negativePrompt,
        tokenType: tokenType,
        onComplete: (videoUrl) => {
          // Play sonic logo before auto-play (respects sound settings)
          playSonicLogo(settings.soundEnabled);
          // Auto-play the generated video when completed
          setPlayingGeneratedVideoIds(prev => new Set([...prev, generatingPhotoId]));
          const videoMessage = getRandomVideoMessage();

          console.log('[VIDEO TOAST FALLBACK] Video generation completed:', {
            generatingPhotoId,
            generatingPhotoIndex,
            videoUrl
          });
          
          // Show success toast with click handler to navigate to photo
          showToast({
            title: videoMessage.title,
            message: videoMessage.message,
            type: 'success',
            onClick: () => {
              console.log('[VIDEO TOAST FALLBACK] Toast clicked!');
              console.log('[VIDEO TOAST FALLBACK] Current selectedPhotoIndex:', selectedPhotoIndex);
              console.log('[VIDEO TOAST FALLBACK] Looking for photo with ID:', generatingPhotoId);
              console.log('[VIDEO TOAST FALLBACK] Total photos in array:', photos.length);
              
              // Find current index of the photo that just completed video generation
              const currentIndex = photos.findIndex(p => p.id === generatingPhotoId);
              
              console.log('[VIDEO TOAST FALLBACK] Found photo at index:', currentIndex);
              
              // Always navigate to the photo - this will either:
              // 1. Open slideshow if it's closed
              // 2. Switch to this photo if slideshow is open to a different photo
              // 3. Re-select the same photo if already viewing it (harmless)
              if (currentIndex !== -1) {
                console.log('[VIDEO TOAST FALLBACK] Navigating to index', currentIndex);
                setSelectedPhotoIndex(currentIndex);
              } else {
                console.warn('[VIDEO TOAST FALLBACK] Photo with ID', generatingPhotoId, 'not found in photos array');
              }
            }
          });
        },
        onError: (error) => {
          showToast({
            title: 'Video Failed',
            message: error.message || 'Video generation failed. Please try again.',
            type: 'error'
          });
        },
        onCancel: () => {
          showToast({
            title: 'Video Cancelled',
            message: 'Video generation was cancelled.',
            type: 'info'
          });
        },
        onOutOfCredits: () => {
          console.log('[VIDEO] Triggering out of credits popup from video generation (fallback)');
          if (onOutOfCredits) {
            onOutOfCredits();
          }
        }
      });
    };
    
    img.src = imageUrl;
  }, [videoTargetPhotoIndex, selectedPhotoIndex, selectedSubIndex, desiredWidth, desiredHeight, sogniClient, setPhotos, settings.videoResolution, settings.videoQuality, photos, showToast]);

  // Handle BASE Hero video generation (single)
  const handleBaseHeroVideo = useCallback(async () => {
    setShowVideoOptionsList(false);
    setShowBaseHeroPopup(true);
  }, []);

  // Handle BASE Hero video generation execution (single)
  const handleBaseHeroVideoExecute = useCallback(async () => {
    setShowBaseHeroPopup(false);
    
    // Pre-warm audio for iOS
    warmUpAudio();

    // Use videoTargetPhotoIndex if set (from gallery motion button), otherwise selectedPhotoIndex (from slideshow)
    const targetIndex = videoTargetPhotoIndex !== null ? videoTargetPhotoIndex : selectedPhotoIndex;
    
    // Clear the video target after using it
    setVideoTargetPhotoIndex(null);
    
    if (targetIndex === null) return;

    const photo = photos[targetIndex];
    if (!photo || photo.generatingVideo) {
      return;
    }

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);

    // Get the actual image dimensions by loading the image
    const imageUrl = photo.enhancedImageUrl || photo.images?.[selectedSubIndex || 0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({
        title: 'Video Failed',
        message: 'No image available for video generation.',
        type: 'error'
      });
      return;
    }

    // Load image to get actual dimensions
    const img = new Image();
    img.onload = () => {
      const actualWidth = img.naturalWidth;
      const actualHeight = img.naturalHeight;
      const generatingPhotoId = photo.id;
      const generatingPhotoIndex = targetIndex;

      generateVideo({
        photo: photo,
        photoIndex: generatingPhotoIndex,
        subIndex: selectedSubIndex || 0,
        imageWidth: actualWidth,
        imageHeight: actualHeight,
        sogniClient,
        setPhotos,
        resolution: settings.videoResolution || '480p',
        quality: settings.videoQuality || 'fast',
        fps: settings.videoFramerate || 16,
        duration: 5, // BASE Hero videos are always 5 seconds
        positivePrompt: BASE_HERO_PROMPT,
        negativePrompt: settings.videoNegativePrompt || '',
        tokenType: tokenType,
        onComplete: (videoUrl) => {
          // Play sonic logo before auto-play (respects sound settings)
          playSonicLogo(settings.soundEnabled);
          // Auto-play the generated video when completed
          setPlayingGeneratedVideoIds(prev => new Set([...prev, generatingPhotoId]));
          const videoMessage = getRandomVideoMessage();

          console.log('[VIDEO TOAST] BASE Hero video generation completed:', {
            generatingPhotoId,
            generatingPhotoIndex,
            videoUrl
          });
          
          // Show success toast with click handler to navigate to photo
          showToast({
            title: videoMessage.title,
            message: videoMessage.message,
            type: 'success',
            onClick: () => {
              console.log('[VIDEO TOAST] Toast clicked!');
              console.log('[VIDEO TOAST] Current selectedPhotoIndex:', selectedPhotoIndex);
              console.log('[VIDEO TOAST] Looking for photo with ID:', generatingPhotoId);
              console.log('[VIDEO TOAST] Total photos in array:', photos.length);
              
              // Find current index of the photo that just completed video generation
              const currentIndex = photos.findIndex(p => p.id === generatingPhotoId);
              
              console.log('[VIDEO TOAST] Found photo at index:', currentIndex);
              
              // Always navigate to the photo
              if (currentIndex !== -1) {
                console.log('[VIDEO TOAST] Navigating to index', currentIndex);
                setSelectedPhotoIndex(currentIndex);
              } else {
                console.warn('[VIDEO TOAST] Photo with ID', generatingPhotoId, 'not found in photos array');
              }
            }
          });
        },
        onError: (error) => {
          console.error('[VIDEO] BASE Hero video generation error:', error);
          showToast({
            title: 'Video Generation Failed',
            message: error.message || 'Failed to generate video. Please try again.',
            type: 'error'
          });
        },
        onOutOfCredits: () => {
          console.log('[VIDEO] Triggering out of credits popup from BASE Hero video generation');
          if (onOutOfCredits) {
            onOutOfCredits();
          }
        }
      });
    };
    
    img.src = imageUrl;
  }, [videoTargetPhotoIndex, selectedPhotoIndex, selectedSubIndex, sogniClient, setPhotos, settings.videoResolution, settings.videoQuality, settings.videoFramerate, settings.videoNegativePrompt, settings.soundEnabled, photos, showToast, tokenType, onOutOfCredits, setPlayingGeneratedVideoIds, setSelectedPhotoIndex, setShowVideoNewBadge]);

  // Handle Prompt Video generation (single)
  const handlePromptVideo = useCallback(async () => {
    setShowVideoOptionsList(false);
    setShowPromptVideoPopup(true);
  }, []);

  // Handle Prompt Video generation execution (single)
  const handlePromptVideoExecute = useCallback(async (prompt) => {
    setShowPromptVideoPopup(false);
    
    // Pre-warm audio for iOS
    warmUpAudio();

    // Use videoTargetPhotoIndex if set (from gallery motion button), otherwise selectedPhotoIndex (from slideshow)
    const targetIndex = videoTargetPhotoIndex !== null ? videoTargetPhotoIndex : selectedPhotoIndex;
    
    // Clear the video target after using it
    setVideoTargetPhotoIndex(null);
    
    if (targetIndex === null) return;

    const photo = photos[targetIndex];
    if (!photo || photo.generatingVideo) {
      return;
    }

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);

    // Get the actual image dimensions by loading the image
    const imageUrl = photo.enhancedImageUrl || photo.images?.[selectedSubIndex || 0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({
        title: 'Video Failed',
        message: 'No image available for video generation.',
        type: 'error'
      });
      return;
    }

    // Load image to get actual dimensions
    const img = new Image();
    img.onload = () => {
      const actualWidth = img.naturalWidth;
      const actualHeight = img.naturalHeight;
      const generatingPhotoId = photo.id;
      const generatingPhotoIndex = targetIndex;

      generateVideo({
        photo: photo,
        photoIndex: generatingPhotoIndex,
        subIndex: selectedSubIndex || 0,
        imageWidth: actualWidth,
        imageHeight: actualHeight,
        sogniClient,
        setPhotos,
        resolution: settings.videoResolution || '480p',
        quality: settings.videoQuality || 'fast',
        fps: settings.videoFramerate || 16,
        duration: settings.videoDuration || 5,
        positivePrompt: prompt,
        negativePrompt: settings.videoNegativePrompt || '',
        tokenType: tokenType,
        onComplete: (videoUrl) => {
          // Play sonic logo before auto-play (respects sound settings)
          playSonicLogo(settings.soundEnabled);
          // Auto-play the generated video when completed
          setPlayingGeneratedVideoIds(prev => new Set([...prev, generatingPhotoId]));
          const videoMessage = getRandomVideoMessage();

          showToast({
            title: videoMessage.title,
            message: videoMessage.message,
            type: 'success',
            onClick: () => {
              const currentIndex = photos.findIndex(p => p.id === generatingPhotoId);
              if (currentIndex !== -1) {
                setSelectedPhotoIndex(currentIndex);
              }
            }
          });
        },
        onError: (error) => {
          console.error('[VIDEO] Prompt video generation error:', error);
          showToast({
            title: 'Video Generation Failed',
            message: error.message || 'Failed to generate video. Please try again.',
            type: 'error'
          });
        },
        onOutOfCredits: () => {
          if (onOutOfCredits) {
            onOutOfCredits();
          }
        }
      });
    };
    
    img.src = imageUrl;
  }, [videoTargetPhotoIndex, selectedPhotoIndex, selectedSubIndex, sogniClient, setPhotos, settings.videoResolution, settings.videoQuality, settings.videoFramerate, settings.videoDuration, settings.videoNegativePrompt, settings.soundEnabled, photos, showToast, tokenType, onOutOfCredits, setPlayingGeneratedVideoIds, setSelectedPhotoIndex, setShowVideoNewBadge]);

  // Handle batch BASE Hero video generation
  const handleBatchBaseHeroVideo = useCallback(async () => {
    setShowBatchVideoDropdown(false);
    setShowBatchBaseHeroPopup(true);
  }, []);

  // Handle batch BASE Hero video generation execution
  const handleBatchBaseHeroVideoExecute = useCallback(async () => {
    setShowBatchBaseHeroPopup(false);
    
    // Pre-warm audio for iOS
    warmUpAudio();

    // Get all loaded photos (excluding hidden/discarded ones)
    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({
        title: 'No Images',
        message: 'No images available for video generation.',
        type: 'error'
      });
      return;
    }

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);

    // Show toast for batch generation
    showToast({
      title: '🦸 Batch BASE Hero Generation',
      message: `Starting BASE Hero video generation for ${loadedPhotos.length} image${loadedPhotos.length > 1 ? 's' : ''}...`,
      type: 'info',
      timeout: 3000
    });

    // Generate videos for each photo
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < loadedPhotos.length; i++) {
      const photo = loadedPhotos[i];
      const photoIndex = photos.findIndex(p => p.id === photo.id);

      if (photoIndex === -1 || photo.generatingVideo) {
        continue;
      }

      // Get the actual image dimensions by loading the image
      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
      if (!imageUrl) {
        errorCount++;
        continue;
      }

      const generatingPhotoId = photo.id;

      // Load image to get actual dimensions
      const img = new Image();
      
      img.onload = () => {
        const actualWidth = img.naturalWidth;
        const actualHeight = img.naturalHeight;

        generateVideo({
          photo: photo,
          photoIndex: photoIndex,
          subIndex: 0,
          imageWidth: actualWidth,
          imageHeight: actualHeight,
          sogniClient,
          setPhotos,
          resolution: settings.videoResolution || '480p',
          quality: settings.videoQuality || 'fast',
          fps: settings.videoFramerate || 16,
          duration: 5, // BASE Hero videos are always 5 seconds
          positivePrompt: BASE_HERO_PROMPT,
          negativePrompt: settings.videoNegativePrompt || '',
          tokenType: tokenType,
          onComplete: (videoUrl) => {
            successCount++;
            // Play sonic logo and auto-play this video immediately as it completes
            playSonicLogo(settings.soundEnabled);
            
            // Set this polaroid to play its own video
            setCurrentVideoIndexByPhoto(prev => ({
              ...prev,
              [photo.id]: 0
            }));
            
            // Start playing this video immediately
            setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
            
            // Show completion toast for batch
            if (successCount === loadedPhotos.length) {
              showToast({
                title: '🎉 Batch Complete!',
                message: `Successfully generated ${successCount} BASE Hero video${successCount > 1 ? 's' : ''}!`,
                type: 'success',
                timeout: 5000
              });
            }
          },
          onError: (error) => {
            errorCount++;
            console.error(`[BATCH BASE HERO] Video ${i + 1} failed:`, error);
            
            if (errorCount === loadedPhotos.length) {
              showToast({
                title: 'Batch Failed',
                message: 'All videos failed to generate. Please try again.',
                type: 'error'
              });
            }
          },
          onOutOfCredits: () => {
            console.log('[VIDEO] Triggering out of credits popup from batch BASE Hero video generation');
            if (onOutOfCredits) {
              onOutOfCredits();
            }
          }
        });
      };
      
      img.src = imageUrl;
    }
  }, [photos, sogniClient, setPhotos, settings.videoResolution, settings.videoQuality, settings.videoFramerate, settings.videoNegativePrompt, settings.soundEnabled, tokenType, desiredWidth, desiredHeight, showToast, onOutOfCredits, setPlayingGeneratedVideoIds, setShowVideoNewBadge, setCurrentVideoIndexByPhoto]);

  // Handle batch Prompt Video generation
  const handleBatchPromptVideo = useCallback(async () => {
    setShowBatchVideoDropdown(false);
    setShowBatchPromptVideoPopup(true);
  }, []);

  // Handle batch Prompt Video generation execution
  const handleBatchPromptVideoExecute = useCallback(async (prompt) => {
    setShowBatchPromptVideoPopup(false);
    
    // Pre-warm audio for iOS
    warmUpAudio();

    // Get all loaded photos (excluding hidden/discarded ones)
    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({
        title: 'No Images',
        message: 'No images available for video generation.',
        type: 'error'
      });
      return;
    }

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);

    // Show toast for batch generation
    showToast({
      title: '✨ Batch Prompt Video Generation',
      message: `Starting prompt video generation for ${loadedPhotos.length} image${loadedPhotos.length > 1 ? 's' : ''}...`,
      type: 'info',
      timeout: 3000
    });

    // Generate videos for each photo
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < loadedPhotos.length; i++) {
      const photo = loadedPhotos[i];
      const photoIndex = photos.findIndex(p => p.id === photo.id);

      if (photoIndex === -1 || photo.generatingVideo) {
        continue;
      }

      // Get the actual image dimensions by loading the image
      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
      if (!imageUrl) {
        errorCount++;
        continue;
      }

      const generatingPhotoId = photo.id;

      // Load image to get actual dimensions
      const img = new Image();
      
      img.onload = () => {
        const actualWidth = img.naturalWidth;
        const actualHeight = img.naturalHeight;

        generateVideo({
          photo: photo,
          photoIndex: photoIndex,
          subIndex: 0,
          imageWidth: actualWidth,
          imageHeight: actualHeight,
          sogniClient,
          setPhotos,
          resolution: settings.videoResolution || '480p',
          quality: settings.videoQuality || 'fast',
          fps: settings.videoFramerate || 16,
          duration: settings.videoDuration || 5,
          positivePrompt: prompt,
          negativePrompt: settings.videoNegativePrompt || '',
          tokenType: tokenType,
          onComplete: (videoUrl) => {
            successCount++;
            // Play sonic logo and auto-play this video immediately as it completes
            playSonicLogo(settings.soundEnabled);
            
            // Set this polaroid to play its own video
            setCurrentVideoIndexByPhoto(prev => ({
              ...prev,
              [photo.id]: 0
            }));
            
            // Start playing this video immediately
            setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
            
            // Show completion toast for batch
            if (successCount === loadedPhotos.length) {
              showToast({
                title: '🎉 Batch Complete!',
                message: `Successfully generated ${successCount} prompt video${successCount > 1 ? 's' : ''}!`,
                type: 'success',
                timeout: 5000
              });
            }
          },
          onError: (error) => {
            errorCount++;
            console.error(`[BATCH PROMPT VIDEO] Video ${i + 1} failed:`, error);
            
            if (errorCount === loadedPhotos.length) {
              showToast({
                title: 'Batch Failed',
                message: 'All videos failed to generate. Please try again.',
                type: 'error'
              });
            }
          },
          onOutOfCredits: () => {
            if (onOutOfCredits) {
              onOutOfCredits();
            }
          }
        });
      };
      
      img.src = imageUrl;
    }
  }, [photos, sogniClient, setPhotos, settings.videoResolution, settings.videoQuality, settings.videoFramerate, settings.videoDuration, settings.videoNegativePrompt, settings.soundEnabled, showToast, tokenType, onOutOfCredits, setPlayingGeneratedVideoIds, setCurrentVideoIndexByPhoto, setShowVideoNewBadge]);

  // Handle batch video generation for all images
  const handleBatchGenerateVideo = useCallback(async (customMotionPrompt = null, customNegativePrompt = null, motionEmoji = null) => {
    setShowBatchVideoDropdown(false);
    setSelectedMotionCategory(null);

    // Pre-warm audio for iOS
    warmUpAudio();

    // Get all loaded photos (excluding hidden/discarded ones)
    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({
        title: 'No Images',
        message: 'No images available for video generation.',
        type: 'error'
      });
      return;
    }

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);

    // Use custom prompts if provided, otherwise use settings defaults
    const motionPrompt = customMotionPrompt || settings.videoPositivePrompt || '';
    const negativePrompt = customNegativePrompt !== null ? customNegativePrompt : (settings.videoNegativePrompt || '');
    const selectedEmoji = motionEmoji || null;

    // Track that this emoji has been used for video generation
    if (selectedEmoji) {
      markMotionEmojiUsed(selectedEmoji);
    }

    // Show toast for batch generation
    showToast({
      title: '🎬 Batch Video Generation',
      message: `Starting video generation for ${loadedPhotos.length} image${loadedPhotos.length > 1 ? 's' : ''}...`,
      type: 'info',
      timeout: 3000
    });

    // Generate videos for each photo
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < loadedPhotos.length; i++) {
      const photo = loadedPhotos[i];
      const photoIndex = photos.findIndex(p => p.id === photo.id);

      if (photoIndex === -1 || photo.generatingVideo) {
        continue;
      }

      // Get the actual image dimensions by loading the image
      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
      if (!imageUrl) {
        errorCount++;
        continue;
      }

      const generatingPhotoId = photo.id;

      // Load image to get actual dimensions
      const img = new Image();
      
      img.onload = () => {
        const actualWidth = img.naturalWidth || img.width;
        const actualHeight = img.naturalHeight || img.height;
        
        generateVideo({
          photo,
          photoIndex: photoIndex,
          subIndex: 0,
          imageWidth: actualWidth,
          imageHeight: actualHeight,
          sogniClient,
          setPhotos,
          resolution: settings.videoResolution || '480p',
          quality: settings.videoQuality || 'fast',
          fps: settings.videoFramerate || 16,
          duration: settings.videoDuration || 5,
          positivePrompt: motionPrompt,
          negativePrompt: negativePrompt,
          motionEmoji: selectedEmoji,
          tokenType: tokenType,
          onComplete: (videoUrl) => {
            successCount++;
            // Play sonic logo before auto-play (respects sound settings)
            playSonicLogo(settings.soundEnabled);
            // Auto-play the generated video when completed
            setPlayingGeneratedVideoIds(prev => new Set([...prev, generatingPhotoId]));
            
            if (successCount === loadedPhotos.length) {
              const videoMessage = getRandomVideoMessage();
              showToast({
                title: videoMessage.title,
                message: `All ${successCount} video${successCount > 1 ? 's' : ''} generated!`,
                type: 'success',
                timeout: 5000
              });
            }
          },
          onError: (error) => {
            errorCount++;
            if (errorCount === loadedPhotos.length) {
              showToast({
                title: 'Batch Video Failed',
                message: 'All video generations failed. Please try again.',
                type: 'error'
              });
            }
          },
          onCancel: () => {
            // Handle cancellation if needed
          },
          onOutOfCredits: () => {
            console.log('[VIDEO] Triggering out of credits popup from batch video generation');
            if (onOutOfCredits) {
              onOutOfCredits();
            }
          }
        });
      };
      
      img.onerror = () => {
        // Fallback to generation target dimensions
        const fallbackWidth = desiredWidth || 768;
        const fallbackHeight = desiredHeight || 1024;
        
        generateVideo({
          photo,
          photoIndex: photoIndex,
          subIndex: 0,
          imageWidth: fallbackWidth,
          imageHeight: fallbackHeight,
          sogniClient,
          setPhotos,
          resolution: settings.videoResolution || '480p',
          quality: settings.videoQuality || 'fast',
          fps: settings.videoFramerate || 16,
          duration: settings.videoDuration || 5,
          positivePrompt: motionPrompt,
          negativePrompt: negativePrompt,
          motionEmoji: selectedEmoji,
          tokenType: tokenType,
          onComplete: (videoUrl) => {
            successCount++;
            playSonicLogo(settings.soundEnabled);
            setPlayingGeneratedVideoIds(prev => new Set([...prev, generatingPhotoId]));
            
            if (successCount === loadedPhotos.length) {
              const videoMessage = getRandomVideoMessage();
              showToast({
                title: videoMessage.title,
                message: `All ${successCount} video${successCount > 1 ? 's' : ''} generated!`,
                type: 'success',
                timeout: 5000
              });
            }
          },
          onError: (error) => {
            errorCount++;
            if (errorCount === loadedPhotos.length) {
              showToast({
                title: 'Batch Video Failed',
                message: 'All video generations failed. Please try again.',
                type: 'error'
              });
            }
          },
          onCancel: () => {
            // Handle cancellation if needed
          },
          onOutOfCredits: () => {
            console.log('[VIDEO] Triggering out of credits popup from batch video generation (fallback)');
            if (onOutOfCredits) {
              onOutOfCredits();
            }
          }
        });
      };
      
      img.src = imageUrl;
    }
  }, [photos, sogniClient, setPhotos, settings.videoResolution, settings.videoQuality, settings.videoFramerate, settings.videoDuration, settings.videoPositivePrompt, settings.videoNegativePrompt, settings.soundEnabled, tokenType, desiredWidth, desiredHeight, showToast, onOutOfCredits, setPlayingGeneratedVideoIds]);

  // Helper function to generate and show stitched video in overlay
  const generateAndShowStitchedVideo = useCallback(async () => {
    setIsGeneratingStitchedVideo(true);
    try {
      // Use appliedMusic if available (set when videos complete if music was captured)
      // Access handleProceedDownload via ref to avoid hoisting issues
      if (!handleProceedDownloadRef.current) {
        throw new Error('handleProceedDownload not available');
      }
      const concatenatedBlob = await handleProceedDownloadRef.current(!!appliedMusic?.file, true);
      
      if (concatenatedBlob) {
        const blobUrl = URL.createObjectURL(concatenatedBlob);
        setStitchedVideoUrl(blobUrl);
        setShowStitchedVideoOverlay(true);
        // Switch bulk action button back to download mode
        setBatchActionMode('download');
        // Don't show tip yet - will show when user closes the overlay
      }
      setIsGeneratingStitchedVideo(false);
    } catch (error) {
      console.error('[Stitched Video] Failed to generate:', error);
      showToast({
        title: 'Failed',
        message: 'Failed to generate stitched video. Please try again.',
        type: 'error'
      });
      setIsGeneratingStitchedVideo(false);
    }
  }, [appliedMusic, showToast]);
  
  // Store the function in a ref so it's accessible in closures
  useEffect(() => {
    generateStitchedVideoRef.current = generateAndShowStitchedVideo;
  }, [generateAndShowStitchedVideo]);

  // Handle batch transition video generation - transitions each image to the next in sequence (circular)
  const handleBatchGenerateTransitionVideo = useCallback(async (skipConfirmation = false) => {
    // Check if there's an existing transition video that hasn't been downloaded
    if (!skipConfirmation && allTransitionVideosComplete && transitionVideoQueue.length > 0 && !transitionVideoDownloaded) {
      const confirmed = window.confirm("New batch video? FYI You haven't downloaded the last one.");
      if (!confirmed) {
        return;
      }
    }
    
    setShowBatchVideoDropdown(false);
    setSelectedMotionCategory(null);

    // Capture current music settings from refs (refs always have latest values)
    // These will be applied when the batch completes
    const capturedMusicFile = musicFileRef.current;
    const capturedMusicStartOffset = musicStartOffsetRef.current;
    console.log(`[Transition] Capturing music settings from refs: file=${!!capturedMusicFile}, isPreset=${capturedMusicFile?.isPreset}, presetUrl=${capturedMusicFile?.presetUrl}, offset=${capturedMusicStartOffset}`);

    // Pre-warm audio for iOS
    warmUpAudio();

    // Get all loaded photos (excluding hidden/discarded ones)
    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    // Debug: Log all photos and which ones are included
    console.log('[Transition] Total photos in state:', photos.length);
    console.log('[Transition] Photos breakdown:');
    photos.forEach((photo, idx) => {
      const excluded = photo.hidden || photo.loading || photo.generating || photo.error || !photo.images || photo.images.length === 0 || photo.isOriginal;
      console.log(`  [${idx}] id=${photo.id}, hidden=${photo.hidden}, loading=${photo.loading}, generating=${photo.generating}, error=${!!photo.error}, hasImages=${!!photo.images && photo.images.length > 0}, isOriginal=${photo.isOriginal}, EXCLUDED=${excluded}`);
    });
    console.log('[Transition] Loaded photos for transition:', loadedPhotos.length, loadedPhotos.map(p => p.id));

    if (loadedPhotos.length === 0) {
      showToast({
        title: 'No Images',
        message: 'No images available for transition video generation.',
        type: 'error'
      });
      return;
    }

    // Set transition mode and store the queue of photo IDs in order
    setIsTransitionMode(true);
    setTransitionVideoQueue(loadedPhotos.map(p => p.id));
    setAllTransitionVideosComplete(false);  // Reset sync mode for new batch
    setTransitionVideoDownloaded(false);  // Reset download flag for new batch
    setCurrentVideoIndexByPhoto({});  // Reset video indices
    
    // Clean up music state for new batch
    if (appliedMusic?.audioUrl) {
      URL.revokeObjectURL(appliedMusic.audioUrl);
    }
    setAppliedMusic(null);
    setIsInlineAudioMuted(false);
    if (inlineAudioRef.current) {
      inlineAudioRef.current.pause();
    }

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);

    // Use transition prompt from settings (with default fallback from DEFAULT_SETTINGS)
    const motionPrompt = settings.videoTransitionPrompt || DEFAULT_SETTINGS.videoTransitionPrompt;
    const negativePrompt = settings.videoNegativePrompt || '';

    // Show toast for batch generation
    showToast({
      title: '🔀 Batch Transition Video',
      message: `Starting transition video generation for ${loadedPhotos.length} image${loadedPhotos.length > 1 ? 's' : ''}...`,
      type: 'info',
      timeout: 3000
    });

    // Generate transition videos for each photo
    let successCount = 0;
    let errorCount = 0;
    const retryAttempts = {}; // Track retry attempts per photo
    const MAX_RETRIES = 1; // Retry failed videos once

    // Helper function to generate a single transition video with retry capability
    const generateTransitionVideoForPhoto = async (i, isRetry = false) => {
      const photo = loadedPhotos[i];
      const photoIndex = photos.findIndex(p => p.id === photo.id);
      
      // IMPORTANT: Get the CURRENT photo from state, not the captured loadedPhotos
      // This ensures we have the latest state after any refreshes
      const currentPhoto = photoIndex !== -1 ? photos[photoIndex] : null;

      const retryLabel = isRetry ? ' [RETRY]' : '';
      console.log(`[Transition]${retryLabel} Processing photo ${i + 1}/${loadedPhotos.length}: id=${photo.id}, photoIndex=${photoIndex}`);
      console.log(`[Transition]${retryLabel}   - loadedPhoto state: generatingVideo=${photo.generatingVideo}, hasImages=${!!photo.images?.length}`);
      console.log(`[Transition]${retryLabel}   - currentPhoto state: generatingVideo=${currentPhoto?.generatingVideo}, hasImages=${!!currentPhoto?.images?.length}, loading=${currentPhoto?.loading}, generating=${currentPhoto?.generating}`);

      if (photoIndex === -1 || !currentPhoto) {
        console.warn(`[Transition]${retryLabel} Photo ${photo.id} not found in photos array! Skipping.`);
        return { skipped: true };
      }
      
      // Check CURRENT photo state (not captured loadedPhotos) - skip for initial generation, allow for retries
      if (!isRetry && currentPhoto.generatingVideo) {
        console.log(`[Transition] Photo ${photo.id} already generating video. Skipping.`);
        return { skipped: true };
      }
      
      // Also check if the current photo is still loading/generating (from a refresh)
      if (currentPhoto.loading || currentPhoto.generating) {
        console.log(`[Transition]${retryLabel} Photo ${photo.id} still loading/generating. Skipping.`);
        return { skipped: true };
      }

      // Get current image from CURRENT photo state (START of transition)
      const currentImageUrl = currentPhoto.enhancedImageUrl || currentPhoto.images?.[0] || currentPhoto.originalDataUrl;
      
      // Get next image in batch (END of transition) - circular: last image uses first image
      const nextLoadedPhotoIndex = (i + 1) % loadedPhotos.length;
      const nextLoadedPhoto = loadedPhotos[nextLoadedPhotoIndex];
      const nextPhotoStateIndex = photos.findIndex(p => p.id === nextLoadedPhoto.id);
      const nextPhoto = nextPhotoStateIndex !== -1 ? photos[nextPhotoStateIndex] : nextLoadedPhoto;
      const nextImageUrl = nextPhoto.enhancedImageUrl || nextPhoto.images?.[0] || nextPhoto.originalDataUrl;
      
      console.log(`[Transition]${retryLabel} Photo ${i}: currentImageUrl=${currentImageUrl?.substring(0, 50)}..., nextImageUrl=${nextImageUrl?.substring(0, 50)}...`);
      
      if (!currentImageUrl || !nextImageUrl) {
        console.error(`[Transition]${retryLabel} Missing image URL for photo ${i}. currentImageUrl=${!!currentImageUrl}, nextImageUrl=${!!nextImageUrl}`);
        return { error: true, photoIndex: i };
      }

      const generatingPhotoId = photo.id;

      return { photo, photoIndex, currentPhoto, currentImageUrl, nextImageUrl, generatingPhotoId, i };
    };

    // Load both images to get their data
    // Uses canvas approach to handle CORS issues with S3 URLs
    const loadImageAsBuffer = async (url) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          // Set crossOrigin for S3/HTTPS URLs to enable canvas extraction
          if (url.startsWith('http')) {
            img.crossOrigin = 'anonymous';
          }
          
          img.onload = async () => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            
            try {
              // First try fetch for blob URLs (faster and more reliable)
              if (url.startsWith('blob:')) {
                const response = await fetch(url);
                if (response.ok) {
                  const imageBlob = await response.blob();
                  const arrayBuffer = await imageBlob.arrayBuffer();
                  const imageBuffer = new Uint8Array(arrayBuffer);
                  resolve({ buffer: imageBuffer, width, height });
                  return;
                }
              }
              
              // For HTTPS URLs or if fetch fails, use canvas approach
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              // Convert canvas to blob
              canvas.toBlob((blob) => {
                if (blob) {
                  blob.arrayBuffer().then(arrayBuffer => {
                    const imageBuffer = new Uint8Array(arrayBuffer);
                    resolve({ buffer: imageBuffer, width, height });
                  }).catch(reject);
                } else {
                  reject(new Error('Failed to convert canvas to blob'));
                }
              }, 'image/png');
              
            } catch (error) {
              // If canvas is tainted (CORS), try to use canvas anyway
              console.warn('[Transition] Image load via fetch failed, trying canvas:', error.message);
              try {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob((blob) => {
                  if (blob) {
                    blob.arrayBuffer().then(arrayBuffer => {
                      const imageBuffer = new Uint8Array(arrayBuffer);
                      resolve({ buffer: imageBuffer, width, height });
                    }).catch(reject);
                  } else {
                    reject(new Error('Failed to convert canvas to blob - canvas may be tainted'));
                  }
                }, 'image/png');
              } catch (canvasError) {
                reject(new Error(`Canvas tainted by cross-origin data: ${canvasError.message}`));
              }
            }
          };
          
          img.onerror = () => {
            // If crossOrigin fails, try without it (image will display but canvas will be tainted)
            if (img.crossOrigin) {
              console.warn('[Transition] Image failed with crossOrigin, retrying without...');
              const retryImg = new Image();
              retryImg.onload = () => {
                const width = retryImg.naturalWidth || retryImg.width;
                const height = retryImg.naturalHeight || retryImg.height;
                
                // Try canvas extraction (will likely fail due to taint, but worth trying)
                try {
                  const canvas = document.createElement('canvas');
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(retryImg, 0, 0);
                  
                  canvas.toBlob((blob) => {
                    if (blob) {
                      blob.arrayBuffer().then(arrayBuffer => {
                        const imageBuffer = new Uint8Array(arrayBuffer);
                        resolve({ buffer: imageBuffer, width, height });
                      }).catch(() => reject(new Error('Failed to load image due to CORS restrictions')));
                    } else {
                      reject(new Error('Failed to load image due to CORS restrictions'));
                    }
                  }, 'image/png');
                } catch {
                  reject(new Error('Failed to load image due to CORS restrictions'));
                }
              };
              retryImg.onerror = () => reject(new Error('Failed to load image'));
              retryImg.src = url;
            } else {
              reject(new Error('Failed to load image'));
            }
          };
          
          img.src = url;
        });
      };

    // Helper to check completion and show appropriate toast
    const checkCompletion = () => {
      const totalProcessed = successCount + errorCount;
      if (totalProcessed === loadedPhotos.length) {
        setTimeout(() => {
          console.log(`[Transition] All videos processed! ${successCount} success, ${errorCount} failed. Enabling Add Music button`);
          setAllTransitionVideosComplete(true);
          
          // Reset all polaroids to start at video index 0 for synchronized looping
          const syncedIndices = {};
          loadedPhotos.forEach((p) => {
            syncedIndices[p.id] = 0;
          });
          setCurrentVideoIndexByPhoto(syncedIndices);
          
          // Increment sync counter to force all videos to reset their currentTime
          setSyncResetCounter(prev => prev + 1);
          
          // Set appliedMusic if music was captured (for use in stitched video)
          // But don't auto-play it - user will see it in the stitched video overlay
          if (capturedMusicFile && successCount > 0) {
            const audioUrl = (capturedMusicFile.isPreset && capturedMusicFile.presetUrl) 
              ? capturedMusicFile.presetUrl 
              : URL.createObjectURL(capturedMusicFile);
            
            setAppliedMusic({
              file: capturedMusicFile,
              startOffset: capturedMusicStartOffset,
              audioUrl
            });
          }
          
          if (successCount > 0 && errorCount === 0) {
            const videoMessage = getRandomVideoMessage();
            showToast({
              title: videoMessage.title,
              message: `All ${successCount} transition video${successCount > 1 ? 's' : ''} generated! Tap to view stitched video.`,
              type: 'success',
              timeout: 0,
              autoClose: false,
              onClick: () => {
                // Generate stitched video and show in overlay
                if (generateStitchedVideoRef.current) {
                  generateStitchedVideoRef.current();
                } else {
                  console.error('[Toast] generateStitchedVideoRef.current is not available');
                }
              }
            });
          } else if (successCount > 0) {
            showToast({
              title: 'Partial Success',
              message: `${successCount} of ${loadedPhotos.length} transition videos generated.`,
              type: 'info',
              timeout: 5000
            });
          } else {
            showToast({
              title: 'Batch Transition Video Failed',
              message: 'All transition video generations failed. Please try again.',
              type: 'error'
            });
          }
        }, 500);
      }
    };

    // Generate video with retry support
    const generateWithRetry = async (photoData, isRetry = false) => {
      const { photo, photoIndex, currentPhoto, currentImageUrl, nextImageUrl, i } = photoData;
      const retryLabel = isRetry ? ' [RETRY]' : '';

      try {
        // Load both images
        const [currentImage, nextImage] = await Promise.all([
          loadImageAsBuffer(currentImageUrl),
          loadImageAsBuffer(nextImageUrl)
        ]);

        // Use the current image dimensions for the video
        const actualWidth = currentImage.width;
        const actualHeight = currentImage.height;

        generateVideo({
          photo: currentPhoto,
          photoIndex: photoIndex,
          subIndex: 0,
          imageWidth: actualWidth,
          imageHeight: actualHeight,
          sogniClient,
          setPhotos,
          resolution: settings.videoResolution || '480p',
          quality: settings.videoQuality || 'fast',
          fps: settings.videoFramerate || 16,
          duration: settings.videoDuration || 5,
          positivePrompt: motionPrompt,
          negativePrompt: negativePrompt,
          tokenType: tokenType,
          referenceImage: currentImage.buffer,
          referenceImageEnd: nextImage.buffer,
          onComplete: () => {
            successCount++;
            console.log(`[Transition]${retryLabel} Video ${i + 1} completed successfully`);
            
            // Play sonic logo and auto-play this video immediately as it completes
            playSonicLogo(settings.soundEnabled);
            
            // Set this polaroid to play its own video
            setCurrentVideoIndexByPhoto(prev => ({
              ...prev,
              [photo.id]: i
            }));
            
            // Start playing this video immediately
            setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
            
            checkCompletion();
          },
          onError: async (error) => {
            console.error(`[Transition]${retryLabel} Video ${i + 1} failed:`, error);
            
            // Check if we should retry
            const currentRetries = retryAttempts[photo.id] || 0;
            if (currentRetries < MAX_RETRIES) {
              retryAttempts[photo.id] = currentRetries + 1;
              console.log(`[Transition] Retrying video ${i + 1} (attempt ${currentRetries + 1} of ${MAX_RETRIES})...`);
              
              showToast({
                title: '🔄 Retrying...',
                message: `Video ${i + 1} failed, retrying automatically...`,
                type: 'info',
                timeout: 2000
              });
              
              // Wait a moment before retrying
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Re-fetch photo data in case state changed
              const retryPhotoData = await generateTransitionVideoForPhoto(i, true);
              if (!retryPhotoData.skipped && !retryPhotoData.error) {
                generateWithRetry(retryPhotoData, true);
              } else {
                // Retry failed to even start
                errorCount++;
                checkCompletion();
              }
            } else {
              // Max retries reached
              errorCount++;
              console.log(`[Transition] Video ${i + 1} failed after ${MAX_RETRIES} retry attempt(s)`);
              checkCompletion();
            }
          },
          onCancel: () => {
            // Handle cancellation if needed
          },
          onOutOfCredits: () => {
            console.log('[VIDEO] Triggering out of credits popup from batch transition video generation');
            // Don't retry on out of credits - count as error immediately
            errorCount++;
            checkCompletion();
            if (onOutOfCredits) {
              onOutOfCredits();
            }
          }
        });
      } catch (error) {
        console.error(`[Transition]${retryLabel} Failed to load images for photo ${i}:`, error);
        
        // Check if we should retry image loading
        const currentRetries = retryAttempts[photo.id] || 0;
        if (currentRetries < MAX_RETRIES) {
          retryAttempts[photo.id] = currentRetries + 1;
          console.log(`[Transition] Retrying image load for video ${i + 1} (attempt ${currentRetries + 1} of ${MAX_RETRIES})...`);
          
          showToast({
            title: '🔄 Retrying...',
            message: `Failed to load images, retrying...`,
            type: 'info',
            timeout: 2000
          });
          
          // Wait a moment before retrying
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Re-fetch photo data and retry
          const retryPhotoData = await generateTransitionVideoForPhoto(i, true);
          if (!retryPhotoData.skipped && !retryPhotoData.error) {
            generateWithRetry(retryPhotoData, true);
          } else {
            errorCount++;
            checkCompletion();
          }
        } else {
          errorCount++;
          checkCompletion();
        }
      }
    };

    // Process all photos
    for (let i = 0; i < loadedPhotos.length; i++) {
      const photoData = await generateTransitionVideoForPhoto(i, false);
      
      if (photoData.skipped) {
        continue;
      }
      
      if (photoData.error) {
        errorCount++;
        checkCompletion();
        continue;
      }

      generateWithRetry(photoData, false);
    }
  }, [photos, sogniClient, setPhotos, settings.videoResolution, settings.videoQuality, settings.videoFramerate, settings.videoDuration, settings.videoNegativePrompt, settings.soundEnabled, tokenType, desiredWidth, desiredHeight, showToast, onOutOfCredits, setPlayingGeneratedVideoIds, allTransitionVideosComplete, transitionVideoQueue, transitionVideoDownloaded]);

  // Handle video cancellation
  const handleCancelVideo = useCallback(() => {
    if (selectedPhotoIndex === null) return;

    const photo = photos[selectedPhotoIndex];
    if (!photo?.videoProjectId) return;

    cancelVideoGeneration(
      photo.videoProjectId,
      sogniClient,
      setPhotos,
      () => {
        showToast({
          title: 'Video Cancelled',
          message: 'Video generation was cancelled.',
          type: 'info'
        });
      }
    );
  }, [selectedPhotoIndex, photos, sogniClient, setPhotos, showToast]);

  // Handle video download
  const handleDownloadVideo = useCallback(() => {
    if (selectedPhotoIndex === null) return;

    const photo = photos[selectedPhotoIndex];
    if (!photo?.videoUrl) return;

    // Build filename using the same logic as image downloads
    // Format: sogni-photobooth-{style-name}-{emoji}-video_{duration}s_{resolution}_{fps}fps.mp4
    
    // Get style display text and clean it (same as image download)
    const styleDisplayText = getStyleDisplayText(photo);
    const cleanStyleName = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '-') : 'sogni';
    
    // Get video metadata (use defaults if not stored)
    const duration = photo.videoDuration || settings.videoDuration || 5;
    const resolution = photo.videoResolution || settings.videoResolution || '480p';
    const fps = photo.videoFramerate || settings.videoFramerate || 16;
    
    // Include motion emoji in filename if available
    const motionEmoji = photo.videoMotionEmoji || '';
    const emojiPart = motionEmoji ? `-${motionEmoji}` : '';
    
    // Build filename: sogni-photobooth-{style}-{emoji}-video_{duration}s_{resolution}_{fps}fps.mp4
    const filename = `sogni-photobooth-${cleanStyleName}${emojiPart}-video_${duration}s_${resolution}_${fps}fps.mp4`;

    downloadVideo(photo.videoUrl, filename)
      .catch(() => {
        showToast({
          title: 'Download Failed',
          message: 'Failed to download video. Please try again.',
          type: 'error'
        });
      });
  }, [selectedPhotoIndex, photos, settings.videoDuration, settings.videoResolution, settings.videoFramerate, showToast]);

  // Handle theme group toggle for prompt selector mode
  const handleThemeGroupToggle = useCallback((groupId) => {
    if (!isPromptSelectorMode) return;

    const newState = {
      ...themeGroupState,
      [groupId]: !themeGroupState[groupId]
    };
    setThemeGroupState(newState);
    saveThemeGroupPreferences(newState);

    // Notify parent component about theme changes
    if (onThemeChange) {
      onThemeChange(newState);
    }
  }, [isPromptSelectorMode, themeGroupState, onThemeChange]);

  // Handle favorite toggle
  // For gallery images (Style Explorer), we store promptKey so favorites can be used for generation
  // For user photos, we store promptKey (only photos with a reusable style can be favorited)
  const handleFavoriteToggle = useCallback((photoId) => {
    if (!photoId) {
      console.log('🔥 FAVORITE TOGGLE - Skipped: No promptKey available');
      return; // Don't allow favoriting photos without a promptKey
    }
    // Don't accept event parameter - all event handling done at button level
    toggleFavoriteImage(photoId);
    const newFavorites = getFavoriteImages();
    setFavoriteImageIds(newFavorites);
  }, []);

  // Handle clear all favorites
  const handleClearFavorites = useCallback((e) => {
    if (e) {
      e.stopPropagation(); // Prevent label click
    }
    saveFavoriteImages([]);
    setFavoriteImageIds([]);
  }, []);

  // Handle block prompt - prevents NSFW-prone prompts from being used
  const handleBlockPrompt = useCallback((promptKey, photoIndex) => {
    if (!promptKey) {
      console.log('🚫 BLOCK PROMPT - Skipped: No promptKey available');
      return;
    }
    
    console.log('🚫 Blocking prompt:', promptKey);
    
    // Add to blocked list
    blockPrompt(promptKey);
    const newBlocked = getBlockedPrompts();
    setBlockedPromptIds(newBlocked);
    
    // Remove from favorites if it's there
    if (favoriteImageIds.includes(promptKey)) {
      toggleFavoriteImage(promptKey);
      const newFavorites = getFavoriteImages();
      setFavoriteImageIds(newFavorites);
    }
    
    // Hide the photo immediately (like clicking X button)
    if (photoIndex !== undefined && photoIndex !== null) {
      setPhotos(currentPhotos => currentPhotos.filter((_, index) => index !== photoIndex));
    }
  }, [favoriteImageIds, setPhotos]);

  // Get consistent photoId for favorites
  // Only use promptKey - this allows favoriting styles that can be reused for generation
  // Returns null if no promptKey (custom/random styles can't be favorited)
  const getPhotoId = useCallback((photo) => {
    const photoId = photo.promptKey || null;
    console.log('🆔 getPhotoId:', { promptKey: photo.promptKey, result: photoId });
    return photoId;
  }, []);

  // Check if a photo is favorited
  // Only checks promptKey - photos without a style can't be favorited
  const isPhotoFavorited = useCallback((photo) => {
    if (!photo.promptKey) return false;
    return favoriteImageIds.includes(photo.promptKey);
  }, [favoriteImageIds]);

  // Filter photos based on enabled theme groups and search term in prompt selector mode
  const filteredPhotos = useMemo(() => {
    if (!isPromptSelectorMode || !photos) return photos;

    const isFluxKontext = selectedModel && isFluxKontextModel(selectedModel);
    let filtered = photos;

    // Build a list of all photos that should be shown based on enabled filters (OR logic)
    const shouldShowPhoto = (photo) => {
      // First, filter out blocked prompts
      if (photo.promptKey && blockedPromptIds.includes(photo.promptKey)) {
        return false;
      }
      
      // Track if any filter is enabled
      const enabledFilters = [];
      
      // Check if favorites filter is enabled
      if (themeGroupState['favorites']) {
        enabledFilters.push('favorites');
      }
      
      // Check if any theme group filters are enabled (for non-Flux models)
      if (!isFluxKontext) {
        const enabledThemeGroups = Object.entries(themeGroupState)
          .filter(([groupId, enabled]) => enabled && groupId !== 'favorites')
          .map(([groupId]) => groupId);
        
        if (enabledThemeGroups.length > 0) {
          enabledFilters.push('themes');
        }
      }
      
      // If no filters are enabled, show all photos
      if (enabledFilters.length === 0) {
        return true;
      }
      
      // Check if photo matches any enabled filter (OR logic)
      let matchesAnyFilter = false;
      
      // Check favorites filter
      if (themeGroupState['favorites']) {
        if (isPhotoFavorited(photo)) {
          matchesAnyFilter = true;
        }
      }
      
      // Check theme group filters
      if (!isFluxKontext && !matchesAnyFilter) {
        const enabledPrompts = getEnabledPrompts(themeGroupState, stylePrompts || {});
        if (photo.promptKey && Object.prototype.hasOwnProperty.call(enabledPrompts, photo.promptKey)) {
          matchesAnyFilter = true;
        }
      }
      
      return matchesAnyFilter;
    };
    
    filtered = photos.filter(shouldShowPhoto);

    // Apply search term filtering if search term exists
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(photo => {
        // Search in the display text (styleIdToDisplay of promptKey)
        const displayText = photo.promptKey ? styleIdToDisplay(photo.promptKey).toLowerCase() : '';
        return displayText.includes(searchLower);
      });
    }

    return filtered;
  }, [isPromptSelectorMode, photos, themeGroupState, stylePrompts, selectedModel, searchTerm, favoriteImageIds, blockedPromptIds]);

  // Handle deep link gallery parameter on load - must come after filteredPhotos is defined
  useEffect(() => {
    const url = new URL(window.location.href);
    const galleryParam = url.searchParams.get('gallery');
    
    if (galleryParam && isPromptSelectorMode && selectedPhotoIndex !== null && !wantsFullscreen) {
      const currentPhoto = (isPromptSelectorMode ? filteredPhotos : photos)[selectedPhotoIndex];
      const promptKey = currentPhoto?.promptKey || currentPhoto?.selectedStyle;
      
      if (promptKey === galleryParam) {
        console.log('🖼️ Gallery deep link detected, enabling fullscreen mode');
        setWantsFullscreen(true);
      }
    }
  }, [isPromptSelectorMode, selectedPhotoIndex, filteredPhotos, photos, wantsFullscreen]);
  
  // Update URL when entering/exiting gallery fullscreen mode - must come after filteredPhotos is defined
  useEffect(() => {
    if (isPromptSelectorMode && selectedPhotoIndex !== null) {
      const currentPhoto = (isPromptSelectorMode ? filteredPhotos : photos)[selectedPhotoIndex];
      const promptKey = currentPhoto?.promptKey || currentPhoto?.selectedStyle;
      
      if (wantsFullscreen && promptKey) {
        // Update URL with gallery parameter for deep linking
        const url = new URL(window.location.href);
        url.searchParams.set('gallery', promptKey);
        window.history.replaceState({}, '', url);
        console.log('🖼️ Updated URL with gallery param:', promptKey);
      } else if (!wantsFullscreen) {
        // Remove gallery parameter when exiting fullscreen
        const url = new URL(window.location.href);
        if (url.searchParams.has('gallery')) {
          url.searchParams.delete('gallery');
          window.history.replaceState({}, '', url);
          console.log('🖼️ Removed gallery param from URL');
        }
      }
    }
  }, [wantsFullscreen, selectedPhotoIndex, isPromptSelectorMode, filteredPhotos, photos]);

  // Get readable style display text for photo labels (no hashtags)
  const getStyleDisplayText = useCallback((photo) => {
    // Gallery images already have promptDisplay
    if (photo.isGalleryImage && photo.promptDisplay) {
      return photo.promptDisplay;
    }
    
    // Skip for loading photos
    if (photo.loading || photo.generating) {
      return '';
    }
    
    // Use custom scene name if available
    if (photo.customSceneName) {
      return photo.customSceneName;
    }
    
    // Try stylePrompt first
    if (photo.stylePrompt) {
      const foundStyleKey = Object.entries(stylePrompts).find(
        ([, value]) => value === photo.stylePrompt
      )?.[0];
      
      if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix' && foundStyleKey !== 'browseGallery') {
        return styleIdToDisplay(foundStyleKey);
      }
    }
    
    // Try positivePrompt next
    if (photo.positivePrompt) {
      const foundStyleKey = Object.entries(stylePrompts).find(
        ([, value]) => value === photo.positivePrompt
      )?.[0];
      
      if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix' && foundStyleKey !== 'browseGallery') {
        return styleIdToDisplay(foundStyleKey);
      }
    }
    
    // Try selectedStyle as fallback
    if (selectedStyle && selectedStyle !== 'custom' && selectedStyle !== 'random' && selectedStyle !== 'randomMix' && selectedStyle !== 'browseGallery') {
      return styleIdToDisplay(selectedStyle);
    }
    
    // Default empty
    return '';
  }, [photos, stylePrompts, selectedStyle]);

  // Helper function to check if current theme supports the current aspect ratio
  // MUST be called before any early returns to maintain hook order
  const isThemeSupported = useCallback(() => {
    if (tezdevTheme === 'off') return false;
    
    // Check hardcoded theme aspect ratio requirements
    switch (tezdevTheme) {
      case 'supercasual':
      case 'tezoswebx':
      case 'taipeiblockchain':
      case 'showup': {
        return aspectRatio === 'narrow';
      }
      default:
        // For dynamic themes, assume they support all aspect ratios
        // The actual validation happens in applyTezDevFrame() which checks
        // themeConfigService.getFrameUrls() and gracefully handles unsupported combinations
        return true;
    }
  }, [tezdevTheme, aspectRatio]);

  // Handle download all videos as ZIP
  const handleDownloadAllVideos = useCallback(async () => {
    if (isBulkDownloading) {
      console.log('Bulk download already in progress');
      return;
    }

    try {
      setIsBulkDownloading(true);
      setBulkDownloadProgress({ current: 0, total: 0, message: 'Preparing videos...' });

      // Get the correct photos array based on mode
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;

      // Get photos with videos (excluding hidden/discarded ones)
      const photosWithVideos = currentPhotosArray.filter(
        photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
      );

      if (photosWithVideos.length === 0) {
        console.warn('No videos to download');
        setBulkDownloadProgress({ current: 0, total: 0, message: 'No videos available to download' });
        setTimeout(() => {
          setIsBulkDownloading(false);
        }, 2000);
        return;
      }

      // Prepare videos array
      const videosToDownload = [];
      const filenameCount = {}; // Track how many times each base filename is used

      for (let i = 0; i < photosWithVideos.length; i++) {
        const photo = photosWithVideos[i];
        setBulkDownloadProgress({ current: i, total: photosWithVideos.length, message: `Processing video ${i + 1} of ${photosWithVideos.length}...` });

        // Get style display text
        const styleDisplayText = getStyleDisplayText(photo);
        const cleanStyleName = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '-') : 'sogni';

        // Get video metadata (use defaults if not stored)
        const duration = photo.videoDuration || settings.videoDuration || 5;
        const resolution = photo.videoResolution || settings.videoResolution || '480p';
        const fps = photo.videoFramerate || settings.videoFramerate || 16;

        // Include motion emoji in filename if available
        const motionEmoji = photo.videoMotionEmoji || '';
        const emojiPart = motionEmoji ? `-${motionEmoji}` : '';

        // Build filename: sogni-photobooth-{style}-{emoji}-video_{duration}s_{resolution}_{fps}fps.mp4
        const baseFilename = `sogni-photobooth-${cleanStyleName}${emojiPart}-video_${duration}s_${resolution}_${fps}fps.mp4`;

        // Track duplicate filenames and append counter if needed
        if (!filenameCount[baseFilename]) {
          filenameCount[baseFilename] = 1;
        } else {
          filenameCount[baseFilename]++;
        }

        // Only add counter if there are duplicates
        const filename = filenameCount[baseFilename] > 1
          ? `sogni-photobooth-${cleanStyleName}${emojiPart}-video_${duration}s_${resolution}_${fps}fps-${filenameCount[baseFilename]}.mp4`
          : baseFilename;

        videosToDownload.push({
          url: photo.videoUrl,
          filename: filename,
          photoIndex: currentPhotosArray.findIndex(p => p.id === photo.id)
        });
      }

      if (videosToDownload.length === 0) {
        console.warn('No videos prepared for download');
        setBulkDownloadProgress({ current: 0, total: 0, message: 'No videos prepared for download' });
        setTimeout(() => {
          setIsBulkDownloading(false);
        }, 2000);
        return;
      }

      // Generate ZIP filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const zipFilename = `sogni-photobooth-videos-${timestamp}.zip`;

      // Download as ZIP with progress callback
      const success = await downloadVideosAsZip(
        videosToDownload,
        zipFilename,
        (current, total, message) => {
          setBulkDownloadProgress({ current, total, message });
        }
      );

      if (success) {
        setBulkDownloadProgress({
          current: videosToDownload.length,
          total: videosToDownload.length,
          message: 'Download complete!'
        });

        console.log(`Successfully downloaded ${videosToDownload.length} videos as ${zipFilename}`);
      } else {
        setBulkDownloadProgress({
          current: 0,
          total: 0,
          message: 'Download failed. Please try again.'
        });
      }

      // Reset after a delay
      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);

    } catch (error) {
      console.error('Error in bulk video download:', error);
      setBulkDownloadProgress({
        current: 0,
        total: 0,
        message: `Error: ${error.message}`
      });
      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);
    }
  }, [photos, filteredPhotos, isPromptSelectorMode, isBulkDownloading, settings.videoDuration, settings.videoResolution, settings.videoFramerate, getStyleDisplayText, setIsBulkDownloading, setBulkDownloadProgress]);

  // Handle sharing the ready transition video (called from button click to preserve user gesture)
  const handleShareTransitionVideo = useCallback(async () => {
    if (!readyTransitionVideo) return;
    
    const { blob, filename } = readyTransitionVideo;
    
    try {
      const file = new File([blob], filename, { type: 'video/mp4' });
      await navigator.share({
        files: [file],
        title: 'My Sogni Photobooth Video',
        text: 'Check out my transition video from Sogni AI Photobooth!'
      });
      
      // Success - clear the ready video and mark as downloaded
      setReadyTransitionVideo(null);
      setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      setIsBulkDownloading(false);
      setTransitionVideoDownloaded(true);
    } catch (shareError) {
      // If user cancelled, that's fine
      if (shareError instanceof Error && 
          (shareError.name === 'AbortError' ||
           shareError.message.includes('abort') ||
           shareError.message.includes('cancel') ||
           shareError.message.includes('dismissed'))) {
        setReadyTransitionVideo(null);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
        setIsBulkDownloading(false);
        return;
      }
      
      // For other errors, fall back to download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      
      setReadyTransitionVideo(null);
      setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      setIsBulkDownloading(false);
      setTransitionVideoDownloaded(true); // Fallback download also counts
    }
  }, [readyTransitionVideo]);

  // Handle music file selection and generate waveform
  const handleMusicFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    const isMP3 = fileName.endsWith('.mp3');
    const isM4A = fileName.endsWith('.m4a');
    
    // Check if it's a supported format
    if (!isMP3 && !isM4A) {
      showToast({
        title: 'Invalid Format',
        message: 'Please select an MP3 or M4A audio file.',
        type: 'error'
      });
      return;
    }
    
    setAudioWaveform(null);
    setMusicStartOffset(0);
    
    let audioFile = file;
    let arrayBuffer;
    
    // If MP3, transcode to M4A using backend
    if (isMP3) {
      try {
        showToast({
          title: 'Converting Audio',
          message: 'Converting MP3 to M4A format...',
          type: 'info'
        });
        
        const formData = new FormData();
        formData.append('audio', file);
        
        const response = await fetch('/api/audio/mp3-to-m4a', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.details || error.error || 'Transcoding failed');
        }
        
        const transcoded = await response.arrayBuffer();
        const m4aBlob = new Blob([transcoded], { type: 'audio/mp4' });
        audioFile = new File([m4aBlob], file.name.replace(/\.mp3$/i, '.m4a'), { type: 'audio/mp4' });
        arrayBuffer = transcoded;
        
        showToast({
          title: 'Conversion Complete',
          message: 'MP3 converted to M4A successfully!',
          type: 'success'
        });
      } catch (transcodeError) {
        console.error('[Music] MP3 transcode error:', transcodeError);
        showToast({
          title: 'Conversion Failed',
          message: transcodeError.message || 'Failed to convert MP3. Please use M4A format.',
          type: 'error'
        });
        return;
      }
    } else {
      arrayBuffer = await file.arrayBuffer();
    }
    
    setMusicFile(audioFile);
    
    try {
      // Create audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Decode audio file
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
      
      // Get duration
      setAudioDuration(audioBuffer.duration);
      
      // Generate waveform data (downsample to ~200 points for visualization)
      const channelData = audioBuffer.getChannelData(0); // Use first channel
      const samples = 200;
      const blockSize = Math.floor(channelData.length / samples);
      const waveformData = [];
      
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[start + j] || 0);
        }
        waveformData.push(sum / blockSize);
      }
      
      // Normalize to 0-1 range
      const max = Math.max(...waveformData);
      const normalizedWaveform = waveformData.map(v => v / (max || 1));
      
      setAudioWaveform(normalizedWaveform);
      
      // Create object URL for audio preview
      if (audioPreviewRef.current) {
        URL.revokeObjectURL(audioPreviewRef.current.src);
      }
      const audioUrl = URL.createObjectURL(file);
      if (audioPreviewRef.current) {
        audioPreviewRef.current.src = audioUrl;
      }
      
    } catch (error) {
      console.error('Failed to decode audio:', error);
      showToast({
        title: 'Audio Error',
        message: 'Failed to decode audio file. Please try a different file.',
        type: 'error'
      });
      setMusicFile(null);
    }
  }, [showToast]);

  // Handle preset music selection
  const handlePresetSelect = useCallback(async (preset) => {
    if (isLoadingPreset) return;
    
    setIsLoadingPreset(true);
    setSelectedPresetId(preset.id);
    setAudioWaveform(null);
    setMusicStartOffset(0);
    
    try {
      // For presets, use Audio element to get duration (avoids CORS issues for metadata)
      // The actual audio data will be fetched at muxing time through the backend proxy
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => {
          setAudioDuration(audio.duration);
          resolve();
        };
        audio.onerror = () => {
          // Fallback: parse duration from preset metadata
          const durationParts = preset.duration.split(':');
          const minutes = parseInt(durationParts[0], 10);
          const seconds = parseInt(durationParts[1], 10);
          setAudioDuration(minutes * 60 + seconds);
          resolve();
        };
        audio.src = preset.url;
      });
      
      // Create a placeholder File object with preset info
      // Actual audio will be fetched at download time
      const presetFile = new File([], `${preset.title}.m4a`, { type: 'audio/mp4' });
      presetFile.presetUrl = preset.url; // Store URL for later fetch
      presetFile.isPreset = true;
      console.log(`[Preset Select] Creating preset file: url=${preset.url}, title=${preset.title}`);
      setMusicFile(presetFile);
      
      // Set up audio preview using the URL directly
      if (audioPreviewRef.current) {
        audioPreviewRef.current.src = preset.url;
        audioPreviewRef.current.crossOrigin = 'anonymous';
      }
      
      // Generate a simple gradient waveform visualization for presets
      // (We can't get actual waveform data without CORS access to the file)
      const samples = 200;
      const waveformData = [];
      for (let i = 0; i < samples; i++) {
        // Create a pleasing pseudo-random waveform based on preset ID
        const seed = preset.id.charCodeAt(i % preset.id.length);
        const noise = Math.sin(i * 0.1 + seed) * 0.3 + 0.5;
        const envelope = Math.sin((i / samples) * Math.PI) * 0.3 + 0.7;
        waveformData.push(noise * envelope);
      }
      setAudioWaveform(waveformData);
      
    } catch (error) {
      console.error('Failed to load preset:', error);
      showToast({
        title: 'Load Error',
        message: 'Failed to load preset track. Please try again.',
        type: 'error'
      });
      setSelectedPresetId(null);
    } finally {
      setIsLoadingPreset(false);
    }
  }, [isLoadingPreset, showToast]);

  // Clear preset selection when choosing custom file
  const handleCustomFileSelect = useCallback(async (e) => {
    setSelectedPresetId(null);
    await handleMusicFileSelect(e);
  }, [handleMusicFileSelect]);

  // Draw waveform on canvas
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !audioWaveform) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / audioWaveform.length;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Calculate video duration for the selection indicator
    // Use loadedPhotosCount * videoDuration setting (works before AND after generation)
    const currentLoadedCount = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    ).length;
    const videoDuration = currentLoadedCount * (settings.videoDuration || 5);
    
    // Draw selection range indicator
    if (audioDuration > 0) {
      const startX = (musicStartOffset / audioDuration) * width;
      const endOffset = Math.min(musicStartOffset + videoDuration, audioDuration);
      const selectionWidth = ((endOffset - musicStartOffset) / audioDuration) * width;
      
      ctx.fillStyle = 'rgba(220, 53, 69, 0.25)';
      ctx.fillRect(startX, 0, selectionWidth, height);
      
      // Draw selection border
      ctx.strokeStyle = 'rgba(220, 53, 69, 0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, 0, selectionWidth, height);
    }
    
    // Draw waveform bars - use dark colors for contrast on white background
    audioWaveform.forEach((value, i) => {
      const barHeight = value * (height - 4);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      
      // Color based on whether it's in selection
      const barTime = (i / audioWaveform.length) * audioDuration;
      const isInSelection = barTime >= musicStartOffset && barTime < musicStartOffset + videoDuration;
      
      // Dark charcoal for non-selected, bright red for selected
      ctx.fillStyle = isInSelection ? '#c62828' : '#333333';
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });
    
    // Draw playhead if playing
    if (isPlayingPreview && audioPreviewRef.current) {
      const playheadX = (previewPlayhead / audioDuration) * width;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
    
    // Draw start position marker
    const startMarkerX = (musicStartOffset / audioDuration) * width;
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startMarkerX, 0);
    ctx.lineTo(startMarkerX, height);
    ctx.stroke();
    
    // Draw marker handle
    ctx.fillStyle = '#dc3545';
    ctx.beginPath();
    ctx.moveTo(startMarkerX - 6, 0);
    ctx.lineTo(startMarkerX + 6, 0);
    ctx.lineTo(startMarkerX, 10);
    ctx.closePath();
    ctx.fill();
  }, [audioWaveform, musicStartOffset, audioDuration, isPlayingPreview, previewPlayhead, photos, settings.videoDuration]);

  // Update waveform when data changes or modal/popup opens
  useEffect(() => {
    if ((showMusicModal || showTransitionVideoPopup) && audioWaveform) {
      // Use requestAnimationFrame for smooth updates during playback
      const frame = requestAnimationFrame(() => {
        drawWaveform();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [drawWaveform, showMusicModal, showTransitionVideoPopup, audioWaveform, musicStartOffset, isPlayingPreview, previewPlayhead]);

  // Calculate video duration for selection width
  const getVideoDuration = useCallback(() => {
    // Use loadedPhotosCount * videoDuration setting (works before AND after generation)
    const currentLoadedCount = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    ).length;
    return currentLoadedCount * (settings.videoDuration || 5);
  }, [photos, settings.videoDuration]);

  // Handle waveform interaction - click to set position OR drag to move selection
  const handleWaveformMouseDown = useCallback((e) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || audioDuration === 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPosition = x / rect.width;
    const clickTime = clickPosition * audioDuration;
    
    const videoDuration = getVideoDuration();
    const selectionEnd = musicStartOffset + videoDuration;
    
    // Check if click is inside the current selection
    const isInsideSelection = clickTime >= musicStartOffset && clickTime <= selectionEnd;
    
    if (isInsideSelection) {
      // Start drag mode
      setIsDraggingWaveform(true);
      setDragStartX(x);
      setDragStartOffset(musicStartOffset);
    } else {
      // Click outside - jump to new position
      const maxOffset = Math.max(0, audioDuration - videoDuration);
      const newOffset = Math.max(0, Math.min(clickTime, maxOffset));
      setMusicStartOffset(newOffset);
    }
    
    e.preventDefault();
  }, [audioDuration, musicStartOffset, getVideoDuration]);

  const handleWaveformMouseMove = useCallback((e) => {
    if (!isDraggingWaveform) return;
    
    const canvas = waveformCanvasRef.current;
    if (!canvas || audioDuration === 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const deltaX = x - dragStartX;
    const deltaTime = (deltaX / rect.width) * audioDuration;
    
    const videoDuration = getVideoDuration();
    const maxOffset = Math.max(0, audioDuration - videoDuration);
    const newOffset = Math.max(0, Math.min(dragStartOffset + deltaTime, maxOffset));
    
    setMusicStartOffset(newOffset);
  }, [isDraggingWaveform, dragStartX, dragStartOffset, audioDuration, getVideoDuration]);

  const handleWaveformMouseUp = useCallback(() => {
    setIsDraggingWaveform(false);
  }, []);

  // Add global mouse listeners for drag
  useEffect(() => {
    if (isDraggingWaveform) {
      const handleGlobalMouseMove = (e) => handleWaveformMouseMove(e);
      const handleGlobalMouseUp = () => handleWaveformMouseUp();
      
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDraggingWaveform, handleWaveformMouseMove, handleWaveformMouseUp]);

  // Restart playback from new position when offset changes during playback
  useEffect(() => {
    if (isPlayingPreview && audioPreviewRef.current) {
      audioPreviewRef.current.currentTime = musicStartOffset;
    }
  }, [musicStartOffset, isPlayingPreview]);

  // Apply music for inline playback
  const handleApplyMusic = useCallback(() => {
    if (musicFile) {
      // For presets, use the preset URL directly; for uploads, create blob URL
      const audioUrl = (musicFile.isPreset && musicFile.presetUrl) 
        ? musicFile.presetUrl 
        : URL.createObjectURL(musicFile);
      
      setAppliedMusic({
        file: musicFile,
        startOffset: musicStartOffset,
        audioUrl
      });
      setShowMusicModal(false);
      // Stop preview if playing
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      setIsPlayingPreview(false);
    }
  }, [musicFile, musicStartOffset]);

  // Remove applied music
  const handleRemoveMusic = useCallback(() => {
    // Only revoke blob URLs, not preset URLs
    if (appliedMusic?.audioUrl && !appliedMusic.file?.isPreset) {
      URL.revokeObjectURL(appliedMusic.audioUrl);
    }
    setAppliedMusic(null);
    if (inlineAudioRef.current) {
      inlineAudioRef.current.pause();
    }
  }, [appliedMusic]);

  // Track the first photo's video index for audio sync (to avoid reacting to all photo changes)
  const firstPhotoId = photos[0]?.id;
  const firstPhotoVideoIndex = firstPhotoId ? (currentVideoIndexByPhoto[firstPhotoId] ?? 0) : 0;
  const prevVideoIndexRef = useRef(firstPhotoVideoIndex);
  const audioReadyRef = useRef(false); // Track if audio is seekable
  const lastAppliedMusicUrlRef = useRef(null); // Track last processed audio URL

  // DO NOT auto-play audio - audio should ONLY play in the stitched video overlay where it's embedded
  // These useEffects are disabled - audio will only be heard in the final stitched video

  // Keep refs in sync with music state for animation frame access and transition video generation
  useEffect(() => {
    musicStartOffsetRef.current = musicStartOffset;
  }, [musicStartOffset]);
  
  useEffect(() => {
    console.log(`[Music Ref Sync] musicFile changed: file=${!!musicFile}, isPreset=${musicFile?.isPreset}, presetUrl=${musicFile?.presetUrl}`);
    musicFileRef.current = musicFile;
  }, [musicFile]);

  // Toggle audio preview playback
  const toggleAudioPreview = useCallback(async () => {
    const audio = audioPreviewRef.current;
    if (!audio) {
      console.warn('[Audio Preview] No audio element ref');
      return;
    }
    
    // Ensure audio has a source
    if (!audio.src && musicFile) {
      // For presets, use the preset URL directly; for uploads, create blob URL
      if (musicFile.isPreset && musicFile.presetUrl) {
        audio.src = musicFile.presetUrl;
        audio.crossOrigin = 'anonymous';
      } else {
        audio.src = URL.createObjectURL(musicFile);
      }
    }
    
    if (isPlayingPreview) {
      audio.pause();
      setIsPlayingPreview(false);
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    } else {
      try {
        audio.currentTime = musicStartOffset;
        await audio.play();
        setIsPlayingPreview(true);
        
        // Update playhead position during playback - loop within selection bounds
        // Uses refs to read current values (not stale closure values)
        const updatePlayhead = () => {
          if (audio.paused) {
            setIsPlayingPreview(false);
            return;
          }
          
          // Read current offset from ref (updated when user drags selection)
          const currentOffset = musicStartOffsetRef.current;
          const videoDuration = getVideoDuration();
          const selectionEnd = currentOffset + videoDuration;
          
          // Check if we've passed the selection end - loop back to start
          if (audio.currentTime >= selectionEnd) {
            audio.currentTime = currentOffset;
          }
          
          setPreviewPlayhead(audio.currentTime);
          playbackAnimationRef.current = requestAnimationFrame(updatePlayhead);
        };
        updatePlayhead();
      } catch (err) {
        console.error('[Audio Preview] Failed to play:', err);
      }
    }
  }, [isPlayingPreview, musicStartOffset, musicFile, getVideoDuration]);

  // Cleanup audio preview on modal/popup close
  useEffect(() => {
    if (!showMusicModal && !showTransitionVideoPopup) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      setIsPlayingPreview(false);
      if (playbackAnimationRef.current) {
        cancelAnimationFrame(playbackAnimationRef.current);
      }
    }
  }, [showMusicModal, showTransitionVideoPopup]);

  // Regenerate waveform when modal/popup opens with existing file but no waveform
  useEffect(() => {
    if ((showMusicModal || showTransitionVideoPopup) && musicFile && !audioWaveform) {
      // Skip waveform regeneration for presets (they have placeholder waveforms set in handlePresetSelect)
      // and the file is empty, so decoding would fail
      if (musicFile.isPreset) {
        // For presets, just regenerate the placeholder waveform and set the audio src
        const samples = 200;
        const waveformData = [];
        const presetId = selectedPresetId || 'preset';
        for (let i = 0; i < samples; i++) {
          const seed = presetId.charCodeAt(i % presetId.length);
          const noise = Math.sin(i * 0.1 + seed) * 0.3 + 0.5;
          const envelope = Math.sin((i / samples) * Math.PI) * 0.3 + 0.7;
          waveformData.push(noise * envelope);
        }
        setAudioWaveform(waveformData);
        
        // Set audio src for preview using preset URL
        if (audioPreviewRef.current && musicFile.presetUrl) {
          audioPreviewRef.current.src = musicFile.presetUrl;
          audioPreviewRef.current.crossOrigin = 'anonymous';
        }
        return;
      }
      
      // Regenerate waveform for user-uploaded file
      (async () => {
        try {
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          }
          
          const arrayBuffer = await musicFile.arrayBuffer();
          const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
          
          setAudioDuration(audioBuffer.duration);
          
          const channelData = audioBuffer.getChannelData(0);
          const samples = 200;
          const blockSize = Math.floor(channelData.length / samples);
          const waveformData = [];
          
          for (let i = 0; i < samples; i++) {
            const start = i * blockSize;
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(channelData[start + j] || 0);
            }
            waveformData.push(sum / blockSize);
          }
          
          const max = Math.max(...waveformData);
          const normalizedWaveform = waveformData.map(v => v / (max || 1));
          
          setAudioWaveform(normalizedWaveform);
          
          // Set audio src for preview
          if (audioPreviewRef.current) {
            audioPreviewRef.current.src = URL.createObjectURL(musicFile);
          }
        } catch (error) {
          console.error('Failed to regenerate waveform:', error);
        }
      })();
    }
  }, [showMusicModal, showTransitionVideoPopup, musicFile, audioWaveform, selectedPresetId]);

  // Proceed with download (with or without music)
  // If returnBlob is true, returns the blob instead of downloading
  const handleProceedDownload = useCallback(async (includeMusic, returnBlob = false) => {
    setShowMusicModal(false);
    
    if (isBulkDownloading) return;

    const startTime = performance.now();
    console.log('[Transition Video] Starting creation process...', { includeMusic });

    try {
      setIsBulkDownloading(true);
      setReadyTransitionVideo(null); // Clear any previous ready video
      setBulkDownloadProgress({ current: 0, total: 0, message: 'Preparing transition video...' });

      // Get videos in the correct order from the transition queue
      const orderedVideos = transitionVideoQueue
        .map(photoId => photos.find(p => p.id === photoId))
        .filter(photo => photo && photo.videoUrl)
        .map((photo, index) => ({
          url: photo.videoUrl,
          filename: `transition-${index + 1}.mp4`
        }));

      if (orderedVideos.length === 0) {
        setBulkDownloadProgress({ current: 0, total: 0, message: 'No videos available' });
        setTimeout(() => {
          setIsBulkDownloading(false);
        }, 2000);
        return;
      }

      console.log(`[Transition Video] Processing ${orderedVideos.length} videos`);

      // Prepare audio options if music is applied
      let audioOptions = null;
      if (includeMusic && appliedMusic?.file) {
        try {
          let audioBuffer;
          
          // Check if this is a preset (has presetUrl) or a user-uploaded file
          if (appliedMusic.file.isPreset && appliedMusic.file.presetUrl) {
            const presetUrl = appliedMusic.file.presetUrl;
            const isMP3 = presetUrl.toLowerCase().endsWith('.mp3');
            
            if (isMP3) {
              // MP3 preset - fetch and transcode via backend
              setBulkDownloadProgress({ current: 0, total: 0, message: 'Converting audio track...' });
              console.log(`[Transition Video] Fetching and transcoding MP3 preset from: ${presetUrl}`);
              
              // First fetch the MP3 file
              const mp3Response = await fetch(presetUrl);
              if (!mp3Response.ok) {
                throw new Error(`Failed to fetch preset audio: ${mp3Response.status}`);
              }
              const mp3Blob = await mp3Response.blob();
              
              // Send to backend for transcoding
              const formData = new FormData();
              formData.append('audio', mp3Blob, 'preset.mp3');
              
              const transcodeResponse = await fetch('/api/audio/mp3-to-m4a', {
                method: 'POST',
                body: formData
              });
              
              if (!transcodeResponse.ok) {
                const error = await transcodeResponse.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(error.details || error.error || 'Transcoding failed');
              }
              
              audioBuffer = await transcodeResponse.arrayBuffer();
              console.log(`[Transition Video] MP3 transcoded to M4A: ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
            } else {
              // M4A preset - fetch directly
              setBulkDownloadProgress({ current: 0, total: 0, message: 'Fetching audio track...' });
              console.log(`[Transition Video] Fetching preset audio from: ${presetUrl}`);
              
              const response = await fetch(presetUrl);
              if (!response.ok) {
                throw new Error(`Failed to fetch preset audio: ${response.status}`);
              }
              audioBuffer = await response.arrayBuffer();
            }
          } else {
            // User-uploaded file - read directly (already transcoded if MP3)
            audioBuffer = await appliedMusic.file.arrayBuffer();
          }
          
          audioOptions = {
            buffer: audioBuffer,
            startOffset: appliedMusic.startOffset || 0
          };
          console.log(`[Transition Video] Audio prepared: ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB, offset: ${appliedMusic.startOffset}s`);
        } catch (audioError) {
          console.error('Failed to read audio file:', audioError);
          showToast({
            title: 'Audio Error',
            message: 'Failed to load audio track. Video will be created without music.',
            type: 'warning'
          });
          // Continue without audio
        }
      }

      // Concatenate videos into one seamless video (with optional audio)
      const concatenatedBlob = await concatenateVideos(
        orderedVideos,
        (current, total, message) => {
          setBulkDownloadProgress({ current, total, message });
        },
        audioOptions
      );

      const elapsedMs = performance.now() - startTime;
      const elapsedSec = (elapsedMs / 1000).toFixed(2);
      console.log(`[Transition Video] ✅ Complete! ${orderedVideos.length} videos → ${(concatenatedBlob.size / 1024 / 1024).toFixed(2)}MB in ${elapsedSec}s`);

      // If returnBlob is true, just return the blob without downloading
      if (returnBlob) {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
        return concatenatedBlob;
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = includeMusic && appliedMusic 
        ? `sogni-photobooth-transition-${timestamp}-with-music.mp4`
        : `sogni-photobooth-transition-${timestamp}.mp4`;
      
      // On mobile, store blob for user to trigger share (user gesture required)
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                             (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      if (isMobileDevice && navigator.share) {
        // Store blob for share button (preserves user gesture requirement)
        setReadyTransitionVideo({ blob: concatenatedBlob, filename });
        setBulkDownloadProgress({
          current: orderedVideos.length,
          total: orderedVideos.length,
          message: 'Ready! Tap to save video'
        });
      } else {
        // Desktop - download immediately
        const blobUrl = URL.createObjectURL(concatenatedBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        
        setBulkDownloadProgress({
          current: orderedVideos.length,
          total: orderedVideos.length,
          message: 'Download complete!'
        });
        
        // Mark transition video as downloaded
        setTransitionVideoDownloaded(true);
      }

      // Reset after a delay
      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);

    } catch (error) {
      const elapsedMs = performance.now() - startTime;
      console.error(`[Transition Video] ❌ Failed after ${(elapsedMs / 1000).toFixed(2)}s:`, error);
      setBulkDownloadProgress({
        current: 0,
        total: 0,
        message: `Error: ${error.message}`
      });
      
      showToast({
        title: 'Download Failed',
        message: 'Failed to combine transition videos. Please try downloading individual videos instead.',
        type: 'error'
      });

      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);
    }
  }, [transitionVideoQueue, photos, isBulkDownloading, setIsBulkDownloading, setBulkDownloadProgress, showToast, appliedMusic]);
  
  // Store handleProceedDownload in ref so it's accessible in closures (avoids hoisting issues)
  useEffect(() => {
    handleProceedDownloadRef.current = handleProceedDownload;
  }, [handleProceedDownload]);

  // Download transition video (uses appliedMusic if set)
  const handleDownloadTransitionVideo = useCallback(() => {
    if (isBulkDownloading) return;
    
    // Get videos to check if there are any
    const orderedVideos = transitionVideoQueue
      .map(photoId => photos.find(p => p.id === photoId))
      .filter(photo => photo && photo.videoUrl);
    
    if (orderedVideos.length === 0) {
      showToast({
        title: 'No Videos',
        message: 'No transition videos available to download.',
        type: 'info'
      });
      return;
    }
    
    // Directly proceed with download, using appliedMusic if available
    console.log(`[Transition Download] appliedMusic=${!!appliedMusic}, file=${!!appliedMusic?.file}, isPreset=${appliedMusic?.file?.isPreset}, presetUrl=${appliedMusic?.file?.presetUrl}`);
    handleProceedDownload(!!appliedMusic?.file);
  }, [isBulkDownloading, transitionVideoQueue, photos, showToast, appliedMusic, handleProceedDownload]);

  // Handle download all photos as ZIP - uses exact same logic as individual downloads
  const handleDownloadAll = useCallback(async (includeFrames = false) => {
    if (isBulkDownloading) {
      console.log('Bulk download already in progress');
      return;
    }

    try {
      setIsBulkDownloading(true);
      setBulkDownloadProgress({ current: 0, total: 0, message: 'Preparing images...' });

      // Get the correct photos array based on mode
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;

      // Count loaded photos (excluding hidden/discarded ones)
      const loadedPhotos = currentPhotosArray.filter(
        photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0
      );

      if (loadedPhotos.length === 0) {
        console.warn('No loaded photos to download');
        setBulkDownloadProgress({ current: 0, total: 0, message: 'No images available to download' });
        setTimeout(() => {
          setIsBulkDownloading(false);
        }, 2000);
        return;
      }

      // Ensure fonts are loaded for framed images
      if (includeFrames && !document.querySelector('link[href*="Permanent+Marker"]')) {
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
        await document.fonts.ready;
      }

      // Prepare images array with proper processing
      const imagesToDownload = [];
      const filenameCount = {}; // Track how many times each base filename is used

      for (let i = 0; i < currentPhotosArray.length; i++) {
        const photo = currentPhotosArray[i];

        // Skip photos that are hidden, still loading, or have errors
        if (photo.hidden || photo.loading || photo.generating || photo.error || !photo.images || photo.images.length === 0) {
          continue;
        }

        setBulkDownloadProgress({ current: i, total: loadedPhotos.length, message: `Processing image ${i + 1} of ${loadedPhotos.length}...` });

        // Get the image URL (handle enhanced images) - SAME AS INDIVIDUAL
        const currentSubIndex = photo.enhanced && photo.enhancedImageUrl
          ? -1
          : (selectedSubIndex || 0);

        const imageUrl = currentSubIndex === -1
          ? photo.enhancedImageUrl
          : photo.images[currentSubIndex];

        if (!imageUrl) continue;

        // Get style display text - SAME AS INDIVIDUAL
        const styleDisplayText = getStyleDisplayText(photo);
        const cleanStyleName = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '-') : 'sogni';

        // Process image based on frame type
        let processedImageUrl = imageUrl;
        let actualExtension = outputFormat === 'png' ? '.png' : '.jpg';

        if (includeFrames) {
          // FRAMED DOWNLOAD - USE EXACT SAME LOGIC AS handleDownloadPhoto
          try {
            // Use statusText directly if it's a hashtag, otherwise use styleDisplayText
            const photoLabel = (photo?.statusText && photo.statusText.includes('#')) 
              ? photo.statusText 
              : styleDisplayText || '';
            
            // Check if theme is supported - SAME AS INDIVIDUAL
            const useTheme = isThemeSupported();
            const isGalleryImage = photo.isGalleryImage;
            const shouldUseTheme = useTheme && !isGalleryImage;
            
            // Truncate label for QR code space - SAME AS INDIVIDUAL
            const maxLabelLength = 20;
            const truncatedLabel = !shouldUseTheme && photoLabel.length > maxLabelLength 
              ? photoLabel.substring(0, maxLabelLength) + '...' 
              : photoLabel;

            // Create polaroid image with EXACT same options as individual download
            const polaroidUrl = await createPolaroidImage(imageUrl, !shouldUseTheme ? truncatedLabel : '', {
              tezdevTheme: shouldUseTheme ? tezdevTheme : 'off',
              aspectRatio,
              frameWidth: !shouldUseTheme ? 56 : 0,
              frameTopWidth: !shouldUseTheme ? 56 : 0,
              frameBottomWidth: !shouldUseTheme ? 150 : 0,
              frameColor: !shouldUseTheme ? 'white' : 'transparent',
              outputFormat: outputFormat,
              taipeiFrameNumber: shouldUseTheme && tezdevTheme === 'taipeiblockchain' ? photo.taipeiFrameNumber : undefined,
              watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
            });

            processedImageUrl = polaroidUrl;
          } catch (error) {
            console.error(`Error creating framed image for photo ${i}:`, error);
            // Fall back to raw image if framing fails
          }
        } else {
          // RAW DOWNLOAD - USE EXACT SAME LOGIC AS handleDownloadRawPhoto
          try {
            // Detect actual format from image - SAME AS INDIVIDUAL
            if (imageUrl.startsWith('blob:') || imageUrl.startsWith('http')) {
              const response = await fetch(imageUrl);
              const contentType = response.headers.get('content-type');
              if (contentType) {
                if (contentType.includes('image/png')) {
                  actualExtension = '.png';
                } else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
                  actualExtension = '.jpg';
                }
              }
            }

            // Process raw image with QR watermark if enabled - SAME AS INDIVIDUAL
            if (settings.sogniWatermark) {
              processedImageUrl = await new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = async () => {
                  try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0);
                    
                    // Add QR watermark - SAME AS INDIVIDUAL
                    const { addQRWatermark } = await import('../../utils/imageProcessing.js');
                    await addQRWatermark(ctx, canvas.width, canvas.height, getQRWatermarkConfig(settings));
                    
                    const dataUrl = canvas.toDataURL(actualExtension === '.png' ? 'image/png' : 'image/jpeg', 0.95);
                    resolve(dataUrl);
                  } catch (error) {
                    console.error('Error processing raw image with watermark:', error);
                    resolve(imageUrl);
                  }
                };
                
                img.onerror = () => {
                  console.error('Error loading image for raw download processing');
                  resolve(imageUrl);
                };
                
                img.src = imageUrl;
              });
            }
          } catch (error) {
            console.error(`Error processing raw image for photo ${i}:`, error);
            // Continue with unprocessed image
          }
        }

        // Generate filename
        const frameType = includeFrames ? '-framed' : '-raw';
        const baseFilename = `sogni-photobooth-${cleanStyleName}${frameType}`;
        
        // Track duplicate filenames and append counter if needed
        if (!filenameCount[baseFilename]) {
          filenameCount[baseFilename] = 1;
        } else {
          filenameCount[baseFilename]++;
        }
        
        // Only add counter if there are duplicates
        const filename = filenameCount[baseFilename] > 1
          ? `${baseFilename}-${filenameCount[baseFilename]}${actualExtension}`
          : `${baseFilename}${actualExtension}`;

        imagesToDownload.push({
          url: processedImageUrl,
          filename: filename,
          photoIndex: i,
          styleId: photo.styleId
        });
      }

      if (imagesToDownload.length === 0) {
        console.warn('No images prepared for download');
        setBulkDownloadProgress({ current: 0, total: 0, message: 'No images prepared for download' });
        setTimeout(() => {
          setIsBulkDownloading(false);
        }, 2000);
        return;
      }

      // Generate ZIP filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const frameTypeLabel = includeFrames ? 'framed' : 'raw';
      const zipFilename = `sogni-photobooth-${frameTypeLabel}-${timestamp}.zip`;

      // Download as ZIP with progress callback
      const success = await downloadImagesAsZip(
        imagesToDownload,
        zipFilename,
        (current, total, message) => {
          setBulkDownloadProgress({ current, total, message });
        }
      );

      if (success) {
        setBulkDownloadProgress({
          current: imagesToDownload.length,
          total: imagesToDownload.length,
          message: 'Download complete!'
        });

        console.log(`Successfully downloaded ${imagesToDownload.length} images as ${zipFilename}`);
      } else {
        setBulkDownloadProgress({
          current: 0,
          total: 0,
          message: 'Download failed. Please try again.'
        });
      }

      // Reset after a delay
      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);

    } catch (error) {
      console.error('Error in bulk download:', error);
      setBulkDownloadProgress({
        current: 0,
        total: 0,
        message: `Error: ${error.message}`
      });

      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);
    }
  }, [isBulkDownloading, isPromptSelectorMode, filteredPhotos, photos, selectedSubIndex, getStyleDisplayText, outputFormat, settings, tezdevTheme, aspectRatio, isThemeSupported]);

  // Close dropdown when clicking outside (but allow clicks inside the portal dropdown)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!showEnhanceDropdown) return;
      const target = event.target;
      const inButtonContainer = !!target.closest('.enhance-button-container');
      const inDropdown = !!target.closest('.enhance-dropdown');
      if (!inButtonContainer && !inDropdown) {
        setShowEnhanceDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showEnhanceDropdown]);

  // Close video dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!showVideoDropdown) return;
      const target = event.target;
      const inVideoContainer = !!target.closest('.video-button-container');
      const inVideoDropdown = !!target.closest('.video-dropdown');
      const inMotionBtn = !!target.closest('.photo-motion-btn-batch');
      if (!inVideoContainer && !inVideoDropdown && !inMotionBtn) {
        setShowVideoDropdown(false);
        setSelectedMotionCategory(null); // Reset category selection
        setVideoTargetPhotoIndex(null); // Clear target when dropdown is dismissed
      }
    };

    // Delay adding listener to avoid immediate close when opening from motion button
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 10);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showVideoDropdown]);

  // Close search input when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!showSearchInput) return;
      const target = event.target;
      const inSearchContainer = !!target.closest('.style-selector-text-container');
      const inSearchInput = !!target.closest('input[placeholder="Search styles..."]');
      const inClearButton = target.textContent === '✕';
      if (!inSearchContainer && !inSearchInput && !inClearButton) {
        setShowSearchInput(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showSearchInput]);

  // Ensure all photos have a Taipei frame number and frame padding assigned (migration for existing photos)
  // Use a ref to track if migration has been done to avoid repeated migrations
  // MUST be called before any early returns to maintain hook order
  const migrationDoneRef = useRef(new Set());
  
  useEffect(() => {
    const photosNeedingMigration = photos.filter(photo => 
      (!photo.taipeiFrameNumber || photo.framePadding === undefined) &&
      !migrationDoneRef.current.has(photo.id)
    );
    
    if (photosNeedingMigration.length === 0) {
      return;
    }
    
    const migratePhotos = async () => {
      // Build minimal per-photo updates to avoid overwriting concurrent changes (e.g., enhancement)
      const updates = await Promise.all(
        photos.map(async (photo, index) => {
          if (migrationDoneRef.current.has(photo.id)) {
            return null;
          }
          const needsFrameNumber = !photo.taipeiFrameNumber;
          const needsPadding = photo.framePadding === undefined;
          if (!needsFrameNumber && !needsPadding) {
            return null;
          }
          const nextTaipeiFrameNumber = needsFrameNumber ? ((index % 6) + 1) : photo.taipeiFrameNumber;
          let nextFramePadding = photo.framePadding;
          if (needsPadding) {
            if (tezdevTheme !== 'off') {
              try {
                nextFramePadding = await themeConfigService.getFramePadding(tezdevTheme);
              } catch (error) {
                console.warn('Could not get frame padding for photo migration:', error);
                nextFramePadding = { top: 0, left: 0, right: 0, bottom: 0 };
              }
            } else {
              nextFramePadding = { top: 0, left: 0, right: 0, bottom: 0 };
            }
          }
          migrationDoneRef.current.add(photo.id);
          return { id: photo.id, index, taipeiFrameNumber: nextTaipeiFrameNumber, framePadding: nextFramePadding };
        })
      );
      
      const effectiveUpdates = updates.filter(Boolean);
      if (effectiveUpdates.length === 0) {
        return;
      }
      
      // Apply only the migrated fields to the latest state to prevent stale overwrites
      setPhotos(prev => {
        const idToUpdate = new Map(effectiveUpdates.map(u => [u.id, u]));
        return prev.map(photo => {
          const u = idToUpdate.get(photo.id);
          if (!u) return photo;
          return {
            ...photo,
            taipeiFrameNumber: u.taipeiFrameNumber,
            framePadding: u.framePadding
          };
        });
      });
    };
    
    migratePhotos();
  }, [photos, tezdevTheme, setPhotos]);


  // Helper function to pre-generate framed image for a specific photo index
  const preGenerateFrameForPhoto = useCallback(async (photoIndex) => {
    if (!isThemeSupported() || !photos[photoIndex]) {
      return;
    }

    const photo = photos[photoIndex];
    const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? photo.enhancedImageUrl
      : photo.images[currentSubIndex];
    
    if (!imageUrl) return;

    const currentTaipeiFrameNumber = photo.taipeiFrameNumber || ((photoIndex % 6) + 1);
    const frameKey = generateFrameKey(photoIndex, currentSubIndex, currentTaipeiFrameNumber);
    
    // Check current state to avoid stale closures
    setFramedImageUrls(currentFramedUrls => {
      setGeneratingFrames(currentGeneratingFrames => {
        // Only generate if we don't already have this framed image and it's not already being generated
        if (!currentFramedUrls[frameKey] && !currentGeneratingFrames.has(frameKey)) {
          console.log(`Pre-generating frame for photo ${photoIndex} with key: ${frameKey}`);
          
          // Mark this frame as generating to prevent duplicate generation
          const newGeneratingFrames = new Set(currentGeneratingFrames);
          newGeneratingFrames.add(frameKey);
          
          // Generate the frame asynchronously
          (async () => {
            try {
              // Wait for fonts to load
              await document.fonts.ready;
              
              // Create composite framed image
              // Gallery images should always use default polaroid styling, not theme frames
              const isGalleryImage = photo.isGalleryImage;
              const framedImageUrl = await createPolaroidImage(imageUrl, '', {
                tezdevTheme: isGalleryImage ? 'off' : tezdevTheme,
                aspectRatio,
                // Gallery images get default polaroid frame, theme images get no polaroid frame
                frameWidth: isGalleryImage ? 56 : 0,
                frameTopWidth: isGalleryImage ? 56 : 0,
                frameBottomWidth: isGalleryImage ? 150 : 0,
                frameColor: isGalleryImage ? 'white' : 'transparent',
                outputFormat: outputFormat,
                // For Taipei theme, pass the current frame number to ensure consistency (but not for gallery images)
                taipeiFrameNumber: (!isGalleryImage && tezdevTheme === 'taipeiblockchain') ? currentTaipeiFrameNumber : undefined,
                // Add QR watermark to preview frames (if enabled)
                watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
              });
              
              // Store the framed image URL
              setFramedImageUrls(prev => ({
                ...prev,
                [frameKey]: framedImageUrl
              }));
              
              console.log(`Successfully generated frame for photo ${photoIndex}`);
              
            } catch (error) {
              console.error('Error pre-generating framed image:', error);
            } finally {
              // Always remove from generating set
              setGeneratingFrames(prev => {
                const newSet = new Set(prev);
                newSet.delete(frameKey);
                return newSet;
              });
            }
          })();
          
          return newGeneratingFrames;
        }
        return currentGeneratingFrames;
      });
      return currentFramedUrls;
    });
  }, [isThemeSupported, photos, selectedSubIndex, generateFrameKey]);

  // Helper function to pre-generate frames for adjacent photos to improve navigation smoothness
  const preGenerateAdjacentFrames = useCallback(async (currentIndex) => {
    if (!isThemeSupported() || currentIndex === null) {
      return;
    }

    // Pre-generate frames for the next 2 and previous 2 photos for smooth navigation
    // Reduced from 3 to prevent overwhelming the system
    const adjacentIndices = [];
    
    // Add previous photos (up to 2)
    for (let i = 1; i <= 2; i++) {
      const prevIndex = currentIndex - i;
      if (prevIndex >= 0 && photos[prevIndex]) {
        adjacentIndices.push(prevIndex);
      }
    }
    
    // Add next photos (up to 2)
    for (let i = 1; i <= 2; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < photos.length && photos[nextIndex]) {
        adjacentIndices.push(nextIndex);
      }
    }

    // Pre-generate frames for adjacent photos with staggered timing to avoid overwhelming
    adjacentIndices.forEach((index, i) => {
      // Use setTimeout to avoid blocking the main thread, with longer delays
      setTimeout(() => preGenerateFrameForPhoto(index), 200 * (i + 1));
    });
  }, [isThemeSupported, photos, preGenerateFrameForPhoto]);

  // Expose the pre-generation function to parent component
  useEffect(() => {
    if (onPreGenerateFrame) {
      onPreGenerateFrame(preGenerateFrameForPhoto);
    }
  }, [onPreGenerateFrame, preGenerateFrameForPhoto]);

  // Expose framed image cache to parent component
  useEffect(() => {
    if (onFramedImageCacheUpdate) {
      onFramedImageCacheUpdate(framedImageUrls);
    }
  }, [onFramedImageCacheUpdate, framedImageUrls]);

  // Check if we're in extension mode - must be defined before handlePhotoSelect
  const isExtensionMode = window.extensionMode;

  const handlePhotoSelect = useCallback(async (index, e) => {
    // Ignore clicks on the favorite button or its children
    const target = e.target;
    const currentTarget = e.currentTarget;

    // Check if click is on favorite button or any of its descendants
    if (target.classList.contains('photo-favorite-btn') ||
        target.classList.contains('photo-favorite-btn-batch') ||
        target.closest('.photo-favorite-btn') ||
        target.closest('.photo-favorite-btn-batch') ||
        target.tagName === 'svg' ||
        target.tagName === 'path' ||
        (target.parentElement && target.parentElement.classList.contains('photo-favorite-btn')) ||
        (target.parentElement && target.parentElement.classList.contains('photo-favorite-btn-batch'))) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    const element = currentTarget;
    
    // In prompt selector mode, clicking the image does nothing
    // Overlay shows on hover (desktop) via CSS
    // Only buttons/icons trigger actions
    if (isPromptSelectorMode) {
      console.log('🔍 Prompt Selector Mode - image click does nothing');
      // Don't set any state - let CSS hover handle overlay visibility
      return;
    }
    
    // For non-prompt-selector mode, use regular photo viewer behavior
    console.log('🔍 Regular mode - photo viewer');
    
    if (selectedPhotoIndex === index) {
      // Capture current position before removing selected state
      const first = element.getBoundingClientRect();
      setSelectedPhotoIndex(null);
      
      // Animate back to grid position
      requestAnimationFrame(() => {
        const last = element.getBoundingClientRect();
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;
        
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        element.style.transition = 'none';
        
        requestAnimationFrame(() => {
          element.style.transform = '';
          element.style.transition = 'transform 0.3s ease-out';
        });
      });
    } else {
      // Capture current position before selecting
      const first = element.getBoundingClientRect();
      setSelectedPhotoIndex(index);
      
      // Pre-generate frames for adjacent photos to improve navigation smoothness
      await preGenerateAdjacentFrames(index);
      
      // Animate to selected position
      requestAnimationFrame(() => {
        const last = element.getBoundingClientRect();
        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;
        
        element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        element.style.transition = 'none';
        
        requestAnimationFrame(() => {
          element.style.transform = '';
          element.style.transition = 'transform 0.3s ease-out';
        });
      });
    }
  }, [selectedPhotoIndex, setSelectedPhotoIndex, preGenerateAdjacentFrames, isPromptSelectorMode, filteredPhotos, photos, onPromptSelect, handleBackToCamera, isExtensionMode]);


  // Detect if running as PWA - MUST be called before any early returns to maintain hook order
  const isPWA = useMemo(() => {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone ||
           document.referrer.includes('android-app://');
  }, []);

  useEffect(() => {
    // Only add has-selected-photo class when:
    // - Not in prompt selector mode, OR
    // - In prompt selector mode AND user wants fullscreen
    if (selectedPhotoIndex !== null && (!isPromptSelectorMode || wantsFullscreen)) {
      document.body.classList.add('has-selected-photo');
    } else {
      document.body.classList.remove('has-selected-photo');
    }
    return () => {
      document.body.classList.remove('has-selected-photo');
    };
  }, [selectedPhotoIndex, isPromptSelectorMode, wantsFullscreen]);

  // Generate composite framed image when photo is selected with decorative theme
  useEffect(() => {
    const generateFramedImage = async () => {
      // Generate for selected photos with supported themes OR when QR watermark is enabled
      if (selectedPhotoIndex === null || (!isThemeSupported() && !settings.sogniWatermark)) {
        return;
      }

      // Get the correct photo from the appropriate array (filtered or original)
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
      const photo = currentPhotosArray[selectedPhotoIndex];
      
      if (!photo) {
        return;
      }
      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
        ? -1 // Special case for enhanced images
        : (selectedSubIndex || 0);
        
      const imageUrl = currentSubIndex === -1
        ? photo.enhancedImageUrl
        : photo.images[currentSubIndex];
      
      if (!imageUrl) return;

      // Get the current Taipei frame number for this photo
      const currentTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
      const frameKey = generateFrameKey(selectedPhotoIndex, currentSubIndex, currentTaipeiFrameNumber);
      
      // Check if we already have this framed image
      if (framedImageUrls[frameKey]) {
        return;
      }

      try {
        // Wait for fonts to load
        await document.fonts.ready;
        
        // Create composite framed image
        // Gallery images should always use default polaroid styling, not theme frames
        // For QR-only cases (no theme but QR enabled), don't add polaroid frame since CSS handles the frame
        const isGalleryImage = photo.isGalleryImage;
        const isQROnly = !isThemeSupported() && settings.sogniWatermark;
        const framedImageUrl = await createPolaroidImage(imageUrl, '', {
          tezdevTheme: isGalleryImage ? 'off' : tezdevTheme,
          aspectRatio,
          // Gallery images get default polaroid frame, theme images and QR-only get no polaroid frame
          frameWidth: isGalleryImage ? 56 : 0,
          frameTopWidth: isGalleryImage ? 56 : 0,
          frameBottomWidth: isGalleryImage ? 196 : 0,
          frameColor: isGalleryImage ? 'white' : 'transparent',
          outputFormat: outputFormat,
          // For Taipei theme, pass the current frame number to ensure consistency (but not for gallery images or QR-only)
          taipeiFrameNumber: (!isGalleryImage && !isQROnly && tezdevTheme === 'taipeiblockchain') ? currentTaipeiFrameNumber : undefined,
          // Add QR watermark to selected photo frames (if enabled) - match download size
          watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
        });
        
        // Store the framed image URL
        setFramedImageUrls(prev => ({
          ...prev,
          [frameKey]: framedImageUrl
        }));
        
        console.log(`Generated framed image for selected photo ${selectedPhotoIndex}`);
        
      } catch (error) {
        console.error('Error generating framed image:', error);
      }
    };

    generateFramedImage();
  }, [selectedPhotoIndex, selectedSubIndex, photos, filteredPhotos, isPromptSelectorMode, isThemeSupported, preGenerateAdjacentFrames, generateFrameKey]);

  // Track photo selection changes to manage smooth transitions
  useEffect(() => {
    if (selectedPhotoIndex !== previousSelectedIndex && isThemeSupported()) {
      // Store the current framed image before switching
      if (previousSelectedIndex !== null) {
        const prevPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
        const prevPhoto = prevPhotosArray[previousSelectedIndex];
        
        if (prevPhoto) {
        const prevSubIndex = prevPhoto.enhanced && prevPhoto.enhancedImageUrl ? -1 : (selectedSubIndex || 0);
        const prevTaipeiFrameNumber = prevPhoto.taipeiFrameNumber || 1;
        const prevFrameKey = `${previousSelectedIndex}-${prevSubIndex}-${tezdevTheme}-${prevTaipeiFrameNumber}-${outputFormat}-${aspectRatio}`;
        const prevFramedImageUrl = framedImageUrls[prevFrameKey];
        
        if (prevFramedImageUrl) {
          setPreviousFramedImage(prevFramedImageUrl);
        }
        }
      }
      
      // Update the previous selected index
      setPreviousSelectedIndex(selectedPhotoIndex);
    }
  }, [selectedPhotoIndex, previousSelectedIndex, photos, filteredPhotos, isPromptSelectorMode, selectedSubIndex, tezdevTheme, outputFormat, aspectRatio, framedImageUrls, isThemeSupported]);

  // Skip rendering if there are no photos or the grid is hidden
  // Exception: In prompt selector mode, we need to render even with empty photos while they're loading
  // This MUST come after all hooks to maintain hook order
  if ((photos.length === 0 && !isPromptSelectorMode) || !showPhotoGrid) return null;
  
  // Calculate proper aspect ratio style based on the selected aspect ratio
  const getAspectRatioStyle = () => {
    // In prompt selector mode, always use hard-coded 2:3 aspect ratio for sample gallery
    if (isPromptSelectorMode) {
    return {
      width: '100%',
      aspectRatio: SAMPLE_GALLERY_CONFIG.CSS_ASPECT_RATIO,
      margin: '0 auto',
      backgroundColor: isExtensionMode ? 'transparent' : 'white',
    };
    }
    
    // For regular mode, use user's selected aspect ratio
    let aspectRatioValue = '1/1'; // Default to square
    
    switch (aspectRatio) {
      case 'ultranarrow':
        aspectRatioValue = '768/1344';
        break;
      case 'narrow':
        aspectRatioValue = '832/1216';
        break;
      case 'portrait':
        aspectRatioValue = '896/1152';
        break;
      case 'square':
        aspectRatioValue = '1024/1024';
        break;
      case 'landscape':
        aspectRatioValue = '1152/896';
        break;
      case 'wide':
        aspectRatioValue = '1216/832';
        break;
      case 'ultrawide':
        aspectRatioValue = '1344/768';
        break;
      default:
        aspectRatioValue = '1024/1024';
        break;
    }
    
    return {
      width: '100%',
      aspectRatio: aspectRatioValue,
      margin: '0 auto',
      backgroundColor: isExtensionMode ? 'transparent' : 'white',
    };
  };
  
  const dynamicStyle = getAspectRatioStyle();
  



  // Note: Hashtag generation for Twitter sharing is now handled by the Twitter service


  // Cleanup old framed image URLs to prevent memory leaks - removed automatic cleanup to avoid continuous re-renders
  // Manual cleanup can be added if needed in specific scenarios

  // Universal download function that works on all devices
  const downloadImage = async (imageUrl, filename, analyticsOptions = {}) => {
    try {
      // Use mobile-optimized download for mobile devices
      if (isMobile()) {
        const result = await downloadImageMobile(imageUrl, filename, analyticsOptions);
        // If mobile download returns true (success or user cancellation), don't fallback
        if (result) {
          return true;
        }
        // Only fallback if mobile download explicitly failed (returned false)
      }
      
      // Standard desktop download
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      // Create a temporary link element
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 100);
      
      return true;
    } catch (error) {
      console.error('Download failed:', error);
      // Only fallback to opening in new tab for non-mobile or when mobile explicitly fails
      if (!isMobile()) {
        window.open(imageUrl, '_blank');
      }
      return false;
    }
  };

  // Handle gallery submission
  const handleGallerySubmitRequest = useCallback(() => {
    const currentPhoto = photos[selectedPhotoIndex];
    if (!currentPhoto) return;
    
    // Only allow submission if photo has a valid prompt key (not custom)
    const promptKey = currentPhoto.promptKey || currentPhoto.selectedStyle;
    if (!promptKey || promptKey === 'custom') {
      console.log('Cannot submit custom prompt to gallery');
      return;
    }
    
    // Show confirmation popup
    setShowGalleryConfirm(true);
  }, [photos, selectedPhotoIndex]);

  const handleGallerySubmitConfirm = useCallback(async () => {
    const currentPhoto = photos[selectedPhotoIndex];
    if (!currentPhoto || gallerySubmissionPending) return;
    
    setGallerySubmissionPending(true);
    setShowGalleryConfirm(false);
    
    try {
      const promptKey = currentPhoto.promptKey || currentPhoto.selectedStyle;
      
      // Check if this is a video submission
      const isVideo = !!currentPhoto.videoUrl;
      const thumbnailUrl = currentPhoto.images[selectedSubIndex || 0];
      const videoUrl = currentPhoto.videoUrl;
      
      // Convert thumbnail image to data URL for server storage
      let imageDataUrl = thumbnailUrl;
      if (thumbnailUrl && thumbnailUrl.startsWith('blob:')) {
        try {
          const response = await fetch(thumbnailUrl);
          const blob = await response.blob();
          imageDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.error('Failed to convert thumbnail to data URL:', err);
        }
      }
      
      // Convert video URL to data URL if it's a video submission
      let videoDataUrl = null;
      if (isVideo && videoUrl) {
        try {
          const response = await fetch(videoUrl);
          const blob = await response.blob();
          videoDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.error('Failed to convert video to data URL:', err);
          // Use the URL directly as fallback (may be a CDN URL)
          videoDataUrl = videoUrl;
        }
      }
      
      // Get metadata from photo (actual values used) and settings (fallback)
      const metadata = {
        model: currentPhoto.model || selectedModel || settings.selectedModel,
        inferenceSteps: currentPhoto.steps || settings.inferenceSteps,
        seed: currentPhoto.seed !== undefined ? currentPhoto.seed : settings.seed,
        guidance: settings.guidance,
        aspectRatio: aspectRatio || settings.aspectRatio,
        width: desiredWidth,
        height: desiredHeight,
        promptKey: promptKey,
        promptText: currentPhoto.positivePrompt || currentPhoto.stylePrompt || stylePrompts[promptKey] || '',
        isVideo: isVideo,
        // Video-specific metadata
        ...(isVideo && {
          videoMotionPrompt: currentPhoto.videoMotionPrompt || settings.videoMotionPrompt || '',
          videoResolution: currentPhoto.videoResolution || settings.videoResolution || '480p',
          videoFramerate: currentPhoto.videoFramerate || settings.videoFramerate || 16,
          videoDuration: currentPhoto.videoDuration || settings.videoDuration || 5
        })
      };
      
      // Submit to gallery API
      const response = await fetch('/api/contest/gallery-submissions/entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: imageDataUrl, // Always send thumbnail image
          videoUrl: isVideo ? videoDataUrl : undefined, // Send video if available
          isVideo: isVideo,
          promptKey,
          username: user?.username,
          address: user?.address,
          metadata
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit to gallery');
      }
      
      const data = await response.json();
      console.log('Gallery submission successful:', data);
      
      // Show success toast notification
      showToast({
        type: 'success',
        title: '✨ Successfully submitted to gallery!',
        message: `Your ${isVideo ? 'video' : 'image'} will be reviewed by moderators.`,
        timeout: 5000
      });
      
    } catch (error) {
      console.error('Error submitting to gallery:', error);
      
      // Show error toast notification
      showToast({
        type: 'error',
        title: '❌ Submission Failed',
        message: 'Failed to submit to gallery. Please try again.',
        timeout: 5000
      });
    } finally {
      setGallerySubmissionPending(false);
    }
  }, [photos, selectedPhotoIndex, selectedSubIndex, gallerySubmissionPending, stylePrompts, user, showToast, settings, selectedModel, aspectRatio, desiredWidth, desiredHeight]);

  const handleGallerySubmitCancel = useCallback(() => {
    setShowGalleryConfirm(false);
  }, []);

  // Handle download photo with polaroid frame
  const handleDownloadPhoto = async (photoIndex) => {
    // Get the correct photo from the appropriate array (filtered or original)
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    const targetPhoto = currentPhotosArray[photoIndex];
    
    if (!targetPhoto || !targetPhoto.images || targetPhoto.images.length === 0) {
      return;
    }

    // Get the current image URL (handle enhanced images)
    const currentSubIndex = targetPhoto.enhanced && targetPhoto.enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? targetPhoto.enhancedImageUrl
      : targetPhoto.images[currentSubIndex];
    
    if (!imageUrl) return;
    
    try {
      // Get style display text (spaced format, no hashtags)
      const styleDisplayText = getStyleDisplayText(targetPhoto);
      
      // Use statusText directly if it's a hashtag (like #SogniPhotobooth), otherwise use styleDisplayText
      const photoLabel = (targetPhoto?.statusText && targetPhoto.statusText.includes('#')) 
        ? targetPhoto.statusText 
        : styleDisplayText || '';
      
      // Generate filename based on outputFormat setting
      const cleanStyleName = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '-') : 'sogni';
      const fileExtension = outputFormat === 'png' ? '.png' : '.jpg';
      const filename = `sogni-photobooth-${cleanStyleName}-framed${fileExtension}`;
      
      // Ensure font is loaded
      if (!document.querySelector('link[href*="Permanent+Marker"]')) {
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
      }
      
      // Wait for fonts to load
      await document.fonts.ready;
      
      // Create framed image: supported custom theme frame OR default polaroid frame
      // Use the outputFormat setting for framed downloads (unlike Twitter which always uses JPG)
      const useTheme = isThemeSupported();
      const isGalleryImage = targetPhoto.isGalleryImage;
      // Gallery images should always use default polaroid styling, regardless of theme
      const shouldUseTheme = useTheme && !isGalleryImage;
      // Truncate label earlier to make room for QR code
      const maxLabelLength = 20; // Shorter to make room for QR
      const truncatedLabel = !shouldUseTheme && photoLabel.length > maxLabelLength 
        ? photoLabel.substring(0, maxLabelLength) + '...' 
        : photoLabel;

      const polaroidUrl = await createPolaroidImage(imageUrl, !shouldUseTheme ? truncatedLabel : '', {
        tezdevTheme: shouldUseTheme ? tezdevTheme : 'off',
        aspectRatio,
        // If theme is not supported or it's a gallery image, use default polaroid frame; otherwise no polaroid frame
        frameWidth: !shouldUseTheme ? 56 : 0,
        frameTopWidth: !shouldUseTheme ? 56 : 0,
        frameBottomWidth: !shouldUseTheme ? 150 : 0,
        frameColor: !shouldUseTheme ? 'white' : 'transparent',
        outputFormat: outputFormat, // Use the actual outputFormat setting for framed downloads
        // For Taipei theme, pass the current frame number to ensure consistency (but not for gallery images)
        taipeiFrameNumber: shouldUseTheme && tezdevTheme === 'taipeiblockchain' ? targetPhoto.taipeiFrameNumber : undefined,
        // Add QR watermark for downloads with improved settings (if enabled)
        watermarkOptions: settings.sogniWatermark ? getQRWatermarkConfig(settings) : null
      });
      
      // Prepare analytics options for mobile sharing
      const analyticsOptions = {
        selectedStyle,
        stylePrompts,
        metadata: {
          downloadType: 'framed',
          filename,
          photoIndex,
          styleDisplayText,
          outputFormat,
          tezdevTheme,
          aspectRatio
        }
      };
      
      // Handle download
      const downloadSuccess = await downloadImage(polaroidUrl, filename, analyticsOptions);
      
      // Track analytics if download was successful (for all platforms)
      if (downloadSuccess) {
        // Get the actual prompt that was used for this photo
        const actualPrompt = targetPhoto.positivePrompt || targetPhoto.stylePrompt;
        await trackDownloadWithStyle(selectedStyle, stylePrompts, {
          downloadType: 'framed',
          filename,
          photoIndex,
          styleDisplayText,
          outputFormat,
          tezdevTheme,
          aspectRatio,
          platform: isMobile() ? 'mobile' : 'desktop',
          actualPrompt
        });
      }
    } catch (error) {
      console.error('Error downloading photo:', error);
    }
  };

  // Handle download raw photo WITHOUT any frame theme (pure original image)
  const handleDownloadRawPhoto = async (photoIndex) => {
    // Get the correct photo from the appropriate array (filtered or original)
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    const targetPhoto = currentPhotosArray[photoIndex];
    
    if (!targetPhoto || !targetPhoto.images || targetPhoto.images.length === 0) {
      return;
    }

    // Get the current image URL (handle enhanced images)
    const currentSubIndex = targetPhoto.enhanced && targetPhoto.enhancedImageUrl 
      ? -1 // Special case for enhanced images
      : (selectedSubIndex || 0);
      
    const imageUrl = currentSubIndex === -1
      ? targetPhoto.enhancedImageUrl
      : targetPhoto.images[currentSubIndex];
    
    if (!imageUrl) return;
    
    try {
      // Generate filename with correct extension based on outputFormat
      const styleDisplayText = getStyleDisplayText(targetPhoto);
      const cleanStyleName = styleDisplayText ? styleDisplayText.toLowerCase().replace(/\s+/g, '-') : 'sogni';
      
      // For raw downloads, ensure we preserve the original format from the server
      // First, try to detect the actual format from the image URL or by fetching it
      let actualExtension = outputFormat === 'jpg' ? '.jpg' : '.png';
      
      try {
        // If this is a blob URL, we can fetch it to check the MIME type
        if (imageUrl.startsWith('blob:') || imageUrl.startsWith('http')) {
          const response = await fetch(imageUrl);
          const contentType = response.headers.get('content-type');
          if (contentType) {
            if (contentType.includes('image/png')) {
              actualExtension = '.png';
            } else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
              actualExtension = '.jpg';
            }
            console.log(`[RAW DOWNLOAD] Detected image format: ${contentType}, using extension: ${actualExtension}`);
          }
          // Don't consume the response body, just use the headers
        }
      } catch (formatDetectionError) {
        console.warn('Could not detect image format, using outputFormat setting:', formatDetectionError);
        // Fall back to outputFormat setting
      }
      
      const filename = `sogni-photobooth-${cleanStyleName}-raw${actualExtension}`;
      
      // For raw downloads, add QR watermark to the original image without frames (if enabled)
      console.log(`[RAW DOWNLOAD] Processing original image${settings.sogniWatermark ? ' with QR watermark' : ''}: ${filename}`);
      
      // Load the original image and optionally add QR watermark
      const processedImageUrl = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            // Enable high-quality image resampling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Draw the original image
            ctx.drawImage(img, 0, 0);
            
            // Add QR watermark to raw image (if enabled)
            if (settings.sogniWatermark) {
              const { addQRWatermark } = await import('../../utils/imageProcessing.js');
              await addQRWatermark(ctx, canvas.width, canvas.height, getQRWatermarkConfig(settings));
            }
            
            // Convert to data URL
            const dataUrl = canvas.toDataURL(actualExtension === '.png' ? 'image/png' : 'image/jpeg', 0.95);
            resolve(dataUrl);
          } catch (error) {
            console.error('Error processing raw image with watermark:', error);
            // Fallback to original image if watermark fails
            resolve(imageUrl);
          }
        };
        
        img.onerror = () => {
          console.error('Error loading image for raw download processing');
          // Fallback to original image if loading fails
          resolve(imageUrl);
        };
        
        img.src = imageUrl;
      });
      
      // Prepare analytics options for mobile sharing
      const analyticsOptions = {
        selectedStyle,
        stylePrompts,
        metadata: {
          downloadType: 'raw',
          filename,
          photoIndex,
          styleDisplayText,
          actualExtension,
          hasWatermark: settings.sogniWatermark
        }
      };
      
      // Handle download and track analytics
      const downloadSuccess = await downloadImage(processedImageUrl, filename, analyticsOptions);
      
      // Track analytics if download was successful (for all platforms)
      if (downloadSuccess) {
        // Get the actual prompt that was used for this photo
        const actualPrompt = targetPhoto.positivePrompt || targetPhoto.stylePrompt;
        await trackDownloadWithStyle(selectedStyle, stylePrompts, {
          downloadType: 'raw',
          filename,
          photoIndex,
          styleDisplayText,
          actualExtension,
          hasWatermark: settings.sogniWatermark,
          platform: isMobile() ? 'mobile' : 'desktop',
          actualPrompt
        });
      }
    } catch (error) {
      console.error('Error downloading raw photo:', error);
    }
  };


  return (
    <div className={`film-strip-container ${showPhotoGrid ? 'visible' : 'hiding'} ${selectedPhotoIndex !== null && (!isPromptSelectorMode || wantsFullscreen) ? 'has-selected' : ''} ${wantsFullscreen ? 'fullscreen-active' : ''} ${hasGalleryEntries && isPromptSelectorMode && wantsFullscreen ? 'has-gallery-carousel' : ''} ${isPWA ? 'pwa-mode' : ''} ${isExtensionMode ? 'extension-mode' : ''} ${isPromptSelectorMode ? 'prompt-selector-mode' : ''}`}
      onClick={(e) => {
        // Dismiss touch hover state when clicking outside images in Vibe Explorer
        if (isPromptSelectorMode && touchHoveredPhotoIndex !== null && e.target === e.currentTarget) {
          setTouchHoveredPhotoIndex(null);
        }
      }}
      style={{
        background: isExtensionMode ? 'transparent' : 'rgba(248, 248, 248, 0.85)',
        backgroundImage: isExtensionMode ? 'none' : `
          linear-gradient(125deg, rgba(255,138,0,0.8), rgba(229,46,113,0.8), rgba(185,54,238,0.8), rgba(58,134,255,0.8)),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px),
          repeating-linear-gradient(-45deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 2px, transparent 2px, transparent 4px)
        `,
        backgroundSize: isExtensionMode ? 'auto' : '400% 400%, 20px 20px, 20px 20px',
        animation: (backgroundAnimationsEnabled && !isPWA && !isExtensionMode) ? 'psychedelic-shift 15s ease infinite' : 'none',
      }}
    >
      <button
        className="corner-btn"
        onClick={handleBackToCamera}
      >
        ← Menu
      </button>
      {/* Settings button - always show in photo grid */}
      {selectedPhotoIndex === null && (
        <button
          className="header-settings-btn"
          onClick={handleShowControlOverlay}
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            width: 38,
            height: 38,
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            fontWeight: 900,
            lineHeight: 1,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 1000,
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
          }}
          title="Settings"
        >
          ⚙️
        </button>
      )}

      {/* Vibe Selector Widget - Top Left next to auth status (only show when not in prompt selector mode and when grid is visible without selection) */}
      {!isPromptSelectorMode && selectedPhotoIndex === null && updateStyle && (
        <button
          className="photo-gallery-style-selector-button"
          onClick={() => setShowStyleDropdown(prev => !prev)}
          title="Your selected vibe - Click to change"
        >
          <div className="photo-gallery-style-selector-content">
            {(() => {
              // Generate the full gallery image path with fallback logic
              // Skip special styles that don't have preview images
              const isIndividualStyle = selectedStyle && 
                !['custom', 'random', 'randomMix', 'oneOfEach', 'browseGallery', 'copyImageStyle'].includes(selectedStyle);
              const folder = isIndividualStyle ? getPortraitFolderWithFallback(portraitType, selectedStyle, promptsDataRaw) : null;
              const stylePreviewImage = isIndividualStyle && folder
                ? `${urls.assetUrl}/gallery/prompts/${folder}/${generateGalleryFilename(selectedStyle)}`
                : null;
              return stylePreviewImage ? (
                <img
                  src={stylePreviewImage}
                  alt={selectedStyle ? styleIdToDisplay(selectedStyle) : 'Style preview'}
                  className="photo-gallery-style-preview-image"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallbackIcon = e.currentTarget.nextElementSibling;
                    if (fallbackIcon && fallbackIcon.classList.contains('photo-gallery-style-icon-fallback')) {
                      fallbackIcon.style.display = 'block';
                    }
                  }}
                />
              ) : null;
            })()}
            <span className={`photo-gallery-style-icon ${selectedStyle && selectedStyle !== 'custom' ? 'photo-gallery-style-icon-fallback' : ''}`} style={selectedStyle && selectedStyle !== 'custom' ? { display: 'none' } : {}}>
              🎨
            </span>
            <div className="photo-gallery-style-info">
              <div className="photo-gallery-style-label">Selected vibe</div>
              <div className="photo-gallery-style-text">
                {selectedStyle === 'custom' ? 'Custom...' : selectedStyle ? styleIdToDisplay(selectedStyle) : 'Select Style'}
              </div>
            </div>
          </div>
        </button>
      )}

      {/* Style Dropdown for Vibe Selector */}
      {!isPromptSelectorMode && showStyleDropdown && updateStyle && (
        <StyleDropdown
          isOpen={showStyleDropdown}
          onClose={() => setShowStyleDropdown(false)}
          selectedStyle={selectedStyle}
          updateStyle={(style) => {
            if (updateStyle) updateStyle(style);
          }}
          defaultStylePrompts={stylePrompts}
          setShowControlOverlay={() => {}}
          dropdownPosition="top"
          triggerButtonClass=".photo-gallery-style-selector-button"
          selectedModel={selectedModel}
          onModelSelect={(model) => {
            console.log('PhotoGallery: Switching model to', model);
            if (switchToModel) {
              switchToModel(model);
            }
          }}
          portraitType={portraitType}
          onNavigateToVibeExplorer={onNavigateToVibeExplorer}
          slideInPanel={true}
        />
      )}

      {/* Bottom right button container - holds both Download and New Batch buttons */}
      {!isPromptSelectorMode && selectedPhotoIndex === null && photos && photos.length > 0 && photos.filter(p => !p.hidden && !p.error && p.images && p.images.length > 0).length > 0 && (
        <div style={{ 
          position: 'fixed', 
          right: '32px', 
          bottom: '32px', 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center',
          zIndex: 10000000 
        }}>
          <div 
            className="batch-action-dropdown-container" 
            style={{ 
              position: 'relative',
              background: 'linear-gradient(135deg, #ff5252, #e53935)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'all 0.2s ease',
              display: 'inline-flex',
              overflow: 'visible'
            }}
            onMouseEnter={(e) => {
              if (!isBulkDownloading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            }}
          >
            <button
              className="batch-action-button batch-action-button-main"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Close mode selection dropdown when clicking main button
                setShowBatchActionDropdown(false);
                // Hide download tip when button is clicked
                if (showDownloadTip) {
                  setShowDownloadTip(false);
                }
                if (batchActionMode === 'download') {
                  // Check if any photos have videos - if so, download videos as zip
                  const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
                  const photosWithVideos = currentPhotosArray.filter(
                    photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
                  );

                  if (photosWithVideos.length > 0) {
                    // Check if these are transition videos - if so, concatenate instead of zipping
                    if (isTransitionMode && transitionVideoQueue.length > 0) {
                      handleDownloadTransitionVideo();
                    } else {
                      // Normal video batch: download as zip
                      handleDownloadAllVideos();
                    }
                  } else {
                    // Show download options dropdown for images
                    setShowMoreDropdown(prev => !prev);
                  }
                } else if (batchActionMode === 'video') {
                  // Show video dropdown to select emoji
                  if (isAuthenticated) {
                    setShowBatchVideoDropdown(prev => !prev);
                  } else {
                    showToast({
                      title: 'Authentication Required',
                      message: 'Please sign in to generate videos.',
                      type: 'info'
                    });
                  }
                } else if (batchActionMode === 'transition') {
                  // Show transition video popup for configuration before generating
                  if (isAuthenticated) {
                    setShowTransitionVideoPopup(true);
                  } else {
                    showToast({
                      title: 'Authentication Required',
                      message: 'Please sign in to generate transition videos.',
                      type: 'info'
                    });
                  }
                }
              }}
              disabled={isBulkDownloading}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                padding: '6px 14px',
                paddingBottom: '8px',
                borderRadius: '0',
                cursor: isBulkDownloading ? 'not-allowed' : 'pointer',
                opacity: isBulkDownloading ? 0.6 : 1,
                fontSize: '15px',
                fontWeight: '600',
                fontFamily: '"Permanent Marker", cursive',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                pointerEvents: 'auto',
                position: 'relative',
                zIndex: 1,
                minHeight: '40px'
              }}
              title={
                batchActionMode === 'video' 
                  ? 'Generate videos for all images' 
                  : batchActionMode === 'transition'
                  ? 'Generate transition videos for all images'
                  : 'Download all images'
              }
            >
              {showDownloadTip && batchActionMode === 'download' && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '8px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    color: '#fff',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    zIndex: 10000,
                    pointerEvents: 'none',
                    animation: 'fadeIn 0.3s ease-out'
                  }}
                >
                  Click here to download your video! ⬇️
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid rgba(0, 0, 0, 0.9)'
                    }}
                  />
                </div>
              )}
              <span>
                {batchActionMode === 'video' 
                  ? '🎥' 
                  : batchActionMode === 'transition'
                  ? '🔀'
                  : '⬇️'}
              </span>
              <span>
                {batchActionMode === 'video' 
                  ? '' 
                  : batchActionMode === 'transition'
                  ? ''
                  : ''}
              </span>
            </button>
            <button
              className="batch-action-button batch-action-button-dropdown"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Close any open dropdowns (like download dropdown) when opening mode selection
                setShowMoreDropdown(false);
                setShowBatchActionDropdown(prev => !prev);
              }}
              disabled={isBulkDownloading}
              style={{
                background: 'transparent',
                border: 'none',
                borderLeft: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'white',
                padding: '8px 8px',
                paddingBottom: '10px',
                borderRadius: '0',
                cursor: isBulkDownloading ? 'not-allowed' : 'pointer',
                opacity: isBulkDownloading ? 0.6 : 1,
                fontSize: '16px',
                fontFamily: '"Permanent Marker", cursive',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                pointerEvents: 'auto',
                position: 'relative',
                zIndex: 1,
                minHeight: '44px'
              }}
              title="Switch between Download and Video"
            >
              <span>▼</span>
            </button>
            
            {/* Mode selection dropdown - portaled to document.body for proper z-index stacking */}
            {showBatchActionDropdown && !isBulkDownloading && (() => {
              // Count loaded photos (excluding originals and hidden/discarded ones)
              const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
              const loadedPhotosCount = currentPhotosArray.filter(
                photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
              ).length;
              const canUseVideo = loadedPhotosCount > 0;

              return createPortal(
                <div
                  className="batch-action-mode-dropdown"
                  style={{
                    position: 'fixed',
                    bottom: '90px',
                    right: '32px',
                    background: 'rgba(255, 255, 255, 0.98)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    overflow: 'hidden',
                    minWidth: '150px',
                    animation: 'fadeIn 0.2s ease-out',
                    zIndex: 10000001
                  }}
                >
                  {/* Header */}
                  <div style={{
                    padding: '10px 16px',
                    background: 'rgba(255, 82, 82, 0.08)',
                    borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
                    fontFamily: '"Permanent Marker", cursive',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#555',
                    textAlign: 'center',
                    letterSpacing: '0.5px'
                  }}>
                    Batch Action
                  </div>
                  <button
                    className="batch-action-mode-option"
                    onClick={() => {
                      setBatchActionMode('download');
                      setShowBatchActionDropdown(false);
                      // DON'T reset transition mode - we need to remember it for download
                      
                      // Auto-execute download action if switching from another mode
                      if (batchActionMode !== 'download') {
                        // Check if any photos have videos - if so, download videos
                        const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
                        const photosWithVideos = currentPhotosArray.filter(
                          photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
                        );

                        if (photosWithVideos.length > 0) {
                          // Check if these are transition videos - if so, concatenate instead of zipping
                          if (isTransitionMode && transitionVideoQueue.length > 0) {
                            handleDownloadTransitionVideo();
                          } else {
                            // Normal video batch: download as zip
                            handleDownloadAllVideos();
                          }
                        } else {
                          // Show download options dropdown for images
                          setShowMoreDropdown(true);
                        }
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: 'none',
                      background: batchActionMode === 'download' ? 'rgba(255, 82, 82, 0.1)' : 'transparent',
                      color: '#333',
                      fontSize: '14px',
                      fontWeight: batchActionMode === 'download' ? '600' : 'normal',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                    onMouseOver={(e) => {
                      if (batchActionMode !== 'download') {
                        e.currentTarget.style.background = 'rgba(255, 82, 82, 0.1)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (batchActionMode !== 'download') {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span>⬇️</span> Download All
                    {batchActionMode === 'download' && <span style={{ marginLeft: 'auto' }}>✓</span>}
                  </button>
                  {canUseVideo && (
                    <>
                      <button
                        className="batch-action-mode-option"
                        onClick={() => {
                          setBatchActionMode('video');
                          setShowBatchActionDropdown(false);
                          // Reset transition mode when switching away
                          setIsTransitionMode(false);
                          setTransitionVideoQueue([]);
                          setCurrentVideoIndexByPhoto({});
                          setAllTransitionVideosComplete(false);
                          
                          // Clean up music state when leaving transition mode
                          if (appliedMusic?.audioUrl) {
                            URL.revokeObjectURL(appliedMusic.audioUrl);
                          }
                          setAppliedMusic(null);
                          setIsInlineAudioMuted(false);
                          if (inlineAudioRef.current) {
                            inlineAudioRef.current.pause();
                          }
                          
                          // Auto-execute video action if switching from another mode
                          if (batchActionMode !== 'video') {
                            // Show video dropdown to select emoji
                            // Use setTimeout to avoid click outside handler closing it immediately
                            if (isAuthenticated) {
                              setTimeout(() => {
                                setShowBatchVideoDropdown(true);
                              }, 10);
                            } else {
                              showToast({
                                title: 'Authentication Required',
                                message: 'Please sign in to generate videos.',
                                type: 'info'
                              });
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          background: batchActionMode === 'video' ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                          color: '#333',
                          fontSize: '14px',
                          fontWeight: batchActionMode === 'video' ? '600' : 'normal',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                        onMouseOver={(e) => {
                          if (batchActionMode !== 'video') {
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (batchActionMode !== 'video') {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <span>🎥💫</span> Motion Video
                        {batchActionMode === 'video' && <span style={{ marginLeft: 'auto' }}>✓</span>}
                      </button>
                      <button
                        className="batch-action-mode-option"
                        onClick={() => {
                          setBatchActionMode('transition');
                          setShowBatchActionDropdown(false);
                          
                          // Show transition video popup for configuration if switching from another mode
                          if (batchActionMode !== 'transition') {
                            if (isAuthenticated) {
                              setShowTransitionVideoPopup(true);
                            } else {
                              showToast({
                                title: 'Authentication Required',
                                message: 'Please sign in to generate transition videos.',
                                type: 'info'
                              });
                            }
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          background: batchActionMode === 'transition' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                          color: '#333',
                          fontSize: '14px',
                          fontWeight: batchActionMode === 'transition' ? '600' : 'normal',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                        onMouseOver={(e) => {
                          if (batchActionMode !== 'transition') {
                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (batchActionMode !== 'transition') {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <span>🔀</span> Transition Video
                        {batchActionMode === 'transition' && <span style={{ marginLeft: 'auto' }}>✓</span>}
                      </button>
                      <button
                        className="batch-action-mode-option"
                        onClick={() => {
                          setShowBatchActionDropdown(false);
                          
                          // Show BASE Hero confirmation popup
                          if (isAuthenticated) {
                            setShowBatchBaseHeroPopup(true);
                          } else {
                            showToast({
                              title: 'Authentication Required',
                              message: 'Please sign in to generate BASE Hero videos.',
                              type: 'info'
                            });
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          background: 'transparent',
                          color: '#333',
                          fontSize: '14px',
                          fontWeight: 'normal',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 82, 255, 0.1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span>🦸</span> BASE Hero
                      </button>
                      <button
                        className="batch-action-mode-option"
                        onClick={() => {
                          setShowBatchActionDropdown(false);
                          
                          // Show Prompt Video confirmation popup
                          if (isAuthenticated) {
                            setShowBatchPromptVideoPopup(true);
                          } else {
                            showToast({
                              title: 'Authentication Required',
                              message: 'Please sign in to generate prompt videos.',
                              type: 'info'
                            });
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          border: 'none',
                          background: 'transparent',
                          color: '#333',
                          fontSize: '14px',
                          fontWeight: 'normal',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'background 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span>✨</span> Prompt Video
                      </button>
                    </>
                  )}
                </div>,
                document.body
              );
            })()}

            {/* Download options dropdown (when in download mode) */}
            {showMoreDropdown && !isBulkDownloading && batchActionMode === 'download' && (
              <div
                className="more-dropdown-menu"
                style={{
                  position: 'absolute',
                  bottom: '50px',
                  right: '0',
                  background: 'rgba(255, 255, 255, 0.98)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  overflow: 'hidden',
                  minWidth: '200px',
                  animation: 'fadeIn 0.2s ease-out',
                  zIndex: 10000001
                }}
              >
                <button
                  className="more-dropdown-option"
                  onClick={() => {
                    handleDownloadAll(false);
                    setShowMoreDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: '#333',
                    fontSize: '14px',
                    fontWeight: 'normal',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 82, 82, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span>⬇️</span> Download All Raw
                </button>
                <button
                  className="more-dropdown-option"
                  onClick={() => {
                    handleDownloadAll(true);
                    setShowMoreDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    color: '#333',
                    fontSize: '14px',
                    fontWeight: 'normal',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 82, 82, 0.1)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span>🖼️</span> Download All Framed
                </button>
              </div>
            )}
              
          {/* Progress indicator for downloads - portaled for proper z-index */}
          {(isBulkDownloading || readyTransitionVideo) && bulkDownloadProgress.message && createPortal(
            <div
              className="bulk-download-progress"
              style={{
                position: 'fixed',
                bottom: '90px',
                right: '32px',
                background: 'rgba(0, 0, 0, 0.85)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                minWidth: '150px',
                textAlign: 'right',
                whiteSpace: 'nowrap',
                zIndex: 10001
              }}
            >
              <div>{bulkDownloadProgress.message}</div>
              {bulkDownloadProgress.total > 0 && !readyTransitionVideo && (
                <div style={{ marginTop: '4px' }}>
                  {bulkDownloadProgress.current}/{bulkDownloadProgress.total}
                </div>
              )}
              {readyTransitionVideo && (
                <button
                  onClick={handleShareTransitionVideo}
                  style={{
                    marginTop: '8px',
                    background: 'rgba(102, 126, 234, 1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    width: '100%',
                    fontFamily: '"Permanent Marker", cursive'
                  }}
                >
                  📱 Save Video
                </button>
              )}
            </div>,
            document.body
          )}

          {/* Batch video mode tutorial tip - shown once after first render */}
          {showBatchVideoTip && !isBulkDownloading && (
            <div
              className="batch-video-tip-tooltip"
              style={{
                position: 'absolute',
                bottom: '65px',
                right: '0',
                background: 'rgba(102, 126, 234, 0.95)',
                color: 'white',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                minWidth: '180px',
                maxWidth: '250px',
                textAlign: 'center',
                whiteSpace: 'normal',
                zIndex: 10000003,
                animation: 'fadeInUp 0.3s ease-out',
                cursor: 'pointer'
              }}
              onClick={() => {
                setShowBatchVideoTip(false);
                markBatchVideoTipShown();
                // Also open the dropdown to show the video mode
                setShowBatchActionDropdown(true);
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '18px' }}>💡</span>
                <span style={{ lineHeight: '1.3' }}>
                  Switch to batch video mode here!
                </span>
              </div>
              {/* Arrow pointer */}
              <div style={{
                position: 'absolute',
                bottom: '-8px',
                right: '24px',
                width: '0',
                height: '0',
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '8px solid rgba(102, 126, 234, 0.95)'
              }} />
            </div>
          )}
          </div>

          {/* New Batch button - inside the same container */}
          {((!isGenerating && selectedPhotoIndex === null) || (isGenerating && showMoreButtonDuringGeneration && selectedPhotoIndex === null)) && (
            <button
              className="more-photos-btn"
              onClick={handleMoreButtonClick}
              disabled={!isGenerating && (!isSogniReady || !lastPhotoData.blob)}
              style={{
                background: 'linear-gradient(135deg, #ff5252, #e53935)',
                color: 'white',
                border: 'none',
                padding: '6px 14px',
                paddingBottom: '8px',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                cursor: (!isGenerating && (!isSogniReady || !lastPhotoData.blob)) ? 'not-allowed' : 'pointer',
                minHeight: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                fontSize: '15px',
                fontFamily: '"Permanent Marker", cursive',
                opacity: (!isGenerating && (!isSogniReady || !lastPhotoData.blob)) ? 0.6 : 1,
              }}
              title={isGenerating ? 'Cancel current generation and start new batch' : 'Adjust and generate next batch'}
            >
              NEW BATCH
            </button>
          )}
        </div>
      )}
      {/* Continue button - only show in prompt selector mode - navigates back to menu */}
      {isPromptSelectorMode && handleBackToCamera && selectedPhotoIndex === null && (
        <button
          className="view-photos-btn corner-btn"
          onClick={() => {
            // Navigate back to menu
            handleBackToCamera();
          }}
          title="Return to main menu"
        >
          <span className="view-photos-label">
            Continue
          </span>
        </button>
      )}
      {/* Navigation buttons - only show when a photo is selected */}
      {selectedPhotoIndex !== null && (isPromptSelectorMode ? filteredPhotos.length > 1 : photos.length > 1) && (
        <>
          <button className="photo-nav-btn prev" onClick={() => {
            // Use filtered photos in prompt selector mode, regular photos otherwise
            const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
            let prevIndex = selectedPhotoIndex - 1;
            if (prevIndex < 0) {
              prevIndex = currentPhotosArray.length - 1; // Loop to end
            }
            setSelectedPhotoIndex(prevIndex);
          }}>
            &#8249;
          </button>
          <button className="photo-nav-btn next" onClick={() => {
            // Use filtered photos in prompt selector mode, regular photos otherwise
            const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
            let nextIndex = selectedPhotoIndex + 1;
            if (nextIndex >= currentPhotosArray.length) {
              nextIndex = 0; // Loop to beginning
            }
            setSelectedPhotoIndex(nextIndex);
          }}>
            &#8250;
          </button>
          <button 
            className="photo-close-btn" 
            onClick={() => setSelectedPhotoIndex(null)}
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              color: 'white',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 99999,
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(255, 83, 83, 0.8)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseDown={e => {
              e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onMouseUp={e => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
          >
            ×
          </button>
        </>
      )}
      {/* Also add a close button when there's only one photo */}
      {selectedPhotoIndex !== null && photos.length === 1 && (
        <button 
          className="photo-close-btn" 
          onClick={() => setSelectedPhotoIndex(null)}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            fontSize: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 99999,
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(255, 83, 83, 0.8)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>
      )}
      {/* Add these buttons when a photo is selected */}
      {(() => {
        if (selectedPhotoIndex === null) return null;
        
        // Get the correct photo from the appropriate array (filtered or original)
        const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
        const selectedPhoto = currentPhotosArray[selectedPhotoIndex];
        
        if (!selectedPhoto) return null;
        
        return (
          <div className="photo-action-buttons" style={{
            display: 'flex',
            justifyContent: 'center',
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            // Ensure this toolbar and its popups are above sloth mascot
            zIndex: 999999,
          }}>
            {/* Share to X Button or Use this Prompt Button for Gallery Images */}
            {selectedPhoto.isGalleryImage ? (
              <>
                <button
                  className="action-button use-prompt-btn"
                  onClick={(e) => {
                    console.log('🔍 isPromptSelectorMode:', isPromptSelectorMode);
                    
                    // Reset scroll position to top in extension mode before style selection
                    if (isExtensionMode) {
                      console.log('✅ EXTENSION MODE DETECTED - EXECUTING SCROLL RESET (Use This Style)');
                      
                      // Direct approach - just scroll the film strip container to top
                      const filmStripContainer = document.querySelector('.film-strip-container');
                      if (filmStripContainer) {
                        console.log('📍 Found .film-strip-container, scrollTop before:', filmStripContainer.scrollTop);
                        filmStripContainer.scrollTop = 0;
                        console.log('📍 Set scrollTop to 0, scrollTop after:', filmStripContainer.scrollTop);
                        filmStripContainer.scrollTo({ top: 0, behavior: 'instant' });
                        console.log('📍 Called scrollTo({top: 0, behavior: instant})');
                      } else {
                        console.log('❌ .film-strip-container NOT FOUND');
                      }
                    }
                    
                    if (isPromptSelectorMode && onPromptSelect && selectedPhoto.promptKey) {
                      // If a gallery variation is selected, pass the seed and metadata to use that variation
                      const seedToUse = selectedPhoto.gallerySeed !== undefined ? selectedPhoto.gallerySeed : undefined;
                      const metadataToUse = selectedPhoto.galleryMetadata || undefined;
                      console.log('🎯 Using this style with metadata:', metadataToUse);
                      onPromptSelect(selectedPhoto.promptKey, seedToUse, metadataToUse);
                      
                      // Navigate back to start menu (unless in extension mode)
                      // Use setTimeout to allow state updates to complete before navigation
                      if (!isExtensionMode && handleBackToCamera) {
                        console.log('🔙 Navigating back to start menu after style selection');
                        setTimeout(() => {
                          handleBackToCamera();
                        }, 50);
                      }
                    } else if (onUseGalleryPrompt && selectedPhoto.promptKey) {
                      const seedToUse = selectedPhoto.gallerySeed !== undefined ? selectedPhoto.gallerySeed : undefined;
                      onUseGalleryPrompt(selectedPhoto.promptKey, seedToUse);
                    }
                    e.stopPropagation();
                  }}
                  disabled={
                    !selectedPhoto.promptKey ||
                    (!onUseGalleryPrompt && !onPromptSelect)
                  }
                >
                  <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  Use this Style
                </button>
              </>
            ) : (
              <ShareMenu
                onShareToTwitter={() => {
                  // Pass both index and actual photo object to handle filtered scenarios
                  const actualPhoto = (isPromptSelectorMode ? filteredPhotos : photos)[selectedPhotoIndex];
                  handleShareToX(selectedPhotoIndex, actualPhoto);
                }}
                onShareViaWebShare={handleShareViaWebShare ? () => handleShareViaWebShare(selectedPhotoIndex) : undefined}
                onSubmitToGallery={handleGallerySubmitRequest}
                onShareQRCode={handleShareQRCode ? () => handleShareQRCode(selectedPhotoIndex) : undefined}
                onSubmitToPromptContest={() => {
                  // Handle winter prompt contest submission
                  console.log('❄️ Submitting to winter prompt contest');
                  // This will use the same gallery submission flow but with winter context
                  handleGallerySubmitRequest();
                }}
                showWebShare={isWebShareSupported()}
                isMobileDevice={isMobile()}
                disabled={
                  selectedPhoto.loading || 
                  selectedPhoto.enhancing ||
                  // Only disable for generation errors, not enhancement errors (original photo is still shareable)
                  (selectedPhoto.error && !selectedPhoto.enhancementError) ||
                  !selectedPhoto.images ||
                  selectedPhoto.images.length === 0
                }
                hasPromptKey={!!(selectedPhoto.promptKey || selectedPhoto.selectedStyle) && (selectedPhoto.promptKey !== 'custom' && selectedPhoto.selectedStyle !== 'custom')}
                isCustomPromptWithWinterContext={!!settings.winterContext && (selectedStyle === 'custom' || selectedPhoto.selectedStyle === 'custom' || selectedPhoto.promptKey === 'custom')}
                tezdevTheme={tezdevTheme}
              />
            )}

          {/* Download Framed Button - Hide in Vibe Explorer or when video exists */}
          {!isPromptSelectorMode && !selectedPhoto.videoUrl && (
          <button
            className="action-button download-btn"
            onClick={(e) => {
              handleDownloadPhoto(selectedPhotoIndex);
              e.stopPropagation();
            }}
            disabled={
              selectedPhoto.loading || 
              selectedPhoto.enhancing ||
              !selectedPhoto.images ||
              selectedPhoto.images.length === 0
            }
          >
            <span>⬇️</span>
            <span>Framed</span>
          </button>
          )}

          {/* Download Raw Button - Hide in Vibe Explorer or when video exists */}
          {!isPromptSelectorMode && !selectedPhoto.videoUrl && (
          <button
            className="action-button download-raw-btn"
            onClick={(e) => {
              handleDownloadRawPhoto(selectedPhotoIndex);
              e.stopPropagation();
            }}
            disabled={
              selectedPhoto.loading || 
              selectedPhoto.enhancing ||
              !selectedPhoto.images ||
              selectedPhoto.images.length === 0
            }
          >
            <span>⬇️</span>
            <span>Raw</span>
          </button>
          )}

          {/* Download Video Button - Show when video exists (replaces Framed/Raw buttons) */}
          {!isPromptSelectorMode && selectedPhoto.videoUrl && (
          <button
            className="action-button download-video-btn"
            onClick={(e) => {
              handleDownloadVideo();
              e.stopPropagation();
            }}
          >
            <span>⬇️</span>
            <span>Video</span>
          </button>
          )}

          {/* Video Button - Show in Vibe Explorer slideshow for styles with videos */}
          {isPromptSelectorMode && selectedPhoto.isGalleryImage && hasVideoEasterEgg(selectedPhoto.promptKey) && (
            <button
              className="action-button video-btn"
              onClick={(e) => {
                const photoId = selectedPhoto.id || selectedPhoto.promptKey;
                setActiveVideoPhotoId(activeVideoPhotoId === photoId ? null : photoId);
                e.stopPropagation();
              }}
            >
              <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                {(activeVideoPhotoId === (selectedPhoto.id || selectedPhoto.promptKey)) ? (
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                ) : (
                  <path d="M8 5v14l11-7z"/>
                )}
              </svg>
              {(activeVideoPhotoId === (selectedPhoto.id || selectedPhoto.promptKey)) ? 'Hide Video' : 'Video'}
            </button>
          )}

          {/* Enhanced Enhance Button with Undo/Redo functionality - Hide when video exists */}
          {!selectedPhoto.videoUrl && (
          <div className="enhance-button-container">
            {selectedPhoto.enhanced ? (
              <div className="enhance-buttons-group">
                <button
                  className="action-button enhance-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (selectedPhotoIndex !== null) {
                      undoEnhancement({
                        photoIndex: selectedPhotoIndex,
                        subIndex: selectedSubIndex || 0,
                        setPhotos,
                        clearFrameCache: clearFrameCacheForPhoto
                      });
                    }
                  }}
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                >
                  ↩️ Undo
                </button>
                <button
                  className={`action-button enhance-btn ${selectedPhoto.enhancing ? 'loading' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (selectedPhoto.enhancing) return;
                    // Show the enhance options dropdown (Krea/Kontext)
                    setShowEnhanceDropdown(prev => !prev);
                  }}
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                >
                  <span>✨ {selectedPhoto.enhancing ? 
                    (selectedPhoto.enhancementProgress !== undefined ? 
                      `Enhancing ${Math.round((selectedPhoto.enhancementProgress || 0) * 100)}%` : 
                      'Enhancing') : 
                    'Enhance'}</span>
                </button>
              </div>
            ) : selectedPhoto.canRedo ? (
              // Show both Redo and Enhance buttons when redo is available
              <div className="enhance-buttons-group">
                <button
                  className="action-button enhance-btn redo-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    if (selectedPhotoIndex !== null) {
                      redoEnhancement({
                        photoIndex: selectedPhotoIndex,
                        subIndex: selectedSubIndex || 0,
                        setPhotos,
                        clearFrameCache: clearFrameCacheForPhoto
                      });
                    }
                  }}
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                >
                  ↪️ Redo
                </button>
                <button
                  className={`action-button enhance-btn ${selectedPhoto.enhancing ? 'loading' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    // Prevent double-clicking by checking if already enhancing
                    if (photos[selectedPhotoIndex].enhancing) {
                      console.log('[ENHANCE] Already enhancing, ignoring click');
                      return;
                    }
                    
                    // Show dropdown menu (same as single enhance button)
                    setShowEnhanceDropdown(prev => !prev);
                  }}
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                >
                  <span>✨ {selectedPhoto.enhancing ? 
                    (selectedPhoto.enhancementProgress !== undefined ? 
                      `Enhancing ${Math.round((selectedPhoto.enhancementProgress || 0) * 100)}%` : 
                      'Enhancing') : 
                    'Enhance'}</span>
                </button>
              </div>
            ) : (
              <button
                className={`action-button enhance-btn ${selectedPhoto.enhancing ? 'loading' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  
                  // Prevent double-clicking by checking if already enhancing
                  if (photos[selectedPhotoIndex].enhancing) {
                    console.log('[ENHANCE] Already enhancing, ignoring click');
                    return;
                  }
                  
                  // Show dropdown menu
                  setShowEnhanceDropdown(prev => !prev);
                }}
                disabled={photos[selectedPhotoIndex].loading || photos[selectedPhotoIndex].enhancing}
              >
                <span>✨ {photos[selectedPhotoIndex].enhancing ? 
                  (photos[selectedPhotoIndex].enhancementProgress !== undefined ? 
                    `Enhancing ${Math.round((photos[selectedPhotoIndex].enhancementProgress || 0) * 100)}%` : 
                    'Enhancing') : 
                  'Enhance'}</span>
              </button>
            )}

            {/* Enhancement Options Dropdown rendered in a portal to escape any stacking context */}
            {showEnhanceDropdown && !selectedPhoto.enhancing && createPortal(
              (
                <div 
                  key="enhance-dropdown-stable"
                  className="enhance-dropdown rainbow-popup"
                  style={{
                    position: 'fixed',
                    bottom: (() => {
                      // Position dropdown above the enhance button
                      const enhanceButton = document.querySelector('.enhance-button-container');
                      if (enhanceButton) {
                        const rect = enhanceButton.getBoundingClientRect();
                        return window.innerHeight - rect.top + 10; // 10px gap above the button
                      }
                      return 88; // fallback
                    })(),
                    left: (() => {
                      // Position dropdown aligned with the enhance button
                      const enhanceButton = document.querySelector('.enhance-button-container');
                      if (enhanceButton) {
                        const rect = enhanceButton.getBoundingClientRect();
                        const dropdownWidth = 310;
                        let leftPos = rect.left + (rect.width / 2) - (dropdownWidth / 2);
                        
                        // Ensure dropdown doesn't go off-screen
                        if (leftPos < 10) leftPos = 10;
                        if (leftPos + dropdownWidth > window.innerWidth - 10) {
                          leftPos = window.innerWidth - dropdownWidth - 10;
                        }
                        
                        return leftPos;
                      }
                      return '50%'; // fallback
                    })(),
                    transform: (() => {
                      const enhanceButton = document.querySelector('.enhance-button-container');
                      return enhanceButton ? 'none' : 'translateX(-50%)'; // Only center if no button found
                    })(),
                    background: 'transparent',
                    animation: 'none',
                    boxShadow: 'none',
                    overflow: 'visible',
                    zIndex: 9999999,
                    minWidth: '280px',
                    borderRadius: '0',
                    border: 'none',
                    backdropFilter: 'none',
                    color: 'white',
                    fontWeight: 'bold',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <button
                    className="dropdown-option rainbow-option"
                    ref={enhanceButton1Ref}
                    onClick={(e) => { e.stopPropagation(); setShowEnhanceDropdown(false); handleEnhanceWithKrea(); }}
                    style={{
                      width: 'calc(100% + 60px)',
                      padding: '16px 20px 16px 20px',
                      paddingRight: '80px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)',
                      backgroundSize: '300% 300%',
                      animation: 'rainbow-shift 3s ease-in-out infinite',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      borderRadius: '20px 0 0 20px',
                      margin: '12px 8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                      position: 'relative',
                      overflow: 'hidden',
                      backdropFilter: 'blur(5px)',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)';
                      e.currentTarget.style.backgroundSize = '200% 200%';
                      e.currentTarget.style.animation = 'rainbow-shift 1.5s ease-in-out infinite';
                      e.currentTarget.style.transform = 'translateY(-6px) translateX(8px) scale(1.08) rotate(1deg)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                      e.currentTarget.style.fontSize = '16px';
                      e.currentTarget.style.fontWeight = '700';
                      e.currentTarget.style.letterSpacing = '0.5px';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)';
                      e.currentTarget.style.backgroundSize = '300% 300%';
                      e.currentTarget.style.animation = 'rainbow-shift 3s ease-in-out infinite';
                      e.currentTarget.style.transform = 'translateY(0) translateX(0) scale(1) rotate(0deg)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                      e.currentTarget.style.fontSize = '15px';
                      e.currentTarget.style.fontWeight = '600';
                      e.currentTarget.style.letterSpacing = '0px';
                    }}
                  >
                    ✨ One-click image enhance
                    {isAuthenticated && !kreaLoading && formatCost(kreaCost, kreaUSD) && (
                      <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
                        {formatCost(kreaCost, kreaUSD)}
                      </div>
                    )}
                  </button>
                  <button
                    className="dropdown-option rainbow-option"
                    ref={enhanceButton2Ref}
                    onClick={(e) => { e.stopPropagation(); setShowEnhanceDropdown(false); handleEnhanceWithKontext(); }}
                    style={{
                      width: 'calc(100% + 60px)',
                      padding: '16px 20px 16px 20px',
                      paddingRight: '80px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)',
                      backgroundSize: '300% 300%',
                      animation: 'rainbow-shift 3s ease-in-out infinite',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      borderRadius: '20px 0 0 20px',
                      margin: '12px 8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                      color: 'white',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                      position: 'relative',
                      overflow: 'hidden',
                      backdropFilter: 'blur(5px)',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)';
                      e.currentTarget.style.backgroundSize = '200% 200%';
                      e.currentTarget.style.animation = 'rainbow-shift 1.5s ease-in-out infinite';
                      e.currentTarget.style.transform = 'translateY(-6px) translateX(8px) scale(1.08) rotate(1deg)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
                      e.currentTarget.style.fontSize = '16px';
                      e.currentTarget.style.fontWeight = '700';
                      e.currentTarget.style.letterSpacing = '0.5px';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #ff0080, #ff8c00, #40e0d0, #9370db, #ff69b4, #00ff7f)';
                      e.currentTarget.style.backgroundSize = '300% 300%';
                      e.currentTarget.style.animation = 'rainbow-shift 3s ease-in-out infinite';
                      e.currentTarget.style.transform = 'translateY(0) translateX(0) scale(1) rotate(0deg)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                      e.currentTarget.style.fontSize = '15px';
                      e.currentTarget.style.fontWeight = '600';
                      e.currentTarget.style.letterSpacing = '0px';
                    }}
                  >
                    🎨 Transform image with words
                    {isAuthenticated && !kontextLoading && formatCost(kontextCost, kontextUSD) && (
                      <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
                        {formatCost(kontextCost, kontextUSD)}
                      </div>
                    )}
                  </button>
                </div>
              ),
              document.body
            )}
            
            {/* Error message */}
            {selectedPhoto.enhancementError && (
              <div 
                className="enhancement-error" 
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '0',
                  right: '0',
                  marginBottom: '4px',
                  background: 'rgba(255, 0, 0, 0.9)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  textAlign: 'center',
                  zIndex: 10,
                  maxWidth: '200px',
                  wordWrap: 'break-word',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  // Allow users to dismiss error by clicking
                  setPhotos(prev => {
                    const updated = [...prev];
                    if (updated[selectedPhotoIndex]) {
                      updated[selectedPhotoIndex] = {
                        ...updated[selectedPhotoIndex],
                        enhancementError: null
                      };
                    }
                    return updated;
                  });
                }}
                title="Click to dismiss"
              >
                {selectedPhoto.enhancementError}
              </div>
            )}
          </div>
          )}

          {/* Video Generation Button - Only for authenticated users */}
          {isAuthenticated && !isPromptSelectorMode && !selectedPhoto.isOriginal && (
            <div className="video-button-container" style={{ position: 'relative' }}>
              {/* Video button - always same appearance */}
              <button
                ref={videoButtonRef}
                className="action-button video-generate-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedPhoto.generatingVideo) {
                    // Show cancel option when generating
                    setShowVideoDropdown(prev => !prev);
                  } else {
                    handleVideoButtonClick();
                  }
                }}
                disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                style={{
                  position: 'relative',
                  overflow: 'visible'
                }}
              >
                <span>🎥</span>
                <span>Video</span>
                
                {/* NEW Badge */}
                {showVideoNewBadge && !selectedPhoto.videoUrl && !selectedPhoto.generatingVideo && (
                  <span
                    className="video-new-badge"
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      background: 'linear-gradient(135deg, #ff6b6b, #ffa502)',
                      color: 'white',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      boxShadow: '0 2px 8px rgba(255, 107, 107, 0.4)',
                      animation: 'pulse 2s ease-in-out infinite',
                      zIndex: 1
                    }}
                  >
                    NEW
                  </span>
                )}
              </button>

              {/* Video Error message */}
              {selectedPhoto.videoError && (
                <div 
                  className="video-error" 
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '0',
                    right: '0',
                    marginBottom: '4px',
                    background: 'rgba(255, 0, 0, 0.9)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    textAlign: 'center',
                    zIndex: 10,
                    maxWidth: '200px',
                    wordWrap: 'break-word',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setPhotos(prev => {
                      const updated = [...prev];
                      if (updated[selectedPhotoIndex]) {
                        updated[selectedPhotoIndex] = {
                          ...updated[selectedPhotoIndex],
                          videoError: null
                        };
                      }
                      return updated;
                    });
                  }}
                  title="Click to dismiss"
                >
                  {selectedPhoto.videoError}
                </div>
              )}

              {/* Video Options List Portal - shows list of video options before opening specific video popup */}
              {showVideoOptionsList && (() => {
                // Calculate position relative to video button
                let dropdownStyle = {
                  position: 'fixed',
                  background: 'rgba(255, 255, 255, 0.98)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  overflow: 'hidden',
                  minWidth: '200px',
                  animation: 'fadeIn 0.2s ease-out',
                  zIndex: 10000001
                };

                if (window.innerWidth < 768) {
                  // Mobile: center at top
                  dropdownStyle = {
                    ...dropdownStyle,
                    top: '10px',
                    left: '50%',
                    transform: 'translateX(-50%)'
                  };
                } else if (videoButtonRef.current) {
                  // Desktop: position above the video button, screen-aware
                  const buttonRect = videoButtonRef.current.getBoundingClientRect();
                  const dropdownWidth = 200; // minWidth
                  const dropdownHeight = 120; // approximate height
                  const spacing = 8; // space above button
                  
                  // Calculate desired position
                  let left = buttonRect.left;
                  let bottom = window.innerHeight - buttonRect.top + spacing;
                  
                  // Ensure dropdown doesn't go off the right edge
                  if (left + dropdownWidth > window.innerWidth) {
                    left = window.innerWidth - dropdownWidth - 16; // 16px padding from edge
                  }
                  
                  // Ensure dropdown doesn't go off the left edge
                  if (left < 16) {
                    left = 16;
                  }
                  
                  // Ensure dropdown doesn't go off the top edge (if button is near top)
                  if (bottom + dropdownHeight > window.innerHeight) {
                    bottom = window.innerHeight - dropdownHeight - 16;
                  }
                  
                  dropdownStyle = {
                    ...dropdownStyle,
                    bottom: `${bottom}px`,
                    left: `${left}px`,
                    transform: 'none'
                  };
                } else {
                  // Fallback: position at bottom right like batch action
                  dropdownStyle = {
                    ...dropdownStyle,
                    bottom: '90px',
                    right: '32px'
                  };
                }

                return createPortal(
                  <div
                    className="video-options-list-dropdown"
                    style={dropdownStyle}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div style={{
                      padding: '10px 16px',
                      background: 'rgba(139, 92, 246, 0.08)',
                      borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
                      fontFamily: '"Permanent Marker", cursive',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#555',
                      textAlign: 'center',
                      letterSpacing: '0.5px'
                    }}>
                      Video Options
                    </div>
                    
                    {/* Motion Video Option */}
                    <button
                      className="video-option-button"
                      onClick={() => {
                        setShowVideoOptionsList(false);
                        setShowVideoDropdown(true);
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        border: 'none',
                        background: 'transparent',
                        color: '#333',
                        fontSize: '14px',
                        fontWeight: 'normal',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: '1px solid rgba(0, 0, 0, 0.05)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span>🎥</span>
                      <span>Motion Video</span>
                    </button>
                    
                    {/* BASE Hero Option */}
                    <button
                      className="video-option-button"
                      onClick={handleBaseHeroVideo}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        border: 'none',
                        background: 'transparent',
                        color: '#333',
                        fontSize: '14px',
                        fontWeight: 'normal',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span>🦸</span>
                      <span>BASE Hero</span>
                    </button>
                    <button
                      className="video-option-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromptVideo();
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        border: 'none',
                        background: 'transparent',
                        color: '#333',
                        fontSize: '14px',
                        fontWeight: 'normal',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderTop: '1px solid rgba(0, 0, 0, 0.08)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span>✨</span>
                      <span>Prompt Video</span>
                    </button>
                  </div>,
                  document.body
                );
              })()}

              {/* Video Dropdown Portal */}
              {showVideoDropdown && createPortal(
                (
                  <div 
                    className="video-dropdown"
                    style={{
                      position: 'fixed',
                      ...(selectedPhoto.generatingVideo
                        ? {
                            // Compact size when generating
                            bottom: window.innerWidth < 768 ? 'auto' : '60px',
                            top: window.innerWidth < 768 ? '10px' : 'auto',
                            height: 'auto',
                            maxHeight: window.innerWidth < 768 ? 'calc(100vh - 20px)' : 'none',
                          }
                        : window.innerWidth < 768 
                          ? { 
                              top: '10px',
                              bottom: '10px',
                              height: 'auto'
                            }
                          : { 
                              bottom: '60px',
                              height: 'min(75vh, 650px)',
                              maxHeight: 'calc(100vh - 80px)'
                            }
                      ),
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#ffeb3b',
                      borderRadius: '8px',
                      padding: '8px',
                      border: 'none',
                      width: selectedPhoto.generatingVideo ? 'min(90vw, 280px)' : 'min(95vw, 950px)',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                      zIndex: 9999999,
                      animation: 'videoDropdownSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Top right buttons container - Settings and Close */}
                    <div style={{ position: 'relative' }}>
                      {/* Settings cog icon - left of close button */}
                      <button
                        onClick={handleOpenVideoSettings}
                        title="Video Settings"
                        style={{
                          position: 'absolute',
                          top: '0px',
                          right: '36px',
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(0, 0, 0, 0.1)',
                          color: 'rgba(0, 0, 0, 0.5)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease',
                          zIndex: 1
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.15)';
                          e.currentTarget.style.color = 'rgba(0, 0, 0, 0.8)';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)';
                          e.currentTarget.style.color = 'rgba(0, 0, 0, 0.5)';
                        }}
                      >
                        ⚙️
                      </button>
                      
                      {/* Close button - far right */}
                      <button
                        onClick={() => { setShowVideoDropdown(false); setSelectedMotionCategory(null); }}
                        title="Close"
                        style={{
                          position: 'absolute',
                          top: '0px',
                          right: '0px',
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(0, 0, 0, 0.6)',
                          color: '#fff',
                          fontSize: '18px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease',
                          zIndex: 1,
                          lineHeight: '1',
                          fontWeight: '300'
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        ×
                      </button>
                    </div>
                    
                    {/* Generating state - simple message with cancel option (progress shown on image overlay) */}
                    {selectedPhoto.generatingVideo ? (
                      <>
                        <div style={{
                          padding: '12px 16px',
                          fontSize: '13px',
                          color: 'rgba(0, 0, 0, 0.6)',
                          borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
                          textAlign: 'center'
                        }}>
                          Video generating...
                        </div>
                        <button
                          onClick={handleCancelVideo}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            background: 'transparent',
                            border: 'none',
                            color: '#ff6b6b',
                            fontSize: '14px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            borderRadius: '8px',
                            transition: 'background 0.2s ease'
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >
                          ❌ Cancel Generation
                        </button>
                      </>
                    ) : selectedPhoto.videoUrl ? (
                      /* Completed state - show same grid for generating another */
                      <>
                        <div style={{
                          padding: '10px 16px 6px 16px',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: '#000',
                          textAlign: 'center',
                          borderBottom: '1px solid rgba(0, 0, 0, 0.15)'
                        }}>
                          🎬 Generate another motion
                        </div>
                        
                        {/* Motion Style Options - Organized by Category */}
                        {renderMotionPicker(selectedMotionCategory, setSelectedMotionCategory, handleGenerateVideo, setShowVideoDropdown, setShowCustomVideoPromptPopup)}

                        {/* Custom Prompt Button - Always visible below grid */}
                        <div style={{
                          padding: '10px',
                          borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                          display: 'flex',
                          flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                          alignItems: window.innerWidth < 768 ? 'stretch' : 'center',
                          justifyContent: window.innerWidth < 768 ? 'center' : 'flex-end',
                          gap: '12px',
                          flexShrink: 0
                        }}>
                          <div style={{
                            fontSize: '13px',
                            color: '#000',
                            fontWeight: '700',
                            letterSpacing: '0.3px',
                            textAlign: window.innerWidth < 768 ? 'center' : 'right',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: window.innerWidth < 768 ? 'center' : 'flex-end',
                            gap: '8px'
                          }}>
                            <span>Or create your own</span>
                            {window.innerWidth >= 768 && <span style={{ fontSize: '20px', fontWeight: '700' }}>→</span>}
                          </div>
                          {renderCustomButton(setShowVideoDropdown, setShowCustomVideoPromptPopup)}
                        </div>

                        {/* Pricing info below Custom button */}
                        {!videoLoading && formatCost(videoCostRaw, videoUSD) ? (
                          <div style={{
                            padding: '8px 16px 12px 16px',
                            borderTop: '1px solid rgba(0, 0, 0, 0.15)',
                            color: '#000',
                            flexShrink: 0
                          }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '4px'
                            }}>
                              <span style={{ fontSize: '10px', fontWeight: '500', opacity: 0.6 }}>
                                📐 {settings.videoResolution || '480p'} • ⏱️ {settings.videoDuration || 5}s
                              </span>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700' }}>
                                  {(() => {
                                    const formatted = formatCost(videoCostRaw, videoUSD);
                                    const parts = formatted.split('(');
                                    return parts[0].trim();
                                  })()}
                                </span>
                                {(() => {
                                  const formatted = formatCost(videoCostRaw, videoUSD);
                                  const usdMatch = formatted.match(/\((.*?)\)/);
                                  if (usdMatch) {
                                    return (
                                      <span style={{ fontWeight: '400', opacity: 0.75, fontSize: '10px' }}>
                                        ≈ {usdMatch[1]}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>
                        ) : videoLoading ? (
                          <div style={{
                            padding: '8px 16px 12px 16px',
                            fontSize: '11px',
                            fontWeight: '700',
                            textAlign: 'right',
                            borderTop: '1px solid rgba(0, 0, 0, 0.15)',
                            color: '#000',
                            flexShrink: 0
                          }}>
                            Calculating cost...
                          </div>
                        ) : null}
                        
                        <style>{`
                          @keyframes videoPulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.15); }
                          }
                        `}</style>
                      </>
                    ) : (
                      /* Initial state - show motion style options grid */
                      <>
                        <div style={{
                          padding: '10px 16px 8px 16px',
                          fontFamily: '"Permanent Marker", cursive',
                          fontSize: '15px',
                          fontWeight: '700',
                          color: '#000',
                          textAlign: 'center',
                          borderBottom: '1px solid rgba(0, 0, 0, 0.15)',
                          flexShrink: 0
                        }}>
                          🎬 Choose a motion style
                        </div>
                        
                        {/* Motion Style Options - Organized by Category */}
                        {renderMotionPicker(selectedMotionCategory, setSelectedMotionCategory, handleGenerateVideo, setShowVideoDropdown, setShowCustomVideoPromptPopup)}

                        {/* Custom Prompt Button - Always visible below grid */}
                        <div style={{
                          padding: '10px',
                          borderTop: '1px solid rgba(0, 0, 0, 0.1)',
                          display: 'flex',
                          flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                          alignItems: window.innerWidth < 768 ? 'stretch' : 'center',
                          justifyContent: window.innerWidth < 768 ? 'center' : 'flex-end',
                          gap: '12px',
                          flexShrink: 0
                        }}>
                          <div style={{
                            fontSize: '13px',
                            color: '#000',
                            fontWeight: '700',
                            letterSpacing: '0.3px',
                            textAlign: window.innerWidth < 768 ? 'center' : 'right',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: window.innerWidth < 768 ? 'center' : 'flex-end',
                            gap: '8px'
                          }}>
                            <span>Or create your own</span>
                            {window.innerWidth >= 768 && <span style={{ fontSize: '20px', fontWeight: '700' }}>→</span>}
                          </div>
                          {renderCustomButton(setShowVideoDropdown, setShowCustomVideoPromptPopup)}
                        </div>

                        {/* Pricing info below Custom button */}
                        {!videoLoading && formatCost(videoCostRaw, videoUSD) ? (
                          <div style={{
                            padding: '8px 16px 12px 16px',
                            borderTop: '1px solid rgba(0, 0, 0, 0.15)',
                            color: '#000',
                            flexShrink: 0
                          }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '4px'
                            }}>
                              <span style={{ fontSize: '10px', fontWeight: '500', opacity: 0.6 }}>
                                📐 {settings.videoResolution || '480p'} • ⏱️ {settings.videoDuration || 5}s
                              </span>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700' }}>
                                  {(() => {
                                    const formatted = formatCost(videoCostRaw, videoUSD);
                                    const parts = formatted.split('(');
                                    return parts[0].trim();
                                  })()}
                                </span>
                                {(() => {
                                  const formatted = formatCost(videoCostRaw, videoUSD);
                                  const usdMatch = formatted.match(/\((.*?)\)/);
                                  if (usdMatch) {
                                    return (
                                      <span style={{ fontWeight: '400', opacity: 0.75, fontSize: '10px' }}>
                                        ≈ {usdMatch[1]}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>
                        ) : videoLoading ? (
                          <div style={{
                            padding: '8px 16px 12px 16px',
                            fontSize: '11px',
                            fontWeight: '700',
                            textAlign: 'right',
                            borderTop: '1px solid rgba(0, 0, 0, 0.15)',
                            color: '#000',
                            flexShrink: 0
                          }}>
                            Calculating cost...
                          </div>
                        ) : null}
                        
                        <style>{`
                          @keyframes videoPulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.15); }
                          }
                        `}</style>
                      </>
                    )}
                  </div>
                ),
                document.body
              )}
            </div>
          )}
        </div>
        );
      })()}
      {/* Settings button when viewing a photo */}
      {selectedPhotoIndex !== null && (
        <button
          className="header-settings-btn"
          onClick={handleShowControlOverlay}
          style={{
            position: 'fixed',
            top: 24,
            right: 72,
            background: 'linear-gradient(135deg, #72e3f2 0%, #4bbbd3 100%)',
            border: 'none',
            color: '#fff',
            fontSize: 20,
            width: 38,
            height: 38,
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer',
            fontWeight: 900,
            lineHeight: 1,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            zIndex: 99999,
          }}
          onMouseOver={e => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseOut={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
          }}
          title="Settings"
        >
          ⚙️
        </button>
      )}

      {/* Prompt Selector Mode Header */}
      {isPromptSelectorMode && (
        <div className="prompt-selector-header" style={{
          padding: '24px 20px 0px',
          background: 'transparent',
          position: 'relative'
        }}>

          {/* PHOTOBOOTH VIBE EXPLORER Title */}
          <div style={{
            position: 'absolute',
            top: '0px',
            left: '20px',
            zIndex: 1000
          }}>
            <h1 
              className="settings-title"
              data-text="VIBE EXPLORER"
              style={{
                margin: '0',
                textAlign: 'left',
                transform: 'translateY(0)',
                opacity: 1
              }}
            >
              VIBE EXPLORER
            </h1>
          </div>


          {/* Workflow Options */}
          <div style={{
            marginBottom: '16px',
            marginTop: '20px'
          }}>
            <h2 style={{
              fontFamily: '"Permanent Marker", cursive',
              fontSize: '20px',
              margin: '0 0 12px 0',
              textAlign: 'center'
            }}>
              Style Picker Mode
            </h2>
            
            {/* Random Style Buttons */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '30px',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <button 
                onClick={onRandomMixSelect}
                style={{
                  background: selectedStyle === 'randomMix' ? 'rgba(114, 227, 242, 0.9)' : (isExtensionMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.9)'),
                  border: selectedStyle === 'randomMix' ? '3px solid #72e3f2' : '3px solid transparent',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedStyle === 'randomMix' ? '0 4px 12px rgba(114, 227, 242, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
                  color: selectedStyle === 'randomMix' ? 'white' : '#333',
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                }}
              >
                <span>🎲</span>
                <span>Random: All</span>
              </button>
              
              {!isFluxKontextModel(selectedModel) && (
                <button 
                  onClick={onRandomSingleSelect}
                  style={{
                    background: selectedStyle === 'random' ? 'rgba(114, 227, 242, 0.9)' : (isExtensionMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.9)'),
                    border: selectedStyle === 'random' ? '3px solid #72e3f2' : '3px solid transparent',
                    borderRadius: '20px',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: selectedStyle === 'random' ? '0 4px 12px rgba(114, 227, 242, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
                    color: selectedStyle === 'random' ? 'white' : '#333',
                    fontSize: '12px',
                    fontFamily: '"Permanent Marker", cursive'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                  }}
                >
                  <span>🔀</span>
                  <span>Random: Single</span>
                </button>
              )}
              
              <button 
                onClick={onOneOfEachSelect}
                style={{
                  background: selectedStyle === 'oneOfEach' ? 'rgba(114, 227, 242, 0.9)' : (isExtensionMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.9)'),
                  border: selectedStyle === 'oneOfEach' ? '3px solid #72e3f2' : '3px solid transparent',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedStyle === 'oneOfEach' ? '0 4px 12px rgba(114, 227, 242, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
                  color: selectedStyle === 'oneOfEach' ? 'white' : '#333',
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                }}
              >
                <span>🙏</span>
                <span>One of Each</span>
              </button>
            </div>

            {/* Visual divider between random options and custom options */}
            <div style={{
              width: '100%',
              height: '1px',
              background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)',
              margin: '16px 0'
            }} />

            {/* Label for custom options */}
            <div style={{
              textAlign: 'center',
              marginBottom: '12px'
            }}>
              <span style={{
                fontSize: '16px',
                fontFamily: '"Permanent Marker", cursive',
                color: 'rgba(255, 255, 255, 0.9)'
              }}>
                Or use your own prompt or style image
              </span>
            </div>

            {/* Custom prompt and style reference options */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <button 
                onClick={() => setShowCustomPromptPopup(true)}
                style={{
                  background: selectedStyle === 'custom' ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                  border: selectedStyle === 'custom' ? '3px solid #3b82f6' : '3px solid transparent',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedStyle === 'custom' ? '0 4px 15px rgba(59, 130, 246, 0.5)' : '0 3px 10px rgba(59, 130, 246, 0.3)',
                  color: 'white',
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive',
                  fontWeight: '600'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 5px 15px rgba(59, 130, 246, 0.4)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(59, 130, 246, 0.3)';
                  e.currentTarget.style.background = selectedStyle === 'custom' ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)';
                }}
              >
                <span>✏️</span>
                <span>Custom prompt</span>
              </button>
              
              <button 
                onClick={() => {
                  // Feature disabled - show "Coming soon" tooltip
                  setShowCopyStyleTooltip(true);
                  setTimeout(() => setShowCopyStyleTooltip(false), 2500);
                }}
                style={{
                  background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                  border: '3px solid transparent',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'not-allowed',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 3px 10px rgba(107, 114, 128, 0.3)',
                  color: 'white',
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive',
                  fontWeight: '600',
                  opacity: 0.6,
                  position: 'relative'
                }}
              >
                {/* Show circular preview thumbnail if style reference exists, otherwise show emoji */}
                {styleReferenceImage?.dataUrl ? (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    overflow: 'visible',
                    border: '2px solid rgba(255, 255, 255, 0.9)',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                    flexShrink: 0,
                    background: '#fff',
                    position: 'relative'
                  }}>
                    <img 
                      src={styleReferenceImage.dataUrl} 
                      alt="Style reference"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%'
                      }}
                    />
                    {/* X button disabled - feature not active */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCopyStyleTooltip(true);
                        setTimeout(() => setShowCopyStyleTooltip(false), 2500);
                      }}
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: '#9ca3af',
                        border: '2px solid white',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        cursor: 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        lineHeight: 1,
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                        transition: 'all 0.2s ease',
                        zIndex: 1,
                        opacity: 0.6
                      }}
                      title="Coming soon"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span>🎨</span>
                )}
                <span>Copy image style</span>
                
                {/* "Coming soon" tooltip */}
                {showCopyStyleTooltip && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-45px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0, 0, 0, 0.9)',
                    color: 'white',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontFamily: '"Permanent Marker", cursive',
                    whiteSpace: 'nowrap',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    pointerEvents: 'none',
                    animation: 'fadeIn 0.2s ease-in'
                  }}>
                    Coming soon
                    <div style={{
                      position: 'absolute',
                      top: '-5px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '6px solid rgba(0, 0, 0, 0.9)'
                    }} />
                  </div>
                )}
              </button>
            </div>

            {/* Visual divider before style library */}
            <div style={{
              width: '100%',
              height: '1px',
              background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)',
              margin: '16px 0'
            }} />
          </div>
        </div>
      )}


      {/* "Or select a style" text row - centered */}
      {isPromptSelectorMode && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          paddingBottom: '12px',
          marginBottom: '0px'
        }}>
          <span style={{
            fontSize: '20px',
            fontFamily: '"Permanent Marker", cursive',
            color: 'white'
          }}>
            Or select a specific vibe ↓
          </span>
        </div>
      )}

      {/* Filter Styles Button and text - aligned on same line for prompt selector mode */}
      {isPromptSelectorMode && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          paddingRight: '32px',
          paddingLeft: '32px',
          paddingBottom: '8px',
          marginBottom: '0px',
          position: 'relative',
          gap: '12px'
        }} className="style-selector-text-container">
          {/* Search icon and inline input on the left */}
          <div style={{
            position: 'absolute',
            left: '22px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <button 
              onClick={() => setShowSearchInput(!showSearchInput)}
              style={{
                paddingTop: '8px',
                fontSize: '16px',
                fontWeight: 500,
                display: 'inline-block',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: 'none',
                border: 'none',
                color: showSearchInput ? '#72e3f2' : 'white',
                opacity: showSearchInput ? 1 : 0.8
              }}
              title="Search styles"
            >
              🔍
            </button>
            
            {/* Inline search input */}
            {showSearchInput && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="Search styles..."
                  value={searchTerm}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setSearchTerm(newValue);
                    if (onSearchChange) {
                      onSearchChange(newValue);
                    }
                  }}
                  style={{
                    width: '180px',
                    padding: '6px 10px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    background: isExtensionMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '6px',
                    color: 'white',
                    outline: 'none',
                    transition: 'all 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                    e.target.style.borderColor = '#72e3f2';
                  }}
                  onBlur={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  }}
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      if (onSearchChange) {
                        onSearchChange('');
                      }
                    }}
                    style={{
                      padding: '4px 6px',
                      fontSize: '11px',
                      background: isExtensionMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.2)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      borderRadius: '3px',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      lineHeight: 1
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* Portrait Type Icons - Circular in center */}
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div 
              style={{ position: 'relative' }} 
              className="portrait-type-button-container"
              onMouseEnter={(e) => {
                if (portraitType !== 'headshot') {
                  const label = e.currentTarget.querySelector('.portrait-type-label');
                  if (label) label.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                const label = e.currentTarget.querySelector('.portrait-type-label');
                if (label) label.style.opacity = '0';
              }}
            >
              <button 
                onClick={() => onPortraitTypeChange && onPortraitTypeChange('headshot')}
                style={{
                  background: 'transparent',
                  border: portraitType === 'headshot' ? '3px solid #72e3f2' : 'none',
                  borderRadius: '50%',
                  padding: '0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  width: '60px',
                  height: '60px',
                  overflow: 'hidden',
                  boxShadow: portraitType === 'headshot' ? '0 0 12px rgba(114, 227, 242, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Up Close"
              >
                <img 
                  src="/gallery/sample-gallery-headshot-einstein.jpg"
                  alt="Up Close"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              </button>
              <span style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '14px',
                fontWeight: 'bold',
                color: 'white',
                textShadow: '0 0 4px rgba(0, 0, 0, 0.6), 0 0 2px rgba(0, 0, 0, 0.8)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                opacity: 0,
                transition: 'opacity 0.2s ease'
              }} className="portrait-type-label">
                NEAR
              </span>
            </div>
            
            <button 
              onClick={() => onPortraitTypeChange && onPortraitTypeChange('medium')}
              style={{
                background: 'transparent',
                border: portraitType === 'medium' ? '3px solid #72e3f2' : 'none',
                borderRadius: '50%',
                padding: '0',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                width: '60px',
                height: '60px',
                overflow: 'hidden',
                boxShadow: portraitType === 'medium' ? '0 0 12px rgba(114, 227, 242, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
              }}
              onMouseOver={e => {
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Waist-Up"
            >
              <img 
                src="/gallery/sample-gallery-medium-body-jen.jpg"
                alt="Waist-Up"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
              />
            </button>
            
            <div 
              style={{ position: 'relative' }} 
              className="portrait-type-button-container"
              onMouseEnter={(e) => {
                if (portraitType !== 'fullbody') {
                  const label = e.currentTarget.querySelector('.portrait-type-label');
                  if (label) label.style.opacity = '1';
                }
              }}
              onMouseLeave={(e) => {
                const label = e.currentTarget.querySelector('.portrait-type-label');
                if (label) label.style.opacity = '0';
              }}
            >
              <button 
                onClick={() => onPortraitTypeChange && onPortraitTypeChange('fullbody')}
                style={{
                  background: 'transparent',
                  border: portraitType === 'fullbody' ? '3px solid #72e3f2' : 'none',
                  borderRadius: '50%',
                  padding: '0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  width: '60px',
                  height: '60px',
                  overflow: 'hidden',
                  boxShadow: portraitType === 'fullbody' ? '0 0 12px rgba(114, 227, 242, 0.6)' : '0 2px 8px rgba(0,0,0,0.2)'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                title="Wide Portrait"
              >
                <img 
                  src="/gallery/sample-gallery-full-body-mark.jpg"
                  alt="Wide Portrait"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              </button>
              <span style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '14px',
                fontWeight: 'bold',
                color: 'white',
                textShadow: '0 0 4px rgba(0, 0, 0, 0.6), 0 0 2px rgba(0, 0, 0, 0.8)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                opacity: 0,
                transition: 'opacity 0.2s ease'
              }} className="portrait-type-label">
                FAR
              </span>
            </div>
          </div>

          {/* Filter button on the right */}
          <button 
            onClick={() => setShowThemeFilters(!showThemeFilters)}
            style={{
              position: 'absolute',
              right: '22px',
              paddingTop: '8px',
              fontSize: '14px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              background: 'none',
              border: 'none',
              fontFamily: '"Permanent Marker", cursive',
              color: 'white'
            }}
          >
            Filter ({filteredPhotos.length})
            <span style={{
              display: 'inline-block',
              transform: showThemeFilters ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.3s ease',
              fontSize: '16px',
              lineHeight: '1'
            }}>
              ▼
            </span>
          </button>
        </div>
      )}

      {/* Theme Filters - Show when filter is toggled */}
      {isPromptSelectorMode && showThemeFilters && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          marginBottom: '16px',
          padding: '16px 32px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          {/* Theme filter content */}
          <div style={{
            width: '100%'
          }}>
              {/* Theme filter header with controls */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '16px',
                  fontFamily: '"Permanent Marker", cursive',
                  color: 'white'
                }}>
                  🎨 Themes
                </h3>
                <div style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'center'
                }}>
                  <button
                    onClick={() => {
                      const allSelected = Object.fromEntries(
                        Object.keys(THEME_GROUPS).map(groupId => [groupId, true])
                      );
                      setThemeGroupState(allSelected);
                      saveThemeGroupPreferences(allSelected);
                      if (onThemeChange) {
                        onThemeChange(allSelected);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontFamily: '"Permanent Marker", cursive',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'white',
                      cursor: 'pointer',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'none';
                    }}
                    title="Select all themes"
                  >
                    ALL
                  </button>
                  <button
                    onClick={() => {
                      const allDeselected = Object.fromEntries(
                        Object.keys(THEME_GROUPS).map(groupId => [groupId, false])
                      );
                      setThemeGroupState(allDeselected);
                      saveThemeGroupPreferences(allDeselected);
                      if (onThemeChange) {
                        onThemeChange(allDeselected);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontFamily: '"Permanent Marker", cursive',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'white',
                      cursor: 'pointer',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'none';
                    }}
                    title="Deselect all themes"
                  >
                    NONE
                  </button>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '8px'
              }}>
                {Object.entries(THEME_GROUPS).map(([groupId, group]) => (
                  <label key={groupId} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: isExtensionMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    color: 'white'
                  }}>
                    <input
                      type="checkbox"
                      checked={themeGroupState[groupId]}
                      onChange={() => handleThemeGroupToggle(groupId)}
                      style={{
                        width: '16px',
                        height: '16px',
                        accentColor: '#72e3f2'
                      }}
                    />
                    <span style={{ flex: 1, fontWeight: 600, fontSize: '12px' }}>{group.name}</span>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>
                      ({groupId === 'favorites' ? favoriteImageIds.length : group.prompts.length})
                    </span>
                    {groupId === 'favorites' && favoriteImageIds.length > 0 && (
                      <button
                        onClick={handleClearFavorites}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          background: 'rgba(255, 71, 87, 0.8)',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'white',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          marginLeft: '4px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 71, 87, 1)';
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 71, 87, 0.8)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title="Clear all favorites"
                      >
                        Clear
                      </button>
                    )}
                  </label>
                ))}
              </div>
            </div>
        </div>
      )}

      {/* Photo Grid - full width for both modes */}
      <div 
        className={`film-strip-content ${selectedPhotoIndex !== null && (!isPromptSelectorMode || wantsFullscreen) ? 'has-selected' : ''} ${isPromptSelectorMode ? 'prompt-selector-mode' : ''}`}
        onClick={(e) => {
          // Dismiss touch hover state when clicking in the grid background
          if (isPromptSelectorMode && touchHoveredPhotoIndex !== null && e.target === e.currentTarget) {
            setTouchHoveredPhotoIndex(null);
          }
        }}
        style={{
          display: 'grid',
          // Remove inline gridTemplateColumns to let CSS media queries work
          gap: '32px',
          justifyItems: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: 'none',
          margin: '0 auto',
          padding: isPromptSelectorMode ? '4px 32px 32px' : '32px',
          paddingTop: isPromptSelectorMode ? '4px' : undefined,
          // Force override the CSS !important rule
          ...(isPromptSelectorMode && {
            paddingTop: '4px !important'
          })
        }}
      >
        {(isPromptSelectorMode ? filteredPhotos : photos).map((photo, index) => {
          const isSelected = index === selectedPhotoIndex;
          const isTouchHovered = isPromptSelectorMode && index === touchHoveredPhotoIndex;
          const isReference = photo.isOriginal;
          const placeholderUrl = photo.originalDataUrl;
          const progress = Math.floor(photo.progress || 0);
          const loadingLabel = progress > 0 ? `${progress}%` : "";
          const styleDisplayText = getStyleDisplayText(photo);
          const labelText = isReference ? "Reference" : 
            photo.isGalleryImage && photo.promptDisplay ? photo.promptDisplay : 
            (styleDisplayText || '#SogniPhotobooth');
          // Check if this photo represents the currently selected style
          const isCurrentStyle = isPromptSelectorMode && photo.promptKey && photo.promptKey === selectedStyle;
          // Loading or error state
          if ((photo.loading && photo.images.length === 0) || (photo.error && photo.images.length === 0)) {
            return (
              <div
                key={photo.id}
                className={`film-frame loading ${isSelected ? 'selected' : ''} ${isSelected && wantsFullscreen ? 'fullscreen-mode' : ''} ${isCurrentStyle ? 'current-style' : ''} ${photo.newlyArrived ? 'newly-arrived' : ''} ${photo.hidden ? 'hidden' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'supercasual' ? 'super-casual-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'tezoswebx' ? 'tezos-webx-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'showup' ? 'showup-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage ? `${tezdevTheme}-theme` : ''}`}
                data-enhancing={photo.enhancing ? 'true' : undefined}
                data-error={photo.error ? 'true' : undefined}
                data-enhanced={photo.enhanced ? 'true' : undefined}
  
                onClick={(e) => {
                  // Don't open photo if clicking the favorite button
                  let el = e.target;
                  while (el && el !== e.currentTarget) {
                    if (el.classList && (el.classList.contains('photo-favorite-btn') || el.classList.contains('photo-favorite-btn-batch'))) {
                      return;
                    }
                    el = el.parentElement;
                  }
                  // Use handlePhotoSelect for consistent touch handling
                  handlePhotoSelect(index, e);
                }}
                // Add touch event handlers for swipe navigation when photo is selected
                onTouchStart={isSelected && photos.length > 1 ? (e) => {
                  const touch = e.touches[0];
                  const touchStartData = {
                    x: touch.clientX,
                    y: touch.clientY,
                    time: Date.now()
                  };
                  e.currentTarget.touchStartData = touchStartData;
                } : undefined}
                onTouchMove={isSelected && photos.length > 1 ? (e) => {
                  // Prevent default scrolling behavior during swipe
                  if (e.currentTarget.touchStartData) {
                    const touch = e.touches[0];
                    const deltaX = Math.abs(touch.clientX - e.currentTarget.touchStartData.x);
                    const deltaY = Math.abs(touch.clientY - e.currentTarget.touchStartData.y);
                    
                    // If horizontal movement is greater than vertical, prevent scrolling
                    if (deltaX > deltaY && deltaX > 10) {
                      e.preventDefault();
                    }
                  }
                } : undefined}
                onTouchEnd={isSelected && photos.length > 1 ? (e) => {
                  const touchStartData = e.currentTarget.touchStartData;
                  if (!touchStartData) return;
                  
                  const touch = e.changedTouches[0];
                  const deltaX = touch.clientX - touchStartData.x;
                  const deltaY = touch.clientY - touchStartData.y;
                  const deltaTime = Date.now() - touchStartData.time;
                  
                  // Swipe thresholds
                  const minSwipeDistance = 50; // Minimum distance for a swipe
                  const maxSwipeTime = 500; // Maximum time for a swipe (ms)
                  const maxVerticalDistance = 100; // Maximum vertical movement allowed
                  
                  // Check if this is a valid horizontal swipe
                  if (Math.abs(deltaX) > minSwipeDistance && 
                      Math.abs(deltaY) < maxVerticalDistance && 
                      deltaTime < maxSwipeTime) {
                    
                    // Prevent the click event from firing
                    e.preventDefault();
                    e.stopPropagation();
                    
                  // Use filtered photos in prompt selector mode, regular photos otherwise
                  const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
                  
                  if (deltaX > 0) {
                    // Swipe right - go to previous photo
                    let prevIndex = selectedPhotoIndex - 1;
                    if (prevIndex < 0) {
                      prevIndex = currentPhotosArray.length - 1; // Loop to end
                    }
                    setSelectedPhotoIndex(prevIndex);
                  } else {
                    // Swipe left - go to next photo
                    let nextIndex = selectedPhotoIndex + 1;
                    if (nextIndex >= currentPhotosArray.length) {
                      nextIndex = 0; // Loop to beginning
                    }
                    setSelectedPhotoIndex(nextIndex);
                  }
                }
                
                // Clean up touch data
                delete e.currentTarget.touchStartData;
              } : undefined}
                style={{
                  width: '100%',
                  margin: '0 auto',
                  backgroundColor: 'white', // Keep polaroid frames white even in extension mode
                  position: 'relative',
                  borderRadius: '2px',
                  boxShadow: isExtensionMode ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
                  display: photo.hidden ? 'none' : 'flex',
                  flexDirection: 'column',
                  '--stagger-delay': `${index * 1}s` // Add staggered delay based on index
                }}
              >
                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: dynamicStyle.aspectRatio,
                  overflow: 'hidden'
                }}>
                  <PlaceholderImage placeholderUrl={placeholderUrl} />

                  {/* Hide button, refresh button, and favorite button for loading/error state - only show on hover for grid photos */}
                  {!isSelected && !photo.isOriginal && !photo.isGalleryImage && (
                    <>
                      {/* Block prompt button - show for batch-generated images on desktop */}
                      {!isMobile() && !photo.generating && !photo.loading && photo.promptKey && (photo.stylePrompt || photo.positivePrompt) && (
                        <button
                          className="photo-block-btn-batch"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleBlockPrompt(photo.promptKey, index);
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(220, 53, 69, 0.9)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '80px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 999,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                            opacity: '0',
                            transform: 'scale(0.8)'
                          }}
                          title="Never use this prompt"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'translateY(1px)' }}>
                            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                          </svg>
                        </button>
                      )}
                      {/* Favorite heart button - show for batch-generated images on desktop */}
                      {!isMobile() && !photo.generating && !photo.loading && photo.promptKey && (photo.stylePrompt || photo.positivePrompt) && (
                        <button
                          className="photo-favorite-btn-batch"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleFavoriteToggle(getPhotoId(photo));
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '52px',
                          background: isPhotoFavorited(photo) ? 'rgba(255, 71, 87, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 999,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                            opacity: '0'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.opacity = '1';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(0.95)';
                            e.currentTarget.style.opacity = isPhotoFavorited(photo) ? '1' : '0';
                          }}
                          title={isPhotoFavorited(photo) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {isPhotoFavorited(photo) ? '❤️' : '🤍'}
                        </button>
                      )}
                      {/* Refresh button - show for failed images or when not generating/loading */}
                      {(photo.error || (!photo.generating && !photo.loading)) && (photo.positivePrompt || photo.stylePrompt) && (
                        <button
                          className="photo-refresh-btn"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            onRefreshPhoto(index);
                          }}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '28px',
                            background: 'rgba(0, 0, 0, 0.7)',
                            color: 'white',
                            border: 'none',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 999,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                            transition: 'all 0.2s ease',
                            opacity: '0',
                            transform: 'scale(0.8)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(52, 152, 219, 0.9)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                            e.currentTarget.style.transform = 'scale(0.8)';
                          }}
                          title="Refresh this image"
                        >
                          🔄
                        </button>
                      )}
                      <button
                        className="photo-hide-btn"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setPhotos(prev => {
                            const updated = [...prev];
                            if (updated[index]) {
                              updated[index] = {
                                ...updated[index],
                                hidden: true
                              };
                            }
                            return updated;
                          });
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 999,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                          transition: 'all 0.2s ease',
                          opacity: '0',
                          transform: 'scale(0.8)'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                          e.currentTarget.style.transform = 'scale(0.8)';
                        }}
                        title="Hide this image"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>

                {/* Block prompt button - show in prompt selector mode for desktop (only if photo has promptKey, hide when video is playing) */}
                {isPromptSelectorMode && !isMobile() && photo.promptKey && (activeVideoPhotoId !== (photo.id || photo.promptKey)) && (
                  <div
                    className="photo-block-btn"
                    onClickCapture={(e) => {
                      e.stopPropagation();
                      handleBlockPrompt(photo.promptKey, index);
                    }}
                    onMouseDownCapture={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '35px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 99999,
                      opacity: '0',
                      transition: 'opacity 0.2s ease',
                      pointerEvents: 'all'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                      const innerDiv = e.currentTarget.querySelector('div');
                      if (innerDiv) innerDiv.style.background = 'rgba(220, 53, 69, 0.9)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0';
                      const innerDiv = e.currentTarget.querySelector('div');
                      if (innerDiv) innerDiv.style.background = 'rgba(0, 0, 0, 0.7)';
                    }}
                    title="Never use this prompt"
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'rgba(0, 0, 0, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      transition: 'background 0.2s ease',
                      pointerEvents: 'none'
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none', transform: 'translateY(1px)' }}>
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                      </svg>
                    </div>
                  </div>
                )}

                {/* Favorite heart button - show in prompt selector mode for desktop (only if photo has promptKey) */}
                {isPromptSelectorMode && !isMobile() && photo.promptKey && (
                  <div
                    className="photo-favorite-btn"
                    onClickCapture={(e) => {
                      e.stopPropagation();
                      handleFavoriteToggle(getPhotoId(photo));
                    }}
                    onMouseDownCapture={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 99999,
                      opacity: isPhotoFavorited(photo) ? '1' : '0',
                      transition: 'opacity 0.2s ease',
                      pointerEvents: 'all'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = isPhotoFavorited(photo) ? '1' : '0';
                    }}
                    title={isPhotoFavorited(photo) ? "Remove from favorites" : "Add to favorites"}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: isPhotoFavorited(photo) ? 'rgba(255, 71, 87, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      transition: 'background 0.2s ease',
                      pointerEvents: 'none'
                    }}>
                      {isPhotoFavorited(photo) ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      )}
                    </div>
                  </div>
                )}

                <div className="photo-label">
                  {photo.error ? 
                    <div>
                      <div style={{ marginBottom: '8px' }}>
                        {(() => {
                          if (typeof photo.error === 'object') {
                            return 'GENERATION FAILED';
                          }
                          // Extract just the title part (before colon if present)
                          const errorStr = String(photo.error);
                          const colonIndex = errorStr.indexOf(':');
                          return colonIndex > 0 ? errorStr.substring(0, colonIndex).trim() : errorStr;
                        })()}
                      </div>
                      {photo.retryable && handleRetryPhoto && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryPhoto(index);
                          }}
                          style={{
                            background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
                            border: 'none',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 3px 6px rgba(0,0,0,0.15)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                          }}
                        >
                          🔄 Retry
                        </button>
                      )}
                    </div>
                    : photo.loading || photo.generating ? 
                      (photo.statusText || loadingLabel || labelText) 
                      : photo.isGalleryImage ? labelText : (photo.statusText || (labelText + (getStyleDisplayText(photo) ? ` ${getStyleDisplayText(photo)}` : '')))}
                </div>
              </div>
            );
          }
          // Show completed image - prefer enhanced image if available
          const thumbUrl = (photo.enhanced && photo.enhancedImageUrl) ? photo.enhancedImageUrl : (photo.images[0] || '');
          // Determine if photo is fully loaded - simplified condition for better theme switching  
          const isLoaded = (!photo.loading && !photo.generating && photo.images.length > 0 && thumbUrl);
          
          return (
            <div 
              key={photo.id}
              className={`film-frame ${(isSelected && (!isPromptSelectorMode || wantsFullscreen)) ? 'selected' : ''} ${isSelected && wantsFullscreen ? 'fullscreen-mode' : ''} ${isTouchHovered ? 'touch-hovered' : ''} ${isCurrentStyle ? 'current-style' : ''} ${photo.loading ? 'loading' : ''} ${isLoaded ? 'loaded' : ''} ${photo.newlyArrived ? 'newly-arrived' : ''} ${photo.hidden ? 'hidden' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'supercasual' ? 'super-casual-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'tezoswebx' ? 'tezos-webx-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'taipeiblockchain' ? 'taipei-blockchain-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage && tezdevTheme === 'showup' ? 'showup-theme' : ''} ${isSelected && isThemeSupported() && !photo.isGalleryImage ? `${tezdevTheme}-theme` : ''}`}
              onClick={e => {
                // Don't open photo if clicking on action buttons
                const target = e.target;
                
                // Check if click target or any parent is an action button or icon container
                let el = target;
                while (el && el !== e.currentTarget) {
                  if (el.classList && (
                    el.classList.contains('photo-favorite-btn') || 
                    el.classList.contains('photo-favorite-btn-batch') ||
                    el.classList.contains('photo-refresh-btn') ||
                    el.classList.contains('photo-hide-btn') ||
                    el.classList.contains('photo-fullscreen-btn') ||
                    el.classList.contains('photo-video-btn') ||
                    el.classList.contains('photo-motion-btn-batch') ||
                    el.classList.contains('photo-block-btn') ||
                    el.classList.contains('vibe-icons-container')
                  )) {
                    return;
                  }
                  el = el.parentElement;
                }
                
                // Check if click coordinates are within any button's bounding box with tolerance
                // This handles clicks in padding areas around small buttons
                const buttons = e.currentTarget.querySelectorAll('.photo-favorite-btn-batch, .photo-refresh-btn, .photo-hide-btn, .photo-motion-btn-batch, .photo-video-btn');
                const clickX = e.clientX;
                const clickY = e.clientY;
                
                for (const button of buttons) {
                  const rect = button.getBoundingClientRect();
                  const verticalTolerance = 15;
                  const horizontalTolerance = 10;
                  
                  if (clickX >= (rect.left - horizontalTolerance) && 
                      clickX <= (rect.right + horizontalTolerance) && 
                      clickY >= (rect.top - verticalTolerance) && 
                      clickY <= (rect.bottom + verticalTolerance)) {
                    return;
                  }
                }
                
                // In prompt selector mode, handle touch device clicks to toggle rollover state
                if (isPromptSelectorMode) {
                  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
                  if (isTouchDevice) {
                    // On touch devices, toggle touch hover to show/hide rollover overlay and icons
                    if (touchHoveredPhotoIndex === index) {
                      setTouchHoveredPhotoIndex(null);
                    } else {
                      setTouchHoveredPhotoIndex(index);
                    }
                  }
                  // On desktop, do nothing (hover will show overlay)
                  return;
                }
                isSelected ? handlePhotoViewerClick(e) : handlePhotoSelect(index, e);
              }}
              data-enhancing={photo.enhancing ? 'true' : undefined}
              data-error={photo.error ? 'true' : undefined}
              data-enhanced={photo.enhanced ? 'true' : undefined}
              // Add touch event handlers for swipe navigation when photo is selected
              onTouchStart={isSelected && photos.length > 1 ? (e) => {
                const touch = e.touches[0];
                const touchStartData = {
                  x: touch.clientX,
                  y: touch.clientY,
                  time: Date.now()
                };
                e.currentTarget.touchStartData = touchStartData;
              } : undefined}
              onTouchMove={isSelected && photos.length > 1 ? (e) => {
                // Prevent default scrolling behavior during swipe
                if (e.currentTarget.touchStartData) {
                  const touch = e.touches[0];
                  const deltaX = Math.abs(touch.clientX - e.currentTarget.touchStartData.x);
                  const deltaY = Math.abs(touch.clientY - e.currentTarget.touchStartData.y);
                  
                  // If horizontal movement is greater than vertical, prevent scrolling
                  if (deltaX > deltaY && deltaX > 10) {
                    e.preventDefault();
                  }
                }
              } : undefined}
              onTouchEnd={isSelected && photos.length > 1 ? (e) => {
                const touchStartData = e.currentTarget.touchStartData;
                if (!touchStartData) return;
                
                const touch = e.changedTouches[0];
                const deltaX = touch.clientX - touchStartData.x;
                const deltaY = touch.clientY - touchStartData.y;
                const deltaTime = Date.now() - touchStartData.time;
                
                // Swipe thresholds
                const minSwipeDistance = 50; // Minimum distance for a swipe
                const maxSwipeTime = 500; // Maximum time for a swipe (ms)
                const maxVerticalDistance = 100; // Maximum vertical movement allowed
                
                // Check if this is a valid horizontal swipe
                if (Math.abs(deltaX) > minSwipeDistance && 
                    Math.abs(deltaY) < maxVerticalDistance && 
                    deltaTime < maxSwipeTime) {
                  
                  // Prevent the click event from firing
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Use filtered photos in prompt selector mode, regular photos otherwise
                  const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
                  
                  if (deltaX > 0) {
                    // Swipe right - go to previous photo
                    let prevIndex = selectedPhotoIndex - 1;
                    if (prevIndex < 0) {
                      prevIndex = currentPhotosArray.length - 1; // Loop to end
                    }
                    setSelectedPhotoIndex(prevIndex);
                  } else {
                    // Swipe left - go to next photo
                    let nextIndex = selectedPhotoIndex + 1;
                    if (nextIndex >= currentPhotosArray.length) {
                      nextIndex = 0; // Loop to beginning
                    }
                    setSelectedPhotoIndex(nextIndex);
                  }
                }
                
                // Clean up touch data
                delete e.currentTarget.touchStartData;
              } : undefined}

              style={{
                width: '100%',
                margin: '0 auto',
                backgroundColor: 'white', // Keep polaroid frames white even in extension mode
                position: 'relative',
                borderRadius: '2px',
                boxShadow: isExtensionMode ? '0 4px 12px rgba(0, 0, 0, 0.5)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
                display: photo.hidden ? 'none' : 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: dynamicStyle.aspectRatio,
                overflow: 'hidden'
              }}>
                <img 
                  key={`${photo.id}-${photo.isPreview ? 'preview' : 'final'}`} // Force re-render when preview state changes
                  className={`${isSelected && photo.enhancing && photo.isPreview ? 'enhancement-preview-selected' : ''}`}
                  src={(() => {
                    // For selected photos with supported themes OR QR watermark enabled, use composite framed image if available
                    // Skip custom theme framing for gallery images, but allow basic polaroid frames
                    if (isSelected && (isThemeSupported() || settings.sogniWatermark) && !photo.isGalleryImage) {
                      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                        ? -1 // Special case for enhanced images
                        : (selectedSubIndex || 0);
                      const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                      const frameKey = generateFrameKey(index, currentSubIndex, photoTaipeiFrameNumber);
                      const framedImageUrl = framedImageUrls[frameKey];
                      const isGeneratingFrame = generatingFrames.has(frameKey);
                      
                      if (framedImageUrl) {
                        // Clear previous framed image since we have the new one
                        if (previousFramedImage) {
                          setPreviousFramedImage(null);
                        }
                        return framedImageUrl;
                      }
                      
                      // If we're generating a frame and have a previous framed image, use that to prevent flicker
                      if (isGeneratingFrame && previousFramedImage) {
                        return previousFramedImage;
                      }
                      
                      // Fall back to original image
                      return thumbUrl;
                    }
                    // Default to original image
                    return thumbUrl;
                  })()}
                  alt={`Generated #${index}`}
                  onLoad={e => {
                    // Enable mobile-optimized download functionality when image loads
                    enableMobileImageDownload(e.target);
                    
                    // Remove fade-in animation to prevent post-load pulse
                    const img = e.target;
                    if (!img.classList.contains('fade-in-complete')) {
                      img.classList.add('fade-in-complete');
                      
                      // For newly arrived photos, delay opacity setting to allow transition
                      // BUT: Don't set inline opacity on placeholder images during loading - let CSS animation control it
                      if (img.classList.contains('placeholder') && photo.loading) {
                        // Skip opacity setting for loading placeholders - CSS animation controls this
                        console.log('Skipping inline opacity for loading placeholder - CSS animation controls it');
                      } else if (photo.newlyArrived) {
                        // For preview images, use a faster transition to handle rapid updates
                        const transitionDelay = photo.isPreview ? 5 : 10;
                        // Start with opacity 0.01 (almost invisible but not completely transparent)
                        // This prevents white background from showing while keeping transition smooth
                        img.style.opacity = '0.01';
                        setTimeout(() => {
                          img.style.opacity = photo.isPreview ? '0.25' : '1';
                          // Add smooth transition for preview updates
                          if (photo.isPreview) {
                            img.style.transition = 'opacity 0.2s ease-in-out';
                          }
                        }, transitionDelay);
                      } else {
                        // Set opacity immediately without animation to prevent pulse
                        const targetOpacity = photo.isPreview ? '0.25' : '1';
                        img.style.opacity = targetOpacity;
                        

                        
                        // Add smooth transition for preview updates
                        if (photo.isPreview) {
                          img.style.transition = 'opacity 0.2s ease-in-out';
                        } else {
                          // Remove transition for final images to ensure immediate full opacity
                          img.style.transition = 'none';
                        }
                      }
                    }
                  }}
                  onError={e => {
                    // Prevent infinite reload loops for gallery images
                    if (photo.isGalleryImage) {
                      // For gallery images, use placeholder instead of retrying
                      e.target.src = '/placeholder-no-preview.svg';
                      e.target.style.opacity = '0.7';
                      e.target.classList.add('fallback', 'gallery-fallback');
                      console.log(`Gallery image failed to load: ${photo.expectedFilename || 'unknown'}`);
                      return;
                    }
                    
                    // For regular photos, try fallback to originalDataUrl if different
                    if (photo.originalDataUrl && e.target.src !== photo.originalDataUrl) {
                      e.target.src = photo.originalDataUrl;
                      e.target.style.opacity = '0.7';
                      e.target.classList.add('fallback');
                      setPhotos(prev => {
                        const updated = [...prev];
                        if (updated[index]) {
                          updated[index] = {
                            ...updated[index],
                            loadError: true,
                            statusText: `${updated[index].statusText || 'Whoops, image failed to load'}`
                          };
                        }
                        return updated;
                      });
                    }
                  }}
                  onContextMenu={e => {
                    // Allow native context menu for image downloads
                    e.stopPropagation();
                  }}
                  style={(() => {
                    const baseStyle = {
                      objectFit: 'cover',
                      position: 'relative',
                      display: 'block',
                      opacity: 0, // Start invisible, will be set to 1 immediately via onLoad without transition
                      // Add strong anti-aliasing for crisp thumbnail rendering
                      imageRendering: 'high-quality',
                      WebkitImageSmoothing: true,
                      MozImageSmoothing: true,
                      msImageSmoothing: true,
                      imageSmoothing: true
                    };

                    // For selected photos during enhancement, maintain original dimensions to prevent Polaroid frame shrinking
                    if (isSelected && photo.enhancing && photo.isPreview) {
                      return {
                        ...baseStyle,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        // Override the CSS that sets width/height to auto for selected images
                        minWidth: '100%',
                        minHeight: '100%'
                      };
                    }
                    
                    // For supported themes with frame padding, account for the border
                    // Skip custom theme framing for gallery images, but allow basic polaroid frames
                    if (isSelected && isThemeSupported() && !photo.isGalleryImage) {
                      // Check if we have a composite framed image - if so, use full size
                      const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                        ? -1 // Special case for enhanced images
                        : (selectedSubIndex || 0);
                      const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                      const frameKey = generateFrameKey(index, currentSubIndex, photoTaipeiFrameNumber);
                      const hasFramedImage = framedImageUrls[frameKey];
                      const isGeneratingFrame = generatingFrames.has(frameKey);
                      
                      if (!hasFramedImage) {
                        // No composite image yet, so check for frame padding and adjust
                        // Use cached frame padding from photo data or get it dynamically
                        const framePadding = photo.framePadding || { top: 0, left: 0, right: 0, bottom: 0 };
                        
                        // Handle both old number format and new object format
                        let paddingObj;
                        if (typeof framePadding === 'number') {
                          paddingObj = { top: framePadding, left: framePadding, right: framePadding, bottom: framePadding };
                        } else {
                          paddingObj = framePadding;
                        }
                        
                        // Check if we have any padding
                        const hasPadding = paddingObj.top > 0 || paddingObj.left > 0 || paddingObj.right > 0 || paddingObj.bottom > 0;
                        
                        if (hasPadding) {
                          // CRITICAL: Use object-fit: cover to ensure image fills entire available space
                          // This ensures NO white space appears in the frame area
                          return {
                            ...baseStyle,
                            width: `calc(100% - ${paddingObj.left + paddingObj.right}px)`,
                            height: `calc(100% - ${paddingObj.top + paddingObj.bottom}px)`,
                            top: `${paddingObj.top}px`,
                            left: `${paddingObj.left}px`,
                            objectFit: 'cover', // Fill entire space, crop if necessary to avoid white space
                            objectPosition: 'center', // Center the image within the available space
                            // Add a subtle loading state when framed image is not ready
                            filter: isGeneratingFrame ? 'brightness(0.8) saturate(0.8)' : 'brightness(0.9) saturate(0.9)',
                            transition: 'filter 0.3s ease'
                          };
                        } else {
                          // No frame padding but still loading framed image
                          return {
                            ...baseStyle,
                            filter: isGeneratingFrame ? 'brightness(0.8) saturate(0.8)' : 'brightness(0.9) saturate(0.9)',
                            transition: 'filter 0.3s ease'
                          };
                        }
                      } else {
                        // Framed image is ready, remove any loading effects
                        return {
                          ...baseStyle,
                          filter: 'none',
                          transition: 'filter 0.3s ease'
                        };
                      }
                    }
                    
                    // Default styling for all other cases
                    return {
                      ...baseStyle,
                      width: '100%',
                      top: 0,
                      left: 0
                    };
                  })()}
                />

                {/* Video Play Button - Shows for photos with AI-generated video */}
                {photo.videoUrl && !photo.generatingVideo && (
                  <button
                    className="photo-video-btn"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      // Toggle generated video playback (multiple videos can play simultaneously)
                      setPlayingGeneratedVideoIds(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(photo.id)) {
                          newSet.delete(photo.id);
                        } else {
                          newSet.add(photo.id);
                        }
                        return newSet;
                      });
                    }}
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'rgba(0, 0, 0, 0.6)',
                      border: 'none',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 999,
                      transition: 'all 0.2s ease',
                      color: 'white',
                      pointerEvents: 'auto'
                    }}
                    title={playingGeneratedVideoIds.has(photo.id) ? 'Stop video' : 'Play video'}
                  >
                    <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
                      {/* Icon reflects actual playback state - pause if playing, play if not */}
                      {playingGeneratedVideoIds.has(photo.id) ? (
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      ) : (
                        <path d="M8 5v14l11-7z"/>
                      )}
                    </svg>
                  </button>
                )}

                {/* AI-Generated Video Overlay - Show when generated video is playing */}
                {photo.videoUrl && !photo.generatingVideo && playingGeneratedVideoIds.has(photo.id) && (
                  // All photos play their own video in a simple loop
                  <video
                    src={photo.videoUrl}
                    autoPlay
                    loop={true}
                    muted
                    playsInline
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      zIndex: 5,
                      pointerEvents: 'none'
                    }}
                  />
                )}

                {/* Video generation progress overlay - displays worker, ETA and elapsed time */}
                {photo.generatingVideo && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      zIndex: 5,
                      color: 'white',
                      textAlign: 'center'
                    }}
                  >
                    {/* Compact glowing card */}
                    <div style={{
                      position: 'relative',
                      background: 'rgba(20, 20, 35, 0.85)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: '12px',
                      padding: '6px 10px',
                      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 107, 107, 0.3)',
                      minWidth: '140px',
                      maxWidth: '160px'
                    }}>
                      {/* Subtle animated glow */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, rgba(255, 107, 107, 0.15), rgba(255, 165, 2, 0.15))',
                        animation: 'pulse 2s ease-in-out infinite',
                        pointerEvents: 'none'
                      }} />
                      
                      {/* Compact header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        marginBottom: '3px',
                        position: 'relative'
                      }}>
                        <span style={{ 
                          fontSize: '14px',
                          filter: 'drop-shadow(0 0 4px rgba(255, 165, 2, 0.6))'
                        }}>
                          🎥
                        </span>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: '600',
                          color: '#ffa502',
                          letterSpacing: '0.3px'
                        }}>
                          Generating
                        </span>
                      </div>
                      
                      {/* ETA - Larger and more prominent */}
                      <div 
                        className={stuckVideoETAs.has(photo.id || index) ? 'video-eta-stuck' : ''}
                        style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: '#fff',
                          marginBottom: '2px',
                          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                          // Add blink animation when ETA is stuck at 1 second or 0 seconds
                          // Use class-based approach for better mobile compatibility
                          ...(stuckVideoETAs.has(photo.id || index) ? {
                            animationName: 'blink',
                            animationDuration: '2s',
                            animationTimingFunction: 'ease-in-out',
                            animationIterationCount: 'infinite',
                            WebkitAnimationName: 'blink',
                            WebkitAnimationDuration: '2s',
                            WebkitAnimationTimingFunction: 'ease-in-out',
                            WebkitAnimationIterationCount: 'infinite'
                          } : {})
                        }}
                      >
                        {photo.videoETA !== undefined && photo.videoETA > 0 ? (
                          <>
                            <span style={{ fontSize: '12px', marginRight: '2px' }}>⏱️</span>
                            {formatVideoDuration(photo.videoETA)}
                          </>
                        ) : photo.videoStatus?.startsWith('Queue') || photo.videoStatus?.startsWith('Next') || photo.videoStatus?.startsWith('In line') ? (
                          <span style={{ fontSize: '12px' }}>In line...</span>
                        ) : (
                          <span style={{ fontSize: '12px' }}>Starting...</span>
                        )}
                      </div>
                      
                      {/* Worker info - smaller and condensed */}
                      <div style={{ 
                        fontSize: '9px', 
                        color: 'rgba(255, 255, 255, 0.7)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '140px'
                      }}>
                        {photo.videoStatus === 'Initializing Model' ? (
                          'Initializing...'
                        ) : photo.videoWorkerName ? (
                          `${photo.videoWorkerName} • ${formatVideoDuration(photo.videoElapsed || 0)}`
                        ) : photo.videoStatus?.startsWith('Queue') || photo.videoStatus?.startsWith('Next') || photo.videoStatus?.startsWith('In line') ? (
                          photo.videoStatus
                        ) : (
                          `${formatVideoDuration(photo.videoElapsed || 0)} elapsed`
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* "Use this vibe" button overlay - shows on hover (desktop) or when selected (touch) */}
                {isPromptSelectorMode && photo.isGalleryImage && !wantsFullscreen && (activeVideoPhotoId !== (photo.id || photo.promptKey)) && (
                  <div 
                    className="use-vibe-overlay-container"
                    onClick={(e) => {
                      // On touch devices, clicking the overlay background (not the button) dismisses it
                      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
                      if (isTouchDevice && e.target === e.currentTarget) {
                        e.stopPropagation();
                        setTouchHoveredPhotoIndex(null);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: isTouchHovered ? 'flex' : 'none',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: isTouchHovered ? 1 : 0,
                      transition: 'opacity 0.2s ease',
                      pointerEvents: isTouchHovered ? 'auto' : 'none',
                      zIndex: 10,
                      background: 'rgba(0, 0, 0, 0.5)'
                    }}
                  >
                    <button
                      style={{
                        background: '#ff5252',
                        color: 'white',
                        border: 'none',
                        padding: '12px 24px',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                        fontFamily: '"Permanent Marker", cursive',
                        minHeight: '44px',
                        minWidth: '120px'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('🎯 Use this vibe button clicked');
                        // Select the style
                        if (photo.promptKey && onPromptSelect) {
                          // Reset scroll position to top in extension mode before style selection
                          if (isExtensionMode) {
                            const filmStripContainer = document.querySelector('.film-strip-container');
                            if (filmStripContainer) {
                              filmStripContainer.scrollTop = 0;
                              filmStripContainer.scrollTo({ top: 0, behavior: 'instant' });
                            }
                          }
                          
                          // Select the style
                          onPromptSelect(photo.promptKey);
                          
                          // Navigate back to menu (unless in extension mode)
                          if (!isExtensionMode && handleBackToCamera) {
                            handleBackToCamera();
                          }
                        }
                      }}
                      onTouchStart={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                      }}
                    >
                      Use this vibe
                    </button>

                    {/* UGC Attribution - Only show when there's an attribution */}
                    {getAttributionText(photo.promptKey) && (
                      <span style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        color: 'white',
                        fontSize: '12px',
                        opacity: 0.9,
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        pointerEvents: 'none',
                        zIndex: 11
                      }}>
                        {getAttributionText(photo.promptKey)}
                      </span>
                    )}
                  </div>
                )}

                {/* Video Overlay - Only show for styles with video easter eggs when video is enabled */}
                {((isSelected && !isPromptSelectorMode) || (isPromptSelectorMode && photo.isGalleryImage)) && hasVideoEasterEgg(photo.promptKey) && (activeVideoPhotoId === (photo.id || photo.promptKey)) && (
                  <video
                    src={(() => {
                      if (photo.promptKey === 'jazzSaxophonist') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-video-demo_832x1216.mp4`;
                      } else if (photo.promptKey === 'kittySwarm') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-kittyswarm-raw.mp4`;
                      } else if (photo.promptKey === 'stoneMoss') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-stonemoss-raw.mp4`;
                      } else if (photo.promptKey === 'dapperVictorian') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-dappervictorian-raw.mp4`;
                      } else if (photo.promptKey === 'prismKaleidoscope') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-prism-kaleidoscope-raw.mp4`;
                      } else if (photo.promptKey === 'apocalypseRooftop') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-apocalypserooftop-raw.mp4`;
                      } else if (photo.promptKey === 'anime1990s') {
                        const animeVideos = [
                          `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw.mp4`,
                          `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw2.mp4`
                        ];
                        return animeVideos[currentVideoIndex] || animeVideos[0];
                      } else if (photo.promptKey === 'nftBoredApe') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-nft-bored-ape-raw.mp4`;
                      } else if (photo.promptKey === 'clownPastel') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-clown-pastel-raw.mp4`;
                      } else if (photo.promptKey === 'jojoStandAura') {
                        return `${urls.assetUrl}/videos/sogni-photobooth-jojo-stand-aura-raw.mp4`;
                      } else if (photo.promptKey === 'babyBlueWrap') {
                        return `${urls.assetUrl}/videos/jen-sogni-photobooth-baby-blue-wrap-raw.mp4`;
                      } else if (photo.promptKey === 'myPolarBearBaby') {
                        return `${urls.assetUrl}/videos/jen-sogni-photobooth-my-polar-bear-baby-raw.mp4`;
                      } else if (photo.promptKey === 'pinkWrap') {
                        return `${urls.assetUrl}/videos/jen-sogni-photobooth-pink-wrap-raw.mp4`;
                      } else if (photo.promptKey === 'redWrap') {
                        return `${urls.assetUrl}/videos/jen-sogni-photobooth-red-wrap-raw.mp4`;
                      }
                      return "";
                    })()}
                    autoPlay
                    loop={photo.promptKey !== 'anime1990s'}
                    playsInline
                    onEnded={() => {
                      if (photo.promptKey === 'anime1990s') {
                        const animeVideos = [
                          `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw.mp4`,
                          `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw2.mp4`
                        ];
                        const nextIndex = (currentVideoIndex + 1) % animeVideos.length;
                        setCurrentVideoIndex(nextIndex);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: photo.promptKey === 'kittySwarm' ? 'contain' : 'cover', // Use contain for kittySwarm to show black bars, cover for others
                      objectPosition: 'center',
                      backgroundColor: photo.promptKey === 'kittySwarm' ? '#000' : 'transparent', // Black background for letterboxing on kittySwarm
                      zIndex: 3, // Above theme overlays
                      borderRadius: 'inherit'
                    }}
                    onLoadedData={() => {
                      console.log(`${photo.promptKey} video loaded and ready to play`);
                    }}
                    onError={(e) => {
                      console.error(`${photo.promptKey} video failed to load:`, e);
                      setActiveVideoPhotoId(null); // Hide video on error
                    }}
                  />
                )}
                
                {/* Event Theme Overlays - Only show on selected (popup) view when theme is supported and not using composite framed image */}
                {(() => {
                  // Only show theme overlays if we don't have a composite framed image
                  // Skip custom theme overlays for gallery images, but allow basic polaroid frames
                  if (!thumbUrl || !isLoaded || !isSelected || !isThemeSupported() || photo.isGalleryImage) {
                    return null;
                  }
                  
                  // Check if we have a composite framed image for this photo
                  const currentSubIndex = photo.enhanced && photo.enhancedImageUrl 
                    ? -1 // Special case for enhanced images
                    : (selectedSubIndex || 0);
                  const photoTaipeiFrameNumber = photo.taipeiFrameNumber || 1;
                  const frameKey = generateFrameKey(index, currentSubIndex, photoTaipeiFrameNumber);
                  
                  // If we have a composite framed image, don't show theme overlays
                  if (framedImageUrls[frameKey]) {
                    return null;
                  }
                  
                  // Show theme overlays
                  return (
                  <>

                    {/* Super Casual Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'supercasual' && aspectRatio === 'narrow' && (
                      <img
                        src="/events/super-casual.png"
                        alt="Super Casual Frame"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    
                    {/* Tezos WebX Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'tezoswebx' && aspectRatio === 'narrow' && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          backgroundImage: `url(/events/tz_webx.png)`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    
                    {/* Taipei Blockchain Week Full Frame Overlay - only for narrow (2:3) aspect ratio */}
                    {tezdevTheme === 'taipeiblockchain' && aspectRatio === 'narrow' && (
                      <img
                        src={`/events/taipei-blockchain-2025/narrow_${photo.taipeiFrameNumber || 1}.png`}
                        alt="Taipei Blockchain Week Frame"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'center',
                          pointerEvents: 'none',
                          zIndex: 2
                        }}
                      />
                    )}
                    

                  </>
                  );
                })()}
                
                {/* QR Code Overlay for Kiosk Mode */}
                {qrCodeData && qrCodeData.photoIndex === index && qrCodeDataUrl && isSelected && (
                  <div 
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 9999,
                      cursor: 'pointer'
                    }}
                    onClick={onCloseQR}
                  >
                    <div 
                      style={{
                        backgroundColor: isExtensionMode ? 'rgba(255, 255, 255, 0.95)' : 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        textAlign: 'center',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <h3 style={{ 
                        margin: '0 0 16px 0', 
                        color: '#333',
                        fontSize: '18px',
                        fontWeight: '600'
                      }}>
                        Scan to Share on Your Phone
                      </h3>
                      
                      {qrCodeDataUrl === 'loading' ? (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          margin: '0 auto 16px auto',
                          width: '200px',
                          height: '200px',
                          border: '2px solid #eee',
                          borderRadius: '8px',
                          justifyContent: 'center',
                          backgroundColor: '#f9f9f9'
                        }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid #e3e3e3',
                            borderTop: '4px solid #1DA1F2',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: '12px'
                          }}></div>
                          <div style={{
                            color: '#666',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}>
                            Generating QR Code...
                          </div>
                        </div>
                      ) : (
                        <img 
                          src={qrCodeDataUrl} 
                          alt="QR Code for sharing" 
                          style={{ 
                            display: 'block',
                            margin: '0 auto 16px auto',
                            border: '2px solid #eee',
                            borderRadius: '8px'
                          }} 
                        />
                      )}

                      <button
                        onClick={onCloseQR}
                        style={{
                          background: '#1DA1F2',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '500'
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* Hide button, refresh button, and favorite button - only show on hover for grid photos (not popup) and when image is loaded */}
                {!isSelected && isLoaded && !photo.isOriginal && !photo.isGalleryImage && (
                  <>
                    {/* Block prompt button - show for batch-generated images on desktop */}
                    {!isMobile() && photo.promptKey && (photo.stylePrompt || photo.positivePrompt) && (
                      <button
                        className="photo-block-btn-batch"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleBlockPrompt(photo.promptKey, index);
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(220, 53, 69, 0.9)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '100px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 999,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                          opacity: '0',
                          transform: 'scale(0.8)'
                        }}
                        title="Never use this prompt"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'translateY(1px)' }}>
                          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                        </svg>
                      </button>
                    )}
                    {/* Favorite heart button - show for batch-generated images on desktop */}
                    {!isMobile() && photo.promptKey && (photo.stylePrompt || photo.positivePrompt) && (
                      <button
                        className="photo-favorite-btn-batch"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleFavoriteToggle(getPhotoId(photo));
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '52px',
                          background: isPhotoFavorited(photo) ? 'rgba(255, 71, 87, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 999,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                          opacity: '0'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                        onMouseOut={(e) => {
                          const photoId = photo.promptKey || photo.id || (photo.images && photo.images[0]);
                          const currentlyFavorited = favoriteImageIds.includes(photoId);
                          e.currentTarget.style.opacity = currentlyFavorited ? '1' : '0';
                        }}
                        title={isPhotoFavorited(photo) ? "Remove from favorites" : "Add to favorites"}
                      >
                        {isPhotoFavorited(photo) ? '❤️' : '🤍'}
                      </button>
                    )}
                    {/* Motion video button - show for batch-generated images on desktop */}
                    {!isMobile() && photo.promptKey && (photo.stylePrompt || photo.positivePrompt) && (
                      <button
                        className="photo-motion-btn-batch"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Show the video options list for this photo (without selecting it)
                          setVideoTargetPhotoIndex(index);
                          setShowVideoOptionsList(true);
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '76px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: photo.generatingVideo ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 999,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                          opacity: photo.generatingVideo ? '0.6' : '0',
                          transform: 'scale(0.8)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          if (!photo.generatingVideo) {
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.9)';
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.opacity = '1';
                          }
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                          e.currentTarget.style.transform = 'scale(0.8)';
                          e.currentTarget.style.opacity = photo.generatingVideo ? '0.6' : '0';
                        }}
                        title={photo.generatingVideo ? "Generating video..." : "Generate motion video"}
                      >
                        {photo.generatingVideo ? (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ animation: 'spin 1s linear infinite' }}>
                            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                          </svg>
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                          </svg>
                        )}
                      </button>
                    )}
                    {/* Refresh button - only show if photo has a prompt */}
                    {(photo.positivePrompt || photo.stylePrompt) && (
                      <button
                        className="photo-refresh-btn"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onRefreshPhoto(index);
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '28px',
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          border: 'none',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 999,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                          transition: 'all 0.2s ease',
                          opacity: '0',
                          transform: 'scale(0.8)'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(52, 152, 219, 0.9)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                          e.currentTarget.style.transform = 'scale(0.8)';
                        }}
                        title="Refresh this image"
                      >
                        🔄
                      </button>
                    )}
                    <button
                      className="photo-hide-btn"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setPhotos(prev => {
                          const updated = [...prev];
                          if (updated[index]) {
                            updated[index] = {
                              ...updated[index],
                              hidden: true
                            };
                          }
                          return updated;
                        });
                      }}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        border: 'none',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 999,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                        transition: 'all 0.2s ease',
                        opacity: '0',
                        transform: 'scale(0.8)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.9)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                        e.currentTarget.style.transform = 'scale(0.8)';
                      }}
                      title="Hide this image"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>

              {/* Icon container for Vibe Explorer - flexbox automatically removes gaps */}
              {isPromptSelectorMode && !wantsFullscreen && photo.isGalleryImage && (
                <div 
                  className="vibe-icons-container"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                  }}
                  style={{
                    position: 'absolute',
                    top: isMobile() ? '10px' : '20px',
                    right: isMobile() ? '10px' : '20px',
                    display: 'flex',
                    flexDirection: 'row-reverse',
                    gap: '4px',
                    alignItems: 'center',
                    zIndex: 99999,
                    opacity: ((activeVideoPhotoId === (photo.id || photo.promptKey)) || (isPhotoFavorited(photo) && !isMobile()) || (('ontouchstart' in window || navigator.maxTouchPoints > 0) && isTouchHovered)) ? '1' : '0',
                    transition: 'opacity 0.2s ease',
                    pointerEvents: 'all'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
                    const isPlaying = activeVideoPhotoId === (photo.id || photo.promptKey);
                    e.currentTarget.style.opacity = (isPlaying || (isPhotoFavorited(photo) && !isMobile()) || (isTouchDevice && isTouchHovered)) ? '1' : '0';
                  }}
                >
                  {/* Favorite heart - rightmost */}
                  <div
                    className="photo-favorite-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onClickCapture={(e) => {
                      e.stopPropagation();
                      const photoId = photo.promptKey || photo.id || (photo.images && photo.images[0]);
                      handleFavoriteToggle(photoId);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDownCapture={(e) => {
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      width: '26px',
                      height: '26px',
                      display: (activeVideoPhotoId === (photo.id || photo.promptKey)) ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title={isPhotoFavorited(photo) ? "Remove from favorites" : "Add to favorites"}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: isPhotoFavorited(photo) ? 'rgba(255, 71, 87, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      transition: 'background 0.2s ease',
                      pointerEvents: 'none'
                    }}>
                      {isPhotoFavorited(photo) ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Video button - only if video exists */}
                  {hasVideoEasterEgg(photo.promptKey) && (
                    <div
                      className="photo-video-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      onClickCapture={(e) => {
                        e.stopPropagation();
                        const photoId = photo.id || photo.promptKey;
                        setActiveVideoPhotoId(activeVideoPhotoId === photoId ? null : photoId);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                      onMouseDownCapture={(e) => {
                        e.stopPropagation();
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                      }}
                      style={{
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      title={(activeVideoPhotoId === (photo.id || photo.promptKey)) ? 'Hide video' : 'Show video'}
                    >
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: (activeVideoPhotoId === (photo.id || photo.promptKey)) ? 'rgba(52, 152, 219, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                        transition: 'background 0.2s ease',
                        pointerEvents: 'none'
                      }}>
                        <svg fill="white" width="10" height="10" viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
                          {(activeVideoPhotoId === (photo.id || photo.promptKey)) ? (
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                          ) : (
                            <path d="M8 5v14l11-7z"/>
                          )}
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Fullscreen button */}
                  <div
                    className="photo-fullscreen-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    onClickCapture={(e) => {
                      e.stopPropagation();
                      console.log('🖼️ Fullscreen button clicked, setting selected and fullscreen');
                      setWantsFullscreen(true);
                      setSelectedPhotoIndex(index);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseDownCapture={(e) => {
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      width: '26px',
                      height: '26px',
                      display: (activeVideoPhotoId === (photo.id || photo.promptKey)) ? 'none' : 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="View fullscreen"
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: 'rgba(0, 0, 0, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                      transition: 'background 0.2s ease',
                      pointerEvents: 'none'
                    }}>
                      <svg fill="white" width="10" height="10" viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                      </svg>
                    </div>
                  </div>

                  {/* Block prompt button - desktop only, leftmost */}
                  {!isMobile() && photo.promptKey && (
                    <div
                      className="photo-block-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      onClickCapture={(e) => {
                        e.stopPropagation();
                        handleBlockPrompt(photo.promptKey, index);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                      onMouseDownCapture={(e) => {
                        e.stopPropagation();
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                      }}
                      style={{
                        width: '26px',
                        height: '26px',
                        display: (activeVideoPhotoId === (photo.id || photo.promptKey)) ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        const innerDiv = e.currentTarget.querySelector('div');
                        if (innerDiv) innerDiv.style.background = 'rgba(220, 53, 69, 0.9)';
                      }}
                      onMouseLeave={(e) => {
                        const innerDiv = e.currentTarget.querySelector('div');
                        if (innerDiv) innerDiv.style.background = 'rgba(0, 0, 0, 0.7)';
                      }}
                      title="Never use this prompt"
                    >
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        transition: 'background 0.2s ease',
                        pointerEvents: 'none'
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none', transform: 'translateY(1px)' }}>
                          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* No special label for selected view - use standard grid label below */}
              <div className="photo-label">
                {photo.loading || photo.generating ? 
                  (photo.statusText || labelText) 
                  : photo.isGalleryImage ? labelText : (photo.statusText || labelText)}
                {/* UGC Attribution - show for Vibe Explorer photos with attribution */}
                {isPromptSelectorMode && photo.promptKey && getAttributionText(photo.promptKey) && (
                  <div style={{
                    fontSize: '9px',
                    opacity: 0.7,
                    marginTop: '2px',
                    fontStyle: 'italic'
                  }}>
                    {getAttributionText(photo.promptKey)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Gallery Carousel - show when in fullscreen mode in prompt selector */}
      {isPromptSelectorMode && wantsFullscreen && selectedPhotoIndex !== null && (
        <GalleryCarousel
          promptKey={
            (isPromptSelectorMode ? filteredPhotos : photos)[selectedPhotoIndex]?.promptKey ||
            (isPromptSelectorMode ? filteredPhotos : photos)[selectedPhotoIndex]?.selectedStyle
          }
          originalImage={(isPromptSelectorMode ? filteredPhotos : photos)[selectedPhotoIndex]}
          onImageSelect={(entry) => {
            console.log('🖼️ [PhotoGallery] onImageSelect called - Gallery entry clicked', {
              entryId: entry.id,
              hasImageUrl: !!entry.imageUrl,
              hasVideoUrl: !!entry.videoUrl,
              isOriginal: entry.isOriginal
            });
            
            // Need at least an imageUrl to display
            if (!entry.imageUrl) {
              console.warn('🖼️ [PhotoGallery] No imageUrl in entry, cannot display');
              return;
            }
            
            // Don't switch models here - that should only happen when "Use this style" is clicked
            
            // In prompt selector mode, we need to update the filtered photo directly
            // Don't update photos array as that's for user-generated images
            if (isPromptSelectorMode) {
              // Since filteredPhotos is derived from photos, we can't directly update it
              // Instead, we'll create a temporary display by replacing just the image URL
              // The actual photo object in the photos array stays the same
              const currentPhoto = filteredPhotos[selectedPhotoIndex];
              if (!currentPhoto) {
                console.warn('🖼️ [PhotoGallery] No current photo at selectedPhotoIndex:', selectedPhotoIndex);
                return;
              }
              
              // Create a modified version for display
              const modifiedPhoto = {
                ...currentPhoto,
                images: [entry.imageUrl],
                videoUrl: entry.videoUrl || undefined, // Include video URL if available
                selectedGalleryEntry: entry,
                gallerySeed: entry.metadata?.seed,
                galleryMetadata: entry.metadata,
                // Mark as showing a gallery entry (not the original style sample)
                isShowingGalleryEntry: !entry.isOriginal
              };
              
              console.log('🖼️ [PhotoGallery] Updating photo with gallery entry:', {
                photoId: currentPhoto.id,
                newImageUrl: entry.imageUrl?.substring(0, 50) + '...',
                hasVideoUrl: !!modifiedPhoto.videoUrl
              });
              
              // Replace the photo at the current index in the photos array used by prompt selector
              setPhotos(prev => {
                const updated = [...prev];
                // Find the index in the full photos array (not filteredPhotos)
                const fullIndex = prev.findIndex(p => p.id === currentPhoto.id);
                if (fullIndex !== -1) {
                  updated[fullIndex] = modifiedPhoto;
                }
                return updated;
              });
            }
          }}
          onEntriesLoaded={(count) => setHasGalleryEntries(count > 0)}
          showKeyboardHint={true}
          onModelSelect={(modelId) => {
            console.log('🤖 [PhotoGallery] Switching model to:', modelId);
            if (switchToModel) {
              console.log('🤖 [PhotoGallery] Calling switchToModel');
              switchToModel(modelId);
            } else {
              console.warn('🤖 [PhotoGallery] switchToModel not provided!');
            }
          }}
        />
      )}
      {/* Only render slothicorn if animation is enabled */}
      {slothicornAnimationEnabled && (
        <div className="slothicorn-container">
          {/* Slothicorn content */}
        </div>
      )}

      {/* Custom Prompt Modal for Kontext Enhancement */}
      {showPromptModal && (
        <div 
          className="prompt-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999999,
            padding: '20px'
          }}
          onClick={handlePromptCancel}
        >
          <div 
            className="prompt-modal"
            style={{
              background: isExtensionMode ? 'rgba(255, 255, 255, 0.95)' : 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              position: 'relative',
              color: '#222'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#333',
              textAlign: 'center'
            }}>
              Modify your image with natural language 🤗
            </h3>
            
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="Type what you want to change in the picture"
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s ease',
                color: '#222',
                backgroundColor: '#fff'
              }}
              onFocus={e => e.target.style.borderColor = '#4bbbd3'}
              onBlur={e => e.target.style.borderColor = '#e0e0e0'}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (customPrompt.trim()) {
                    handlePromptSubmit();
                  }
                }
              }}
              autoComplete="off"
              autoCapitalize="off"
              data-form-type="other"
            />

            {/* Quick-action suggestion chips */}
            {(() => {
              const samplePrompts = [
                'Zoom way out',
                'Recreate the scene in legos',
                'Make it night time',
                'Change background to a beach',
                'Add rainbow lens flare',
                'Turn into pixel art',
                'Add hats and sunglasses',
                'Add cats and match style',
                'Add more people',
                'Make into Time Magazine cover with "The Year of AI" and "with SOGNI AI"'
              ];
              const chipBackgrounds = [
                'linear-gradient(135deg, #72e3f2, #4bbbd3)',
                'linear-gradient(135deg, #ffb6e6, #ff5e8a)',
                'linear-gradient(135deg, #ffd86f, #fc6262)',
                'linear-gradient(135deg, #a8e063, #56ab2f)',
                'linear-gradient(135deg, #f093fb, #f5576c)',
                'linear-gradient(135deg, #5ee7df, #b490ca)'
              ];
              return (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '12px',
                  justifyContent: 'center'
                }}>
                  {samplePrompts.map((text, idx) => (
                    <button
                      key={text}
                      onClick={() => { setCustomPrompt(text); submitPrompt(text); }}
                      style={{
                        padding: '8px 12px',
                        border: 'none',
                        borderRadius: '999px',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: chipBackgrounds[idx % chipBackgrounds.length],
                        boxShadow: '0 2px 6px rgba(0,0,0,0.45)'
                      }}
                      title={text}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              );
            })()}
            
            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '20px',
              justifyContent: 'center'
            }}>
              <button
                onClick={handlePromptCancel}
                style={{
                  padding: '10px 20px',
                  border: '2px solid #ddd',
                  background: isExtensionMode ? 'rgba(255, 255, 255, 0.9)' : 'white',
                  color: '#666',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.target.style.backgroundColor = '#f5f5f5';
                  e.target.style.borderColor = '#ccc';
                }}
                onMouseOut={e => {
                  e.target.style.backgroundColor = isExtensionMode ? 'rgba(255, 255, 255, 0.9)' : 'white';
                  e.target.style.borderColor = '#ddd';
                }}
              >
                Cancel
              </button>
              
              <button
                onClick={handlePromptSubmit}
                disabled={!customPrompt.trim()}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  background: customPrompt.trim() ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)' : '#ccc',
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: customPrompt.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s ease',
                  opacity: customPrompt.trim() ? 1 : 0.6
                }}
                onMouseOver={e => {
                  if (customPrompt.trim()) {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 107, 0.3)';
                  }
                }}
                onMouseOut={e => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
              🎨 Change It!
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Hidden file input for music upload - always rendered so it's available to both popups */}
      <input
        ref={musicFileInputRef}
        type="file"
        accept=".m4a,.mp3,audio/mp4,audio/x-m4a,audio/mpeg,audio/mp3"
        onChange={handleMusicFileSelect}
        style={{ display: 'none' }}
      />
      
      {/* Hidden audio element for preview playback */}
      <audio
        ref={audioPreviewRef}
        style={{ display: 'none' }}
        onEnded={() => setIsPlayingPreview(false)}
      />

      {/* Video Intro Popup - Shows on first Video button click */}
      <VideoIntroPopup
        visible={showVideoIntroPopup}
        onDismiss={handleVideoIntroDismiss}
        onProceed={handleVideoIntroProceed}
      />

      {/* Transition Video Popup - Shows before generating transition videos */}
      {showTransitionVideoPopup && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000000,
            padding: '20px'
          }}
          onClick={() => {
            setShowTransitionVideoPopup(false);
            // Stop any playing preview
            setIsPlayingPreview(false);
            if (audioPreviewRef.current) {
              audioPreviewRef.current.pause();
            }
          }}
        >
          <div
            style={{
              backgroundColor: '#ffeb3b',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
              animation: 'popupFadeIn 0.25s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <div>
                <h3 style={{
                  margin: 0,
                  color: '#000',
                  fontSize: '18px',
                  fontWeight: '700',
                  fontFamily: '"Permanent Marker", cursive',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  🔀 Transition Video
                </h3>
                <p style={{
                  margin: '4px 0 0 0',
                  color: 'rgba(0, 0, 0, 0.6)',
                  fontSize: '12px',
                  fontWeight: '400'
                }}>
                  Generate a sweet looping transition video between all images.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Settings Cog */}
                <button
                  onClick={handleOpenVideoSettings}
                  title="Video Settings"
                  style={{
                    background: 'rgba(0, 0, 0, 0.1)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    color: '#000',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ⚙️
                </button>
                {/* Close button */}
                <button
                  onClick={() => {
                    setShowTransitionVideoPopup(false);
                    setIsPlayingPreview(false);
                    if (audioPreviewRef.current) audioPreviewRef.current.pause();
                  }}
                  style={{
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    cursor: 'pointer',
                    color: '#fff',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '16px 20px' }}>
              {/* Transition Prompt */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: 'rgba(0, 0, 0, 0.7)',
                  fontSize: '11px',
                  marginBottom: '6px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  ✨ Transition Prompt
                </label>
                <textarea
                  value={settings.videoTransitionPrompt ?? DEFAULT_SETTINGS.videoTransitionPrompt ?? ''}
                  onChange={(e) => updateSetting('videoTransitionPrompt', e.target.value)}
                  placeholder="Describe how images should transition..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid rgba(0, 0, 0, 0.15)',
                    borderRadius: '8px',
                    color: '#000',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    resize: 'vertical',
                    minHeight: '70px',
                    maxHeight: '150px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Music Section */}
              <div style={{
                backgroundColor: 'rgba(0, 0, 0, 0.08)',
                borderRadius: '10px',
                padding: '14px 16px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <span style={{
                    color: 'rgba(0, 0, 0, 0.85)',
                    fontSize: '12px',
                    fontWeight: '700'
                  }}>
                    🎵 Add Music (Optional)
                  </span>
                  <span style={{
                    fontSize: '9px',
                    backgroundColor: '#c62828',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontWeight: '700'
                  }}>BETA</span>
                </div>

                {/* Preset Music Selection */}
                <select
                  value={selectedPresetId || ''}
                  onChange={(e) => {
                    const preset = TRANSITION_MUSIC_PRESETS.find(p => p.id === e.target.value);
                    if (preset) {
                      handlePresetSelect(preset);
                    } else {
                      setSelectedPresetId(null);
                      setMusicFile(null);
                      setAudioWaveform(null);
                    }
                  }}
                  disabled={isLoadingPreset}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: selectedPresetId ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 255, 255, 0.95)',
                    border: selectedPresetId ? '2px solid rgba(76, 175, 80, 0.6)' : '1px solid rgba(0, 0, 0, 0.2)',
                    borderRadius: '6px',
                    color: '#000',
                    cursor: isLoadingPreset ? 'wait' : 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23000' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 10px center',
                    paddingRight: '32px',
                    marginBottom: '6px'
                  }}
                >
                  <option value="">
                    {isLoadingPreset ? '⏳ Loading...' : '🎵 Select a preset track...'}
                  </option>
                  {TRANSITION_MUSIC_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.title} • {preset.duration}
                    </option>
                  ))}
                </select>

                {/* Or upload divider */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: '6px 0',
                  color: 'rgba(0, 0, 0, 0.5)',
                  fontSize: '10px'
                }}>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(0, 0, 0, 0.2)' }} />
                  <span>or</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(0, 0, 0, 0.2)' }} />
                </div>

                {/* Custom file upload button */}
                <button
                  onClick={() => {
                    setSelectedPresetId(null);
                    musicFileInputRef.current?.click();
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: musicFile && !selectedPresetId ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 255, 255, 0.95)',
                    border: musicFile && !selectedPresetId ? '2px solid rgba(76, 175, 80, 0.6)' : '1px dashed rgba(0, 0, 0, 0.35)',
                    borderRadius: '6px',
                    color: '#000',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '500',
                    textAlign: 'center'
                  }}
                >
                  {musicFile && !selectedPresetId ? `✅ ${musicFile.name}` : '📁 Upload MP3/M4A'}
                </button>

                {/* Waveform Visualization */}
                {musicFile && audioWaveform && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px'
                    }}>
                      <label style={{ color: 'rgba(0, 0, 0, 0.8)', fontSize: '11px', fontWeight: '600' }}>
                        Select Start Position
                      </label>
                      <button
                        onClick={toggleAudioPreview}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: isPlayingPreview ? '#c62828' : 'rgba(0, 0, 0, 0.75)',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isPlayingPreview ? '⏸ Pause' : '▶ Preview'}
                      </button>
                    </div>
                    
                    {/* Canvas for waveform */}
                    <div
                      style={{
                        position: 'relative',
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        cursor: isDraggingWaveform ? 'grabbing' : 'crosshair',
                        userSelect: 'none',
                        border: '1px solid rgba(0, 0, 0, 0.15)'
                      }}
                      onMouseDown={handleWaveformMouseDown}
                    >
                      <canvas
                        ref={waveformCanvasRef}
                        width={352}
                        height={60}
                        style={{
                          display: 'block',
                          width: '100%',
                          height: '60px',
                          pointerEvents: 'none'
                        }}
                      />
                    </div>
                    
                    {/* Time indicators */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '4px',
                      fontSize: '10px',
                      color: 'rgba(0, 0, 0, 0.7)',
                      fontWeight: '500'
                    }}>
                      <span>0:00</span>
                      <span style={{ color: '#c62828', fontWeight: '700' }}>
                        Start: {Math.floor(musicStartOffset / 60)}:{(musicStartOffset % 60).toFixed(1).padStart(4, '0')}
                      </span>
                      <span>
                        {Math.floor(audioDuration / 60)}:{Math.floor(audioDuration % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                    
                    <p style={{
                      margin: '4px 0 0 0',
                      color: 'rgba(0, 0, 0, 0.55)',
                      fontSize: '10px',
                      textAlign: 'center'
                    }}>
                      Click to set • Drag red area to move
                    </p>
                  </div>
                )}

                {/* Manual offset input as fallback */}
                {musicFile && !audioWaveform && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{
                      display: 'block',
                      color: 'rgba(0, 0, 0, 0.7)',
                      fontSize: '11px',
                      marginBottom: '4px'
                    }}>
                      Start Offset (seconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={musicStartOffset}
                      onChange={(e) => setMusicStartOffset(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        border: '1px solid rgba(0, 0, 0, 0.15)',
                        borderRadius: '6px',
                        color: '#000',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                      }}
                      placeholder="0"
                    />
                    <p style={{
                      margin: '4px 0 0 0',
                      color: 'rgba(0, 0, 0, 0.4)',
                      fontSize: '10px'
                    }}>
                      Loading waveform...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer with Generate button and pricing */}
            <div style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid rgba(0, 0, 0, 0.1)'
            }}>
              {/* Generate button */}
              <button
                onClick={() => {
                  setShowTransitionVideoPopup(false);
                  setIsPlayingPreview(false);
                  if (audioPreviewRef.current) audioPreviewRef.current.pause();
                  handleBatchGenerateTransitionVideo();
                }}
                disabled={transitionVideoLoading}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: transitionVideoLoading ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.85)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  cursor: transitionVideoLoading ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  fontFamily: '"Permanent Marker", cursive'
                }}
              >
                🎬 Generate Transition Video
              </button>
              {/* Pricing row */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '12px'
              }}>
                <span style={{ fontSize: '11px', fontWeight: '500', color: 'rgba(0, 0, 0, 0.6)' }}>
                  📹 {loadedPhotosCount} video{loadedPhotosCount !== 1 ? 's' : ''} • 📐 {settings.videoResolution || '480p'} • ⏱️ {settings.videoDuration || 5}s
                </span>
                {transitionVideoLoading ? (
                  <span style={{ fontSize: '10px', color: 'rgba(0, 0, 0, 0.5)' }}>...</span>
                ) : formatCost(transitionVideoCostRaw, transitionVideoUSD) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#000' }}>
                      {(() => {
                        const formatted = formatCost(transitionVideoCostRaw, transitionVideoUSD);
                        return formatted.split('(')[0].trim();
                      })()}
                    </span>
                    {(() => {
                      const formatted = formatCost(transitionVideoCostRaw, transitionVideoUSD);
                      const usdMatch = formatted.match(/\((.*?)\)/);
                      return usdMatch ? (
                        <span style={{ fontWeight: '500', color: 'rgba(0, 0, 0, 0.6)', fontSize: '10px' }}>≈ {usdMatch[1]}</span>
                      ) : null;
                    })()}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Video Options List Portal for Gallery Mode (when not in slideshow) */}
      {showVideoOptionsList && videoTargetPhotoIndex !== null && selectedPhotoIndex === null && createPortal(
        <div
          className="video-options-list-dropdown"
          style={{
            position: 'fixed',
            bottom: window.innerWidth < 768 ? 'auto' : '90px',
            top: window.innerWidth < 768 ? '10px' : 'auto',
            right: window.innerWidth < 768 ? 'auto' : '32px',
            left: window.innerWidth < 768 ? '50%' : 'auto',
            transform: window.innerWidth < 768 ? 'translateX(-50%)' : 'none',
            background: 'rgba(255, 255, 255, 0.98)',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            minWidth: '200px',
            animation: 'fadeIn 0.2s ease-out',
            zIndex: 10000001
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '10px 16px',
            background: 'rgba(139, 92, 246, 0.08)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
            fontFamily: '"Permanent Marker", cursive',
            fontSize: '13px',
            fontWeight: '600',
            color: '#555',
            textAlign: 'center',
            letterSpacing: '0.5px'
          }}>
            Video Options
          </div>
          
          {/* Motion Video Option */}
          <button
            className="video-option-button"
            onClick={() => {
              setShowVideoOptionsList(false);
              setShowVideoDropdown(true);
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              color: '#333',
              fontSize: '14px',
              fontWeight: 'normal',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '1px solid rgba(0, 0, 0, 0.05)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span>🎥</span>
            <span>Motion Video</span>
          </button>
          
          {/* BASE Hero Option */}
          <button
            className="video-option-button"
            onClick={handleBaseHeroVideo}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              color: '#333',
              fontSize: '14px',
              fontWeight: 'normal',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span>🦸</span>
            <span>BASE Hero</span>
          </button>
        </div>,
        document.body
      )}

      {/* Video Dropdown Portal for Gallery Mode (when not in slideshow) */}
      {showVideoDropdown && videoTargetPhotoIndex !== null && selectedPhotoIndex === null && createPortal(
        <div 
          className="video-dropdown"
          style={{
            position: 'fixed',
            ...(window.innerWidth < 768 
              ? { 
                  top: '10px',
                  bottom: '10px',
                  height: 'auto'
                }
              : { 
                  bottom: '60px',
                  height: 'min(75vh, 650px)',
                  maxHeight: 'calc(100vh - 80px)'
                }
            ),
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ffeb3b',
            borderRadius: '8px',
            padding: '8px',
            border: 'none',
            width: 'min(95vw, 950px)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
            zIndex: 9999999,
            animation: 'videoDropdownSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowVideoDropdown(false); setSelectedMotionCategory(null); setVideoTargetPhotoIndex(null); }}
              style={{
                position: 'absolute', top: '4px', right: '4px', width: '24px', height: '24px',
                borderRadius: '50%', border: 'none', 
                background: 'rgba(0, 0, 0, 0.6)',
                color: '#fff', fontSize: '14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)'; }}
            >×</button>
          </div>
          <div style={{ padding: '10px 16px 8px', fontFamily: '"Permanent Marker", cursive', fontSize: '15px', fontWeight: '700', color: '#000', textAlign: 'center', borderBottom: '1px solid rgba(0, 0, 0, 0.15)' }}>
            🎬 Choose a motion style
          </div>
          {renderMotionPicker(selectedMotionCategory, setSelectedMotionCategory, handleGenerateVideo, setShowVideoDropdown, setShowCustomVideoPromptPopup)}
          <div style={{ padding: '10px', borderTop: '1px solid rgba(0, 0, 0, 0.1)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            {renderCustomButton(setShowVideoDropdown, setShowCustomVideoPromptPopup)}
          </div>
        </div>,
        document.body
      )}

      {/* Batch Video Dropdown Portal - for batch video generation */}
      {showBatchVideoDropdown && batchActionMode === 'video' && createPortal(
        <div 
          className="video-dropdown batch-video-dropdown"
          style={{
            position: 'fixed',
            ...(window.innerWidth < 768 
              ? { 
                  top: '10px',
                  bottom: '10px',
                  height: 'auto'
                }
              : { 
                  bottom: '60px',
                  height: 'min(75vh, 650px)',
                  maxHeight: 'calc(100vh - 80px)'
                }
            ),
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ffeb3b',
            borderRadius: '8px',
            padding: '8px',
            border: 'none',
            width: 'min(95vw, 950px)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
            zIndex: 9999999,
            animation: 'videoDropdownSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top right buttons container - Settings and Close */}
          <div style={{ position: 'relative' }}>
            {/* Settings cog icon - left of close button */}
            <button
              onClick={handleOpenVideoSettings}
              title="Video Settings"
              style={{
                position: 'absolute',
                top: '0px',
                right: '36px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0, 0, 0, 0.1)',
                color: 'rgba(0, 0, 0, 0.5)',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 1
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.15)';
                e.currentTarget.style.color = 'rgba(0, 0, 0, 0.8)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.color = 'rgba(0, 0, 0, 0.5)';
              }}
            >
              ⚙️
            </button>
            
            {/* Close button - far right */}
            <button
              onClick={() => { setShowBatchVideoDropdown(false); setSelectedBatchMotionCategory(null); }}
              title="Close"
              style={{
                position: 'absolute',
                top: '0px',
                right: '0px',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0, 0, 0, 0.6)',
                color: '#fff',
                fontSize: '18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 1,
                lineHeight: '1',
                fontWeight: '300'
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              ×
            </button>
          </div>
          
          <div style={{ padding: '10px 16px 8px', fontFamily: '"Permanent Marker", cursive', fontSize: '15px', fontWeight: '700', color: '#000', textAlign: 'center', borderBottom: '1px solid rgba(0, 0, 0, 0.15)' }}>
            🎬 Choose a motion style for all images
          </div>
          {renderMotionPicker(selectedBatchMotionCategory, setSelectedBatchMotionCategory, handleBatchGenerateVideo, setShowBatchVideoDropdown, setShowBatchCustomVideoPromptPopup)}
          
          {/* BASE Hero Option Button */}
          <div style={{
            padding: '10px',
            borderTop: '1px solid rgba(0, 0, 0, 0.1)',
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
            flexShrink: 0
          }}>
            <button
              onClick={handleBatchBaseHeroVideo}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: 'linear-gradient(135deg, #0052FF, #0052FF)',
                color: 'white',
                fontSize: '14px',
                fontWeight: '700',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(0, 82, 255, 0.3)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #0066FF, #0066FF)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 82, 255, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #0052FF, #0052FF)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 82, 255, 0.3)';
              }}
            >
              <span>🦸</span>
              <span>BASE Hero</span>
            </button>
            <button
              onClick={handleBatchPromptVideo}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                color: 'white',
                fontSize: '14px',
                fontWeight: '700',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #9B6CF6, #7D38E9)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #8B5CF6, #6D28D9)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.3)';
              }}
            >
              <span>✨</span>
              <span>Prompt Video</span>
            </button>
          </div>

          {/* Custom Prompt Button - Always visible below grid */}
          <div style={{
            padding: '10px',
            borderTop: '1px solid rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: window.innerWidth < 768 ? 'column' : 'row',
            alignItems: window.innerWidth < 768 ? 'stretch' : 'center',
            justifyContent: window.innerWidth < 768 ? 'center' : 'flex-end',
            gap: '12px',
            flexShrink: 0
          }}>
            <div style={{
              fontSize: '13px',
              color: '#000',
              fontWeight: '700',
              letterSpacing: '0.3px',
              textAlign: window.innerWidth < 768 ? 'center' : 'right',
              display: 'flex',
              alignItems: 'center',
              justifyContent: window.innerWidth < 768 ? 'center' : 'flex-end',
              gap: '8px'
            }}>
              <span>Or create your own</span>
              {window.innerWidth >= 768 && <span style={{ fontSize: '20px', fontWeight: '700' }}>→</span>}
            </div>
            {renderCustomButton(setShowBatchVideoDropdown, setShowBatchCustomVideoPromptPopup)}
          </div>

          {/* Pricing info below Custom button */}
          {!batchVideoLoading && formatCost(batchVideoCostRaw, batchVideoUSD) ? (
            <div style={{
              padding: '8px 16px 12px 16px',
              borderTop: '1px solid rgba(0, 0, 0, 0.15)',
              color: '#000',
              flexShrink: 0
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px'
              }}>
                <span style={{ fontSize: '10px', fontWeight: '500', opacity: 0.6 }}>
                  📹 {loadedPhotosCount} videos • 📐 {settings.videoResolution || '480p'} • ⏱️ {settings.videoDuration || 5}s
                </span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700' }}>
                    {(() => {
                      const formatted = formatCost(batchVideoCostRaw, batchVideoUSD);
                      const parts = formatted.split('(');
                      return parts[0].trim();
                    })()}
                  </span>
                  {(() => {
                    const formatted = formatCost(batchVideoCostRaw, batchVideoUSD);
                    const usdMatch = formatted.match(/\((.*?)\)/);
                    if (usdMatch) {
                      return (
                        <span style={{ fontWeight: '400', opacity: 0.75, fontSize: '10px' }}>
                          ≈ {usdMatch[1]}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          ) : batchVideoLoading ? (
            <div style={{
              padding: '8px 16px 12px 16px',
              fontSize: '11px',
              fontWeight: '700',
              textAlign: 'right',
              borderTop: '1px solid rgba(0, 0, 0, 0.15)',
              color: '#000',
              flexShrink: 0
            }}>
              Calculating cost...
            </div>
          ) : null}
        </div>,
        document.body
      )}

      {/* Custom Video Prompt Popup */}
      <CustomVideoPromptPopup
        visible={showCustomVideoPromptPopup}
        onGenerate={(positivePrompt, negativePrompt) => {
          // Generate video with custom prompts
          handleGenerateVideo(positivePrompt, negativePrompt);
        }}
        onClose={() => setShowCustomVideoPromptPopup(false)}
      />

      {/* Batch Custom Video Prompt Popup */}
      <CustomVideoPromptPopup
        visible={showBatchCustomVideoPromptPopup}
        onGenerate={(positivePrompt, negativePrompt) => {
          // Generate batch videos with custom prompts (only for motion video mode)
          handleBatchGenerateVideo(positivePrompt, negativePrompt);
        }}
        onClose={() => setShowBatchCustomVideoPromptPopup(false)}
      />

      {/* BASE Hero Confirmation Popup (Single) */}
      <BaseHeroConfirmationPopup
        visible={showBaseHeroPopup}
        onConfirm={handleBaseHeroVideoExecute}
        onClose={() => setShowBaseHeroPopup(false)}
        loading={baseHeroLoading}
        costRaw={baseHeroCostRaw}
        costUSD={baseHeroUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={false}
        itemCount={1}
      />

      {/* BASE Hero Confirmation Popup (Batch) */}
      <BaseHeroConfirmationPopup
        visible={showBatchBaseHeroPopup}
        onConfirm={handleBatchBaseHeroVideoExecute}
        onClose={() => setShowBatchBaseHeroPopup(false)}
        loading={batchBaseHeroLoading}
        costRaw={batchBaseHeroCostRaw}
        costUSD={batchBaseHeroUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={true}
        itemCount={loadedPhotosCount}
      />

      {/* Prompt Video Confirmation Popup (Single) */}
      <PromptVideoConfirmationPopup
        visible={showPromptVideoPopup}
        onConfirm={handlePromptVideoExecute}
        onClose={() => setShowPromptVideoPopup(false)}
        loading={promptVideoLoading}
        costRaw={promptVideoCostRaw}
        costUSD={promptVideoUSD}
        videoResolution={settings.videoResolution || '480p'}
        videoDuration={settings.videoDuration || 5}
        tokenType={tokenType}
        isBatch={false}
        itemCount={1}
      />

      {/* Prompt Video Confirmation Popup (Batch) */}
      <PromptVideoConfirmationPopup
        visible={showBatchPromptVideoPopup}
        onConfirm={handleBatchPromptVideoExecute}
        onClose={() => setShowBatchPromptVideoPopup(false)}
        loading={batchPromptVideoLoading}
        costRaw={batchPromptVideoCostRaw}
        costUSD={batchPromptVideoUSD}
        videoResolution={settings.videoResolution || '480p'}
        videoDuration={settings.videoDuration || 5}
        tokenType={tokenType}
        isBatch={true}
        itemCount={loadedPhotosCount}
      />


      {/* Custom Prompt Popup for Sample Gallery mode */}
      <CustomPromptPopup
        isOpen={showCustomPromptPopup}
        onClose={() => setShowCustomPromptPopup(false)}
        onApply={handleApplyCustomPrompt}
        currentPrompt={settings.positivePrompt || ''}
      />

      {/* Gallery Submission Confirmation Modal */}
      <GallerySubmissionConfirm
        isOpen={showGalleryConfirm}
        onConfirm={handleGallerySubmitConfirm}
        onCancel={handleGallerySubmitCancel}
        promptKey={selectedPhotoIndex !== null && photos[selectedPhotoIndex] ? (photos[selectedPhotoIndex].promptKey || photos[selectedPhotoIndex].selectedStyle) : null}
        imageUrl={selectedPhotoIndex !== null && photos[selectedPhotoIndex] && photos[selectedPhotoIndex].images ? photos[selectedPhotoIndex].images[selectedSubIndex || 0] : null}
        videoUrl={selectedPhotoIndex !== null && photos[selectedPhotoIndex] ? photos[selectedPhotoIndex].videoUrl : null}
      />

      {/* Music Modal for Transition Video Download (Beta) */}
      {/* Inline audio element - NOT USED (audio only plays in stitched video overlay) */}
      {/* Kept for potential future use but never auto-plays */}
      {false && appliedMusic && isTransitionMode && allTransitionVideosComplete && (
        <audio
          ref={inlineAudioRef}
          src={appliedMusic.audioUrl}
          crossOrigin={appliedMusic.file?.isPreset ? 'anonymous' : undefined}
          loop
          muted={true}
          style={{ display: 'none' }}
        />
      )}

      {/* Stitched Video Overlay - Shows the concatenated video */}
      {showStitchedVideoOverlay && stitchedVideoUrl && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000000,
            padding: '20px'
          }}
          onClick={() => {
            setShowStitchedVideoOverlay(false);
            if (stitchedVideoUrl) {
              URL.revokeObjectURL(stitchedVideoUrl);
              setStitchedVideoUrl(null);
            }
            // Show tip over download button after closing overlay
            setShowDownloadTip(true);
            // Hide tip after 8 seconds
            setTimeout(() => {
              setShowDownloadTip(false);
            }, 8000);
          }}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={stitchedVideoUrl}
              controls
              autoPlay
              loop
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto'
              }}
            />
            <button
              onClick={() => {
                setShowStitchedVideoOverlay(false);
                if (stitchedVideoUrl) {
                  URL.revokeObjectURL(stitchedVideoUrl);
                  setStitchedVideoUrl(null);
                }
                // Show tip over download button after closing overlay
                setShowDownloadTip(true);
                // Hide tip after 8 seconds
                setTimeout(() => {
                  setShowDownloadTip(false);
                }, 8000);
              }}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'rgba(0, 0, 0, 0.7)',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                color: '#fff',
                fontSize: '24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000001
              }}
            >
              ×
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Loading overlay for stitched video generation */}
      {isGeneratingStitchedVideo && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000000,
            flexDirection: 'column',
            gap: '20px',
            color: '#fff'
          }}
        >
          <div style={{ fontSize: '18px' }}>Generating stitched video...</div>
          <div style={{ fontSize: '14px', opacity: 0.7 }}>Please wait</div>
        </div>,
        document.body
      )}
    </div>
  );
};

PhotoGallery.propTypes = {
  photos: PropTypes.array.isRequired,
  selectedPhotoIndex: PropTypes.number,
  setSelectedPhotoIndex: PropTypes.func.isRequired,
  showPhotoGrid: PropTypes.bool.isRequired,
  handleBackToCamera: PropTypes.func.isRequired,
  handlePhotoViewerClick: PropTypes.func.isRequired,
  handleOpenImageAdjusterForNextBatch: PropTypes.func,
  handleShowControlOverlay: PropTypes.func.isRequired,
  isGenerating: PropTypes.bool.isRequired,
  keepOriginalPhoto: PropTypes.bool.isRequired,
  lastPhotoData: PropTypes.object.isRequired,
  activeProjectReference: PropTypes.object.isRequired,
  isSogniReady: PropTypes.bool.isRequired,
  toggleNotesModal: PropTypes.func.isRequired,
  setPhotos: PropTypes.func.isRequired,
  selectedStyle: PropTypes.string,
  stylePrompts: PropTypes.object,
  enhancePhoto: PropTypes.func.isRequired,
  undoEnhancement: PropTypes.func.isRequired,
  redoEnhancement: PropTypes.func.isRequired,
  sogniClient: PropTypes.object.isRequired,
  desiredWidth: PropTypes.number.isRequired,
  desiredHeight: PropTypes.number.isRequired,
  selectedSubIndex: PropTypes.number,
  handleShareToX: PropTypes.func.isRequired,
  handleShareViaWebShare: PropTypes.func,
  handleShareQRCode: PropTypes.func,
  slothicornAnimationEnabled: PropTypes.bool.isRequired,
  backgroundAnimationsEnabled: PropTypes.bool,
  tezdevTheme: PropTypes.string,
  aspectRatio: PropTypes.string,
  handleRetryPhoto: PropTypes.func,
  outputFormat: PropTypes.string,
  onPreGenerateFrame: PropTypes.func, // New prop for frame pre-generation callback
  onFramedImageCacheUpdate: PropTypes.func, // New prop for framed image cache updates
  onClearQrCode: PropTypes.func, // New prop to clear QR codes when images change
  onClearMobileShareCache: PropTypes.func, // New prop to clear mobile share cache when images change
  onRegisterFrameCacheClear: PropTypes.func, // New prop to register frame cache clearing function
  qrCodeData: PropTypes.object,
  onCloseQR: PropTypes.func,
  onUseGalleryPrompt: PropTypes.func, // New prop to handle using a gallery prompt
  // New props for prompt selector mode
  isPromptSelectorMode: PropTypes.bool,
  selectedModel: PropTypes.string,
  onPromptSelect: PropTypes.func,
  onRandomMixSelect: PropTypes.func,
  onRandomSingleSelect: PropTypes.func,
  onOneOfEachSelect: PropTypes.func,
  onCustomSelect: PropTypes.func,
  onThemeChange: PropTypes.func,
  initialThemeGroupState: PropTypes.object,
  onSearchChange: PropTypes.func,
  initialSearchTerm: PropTypes.string,
  portraitType: PropTypes.string,
  onPortraitTypeChange: PropTypes.func,
  numImages: PropTypes.number,
  authState: PropTypes.object,
  handleRefreshPhoto: PropTypes.func,
  onOutOfCredits: PropTypes.func,
  // Copy image style feature props
  onCopyImageStyleSelect: PropTypes.func,
  styleReferenceImage: PropTypes.object,
  onRemoveStyleReference: PropTypes.func,
  onEditStyleReference: PropTypes.func,
  // Vibe selector widget props
  updateStyle: PropTypes.func, // Function to update selected style
  switchToModel: PropTypes.func, // Function to switch AI model
  onNavigateToVibeExplorer: PropTypes.func, // Function to navigate to full vibe explorer
  onRegisterVideoIntroTrigger: PropTypes.func // Callback to register function that triggers video intro popup
};

export default PhotoGallery; 