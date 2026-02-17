import React, { useMemo, useCallback, useEffect, useState, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';

import PropTypes from 'prop-types';
import urls from '../../config/urls';
import { fetchS3AsBlob, fetchS3WithFallback } from '../../utils/s3FetchWithFallback';
import '../../styles/film-strip.css'; // Using film-strip.css which contains the gallery styles
import '../../styles/components/PhotoGallery.css';
import { createPolaroidImage } from '../../utils/imageProcessing';
import { downloadImageMobile, enableMobileImageDownload } from '../../utils/mobileDownload';
import { isMobile, styleIdToDisplay } from '../../utils/index';
import promptsDataRaw from '../../prompts.json';
import { THEME_GROUPS, getDefaultThemeGroupState, getEnabledPrompts } from '../../constants/themeGroups';
import { stripTransformationPrefix } from '../../constants/editPrompts';
import { getThemeGroupPreferences, saveThemeGroupPreferences, getFavoriteImages, toggleFavoriteImage, saveFavoriteImages, getBlockedPrompts, blockPrompt, hasSeenBatchVideoTip, markBatchVideoTipShown } from '../../utils/cookies';
import { getAttributionText } from '../../config/ugcAttributions';
import { isContextImageModel, SAMPLE_GALLERY_CONFIG, getQRWatermarkConfig, DEFAULT_SETTINGS } from '../../constants/settings';
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
import { generateVideo, cancelVideoGeneration, cancelAllActiveVideoProjects, getActiveVideoProjectIds, downloadVideo } from '../../services/VideoGenerator.ts';
import { getLastRecording } from '../../utils/recordingsDB';
import CancelConfirmationPopup, { useCancelConfirmation } from './CancelConfirmationPopup.tsx';
import { shouldSkipConfirmation, clearSkipConfirmation } from '../../services/cancellationService.ts';
import { 
  hasSeenVideoIntro, 
  hasGeneratedVideo, 
  formatVideoDuration, 
  hasSeenVideoTip, 
  markVideoTipShown, 
  BASE_HERO_PROMPT,
  S2V_MODELS,
  S2V_QUALITY_PRESETS,
  ANIMATE_MOVE_MODELS,
  ANIMATE_MOVE_QUALITY_PRESETS,
  ANIMATE_REPLACE_MODELS,
  ANIMATE_REPLACE_QUALITY_PRESETS
} from '../../constants/videoSettings.ts';
import VideoIntroPopup from './VideoIntroPopup.tsx';
import { playSonicLogo, warmUpAudio } from '../../utils/sonicLogos';
import CustomVideoPromptPopup from './CustomVideoPromptPopup';
import BaldForBaseConfirmationPopup from './BaldForBaseConfirmationPopup';
import PromptVideoConfirmationPopup from './PromptVideoConfirmationPopup';
import VideoSelectionPopup from './VideoSelectionPopup';
import AnimateMovePopup from './AnimateMovePopup';
import AnimateReplacePopup from './AnimateReplacePopup';
import SoundToVideoPopup from './SoundToVideoPopup';
import MusicGeneratorModal from './MusicGeneratorModal';
import ConfettiCelebration from './ConfettiCelebration';
import StitchOptionsPopup from './StitchOptionsPopup';
import VideoReviewPopup from './VideoReviewPopup';
import VideoSettingsFooter from './VideoSettingsFooter';
import CameraAnglePopup from './CameraAnglePopup';
import CameraAngleReviewPopup from './CameraAngleReviewPopup';
import SaveToLocalProjectPopup, { generateDefaultProjectName } from './SaveToLocalProjectPopup';
import { useLocalProjects } from '../../hooks/useLocalProjects';
import { extractLastFrame, extractFirstFrame } from '../../utils/videoFrameExtraction';
import { generateCameraAngle } from '../../services/CameraAngleGenerator.ts';
import {
  generateMultipleAngles,
  createAngleGenerationItems,
  markItemStarted,
  updateItemProgress,
  markItemComplete,
  markItemFailed,
  resetItemForRegeneration
} from '../../services/MultiAngleGenerator.ts';

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

// Module-level helper to load an image URL as a buffer
// Used by batch-transition generation and regeneration
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
        console.warn('[loadImageAsBuffer] Image load via fetch failed, trying canvas:', error.message);
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
        console.warn('[loadImageAsBuffer] Image failed with crossOrigin, retrying without...');
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
        position: 'absolute',
        top: 0,
        left: 0,
        // Base opacity - CSS animation will control actual opacity during loading
        // Keep this low so if animation stops, we don't get a bright flash
        opacity: 0.15,
        // Add blur to match preview thumbnails for seamless morphing transition
        filter: 'blur(5px)',
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
  handleStitchedVideoQRShare,
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
  // Props for Copy image style feature
  onCopyImageStyleSelect = null,
  styleReferenceImage = null,
  onRemoveStyleReference = null,
  onEditStyleReference = null, // Callback to open existing style reference in adjuster
  // New props for vibe selector widget
  updateStyle = null, // Function to update selected style
  switchToModel = null, // Function to switch AI model
  onNavigateToVibeExplorer = null, // Function to navigate to full vibe explorer
  onRegisterVideoIntroTrigger = null, // Callback to register function that triggers video intro popup
  onOpenLoginModal = null // Function to open the login modal
}) => {
  // Get settings from context
  const { settings, updateSetting } = useApp();
  const { isAuthenticated } = useSogniAuth();
  const { tokenType } = useWallet();
  const tokenLabel = getTokenLabel(tokenType);

  // Local projects hook for saving images to local storage
  const { createProject: createLocalProject, addImages: addLocalImages, isSupported: isLocalProjectsSupported } = useLocalProjects();

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

  // Cost estimation for Z-Image Turbo enhancement (one-click image enhance)
  // Z-Image Turbo uses the image as a guide/starting image for enhancement
  const { loading: kreaLoading, formattedCost: kreaCost, costInUSD: kreaUSD } = useCostEstimation({
    model: 'z_image_turbo_bf16',
    imageCount: 1,
    stepCount: 6, // Z-Image Turbo uses 6 steps (from PhotoEnhancer)
    guidance: 3.5, // Z-Image Turbo uses 3.5 guidance (from PhotoEnhancer)
    scheduler: 'DPM++ SDE',
    network: 'fast',
    previewCount: 0, // Typically has no previews
    contextImages: 0, // Not using Qwen Image Edit
    cnEnabled: false, // Not using ControlNet
    guideImage: true, // Using guide/starting image for enhancement
    denoiseStrength: 0.75 // Starting image strength (1 - 0.75 = 0.25 denoise)
  });

  // Cost estimation for context image edit enhancement (AI-guided enhancement)
  // Context image models (Qwen, Flux) use the image as a context/reference image
  const { loading: editModelLoading, formattedCost: editModelCost, costInUSD: editModelUSD } = useCostEstimation({
    model: 'qwen_image_edit_2511_fp8_lightning',
    imageCount: 1,
    stepCount: 5, // Qwen Image Edit Lightning uses 5 steps
    guidance: 1, // Qwen Image Edit 2511 Lightning default guidance is 1 (max 2)
    scheduler: 'DPM++ SDE',
    network: 'fast',
    previewCount: 10,
    contextImages: 1, // Using 1 context image reference
    cnEnabled: false, // Not using ControlNet
    guideImage: false // Not using guide image (uses contextImages instead)
  });

  // Video generation state
  const [showVideoDropdown, setShowVideoDropdown] = useState(false);
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
  const [showTransitionPromptPopup, setShowTransitionPromptPopup] = useState(false); // Popup to edit transition prompt for Infinite Loop
  const [showBaldForBasePopup, setShowBaldForBasePopup] = useState(false); // Popup before Bald for Base video generation (single)
  const [showBatchBaldForBasePopup, setShowBatchBaldForBasePopup] = useState(false); // Popup before Bald for Base video generation (batch)
  const [showPromptVideoPopup, setShowPromptVideoPopup] = useState(false); // Popup before Prompt Video generation (single)
  const [showBatchPromptVideoPopup, setShowBatchPromptVideoPopup] = useState(false); // Popup before Prompt Video generation (batch)
  const [showVideoSelectionPopup, setShowVideoSelectionPopup] = useState(false); // New video selection popup
  const [isVideoSelectionBatch, setIsVideoSelectionBatch] = useState(false); // Track if selection popup is from batch
  // New video workflow popup states
  const [showAnimateMovePopup, setShowAnimateMovePopup] = useState(false); // Single Animate Move popup
  const [showBatchAnimateMovePopup, setShowBatchAnimateMovePopup] = useState(false); // Batch Animate Move popup
  const [showAnimateReplacePopup, setShowAnimateReplacePopup] = useState(false); // Single Animate Replace popup
  const [showBatchAnimateReplacePopup, setShowBatchAnimateReplacePopup] = useState(false); // Batch Animate Replace popup
  const [showS2VPopup, setShowS2VPopup] = useState(false); // Single Sound to Video popup
  const [showBatchS2VPopup, setShowBatchS2VPopup] = useState(false); // Batch Sound to Video popup

  // Camera Angle popup states
  const [showCameraAnglePopup, setShowCameraAnglePopup] = useState(false);
  const [isCameraAngleBatch, setIsCameraAngleBatch] = useState(false);

  // Multi-angle camera generation states
  const [showMultiAngleReview, setShowMultiAngleReview] = useState(false);
  const [multiAngleItems, setMultiAngleItems] = useState([]);
  const [multiAngleSourcePhoto, setMultiAngleSourcePhoto] = useState(null);
  const [multiAngleKeepOriginal, setMultiAngleKeepOriginal] = useState(true);
  const [multiAngleSourceUrl, setMultiAngleSourceUrl] = useState(null);
  const multiAngleAbortRef = useRef(false);

  // Model variant states for cost estimation in new workflow popups
  const [animateMoveModelVariant, setAnimateMoveModelVariant] = useState('speed');
  const [animateReplaceModelVariant, setAnimateReplaceModelVariant] = useState('speed');
  const [s2vModelVariant, setS2vModelVariant] = useState('speed');
  
  // Duration states for cost estimation in new workflow popups
  const [animateMoveDuration, setAnimateMoveDuration] = useState(5);
  const [animateReplaceDuration, setAnimateReplaceDuration] = useState(5);
  const [s2vDuration, setS2vDuration] = useState(5);
  const [autoTriggerBaldForBaseAfterGeneration, setAutoTriggerBaldForBaseAfterGeneration] = useState(false); // Auto-trigger Bald for Base after photo generation
  const [hasSeenGenerationStart, setHasSeenGenerationStart] = useState(false); // Track if we've seen generation start
  const previousPhotoCountRef = useRef(0); // Track previous photo count to detect when new photos are added

  // Save to Local Project Popup state
  const [showSaveToLocalProjectPopup, setShowSaveToLocalProjectPopup] = useState(false);
  const [isSavingToLocalProject, setIsSavingToLocalProject] = useState(false);

  // Stitch Options Popup state (for Infinite Loop feature)
  const [showStitchOptionsPopup, setShowStitchOptionsPopup] = useState(false);
  const [isGeneratingInfiniteLoop, setIsGeneratingInfiniteLoop] = useState(false);
  const [infiniteLoopProgress, setInfiniteLoopProgress] = useState(null); // { phase, current, total, message, transitionStatus }
  const [cachedInfiniteLoopBlob, setCachedInfiniteLoopBlob] = useState(null);
  const [cachedInfiniteLoopHash, setCachedInfiniteLoopHash] = useState(null);
  const [cachedInfiniteLoopUrl, setCachedInfiniteLoopUrl] = useState(null); // Stable URL to prevent re-renders from restarting video
  const [showInfiniteLoopPreview, setShowInfiniteLoopPreview] = useState(false);
  const infiniteLoopVideoRef = useRef(null);
  const infiniteLoopCancelledRef = useRef(false); // Track if infinite loop was cancelled
  
  // Transition review state (for reviewing/regenerating individual transitions before stitching)
  const [showTransitionReview, setShowTransitionReview] = useState(false);
  const [pendingTransitions, setPendingTransitions] = useState([]); // Array of { url, index, fromVideoIndex, toVideoIndex, status }
  const [transitionReviewData, setTransitionReviewData] = useState(null); // { photosWithVideos, lastFrames, firstFrames, transitionFrames, etc. }
  // Track multiple regenerating transitions and their progress (Set and Map for multi-regeneration support)
  const [regeneratingTransitionIndices, setRegeneratingTransitionIndices] = useState(new Set());
  const [transitionRegenerationProgresses, setTransitionRegenerationProgresses] = useState(new Map());
  // Track the previous video URL when starting regeneration (to detect actual completion vs stale state)
  const transitionPreviousVideoUrlsRef = useRef(new Map());

  // Segment review state (for montage modes: S2V, Animate Move, Animate Replace, Batch Transition)
  const [showSegmentReview, setShowSegmentReview] = useState(false);
  const [pendingSegments, setPendingSegments] = useState([]); // Array of { url, index, photoId, status, thumbnail }
  const [segmentReviewData, setSegmentReviewData] = useState(null); // { workflowType, photoIds, regenerateParams, etc. }
  // Track multiple regenerating segments and their progress (Map: segmentIndex -> progress object)
  const [regeneratingSegmentIndices, setRegeneratingSegmentIndices] = useState(new Set());
  const [segmentRegenerationProgresses, setSegmentRegenerationProgresses] = useState(new Map());
  // Track the previous video URL when starting regeneration (to detect actual completion vs stale state)
  const segmentPreviousVideoUrlsRef = useRef(new Map());
  // Version history tracking: Map of segmentIndex -> array of successful video URLs (for back/forward navigation)
  const [segmentVersionHistories, setSegmentVersionHistories] = useState(new Map()); // Map<segmentIndex, string[]>
  // Track which version is currently selected for each segment (for stitching and display)
  const [selectedSegmentVersions, setSelectedSegmentVersions] = useState(new Map()); // Map<segmentIndex, versionIndex>
  // Per-segment progress tracking arrays (mirrors infiniteLoopProgress structure)
  const [segmentProgress, setSegmentProgress] = useState(null); // { itemETAs, itemProgress, itemWorkers, itemStatuses, itemElapsed }
  // Track active montage batch for completion detection
  const [activeMontagePhotoIds, setActiveMontagePhotoIds] = useState(null); // Array of photo IDs in current batch
  const [activeMontageWorkflowType, setActiveMontageWorkflowType] = useState(null); // 's2v' | 'animate-move' | 'animate-replace' | 'batch-transition'
  const montageCompletedRef = useRef(new Set()); // Track which photo IDs have completed in current batch

  // Cancel confirmation popup state
  const {
    showPopup: showCancelConfirmation,
    pendingCancel,
    requestCancel,
    updateProgress: updateCancelProgress,
    dismissIfComplete: dismissCancelPopup,
    handleClose: handleCancelConfirmationClose,
    handleConfirm: handleCancelConfirmationConfirm
  } = useCancelConfirmation();
  const [cancelRateLimited, setCancelRateLimited] = useState(false);
  const [cancelCooldownSeconds, setCancelCooldownSeconds] = useState(0);

  // Check if any videos are currently generating (for showing cancel button during batch video ops)
  const hasGeneratingVideos = photos.some(p => !p.hidden && p.generatingVideo);
  
  // Recalculate isGenerating based on current photos state to avoid stale prop values
  const hasGeneratingPhotos = photos.some(p => !p.hidden && (p.generating || p.loading));

  // Check if infinite loop transitions are generating (not tracked in photos array)
  const hasGeneratingInfiniteLoopTransitions = pendingTransitions?.some(t => t.status === 'generating') ?? false;

  // Auto-dismiss cancel popup when generation completes (nothing left to cancel)
  useEffect(() => {
    if (showCancelConfirmation && !hasGeneratingPhotos && !activeProjectReference?.current && !hasGeneratingVideos && !hasGeneratingInfiniteLoopTransitions) {
      dismissCancelPopup();
    }
  }, [showCancelConfirmation, hasGeneratingPhotos, activeProjectReference, hasGeneratingVideos, hasGeneratingInfiniteLoopTransitions, dismissCancelPopup]);

  // Update cancel popup progress dynamically as photos/videos complete
  // Uses pendingCancel.projectType to determine whether to calculate image or video progress
  const cancelProjectType = pendingCancel?.projectType;
  useEffect(() => {
    if (!showCancelConfirmation || !cancelProjectType) return;
    
    if (cancelProjectType === 'video') {
      // Calculate video progress - count videos completed vs generating
      const completedVideos = photos.filter(p => !p.hidden && p.videoUrl && !p.generatingVideo);
      const generatingVideos = photos.filter(p => !p.hidden && p.generatingVideo);
      
      const completedCount = completedVideos.length;
      const totalCount = completedCount + generatingVideos.length;
      
      // For videos, use videoProgress if available, otherwise estimate
      let totalProgress = completedCount * 100;
      generatingVideos.forEach(p => {
        totalProgress += (p.videoProgress || 0);
      });
      const averageProgress = totalCount > 0 ? totalProgress / totalCount : 0;
      
      updateCancelProgress(averageProgress, completedCount, totalCount);
    } else {
      // Calculate image progress (default)
      const completedPhotos = photos.filter(p => !p.hidden && !p.loading && !p.generating && !p.error && p.images && p.images.length > 0 && !p.isOriginal);
      const generatingPhotos = photos.filter(p => !p.hidden && (p.loading || p.generating));
      
      const completedCount = completedPhotos.length;
      const totalCount = completedCount + generatingPhotos.length;
      
      // Calculate weighted progress including partial progress of in-progress items
      // Each completed photo = 100%, each generating photo = its progress%
      let totalProgress = completedCount * 100;
      generatingPhotos.forEach(p => {
        totalProgress += (p.progress || 0);
      });
      const averageProgress = totalCount > 0 ? totalProgress / totalCount : 0;
      
      updateCancelProgress(averageProgress, completedCount, totalCount);
    }
  }, [showCancelConfirmation, cancelProjectType, photos, updateCancelProgress]);

  // Track retry attempts for montage mode video generation
  // Key: photo.id, Value: number of retry attempts
  const videoRetryAttempts = useRef(new Map());

  // Refs for montage auto-stitch (declared here, effect is after state declarations)
  const montageAutoStitchInProgressRef = useRef(false);
  const montageStitchCompletedRef = useRef(false); // Prevents re-stitching after completion
  // Store audio/video source info for montage stitching (mutes individual clips, uses single parent audio)
  // For S2V: { type: 's2v', audioBuffer, audioUrl, startOffset, duration }
  // For Animate Move/Replace: { type: 'animate-move'|'animate-replace', videoBuffer, videoUrl, startOffset, duration }
  const activeMontageAudioSourceRef = useRef(null);

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
  const loadedPhotos = photos.filter(
    photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
  );
  const loadedPhotosCount = loadedPhotos.length;

  // Array of source photo URLs for batch operations (e.g., camera angle popup)
  const loadedPhotoUrls = useMemo(() => {
    return loadedPhotos.map(photo =>
      photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl
    );
  }, [loadedPhotos]);
  
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

  // Bald for Base video cost estimation (single) - enabled when popup is shown, always 5 seconds
  const { loading: baldForBaseLoading, cost: baldForBaseCostRaw, costInUSD: baldForBaseUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: 5, // Bald for Base videos are always 5 seconds
    enabled: isAuthenticated && selectedPhoto !== null && showBaldForBasePopup,
    photoId: selectedPhotoIndex
  });

  // Bald for Base video cost estimation (batch) - enabled when popup is shown, always 5 seconds
  const { loading: batchBaldForBaseLoading, cost: batchBaldForBaseCostRaw, costInUSD: batchBaldForBaseUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: 5, // Bald for Base videos are always 5 seconds
    enabled: isAuthenticated && loadedPhotosCount > 0 && showBatchBaldForBasePopup,
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

  // Animate Move cost estimation (single) - enabled when popup is shown
  const animateMoveConfig = animateMoveModelVariant === 'speed' 
    ? ANIMATE_MOVE_QUALITY_PRESETS.fast 
    : ANIMATE_MOVE_QUALITY_PRESETS.quality;
  const { loading: animateMoveLoading, cost: animateMoveCostRaw, costInUSD: animateMoveUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: animateMoveDuration, // Use popup duration state
    enabled: isAuthenticated && selectedPhoto !== null && showAnimateMovePopup,
    photoId: selectedPhotoIndex,
    modelId: ANIMATE_MOVE_MODELS[animateMoveModelVariant],
    steps: animateMoveConfig.steps
  });

  // Animate Move cost estimation (batch) - enabled when popup is shown
  const { loading: batchAnimateMoveLoading, cost: batchAnimateMoveCostRaw, costInUSD: batchAnimateMoveUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: animateMoveDuration, // Use popup duration state
    enabled: isAuthenticated && loadedPhotosCount > 0 && showBatchAnimateMovePopup,
    jobCount: loadedPhotosCount,
    modelId: ANIMATE_MOVE_MODELS[animateMoveModelVariant],
    steps: animateMoveConfig.steps
  });

  // Animate Replace cost estimation (single) - enabled when popup is shown
  const animateReplaceConfig = animateReplaceModelVariant === 'speed'
    ? ANIMATE_REPLACE_QUALITY_PRESETS.fast
    : ANIMATE_REPLACE_QUALITY_PRESETS.quality;
  const { loading: animateReplaceLoading, cost: animateReplaceCostRaw, costInUSD: animateReplaceUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: animateReplaceDuration, // Use popup duration state
    enabled: isAuthenticated && selectedPhoto !== null && showAnimateReplacePopup,
    photoId: selectedPhotoIndex,
    modelId: ANIMATE_REPLACE_MODELS[animateReplaceModelVariant],
    steps: animateReplaceConfig.steps
  });

  // Animate Replace cost estimation (batch) - enabled when popup is shown
  const { loading: batchAnimateReplaceLoading, cost: batchAnimateReplaceCostRaw, costInUSD: batchAnimateReplaceUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: animateReplaceDuration, // Use popup duration state
    enabled: isAuthenticated && loadedPhotosCount > 0 && showBatchAnimateReplacePopup,
    jobCount: loadedPhotosCount,
    modelId: ANIMATE_REPLACE_MODELS[animateReplaceModelVariant],
    steps: animateReplaceConfig.steps
  });

  // Sound to Video cost estimation (single) - enabled when popup is shown
  const s2vConfig = s2vModelVariant === 'speed'
    ? S2V_QUALITY_PRESETS.fast
    : S2V_QUALITY_PRESETS.quality;
  const { loading: s2vLoading, cost: s2vCostRaw, costInUSD: s2vUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: s2vDuration, // Use popup duration state
    enabled: isAuthenticated && selectedPhoto !== null && showS2VPopup,
    photoId: selectedPhotoIndex,
    modelId: S2V_MODELS[s2vModelVariant],
    steps: s2vConfig.steps
  });

  // Sound to Video cost estimation (batch) - enabled when popup is shown
  const { loading: batchS2VLoading, cost: batchS2VCostRaw, costInUSD: batchS2VUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: s2vDuration, // Use popup duration state
    enabled: isAuthenticated && loadedPhotosCount > 0 && showBatchS2VPopup,
    jobCount: loadedPhotosCount,
    modelId: S2V_MODELS[s2vModelVariant],
    steps: s2vConfig.steps
  });

  // Infinite Loop cost estimation - enabled when stitch popup is shown
  // This estimates the cost of generating transition videos (one per segment)
  const photosWithVideosCount = photos.filter(
    photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
  ).length;
  const { loading: infiniteLoopCostLoading, cost: infiniteLoopCostRaw, costInUSD: infiniteLoopUSD } = useVideoCostEstimation({
    imageWidth: desiredWidth || 768,
    imageHeight: desiredHeight || 1024,
    resolution: settings.videoResolution || '480p',
    quality: settings.videoQuality || 'fast',
    fps: settings.videoFramerate || 16,
    duration: settings.videoDuration || 5,
    enabled: isAuthenticated && photosWithVideosCount >= 2 && showStitchOptionsPopup,
    jobCount: photosWithVideosCount // One transition per segment
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

  // eslint-disable-next-line no-unused-vars
  const [showCopyStyleTooltip, setShowCopyStyleTooltip] = useState(false); // Legacy - can be removed
  
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
  const animeVideoRef = useRef(null);

  // Anime video playlist - update video source when index changes (gapless transitions)
  useEffect(() => {
    const animeVideos = [
      `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw.mp4`,
      `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw2.mp4`
    ];
    
    if (animeVideoRef.current && animeVideos[currentVideoIndex]) {
      const video = animeVideoRef.current;
      const newSrc = animeVideos[currentVideoIndex];
      
      // Only update if the source is different to avoid unnecessary reloads
      if (video.src !== newSrc && !video.src.endsWith(newSrc.split('/').pop())) {
        // Pause and reset before changing source
        video.pause();
        video.currentTime = 0;
        
        // Set new source and load
        video.src = newSrc;
        video.load();
        
        // Play after video is ready (using canplay event) - seamless transition
        const playWhenReady = () => {
          if (animeVideoRef.current && animeVideoRef.current.src === newSrc) {
            animeVideoRef.current.play().catch(() => {});
          }
        };
        
        video.addEventListener('canplay', playWhenReady, { once: true });
      }
    }
  }, [currentVideoIndex]);
  
  // State for AI-generated video playback (separate from easter egg videos)
  // Use a Set to allow multiple videos to play simultaneously (since videos are muted)
  const [playingGeneratedVideoIds, setPlayingGeneratedVideoIds] = useState(new Set());
  
  // Track S2V videos that need user interaction to play with audio
  const [s2vVideosNeedingClick, setS2vVideosNeedingClick] = useState(new Set());
  
  // Track which video currently has audio unmuted (only one at a time)
  const [unmutedVideoId, setUnmutedVideoId] = useState(null);
  
  // Track which s2v videos have played audio once (so we can auto-mute after first play)
  const [s2vVideosPlayedOnce, setS2vVideosPlayedOnce] = useState(new Set());
  
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
  const [hasShownInfiniteLoopTipThisBatch, setHasShownInfiniteLoopTipThisBatch] = useState(false);
  const [stitchedVideoMuted, setStitchedVideoMuted] = useState(false);
  const [stitchedVideoReturnToSegmentReview, setStitchedVideoReturnToSegmentReview] = useState(false); // Track if we should return to segment review on close
  const stitchedVideoRef = useRef(null);

  // Handle autoplay with audio when stitched video overlay opens
  // Browsers may block autoplay with audio, so we try to play and fallback to muted
  useEffect(() => {
    if (!showStitchedVideoOverlay || !stitchedVideoUrl || !stitchedVideoRef.current) {
      return;
    }

    const video = stitchedVideoRef.current;

    // Reset muted state for new video
    setStitchedVideoMuted(false);
    video.muted = false;

    // Try to play with audio
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        // Autoplay was prevented - likely due to browser policy
        console.log('[Stitched Video] Autoplay with audio blocked, falling back to muted:', error.message);

        // Mute and try again
        video.muted = true;
        setStitchedVideoMuted(true);
        video.play().catch(() => {
          // Even muted play failed - user will need to interact
          console.log('[Stitched Video] Even muted autoplay blocked');
        });
      });
    }
  }, [showStitchedVideoOverlay, stitchedVideoUrl]);

  // State for caching stitched video blob (works with any workflow, not just transition mode)
  const [cachedStitchedVideoBlob, setCachedStitchedVideoBlob] = useState(null);
  const [cachedStitchedVideoPhotosHash, setCachedStitchedVideoPhotosHash] = useState(null);

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
  // Track browser state (collapsible preset list with preview)
  const [showTrackBrowser, setShowTrackBrowser] = useState(false);
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const [trackPreviewingId, setTrackPreviewingId] = useState(null);
  const [isTrackPreviewPlaying, setIsTrackPreviewPlaying] = useState(false);
  const [showTransitionMusicGenerator, setShowTransitionMusicGenerator] = useState(false);
  const trackPreviewAudioRef = useRef(null);
  const musicFileInputRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const audioContextRef = useRef(null);
  const playbackAnimationRef = useRef(null);
  const musicStartOffsetRef = useRef(0); // Track current offset for animation frame access
  const videoDurationRef = useRef(0); // Track current video duration for animation frame access
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
  
  // Clear the "skip cancel confirmation" cookie on mount so users see the popup
  // This ensures new users and users who had the old default always see the confirmation
  useEffect(() => {
    clearSkipConfirmation();
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

  // Reload theme state when model changes (to reflect auto-toggle of Image Edit Styles)
  useEffect(() => {
    if (isPromptSelectorMode && selectedModel) {
      const saved = getThemeGroupPreferences();
      const defaultState = getDefaultThemeGroupState();
      const newThemeState = { ...defaultState, ...saved };
      setThemeGroupState(newThemeState);
    }
  }, [isPromptSelectorMode, selectedModel]);

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

  // State for slideshow download button dropdown
  const [showSlideshowDownloadDropdown, setShowSlideshowDownloadDropdown] = useState(false);

  // State for batch video mode tutorial tip
  const [showBatchVideoTip, setShowBatchVideoTip] = useState(false);

  // State for gallery submission
  const [showGalleryConfirm, setShowGalleryConfirm] = useState(false);
  const [gallerySubmissionPending, setGallerySubmissionPending] = useState(false);
  
  // Get user authentication state for gallery submissions
  const { user } = useSogniAuth();
  
  // Get toast notification system
  const { showToast } = useToastContext();

  // Detect montage batch completion - auto-stitch and show final video
  // (User can click "Remix Video" to review/regenerate segments)
  useEffect(() => {
    // Only check if we have an active montage batch
    if (!activeMontagePhotoIds || activeMontagePhotoIds.length === 0) {
      return;
    }

    // Prevent duplicate stitching - check all guards
    if (montageAutoStitchInProgressRef.current || montageStitchCompletedRef.current) {
      return;
    }

    // Also skip if segment review or overlay is showing
    if (showStitchedVideoOverlay || showSegmentReview) {
      return;
    }
    
    // Skip if we already have pendingSegments (new unified flow shows VideoReviewPopup immediately)
    // This means we're using the new flow where user manually clicks "Stitch All"
    if (pendingSegments && pendingSegments.length > 0) {
      console.log('[Montage] Skipping auto-stitch - using manual VideoReviewPopup flow');
      return;
    }

    // Check if all montage photos have completed videos (not generating)
    const montagePhotos = photos.filter(p => activeMontagePhotoIds.includes(p.id));
    const allComplete = montagePhotos.every(p => p.videoUrl && !p.generatingVideo);
    const anyGenerating = montagePhotos.some(p => p.generatingVideo);

    // If all complete and not generating, auto-stitch and show final video
    // (This path is only for legacy flows that don't use VideoReviewPopup)
    if (allComplete && !anyGenerating && montagePhotos.length === activeMontagePhotoIds.length) {
      console.log(`[Montage] All ${montagePhotos.length} segments complete, auto-stitching (legacy flow)...`);
      montageAutoStitchInProgressRef.current = true;
      montageStitchCompletedRef.current = true; // Mark as completed to prevent loops

      // Capture workflow type and audio source before they might change
      const currentWorkflowType = activeMontageWorkflowType;
      const audioSource = activeMontageAudioSourceRef.current;
      console.log('[Montage Complete] Captured audioSource from ref:', audioSource);

      // Build segments array for later remix (in order of activeMontagePhotoIds)
      const segmentsForReview = activeMontagePhotoIds.map((photoId, index) => {
        const photo = photos.find(p => p.id === photoId);
        return {
          url: photo?.videoUrl || '',
          index,
          photoId,
          status: 'ready',
          thumbnail: photo?.enhancedImageUrl || photo?.images?.[0] || photo?.originalDataUrl
        };
      });

      // Store segments and workflow data for remix functionality (including audio source for re-stitching)
      console.log('[Montage Complete] Setting segmentReviewData with audioSource:', audioSource);
      setPendingSegments(segmentsForReview);
      setSegmentReviewData({
        workflowType: currentWorkflowType,
        photoIds: [...activeMontagePhotoIds], // Copy to preserve
        photos: montagePhotos,
        audioSource: audioSource // Store audio/video source info for stitching with parent audio
      });

      // Clear active montage tracking now to prevent re-triggering
      // (segment data is preserved for remix)
      setActiveMontagePhotoIds(null);
      setActiveMontageWorkflowType(null);
      activeMontageAudioSourceRef.current = null; // Clear after capturing

      // Auto-stitch the segments with parent audio (muting individual clip audio)
      (async () => {
        try {
          setIsGeneratingStitchedVideo(true);
          setBulkDownloadProgress({
            current: 0,
            total: segmentsForReview.length,
            message: 'Stitching segments together...'
          });

          const videosToStitch = segmentsForReview.map((segment, index) => ({
            url: segment.url,
            filename: `segment-${index + 1}.mp4`
          }));

          // Prepare audio options from the stored audio source (for parent audio overlay)
          let audioOptions = null;
          if (audioSource) {
            try {
              if (audioSource.type === 's2v') {
                // For S2V: Use the audio file directly
                setBulkDownloadProgress({ current: 0, total: segmentsForReview.length, message: 'Preparing audio track...' });
                
                // Convert Uint8Array to ArrayBuffer properly
                let audioBuffer = audioSource.audioBuffer;
                if (audioBuffer instanceof Uint8Array) {
                  // Slice to create a clean ArrayBuffer (handles byte offset issues)
                  audioBuffer = audioBuffer.buffer.slice(
                    audioBuffer.byteOffset,
                    audioBuffer.byteOffset + audioBuffer.byteLength
                  );
                }
                
                if (audioBuffer) {
                  audioOptions = {
                    buffer: audioBuffer,
                    startOffset: audioSource.startOffset || 0
                  };
                  console.log(`[Montage] Using S2V audio: offset=${audioSource.startOffset}s, duration=${audioSource.duration}s, bufferSize=${audioBuffer.byteLength}`);
                }
              } else if (audioSource.type === 'animate-move' || audioSource.type === 'animate-replace') {
                // For Animate Move/Replace: Extract audio from the source video
                setBulkDownloadProgress({ current: 0, total: segmentsForReview.length, message: 'Extracting audio from source video...' });
                
                // Convert Uint8Array to ArrayBuffer properly
                let videoBuffer = audioSource.videoBuffer;
                if (videoBuffer instanceof Uint8Array) {
                  // Slice to create a clean ArrayBuffer (handles byte offset issues)
                  videoBuffer = videoBuffer.buffer.slice(
                    videoBuffer.byteOffset,
                    videoBuffer.byteOffset + videoBuffer.byteLength
                  );
                }
                
                if (videoBuffer) {
                  audioOptions = {
                    buffer: videoBuffer,
                    startOffset: audioSource.startOffset || 0,
                    isVideoSource: true // Flag to indicate this is a video file to extract audio from
                  };
                  console.log(`[Montage] Using ${audioSource.type} video audio: offset=${audioSource.startOffset}s, duration=${audioSource.duration}s, bufferSize=${videoBuffer.byteLength}`);
                }
              }
            } catch (audioError) {
              console.warn('[Montage] Failed to prepare audio options, continuing without parent audio:', audioError);
              // Continue without audio rather than failing
            }
          }

          const concatenatedBlob = await concatenateVideos(
            videosToStitch,
            (current, total, message) => {
              setBulkDownloadProgress({ current, total, message });
            },
            audioOptions, // Pass audio options to mux parent audio track
            false // Don't preserve source audio from individual clips (we're using parent audio)
          );

          // Create blob URL and show video overlay directly
          const blobUrl = URL.createObjectURL(concatenatedBlob);
          setStitchedVideoUrl(blobUrl);

          setIsGeneratingStitchedVideo(false);
          setBulkDownloadProgress({ current: 0, total: 0, message: '' });

          // Close segment review and show video overlay directly (user already reviewed segments)
          setShowSegmentReview(false);
          setShowStitchedVideoOverlay(true);

        } catch (error) {
          console.error('[Montage] Auto-stitch failed:', error);
          // Only show toast for final error (not individual retry errors)
          showToast({
            title: 'oops! stitching didn\'t work 😅',
            message: 'try using remix to regenerate segments and we\'ll try again!',
            type: 'error'
          });
          setIsGeneratingStitchedVideo(false);
          setBulkDownloadProgress({ current: 0, total: 0, message: '' });
          // Reset the completed flag so user can try again after fixing
          montageStitchCompletedRef.current = false;
        } finally {
          montageAutoStitchInProgressRef.current = false;
        }
      })();
    }
  }, [photos, activeMontagePhotoIds, activeMontageWorkflowType, showStitchedVideoOverlay, showSegmentReview, showToast, pendingSegments]);

  // FIX 2: Ensure segmentReviewData.audioSource is populated from the ref when all segments complete
  // This is a backup in case FIX 1 didn't work (e.g., data was set in wrong order)
  useEffect(() => {
    // Only run if we have segmentReviewData but no audioSource
    if (!segmentReviewData || segmentReviewData.audioSource) {
      return;
    }

    // Only run if we have a ref with audio source data
    if (!activeMontageAudioSourceRef.current) {
      return;
    }

    // Only run for montage workflow types that need audio replacement
    const workflowType = segmentReviewData.workflowType;
    if (!['animate-move', 'animate-replace', 's2v'].includes(workflowType)) {
      return;
    }

    // Check if all segments are ready (complete)
    const allSegmentsReady = pendingSegments &&
      pendingSegments.length > 0 &&
      pendingSegments.every(s => s.status === 'ready' || s.url);

    if (allSegmentsReady || pendingSegments?.length > 0) {
      // Copy audioSource from ref to segmentReviewData
      const audioSource = activeMontageAudioSourceRef.current;
      setSegmentReviewData(prev => ({
        ...prev,
        audioSource: audioSource
      }));
    }
  }, [segmentReviewData, pendingSegments]);

  // Sync photo progress to segmentProgress for the VideoReviewPopup
  // This extracts ETA, worker name, progress, status, elapsed time from each photo
  useEffect(() => {
    // Only sync if segment review is showing and we have pending segments
    if (!showSegmentReview || !pendingSegments || pendingSegments.length === 0) {
      setSegmentProgress(null);
      return;
    }

    // Check if any segments are generating (need progress tracking)
    const anyGenerating = pendingSegments.some(s => s.status === 'generating' || s.status === 'regenerating');
    if (!anyGenerating) {
      // All done, clear progress
      setSegmentProgress(null);
      return;
    }

    // Extract progress from photos for each segment
    const itemETAs = [];
    const itemProgress = [];
    const itemWorkers = [];
    const itemStatuses = [];
    const itemElapsed = [];

    pendingSegments.forEach(segment => {
      const photo = photos.find(p => p.id === segment.photoId);
      if (photo && photo.generatingVideo) {
        itemETAs.push(photo.videoETA || 0);
        itemProgress.push(photo.videoProgress || 0);
        itemWorkers.push(photo.videoWorkerName || '');
        itemStatuses.push(photo.videoStatus || '');
        itemElapsed.push(photo.videoElapsed || 0);
      } else {
        // Segment not generating, use defaults
        itemETAs.push(0);
        itemProgress.push(0);
        itemWorkers.push('');
        itemStatuses.push('');
        itemElapsed.push(0);
      }
    });

    setSegmentProgress({
      itemETAs,
      itemProgress,
      itemWorkers,
      itemStatuses,
      itemElapsed
    });
  }, [showSegmentReview, pendingSegments, photos]);

  // Populate segment data for Batch Transition when complete (for Remix functionality)
  // This doesn't auto-stitch - Batch Transition uses its own notification/stitch flow
  useEffect(() => {
    // Only run when all transition videos complete
    if (!allTransitionVideosComplete || transitionVideoQueue.length === 0) {
      return;
    }

    // Don't re-populate if we already have segment data
    if (pendingSegments.length > 0 && segmentReviewData?.workflowType === 'batch-transition') {
      return;
    }

    // Build segments from the transition video queue
    const segmentsForRemix = transitionVideoQueue.map((photoId, index) => {
      const photo = photos.find(p => p.id === photoId);
      return {
        url: photo?.videoUrl || '',
        index,
        photoId,
        status: 'ready',
        thumbnail: photo?.enhancedImageUrl || photo?.images?.[0] || photo?.originalDataUrl
      };
    }).filter(s => s.url); // Only include photos that have videos

    if (segmentsForRemix.length > 0) {
      console.log(`[Batch Transition] Populating segment data for Remix (${segmentsForRemix.length} segments)`);
      setPendingSegments(segmentsForRemix);
      setSegmentReviewData({
        workflowType: 'batch-transition',
        photoIds: [...transitionVideoQueue],
        photos: photos.filter(p => transitionVideoQueue.includes(p.id))
      });

      // Initialize version histories with existing URLs for Remix mode
      // This enables version navigation when reopening the popup after videos are already complete
      const initialVersionHistories = new Map();
      const initialSelectedVersions = new Map();
      segmentsForRemix.forEach((segment, index) => {
        if (segment.url) {
          initialVersionHistories.set(index, [segment.url]);
          initialSelectedVersions.set(index, 0);
        }
      });
      setSegmentVersionHistories(initialVersionHistories);
      setSelectedSegmentVersions(initialSelectedVersions);
    }
  }, [allTransitionVideosComplete, transitionVideoQueue, photos, pendingSegments, segmentReviewData]);
  
  // State to track if gallery carousel has entries
  const [hasGalleryEntries, setHasGalleryEntries] = useState(false);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMoreDropdown && !e.target.closest('.batch-download-button-container') && !e.target.closest('.more-dropdown-menu')) {
        setShowMoreDropdown(false);
      }
      if (showBatchVideoDropdown && !e.target.closest('.batch-video-button-container') && !e.target.closest('.batch-video-dropdown')) {
        setShowBatchVideoDropdown(false);
      }
      if (showBatchVideoTip && !e.target.closest('.batch-video-tip-tooltip')) {
        setShowBatchVideoTip(false);
        markBatchVideoTipShown();
      }
      if (showSlideshowDownloadDropdown && !e.target.closest('.slideshow-download-button-container') && !e.target.closest('.slideshow-download-dropdown')) {
        setShowSlideshowDownloadDropdown(false);
      }
    };

    if (showMoreDropdown || showBatchVideoDropdown || showBatchVideoTip || showSlideshowDownloadDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMoreDropdown, showBatchVideoDropdown, showBatchVideoTip, showSlideshowDownloadDropdown]);
  
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

      // Clear stitched video cache for new batch
      setCachedStitchedVideoBlob(null);
      setCachedStitchedVideoPhotosHash(null);
      
      // Reset infinite loop tip flag for new batch (when actual batch change is detected)
      setHasShownInfiniteLoopTipThisBatch(false);
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

    // Clear stitched video cache for new batch
    setCachedStitchedVideoBlob(null);
    setCachedStitchedVideoPhotosHash(null);
    
    // Note: We DON'T reset hasShownInfiniteLoopTipThisBatch here because user hasn't confirmed yet.
    // It will be reset when photos array changes (new batch actually starts)

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

  // Handle cancellation of image generation with confirmation popup
  const handleCancelImageGeneration = useCallback(() => {
    // Allow cancel if there's an active project (even if isGenerating is false - early cancel)
    if (!activeProjectReference.current) {
      console.log('[Cancel] No active project to cancel');
      return;
    }

    const projectId = activeProjectReference.current;

    // Calculate approximate progress from photos
    const completedCount = photos.filter(p => !p.hidden && !p.loading && !p.generating && !p.error && p.images && p.images.length > 0 && !p.isOriginal).length;
    const generatingCount = photos.filter(p => !p.hidden && (p.loading || p.generating)).length;
    const totalCount = completedCount + generatingCount;
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    const performCancel = async () => {
      console.log('[Cancel] Cancelling project:', projectId);
      try {
        // Try to cancel via API if available
        if (sogniClient && sogniClient.cancelProject) {
          const result = await sogniClient.cancelProject(projectId);

          // Check for rate limiting
          if (result?.rateLimited) {
            setCancelRateLimited(true);
            setCancelCooldownSeconds(result.cooldownRemaining || 20);
            showToast({
              title: 'hold on a sec! ⏳',
              message: `u can cancel again in ${result.cooldownRemaining || 20} seconds`,
              type: 'warning',
              timeout: 4000
            });
            return;
          }
        } else {
          // No cancelProject method - just do local cleanup
          console.log('[Cancel] No cancelProject method available, doing local cleanup only');
        }

        // Clear local state regardless of whether API cancel succeeded
        activeProjectReference.current = null;
        setShowMoreButtonDuringGeneration(false);

        // Update photo states - hide incomplete jobs AND clear generating/loading flags
        setPhotos(prev => prev.map(photo => {
          if (photo.loading || photo.generating) {
            return {
              ...photo,
              loading: false,
              generating: false,
              hidden: true
            };
          }
          return photo;
        }));

        const completedMsg = completedCount > 0
          ? `${completedCount} image${completedCount !== 1 ? 's' : ''} completed, remaining cancelled`
          : 'Generation cancelled';

        showToast({
          title: 'all done! cancelled ✨',
          message: completedMsg,
          type: 'info',
          timeout: 3000
        });
      } catch (error) {
        console.error('Error cancelling generation:', error);
        
        // Still clear local state on error so user isn't stuck
        activeProjectReference.current = null;
        setShowMoreButtonDuringGeneration(false);
        setPhotos(prev => prev.map(photo => {
          if (photo.loading || photo.generating) {
            return { ...photo, loading: false, generating: false, hidden: true };
          }
          return photo;
        }));
        
        showToast({
          title: 'stopped! ✋',
          message: 'generation stopped (server cancel might not have worked)',
          type: 'warning',
          timeout: 4000
        });
      }
    };

    // Check if user has opted out of confirmations
    if (shouldSkipConfirmation()) {
      performCancel();
      return;
    }

    // Show confirmation popup
    requestCancel({
      projectId,
      projectType: 'image',
      progress,
      itemsCompleted: completedCount,
      totalItems: totalCount,
      onConfirm: performCancel
    });
  }, [isGenerating, activeProjectReference, sogniClient, photos, showToast, setPhotos, requestCancel]);

  // Handle cancellation of all video generations
  const handleCancelAllVideos = useCallback(() => {
    // Find all photos that are generating videos
    const generatingPhotos = photos.filter(p => !p.hidden && p.generatingVideo && p.videoProjectId);
    
    if (generatingPhotos.length === 0) {
      console.log('[Cancel Videos] No videos generating');
      return;
    }

    const totalCount = generatingPhotos.length;
    const completedCount = photos.filter(p => !p.hidden && p.videoUrl && !p.generatingVideo).length;

    const performCancel = async () => {
      console.log(`[Cancel Videos] Cancelling ${totalCount} video(s) using bulk cancel`);
      
      try {
        // Use bulk cancel to cancel all at once (bypasses per-item rate limiting)
        const result = await cancelAllActiveVideoProjects(setPhotos);
        
        console.log(`[Cancel Videos] Bulk cancel result: ${result.cancelled} cancelled, ${result.failed} failed`);
        
        if (result.cancelled > 0) {
          showToast({
            title: 'videos cancelled! ✨',
            message: `${result.cancelled} video${result.cancelled !== 1 ? 's' : ''} cancelled. we'll refund u for incomplete work!`,
            type: 'info',
            timeout: 4000
          });
        } else {
          showToast({
            title: 'video cancelled! ✨',
            message: 'video generation was cancelled',
            type: 'info',
            timeout: 3000
          });
        }
      } catch (error) {
        console.error('[Cancel Videos] Error during bulk cancel:', error);
        showToast({
          title: 'oops! cancel error 😅',
          message: 'couldn\'t cancel the videos. some might still finish!',
          type: 'warning',
          timeout: 4000
        });
      }
    };

    // Check if user has opted out of confirmations
    if (shouldSkipConfirmation()) {
      performCancel();
      return;
    }

    // Show confirmation popup
    requestCancel({
      projectId: 'batch-video',
      projectType: 'video',
      progress: 0,
      itemsCompleted: completedCount,
      totalItems: totalCount + completedCount,
      onConfirm: performCancel
    });
  }, [photos, sogniClient, setPhotos, showToast, requestCancel]);

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

  // Handle enhancement with Z-Image Turbo (default behavior)
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

  // Handle enhancement with context image edit model (with custom prompt)
  const handleEnhanceWithEditModel = useCallback(() => {
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
      console.log('[ENHANCE] Already enhancing or no photo, ignoring edit model enhance');
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
      // Context image edit model specific parameters
      useEditModel: true,
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
    // Show the video selection popup
    if (isAuthenticated) {
      setIsVideoSelectionBatch(false);
      setShowVideoSelectionPopup(true);
    } else {
      showToast({
        title: 'hey there! 👋',
        message: 'just need u to sign in first to create ur videos :)',
        type: 'info'
      });
      // Automatically open the login modal after showing the toast
      if (onOpenLoginModal) {
        setTimeout(() => onOpenLoginModal(), 500);
      }
    }
  }, [isAuthenticated, showToast, onOpenLoginModal]);

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
        title: 'oops! no image 📸',
        message: 'need an image to make a video!',
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
            title: 'video didn\'t work 😅',
            message: error.message || 'video generation failed. wanna try again?',
            type: 'error'
          });
        },
        onCancel: () => {
          showToast({
            title: 'video cancelled ✨',
            message: 'video generation was cancelled',
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
            title: 'video didn\'t work 😅',
            message: error.message || 'video generation failed. wanna try again?',
            type: 'error'
          });
        },
        onCancel: () => {
          showToast({
            title: 'video cancelled ✨',
            message: 'video generation was cancelled',
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

  // Check for Bald for Base deep link on mount and route changes
  useEffect(() => {
    // Use a ref to track if we've already handled this route to avoid duplicate triggers
    const handledRouteKey = 'baldForBaseDeepLinkHandled';
    
    const checkBaldForBaseDeepLink = () => {
      // Check both sessionStorage flag and current route pathname
      const baldForBaseDeepLink = sessionStorage.getItem('baldForBaseDeepLink');
      const isBaldForBaseRoute = window.location.pathname === '/event/bald-for-base';
      
      // Skip if we've already handled this route visit (unless it's a new sessionStorage flag)
      const alreadyHandled = sessionStorage.getItem(handledRouteKey) === window.location.pathname;
      if (alreadyHandled && !baldForBaseDeepLink) {
        return;
      }
      
      if (baldForBaseDeepLink === 'true' || isBaldForBaseRoute) {
        // Mark this route as handled
        sessionStorage.setItem(handledRouteKey, window.location.pathname);
        
        // Clear the sessionStorage flag if it exists
        if (baldForBaseDeepLink === 'true') {
          sessionStorage.removeItem('baldForBaseDeepLink');
        }
        
        // Always show the Bald for Base popup, regardless of whether user has photos
        setShowBatchBaldForBasePopup(true);
      }
    };
    
    // Check immediately
    checkBaldForBaseDeepLink();
    
    // Also listen for route changes (popstate for back/forward, and custom pushState)
    const handleRouteChange = () => {
      // Small delay to ensure route has updated
      setTimeout(checkBaldForBaseDeepLink, 100);
    };
    
    window.addEventListener('popstate', handleRouteChange);
    
    // Intercept pushState to detect route changes
    const originalPushState = window.history.pushState;
    window.history.pushState = function(...args) {
      originalPushState.apply(window.history, args);
      handleRouteChange();
    };
    
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.history.pushState = originalPushState;
    };
  }, [photos, showToast]); // Run when photos or showToast changes

  // Check for sessionStorage flag on mount and when photos change
  useEffect(() => {
    const sessionFlag = sessionStorage.getItem('baldForBaseAutoTrigger');
    if (sessionFlag === 'true' && !autoTriggerBaldForBaseAfterGeneration) {
      setAutoTriggerBaldForBaseAfterGeneration(true);
      sessionStorage.removeItem('baldForBaseAutoTrigger');
    }
  }, [photos, autoTriggerBaldForBaseAfterGeneration]);

  // Auto-trigger Bald for Base after photo generation completes
  useEffect(() => {
    if (!autoTriggerBaldForBaseAfterGeneration) {
      // Reset the flag if auto-trigger is disabled
      if (hasSeenGenerationStart) {
        setHasSeenGenerationStart(false);
      }
      previousPhotoCountRef.current = 0;
      return;
    }
    
    // Check if generation has started (any photos with generating/loading flags)
    const currentlyGenerating = photos.some(
      photo => !photo.hidden && (photo.generating || photo.loading)
    );
    
    // Track when generation starts
    if (currentlyGenerating && !hasSeenGenerationStart) {
      setHasSeenGenerationStart(true);
      return;
    }
    
    // Check if we have completed photos
    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );
    
    // Track if photos were added (generation happened)
    const currentPhotoCount = loadedPhotos.length;
    const photosWereAdded = currentPhotoCount > previousPhotoCountRef.current;
    previousPhotoCountRef.current = currentPhotoCount;
    
    // Show popup if:
    // 1. Nothing is currently generating (isGenerating is false AND no photos are generating/loading)
    // 2. We have at least one completed photo
    // 3. We've seen generation start OR photos were added (indicating generation happened)
    const canShowPopup = !isGenerating && !currentlyGenerating && loadedPhotos.length > 0;
    const shouldShowPopup = canShowPopup && (hasSeenGenerationStart || photosWereAdded);
    
    if (shouldShowPopup) {
      setAutoTriggerBaldForBaseAfterGeneration(false);
      setHasSeenGenerationStart(false);
      previousPhotoCountRef.current = 0;
      
      // Check if user is authenticated - videos require login
      if (!isAuthenticated) {
        // User is not logged in - show error toast instead of popup
        showToast({
          title: '🔐 Sign In Required',
          message: 'Please sign up or log in to create Bald for Base videos. Video generation requires an account.',
          type: 'error',
          timeout: 6000
        });
        return;
      }
      
      // Small delay to ensure UI is ready
      setTimeout(() => {
        setShowBatchBaldForBasePopup(true);
        showToast({
          title: '🟦 Ready for Bald for Base!',
          message: 'Your photos are ready! Click Generate to create your Bald for Base videos.',
          type: 'success',
          timeout: 4000
        });
      }, 500);
    }
  }, [isGenerating, photos, autoTriggerBaldForBaseAfterGeneration, hasSeenGenerationStart, showToast, isAuthenticated]);

  // Handle Bald for Base video generation (single)
  const handleBaldForBaseVideo = useCallback(async () => {
    setShowVideoOptionsList(false);
    setShowBaldForBasePopup(true);
  }, []);

  // Handle Bald for Base video generation execution (single)
  const handleBaldForBaseVideoExecute = useCallback(async () => {
    setShowBaldForBasePopup(false);
    
    // Check if user has photos - if not, redirect to generation workflow
    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );
    
    if (loadedPhotos.length === 0) {
      showToast({
        title: 'need some photos first! 📸',
        message: 'generate some photos and we\'ll automatically create ur videos after!',
        type: 'info',
        timeout: 5000
      });
      setAutoTriggerBaldForBaseAfterGeneration(true);
      // Navigate back to camera/start menu
      if (handleBackToCamera) {
        handleBackToCamera();
      }
      return;
    }
    
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
        title: 'oops! no image 📸',
        message: 'need an image to make a video!',
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
        duration: 5, // Bald for Base videos are always 5 seconds
        positivePrompt: BASE_HERO_PROMPT,
        negativePrompt: settings.videoNegativePrompt || '',
        tokenType: tokenType,
        onComplete: (videoUrl) => {
          // Play sonic logo before auto-play (respects sound settings)
          playSonicLogo(settings.soundEnabled);
          // Auto-play the generated video when completed
          setPlayingGeneratedVideoIds(prev => new Set([...prev, generatingPhotoId]));
          const videoMessage = getRandomVideoMessage();

          console.log('[VIDEO TOAST] Bald for Base video generation completed:', {
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
          console.error('[VIDEO] Bald for Base video generation error:', error);
          showToast({
            title: 'couldn\'t generate video 😅',
            message: error.message || 'failed to generate video. wanna try again?',
            type: 'error'
          });
        },
        onOutOfCredits: () => {
          console.log('[VIDEO] Triggering out of credits popup from Bald for Base video generation');
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
  const handlePromptVideoExecute = useCallback(async (positivePrompt, negativePrompt) => {
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
        title: 'oops! no image 📸',
        message: 'need an image to make a video!',
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
        positivePrompt: positivePrompt,
        negativePrompt: negativePrompt || '',
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
            title: 'couldn\'t generate video 😅',
            message: error.message || 'failed to generate video. wanna try again?',
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

  // Handle video type selection from VideoSelectionPopup
  const handleVideoTypeSelection = useCallback((videoType) => {
    setShowVideoSelectionPopup(false);

    if (isVideoSelectionBatch) {
      // Batch mode
      switch (videoType) {
        case 'prompt':
          setShowBatchPromptVideoPopup(true);
          break;
        case 'emoji':
          setBatchActionMode('video');
          setShowBatchVideoDropdown(true);
          break;
        case 'bald-for-base':
          setShowBatchBaldForBasePopup(true);
          break;
        case 'batch-transition':
          setShowTransitionVideoPopup(true);
          break;
        case 'batch-animate-move':
          setShowBatchAnimateMovePopup(true);
          break;
        case 'batch-animate-replace':
          setShowBatchAnimateReplacePopup(true);
          break;
        case 'batch-s2v':
          setShowBatchS2VPopup(true);
          break;
        default:
          break;
      }
    } else {
      // Single mode
      switch (videoType) {
        case 'prompt':
          setShowPromptVideoPopup(true);
          break;
        case 'emoji':
          setShowVideoDropdown(true);
          break;
        case 'bald-for-base':
          setShowBaldForBasePopup(true);
          break;
        case 'transition':
          setShowTransitionVideoPopup(true);
          break;
        case 'animate-move':
          setShowAnimateMovePopup(true);
          break;
        case 'animate-replace':
          setShowAnimateReplacePopup(true);
          break;
        case 's2v':
          setShowS2VPopup(true);
          break;
        default:
          break;
      }
    }
  }, [isVideoSelectionBatch]);

  // Handle batch Bald for Base video generation
  const handleBatchBaldForBaseVideo = useCallback(async () => {
    setShowBatchVideoDropdown(false);
          setShowBatchBaldForBasePopup(true);
  }, []);

  // Handle batch Bald for Base video generation execution
  const handleBatchBaldForBaseVideoExecute = useCallback(async () => {
    setShowBatchBaldForBasePopup(false);
    
    // Get all loaded photos (excluding hidden/discarded ones)
    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      // Show toast and navigate to intro/start menu
      showToast({
        title: 'need some photos first! 📸',
        message: 'generate some photos and we\'ll automatically create ur videos after!',
        type: 'info',
        timeout: 5000
      });
      setAutoTriggerBaldForBaseAfterGeneration(true);
      // Navigate back to camera/start menu (intro page)
      if (handleBackToCamera) {
        handleBackToCamera();
      }
      return;
    }
    
    // Pre-warm audio for iOS
    warmUpAudio();

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);

    // Show toast for batch generation
    showToast({
      title: '🟦 Batch Bald for Base Generation',
      message: `Starting Bald for Base video generation for ${loadedPhotos.length} image${loadedPhotos.length > 1 ? 's' : ''}...`,
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
          duration: 5, // Bald for Base videos are always 5 seconds
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
                message: `Successfully generated ${successCount} Bald for Base video${successCount > 1 ? 's' : ''}!`,
                type: 'success',
                timeout: 5000
              });
            }
          },
          onError: (error) => {
            errorCount++;
            console.error(`[BATCH BALD FOR BASE] Video ${i + 1} failed:`, error);
            
            if (errorCount === loadedPhotos.length) {
              showToast({
                title: 'batch didn\'t work 😅',
                message: 'all videos failed to generate. wanna try again?',
                type: 'error'
              });
            }
          },
          onOutOfCredits: () => {
            console.log('[VIDEO] Triggering out of credits popup from batch Bald for Base video generation');
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
  const handleBatchPromptVideoExecute = useCallback(async (positivePrompt, negativePrompt) => {
    setShowBatchPromptVideoPopup(false);
    
    // Pre-warm audio for iOS
    warmUpAudio();

    // Get all loaded photos (excluding hidden/discarded ones)
    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({
        title: 'oops! no images 📸',
        message: 'need some images to make videos!',
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
          positivePrompt: positivePrompt,
          negativePrompt: negativePrompt || '',
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
                title: 'batch didn\'t work 😅',
                message: 'all videos failed to generate. wanna try again?',
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

  // ==================== ANIMATE MOVE HANDLERS ====================

  // Handle Animate Move video generation (single)
  const handleAnimateMoveExecute = useCallback(async ({ positivePrompt, negativePrompt, videoData, videoUrl, videoDuration: customDuration, videoStartOffset, workflowType, modelVariant }) => {
    setShowAnimateMovePopup(false);

    // Pre-warm audio for iOS
    warmUpAudio();

    // Use videoTargetPhotoIndex if set (from gallery motion button), otherwise selectedPhotoIndex
    const targetIndex = videoTargetPhotoIndex !== null ? videoTargetPhotoIndex : selectedPhotoIndex;
    setVideoTargetPhotoIndex(null);

    if (targetIndex === null) return;

    const photo = photos[targetIndex];
    if (!photo || photo.generatingVideo) return;

    setShowVideoNewBadge(false);

    const imageUrl = photo.enhancedImageUrl || photo.images?.[selectedSubIndex || 0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({ title: 'Video Failed', message: 'No image available for video generation.', type: 'error' });
      return;
    }

    // Use custom duration from popup or fall back to settings
    const duration = customDuration || settings.videoDuration || 5;

    // Fetch video data if URL provided
    let videoBuffer = videoData;
    if (!videoBuffer && videoUrl) {
      try {
        const response = await fetch(videoUrl);
        const arrayBuffer = await response.arrayBuffer();
        videoBuffer = new Uint8Array(arrayBuffer);
      } catch (err) {
        showToast({ title: 'couldn\'t load video 📹', message: 'failed to load source video', type: 'error' });
        return;
      }
    }

    const img = new Image();
    img.onload = () => {
      generateVideo({
        photo,
        photoIndex: targetIndex,
        subIndex: selectedSubIndex || 0,
        imageWidth: img.naturalWidth,
        imageHeight: img.naturalHeight,
        sogniClient,
        setPhotos,
        resolution: settings.videoResolution || '480p',
        quality: settings.videoQuality || 'fast',
        fps: settings.videoFramerate || 16,
        duration: duration,
        positivePrompt,
        negativePrompt,
        tokenType,
        workflowType: 'animate-move',
        referenceVideo: videoBuffer,
        videoStart: videoStartOffset, // Pass video trim start offset
        modelVariant, // Pass model variant from popup
        // Regeneration metadata
        referenceVideoUrl: videoUrl,
        onComplete: (resultVideoUrl) => {
          playSonicLogo(settings.soundEnabled);
          showToast({ title: '🎬 Animate Move Complete!', message: 'Your video is ready!', type: 'success' });
          setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
        },
        onError: (error) => {
          showToast({ title: 'video didn\'t work 😅', message: error.message || 'video generation failed', type: 'error' });
        },
        onOutOfCredits: () => { if (onOutOfCredits) onOutOfCredits(); }
      });
    };
    img.src = imageUrl;
  }, [videoTargetPhotoIndex, selectedPhotoIndex, selectedSubIndex, photos, sogniClient, setPhotos, settings, tokenType, showToast, onOutOfCredits]);

  // Handle Animate Move batch execution
  const handleBatchAnimateMoveExecute = useCallback(async ({ positivePrompt, negativePrompt, videoData, videoUrl, videoDuration: customDuration, videoStartOffset, workflowType, modelVariant, splitMode, perImageDuration }) => {
    setShowBatchAnimateMovePopup(false);
    warmUpAudio();

    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({ title: 'No Images', message: 'No images available for video generation.', type: 'error' });
      return;
    }

    setShowVideoNewBadge(false);

    // CRITICAL: Clear previous workflow state to prevent stale data from persisting
    activeMontageAudioSourceRef.current = null;
    segmentPreviousVideoUrlsRef.current.clear();
    videoRetryAttempts.current.clear();

    // Fetch video data if URL provided (needed for both montage source storage and video generation)
    let videoBuffer = videoData;
    if (!videoBuffer && videoUrl) {
      try {
        const response = await fetch(videoUrl);
        const arrayBuffer = await response.arrayBuffer();
        videoBuffer = new Uint8Array(arrayBuffer);
      } catch (err) {
        showToast({ title: 'couldn\'t load video 📹', message: 'failed to load source video', type: 'error' });
        return;
      }
    }

    // Use custom duration from popup or fall back to settings
    const baseDuration = customDuration || settings.videoDuration || 5;

    // Set up montage tracking for segment review (only in split mode)
    if (splitMode) {
      const photoIds = loadedPhotos.map(p => p.id);
      console.log(`[Animate Move Montage] Setting up tracking for ${photoIds.length} segments`);
      
      // CRITICAL: Reset ALL montage state to prevent stale data from previous batches
      setActiveMontagePhotoIds(photoIds);
      setActiveMontageWorkflowType('animate-move');
      montageCompletedRef.current.clear();
      montageStitchCompletedRef.current = false; // Reset for new batch
      montageAutoStitchInProgressRef.current = false; // Reset auto-stitch flag
      
      // Clear any previous segment review data and version history
      setPendingSegments([]);
      setSegmentReviewData(null);
      setSegmentVersionHistories(new Map()); // Clear version histories for new workflow
      setSelectedSegmentVersions(new Map()); // Clear selected versions for new workflow
      setShowStitchedVideoOverlay(false);
      setShowSegmentReview(false);

      // Clear batch-transition state to prevent the Remix useEffect from repopulating
      setIsTransitionMode(false);
      setTransitionVideoQueue([]);
      setAllTransitionVideosComplete(false);

      // Initialize segment review with generating status immediately (like Infinite Loop)
      const initialSegments = photoIds.map((photoId, index) => {
        const photo = loadedPhotos.find(p => p.id === photoId);
        return {
          url: '',
          index,
          photoId,
          status: 'generating',
          thumbnail: photo?.enhancedImageUrl || photo?.images?.[0] || photo?.originalDataUrl
        };
      });
      setPendingSegments(initialSegments);

      // FIX 1: Build audioSource BEFORE setSegmentReviewData so it's included
      const audioSourceForStitch = {
        type: 'animate-move',
        videoBuffer: videoBuffer,
        videoUrl: videoUrl,
        startOffset: videoStartOffset || 0,
        duration: baseDuration
      };

      setSegmentReviewData({
        workflowType: 'animate-move',
        photoIds: [...photoIds],
        photos: loadedPhotos,
        audioSource: audioSourceForStitch
      });
      
      // Show VideoReviewPopup immediately for segment review
      setShowSegmentReview(true);

      // Also store in ref for backward compatibility / other code paths
      activeMontageAudioSourceRef.current = audioSourceForStitch;
    }

    // In split mode, each image gets perImageDuration at sequential offsets
    // In normal mode, all images use the same duration and offset
    const imageCount = loadedPhotos.length;

    showToast({
      title: '🎬 Batch Animate Move',
      message: splitMode
        ? `Starting ${imageCount} videos (${perImageDuration.toFixed(2)}s each, split from ${baseDuration.toFixed(2)}s selection)...`
        : `Starting video generation for ${imageCount} image${imageCount > 1 ? 's' : ''}...`,
      type: 'info',
      timeout: 3000
    });

    loadedPhotos.forEach((photo, batchIndex) => {
      const photoIndex = photos.findIndex(p => p.id === photo.id);
      if (photoIndex === -1 || photo.generatingVideo) return;

      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
      if (!imageUrl) return;

      // Calculate per-image duration and start offset for split mode
      const imageDuration = splitMode ? perImageDuration : baseDuration;
      const imageStartOffset = splitMode
        ? videoStartOffset + (batchIndex * perImageDuration)
        : videoStartOffset;

      // DEBUG: Log videoStart calculation for each clip
      console.log(`[Animate Move Montage] Clip ${batchIndex}: videoStartOffset=${videoStartOffset}, batchIndex=${batchIndex}, perImageDuration=${perImageDuration}, imageStartOffset=${imageStartOffset}, imageDuration=${imageDuration}`);

      const img = new Image();
      img.onload = () => {
        // DEBUG: Log inside onload to verify closure captured correct values
        console.log(`[Animate Move Montage] Image loaded for clip ${batchIndex}, using videoStart=${imageStartOffset}`);

        // Store workflow type and regeneration params BEFORE calling generateVideo
        // This ensures params are available for redo even if the video is cancelled or fails
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[photoIndex]) {
            updated[photoIndex] = {
              ...updated[photoIndex],
              videoWorkflowType: 'animate-move',
              videoRegenerateParams: {
                referenceVideoUrl: videoUrl,
                videoStart: imageStartOffset,
                isMontageSegment: splitMode,
                segmentIndex: splitMode ? batchIndex : undefined
              }
            };
          }
          return updated;
        });

        // Helper function to generate video with retry capability
        const attemptGeneration = (retryCount = 0) => {
          generateVideo({
            photo,
            photoIndex,
            subIndex: 0,
            imageWidth: img.naturalWidth,
            imageHeight: img.naturalHeight,
            sogniClient,
            setPhotos,
            resolution: settings.videoResolution || '480p',
            quality: settings.videoQuality || 'fast',
            fps: settings.videoFramerate || 16,
            duration: imageDuration,
            positivePrompt,
            negativePrompt,
            tokenType,
            workflowType: 'animate-move',
            referenceVideo: videoBuffer,
            videoStart: imageStartOffset, // Per-image start offset in split mode
            modelVariant, // Pass model variant from popup
            // Regeneration metadata
            referenceVideoUrl: videoUrl,
            isMontageSegment: splitMode,
            segmentIndex: splitMode ? batchIndex : undefined,
            onComplete: (videoUrl) => {
              // Clear retry count on success
              videoRetryAttempts.current.delete(photo.id);
              playSonicLogo(settings.soundEnabled);

              // Update pendingSegments to mark this segment as ready
              if (splitMode) {
                setPendingSegments(prev => {
                  const updated = [...prev];
                  const segmentIndex = updated.findIndex(s => s.photoId === photo.id);
                  if (segmentIndex !== -1) {
                    updated[segmentIndex] = { ...updated[segmentIndex], url: videoUrl, status: 'ready' };
                    // Initialize version history for this segment (first successful generation)
                    setSegmentVersionHistories(prevHistories => {
                      const newHistories = new Map(prevHistories);
                      const history = newHistories.get(segmentIndex) || [];
                      if (!history.includes(videoUrl)) {
                        newHistories.set(segmentIndex, [...history, videoUrl]);
                      }
                      return newHistories;
                    });
                    setSelectedSegmentVersions(prevVersions => {
                      const newVersions = new Map(prevVersions);
                      const history = segmentVersionHistories.get(segmentIndex) || [];
                      newVersions.set(segmentIndex, history.length); // Latest version
                      return newVersions;
                    });
                  }
                  return updated;
                });
              }

              // Don't auto-play videos during segment review mode
              if (!splitMode) {
                setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
              }
            },
            onError: (error) => {
              console.error('[BATCH ANIMATE MOVE] Error:', error);

              // Update pendingSegments to mark this segment as failed (after retries exhausted)
              if (splitMode && retryCount >= 2) {
                setPendingSegments(prev => {
                  const updated = [...prev];
                  const segmentIndex = updated.findIndex(s => s.photoId === photo.id);
                  if (segmentIndex !== -1) {
                    updated[segmentIndex] = { ...updated[segmentIndex], status: 'failed' };
                  }
                  return updated;
                });
              }
              
              // Check if this is a montage mode video and we haven't exhausted retries (2 automatic retries = 3 total attempts)
              if (splitMode && retryCount < 2) {
                const nextRetryCount = retryCount + 1;
                videoRetryAttempts.current.set(photo.id, nextRetryCount);
                
                console.log(`[BATCH ANIMATE MOVE] Retrying segment ${batchIndex + 1} (attempt ${nextRetryCount + 1}/3)...`);
                
                // Show retry toast only for montage segments
                showToast({
                  title: 'retrying segment ♻️',
                  message: `segment ${batchIndex + 1} didn't work, trying again (${nextRetryCount + 1}/3)...`,
                  type: 'warning',
                  timeout: 3000
                });
                
                // Retry after a brief delay
                setTimeout(() => attemptGeneration(nextRetryCount), 1000);
              } else {
                // Exhausted retries or not montage mode
                videoRetryAttempts.current.delete(photo.id);
                
                if (splitMode && retryCount >= 2) {
                  showToast({
                    title: 'segment didn\'t work 😅',
                    message: `segment ${batchIndex + 1} failed after 3 tries. this might affect the full montage`,
                    type: 'error',
                    timeout: 5000
                  });
                }
              }
            },
            onOutOfCredits: () => { if (onOutOfCredits) onOutOfCredits(); }
          });
        };
        
        // Start generation
        attemptGeneration();
      };
      img.src = imageUrl;
    });
  }, [photos, sogniClient, setPhotos, settings, tokenType, showToast, onOutOfCredits]);

  // ==================== ANIMATE REPLACE HANDLERS ====================

  // Handle Animate Replace video generation (single)
  const handleAnimateReplaceExecute = useCallback(async ({ positivePrompt, negativePrompt, videoData, videoUrl, sam2Coordinates, videoDuration: customDuration, videoStartOffset, workflowType, modelVariant }) => {
    setShowAnimateReplacePopup(false);
    warmUpAudio();

    const targetIndex = videoTargetPhotoIndex !== null ? videoTargetPhotoIndex : selectedPhotoIndex;
    setVideoTargetPhotoIndex(null);

    if (targetIndex === null) return;

    const photo = photos[targetIndex];
    if (!photo || photo.generatingVideo) return;

    setShowVideoNewBadge(false);

    const imageUrl = photo.enhancedImageUrl || photo.images?.[selectedSubIndex || 0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({ title: 'Video Failed', message: 'No image available for video generation.', type: 'error' });
      return;
    }

    // Use custom duration from popup or fall back to settings
    const duration = customDuration || settings.videoDuration || 5;

    // Fetch video data if URL provided
    let videoBuffer = videoData;
    if (!videoBuffer && videoUrl) {
      try {
        const response = await fetch(videoUrl);
        const arrayBuffer = await response.arrayBuffer();
        videoBuffer = new Uint8Array(arrayBuffer);
      } catch (err) {
        showToast({ title: 'couldn\'t load video 📹', message: 'failed to load source video', type: 'error' });
        return;
      }
    }

    const img = new Image();
    img.onload = () => {
      generateVideo({
        photo,
        photoIndex: targetIndex,
        subIndex: selectedSubIndex || 0,
        imageWidth: img.naturalWidth,
        imageHeight: img.naturalHeight,
        sogniClient,
        setPhotos,
        resolution: settings.videoResolution || '480p',
        quality: settings.videoQuality || 'fast',
        fps: settings.videoFramerate || 16,
        duration: duration,
        positivePrompt,
        negativePrompt,
        tokenType,
        workflowType: 'animate-replace',
        referenceVideo: videoBuffer,
        sam2Coordinates,
        videoStart: videoStartOffset, // Pass video trim start offset
        modelVariant, // Pass model variant from popup
        // Regeneration metadata
        referenceVideoUrl: videoUrl,
        onComplete: () => {
          playSonicLogo(settings.soundEnabled);
          showToast({ title: '🔄 Animate Replace Complete!', message: 'Your video is ready!', type: 'success' });
          setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
        },
        onError: (error) => {
          showToast({ title: 'video didn\'t work 😅', message: error.message || 'video generation failed', type: 'error' });
        },
        onOutOfCredits: () => { if (onOutOfCredits) onOutOfCredits(); }
      });
    };
    img.src = imageUrl;
  }, [videoTargetPhotoIndex, selectedPhotoIndex, selectedSubIndex, photos, sogniClient, setPhotos, settings, tokenType, showToast, onOutOfCredits]);

  // Handle Animate Replace batch execution
  const handleBatchAnimateReplaceExecute = useCallback(async ({ positivePrompt, negativePrompt, videoData, videoUrl, sam2Coordinates, videoDuration: customDuration, videoStartOffset, workflowType, modelVariant, splitMode, perImageDuration }) => {
    setShowBatchAnimateReplacePopup(false);
    warmUpAudio();

    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({ title: 'No Images', message: 'No images available for video generation.', type: 'error' });
      return;
    }

    setShowVideoNewBadge(false);

    // CRITICAL: Clear previous workflow state to prevent stale data from persisting
    activeMontageAudioSourceRef.current = null;
    segmentPreviousVideoUrlsRef.current.clear();
    videoRetryAttempts.current.clear();

    // Fetch video data if URL provided (needed for both montage source storage and video generation)
    let videoBuffer = videoData;
    if (!videoBuffer && videoUrl) {
      try {
        const response = await fetch(videoUrl);
        const arrayBuffer = await response.arrayBuffer();
        videoBuffer = new Uint8Array(arrayBuffer);
      } catch (err) {
        showToast({ title: 'couldn\'t load video 📹', message: 'failed to load source video', type: 'error' });
        return;
      }
    }

    // Use custom duration from popup or fall back to settings
    const baseDuration = customDuration || settings.videoDuration || 5;

    // Set up montage tracking for segment review (only in split mode)
    if (splitMode) {
      const photoIds = loadedPhotos.map(p => p.id);
      console.log(`[Animate Replace Montage] Setting up tracking for ${photoIds.length} segments`);

      // CRITICAL: Reset ALL montage state to prevent stale data from previous batches
      setActiveMontagePhotoIds(photoIds);
      setActiveMontageWorkflowType('animate-replace');
      montageCompletedRef.current.clear();
      montageStitchCompletedRef.current = false; // Reset for new batch
      montageAutoStitchInProgressRef.current = false; // Reset auto-stitch flag

      // Clear any previous segment review data and version history
      setPendingSegments([]);
      setSegmentReviewData(null);
      setSegmentVersionHistories(new Map()); // Clear version histories for new workflow
      setSelectedSegmentVersions(new Map()); // Clear selected versions for new workflow
      setShowStitchedVideoOverlay(false);
      setShowSegmentReview(false);

      // Clear batch-transition state to prevent the Remix useEffect from repopulating
      setIsTransitionMode(false);
      setTransitionVideoQueue([]);
      setAllTransitionVideosComplete(false);

      // Initialize segment review with generating status immediately (like Infinite Loop)
      const initialSegments = photoIds.map((photoId, index) => {
        const photo = loadedPhotos.find(p => p.id === photoId);
        return {
          url: '',
          index,
          photoId,
          status: 'generating',
          thumbnail: photo?.enhancedImageUrl || photo?.images?.[0] || photo?.originalDataUrl
        };
      });
      setPendingSegments(initialSegments);

      // FIX 1: Build audioSource BEFORE setSegmentReviewData so it's included
      const audioSourceForStitch = {
        type: 'animate-replace',
        videoBuffer: videoBuffer,
        videoUrl: videoUrl,
        startOffset: videoStartOffset || 0,
        duration: baseDuration
      };

      setSegmentReviewData({
        workflowType: 'animate-replace',
        photoIds: [...photoIds],
        photos: loadedPhotos,
        audioSource: audioSourceForStitch
      });
      
      // Show VideoReviewPopup immediately for segment review
      setShowSegmentReview(true);

      // Also store in ref for backward compatibility / other code paths
      activeMontageAudioSourceRef.current = audioSourceForStitch;
    }

    // In split mode, each image gets perImageDuration at sequential offsets
    // In normal mode, all images use the same duration and offset
    const imageCount = loadedPhotos.length;

    showToast({
      title: '🔄 Batch Animate Replace',
      message: splitMode
        ? `Starting ${imageCount} videos (${perImageDuration.toFixed(2)}s each, split from ${baseDuration.toFixed(2)}s selection)...`
        : `Starting video generation for ${imageCount} image${imageCount > 1 ? 's' : ''}...`,
      type: 'info',
      timeout: 3000
    });

    loadedPhotos.forEach((photo, batchIndex) => {
      const photoIndex = photos.findIndex(p => p.id === photo.id);
      if (photoIndex === -1 || photo.generatingVideo) return;

      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
      if (!imageUrl) return;

      // Calculate per-image duration and start offset for split mode
      const imageDuration = splitMode ? perImageDuration : baseDuration;
      const imageStartOffset = splitMode
        ? videoStartOffset + (batchIndex * perImageDuration)
        : videoStartOffset;

      // DEBUG: Log videoStart calculation for each clip
      console.log(`[Animate Replace Montage] Clip ${batchIndex}: videoStartOffset=${videoStartOffset}, batchIndex=${batchIndex}, perImageDuration=${perImageDuration}, imageStartOffset=${imageStartOffset}, imageDuration=${imageDuration}`);

      const img = new Image();
      img.onload = () => {
        // DEBUG: Log inside onload to verify closure captured correct values
        console.log(`[Animate Replace Montage] Image loaded for clip ${batchIndex}, using videoStart=${imageStartOffset}`);

        // Store workflow type and regeneration params BEFORE calling generateVideo
        // This ensures params are available for redo even if the video is cancelled or fails
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[photoIndex]) {
            updated[photoIndex] = {
              ...updated[photoIndex],
              videoWorkflowType: 'animate-replace',
              videoRegenerateParams: {
                referenceVideoUrl: videoUrl,
                videoStart: imageStartOffset,
                sam2Coordinates,
                isMontageSegment: splitMode,
                segmentIndex: splitMode ? batchIndex : undefined
              }
            };
          }
          return updated;
        });

        // Helper function to generate video with retry capability
        const attemptGeneration = (retryCount = 0) => {
          generateVideo({
            photo,
            photoIndex,
            subIndex: 0,
            imageWidth: img.naturalWidth,
            imageHeight: img.naturalHeight,
            sogniClient,
            setPhotos,
            resolution: settings.videoResolution || '480p',
            quality: settings.videoQuality || 'fast',
            fps: settings.videoFramerate || 16,
            duration: imageDuration,
            positivePrompt,
            negativePrompt,
            tokenType,
            workflowType: 'animate-replace',
            referenceVideo: videoBuffer,
            sam2Coordinates,
            videoStart: imageStartOffset, // Per-image start offset in split mode
            modelVariant, // Pass model variant from popup
            // Regeneration metadata
            referenceVideoUrl: videoUrl,
            isMontageSegment: splitMode,
            segmentIndex: splitMode ? batchIndex : undefined,
            onComplete: (videoUrl) => {
              // Clear retry count on success
              videoRetryAttempts.current.delete(photo.id);
              playSonicLogo(settings.soundEnabled);

              // Update pendingSegments to mark this segment as ready
              if (splitMode) {
                setPendingSegments(prev => {
                  const updated = [...prev];
                  const segmentIndex = updated.findIndex(s => s.photoId === photo.id);
                  if (segmentIndex !== -1) {
                    updated[segmentIndex] = { ...updated[segmentIndex], url: videoUrl, status: 'ready' };
                    // Initialize version history for this segment (first successful generation)
                    setSegmentVersionHistories(prevHistories => {
                      const newHistories = new Map(prevHistories);
                      const history = newHistories.get(segmentIndex) || [];
                      if (!history.includes(videoUrl)) {
                        newHistories.set(segmentIndex, [...history, videoUrl]);
                      }
                      return newHistories;
                    });
                    setSelectedSegmentVersions(prevVersions => {
                      const newVersions = new Map(prevVersions);
                      const history = segmentVersionHistories.get(segmentIndex) || [];
                      newVersions.set(segmentIndex, history.length); // Latest version
                      return newVersions;
                    });
                  }
                  return updated;
                });
              }

              // Don't auto-play videos during segment review mode
              if (!splitMode) {
                setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
              }
            },
            onError: (error) => {
              console.error('[BATCH ANIMATE REPLACE] Error:', error);

              // Update pendingSegments to mark this segment as failed (after retries exhausted)
              if (splitMode && retryCount >= 2) {
                setPendingSegments(prev => {
                  const updated = [...prev];
                  const segmentIndex = updated.findIndex(s => s.photoId === photo.id);
                  if (segmentIndex !== -1) {
                    updated[segmentIndex] = { ...updated[segmentIndex], status: 'failed' };
                  }
                  return updated;
                });
              }

              // Check if this is a montage mode video and we haven't exhausted retries (2 automatic retries = 3 total attempts)
              if (splitMode && retryCount < 2) {
                const nextRetryCount = retryCount + 1;
                videoRetryAttempts.current.set(photo.id, nextRetryCount);

                console.log(`[BATCH ANIMATE REPLACE] Retrying segment ${batchIndex + 1} (attempt ${nextRetryCount + 1}/3)...`);

                // Show retry toast only for montage segments
                showToast({
                  title: 'retrying segment ♻️',
                  message: `segment ${batchIndex + 1} didn't work, trying again (${nextRetryCount + 1}/3)...`,
                  type: 'warning',
                  timeout: 3000
                });

                // Retry after a brief delay
                setTimeout(() => attemptGeneration(nextRetryCount), 1000);
              } else {
                // Exhausted retries or not montage mode
                videoRetryAttempts.current.delete(photo.id);

                if (splitMode && retryCount >= 2) {
                  showToast({
                    title: 'segment didn\'t work 😅',
                    message: `segment ${batchIndex + 1} failed after 3 tries. this might affect the full montage`,
                    type: 'error',
                    timeout: 5000
                  });
                }
              }
            },
            onOutOfCredits: () => { if (onOutOfCredits) onOutOfCredits(); }
          });
        };
        
        // Start generation
        attemptGeneration();
      };
      img.src = imageUrl;
    });
  }, [photos, sogniClient, setPhotos, settings, tokenType, showToast, onOutOfCredits]);

  // ==================== SOUND TO VIDEO (S2V) HANDLERS ====================

  // Handle Sound to Video generation (single)
  const handleS2VExecute = useCallback(async ({ positivePrompt, negativePrompt, audioData, audioUrl, audioStartOffset, videoDuration: customDuration, workflowType, modelVariant }) => {
    setShowS2VPopup(false);
    warmUpAudio();

    const targetIndex = videoTargetPhotoIndex !== null ? videoTargetPhotoIndex : selectedPhotoIndex;
    setVideoTargetPhotoIndex(null);

    if (targetIndex === null) return;

    const photo = photos[targetIndex];
    if (!photo || photo.generatingVideo) return;

    setShowVideoNewBadge(false);

    const imageUrl = photo.enhancedImageUrl || photo.images?.[selectedSubIndex || 0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({ title: 'Video Failed', message: 'No image available for video generation.', type: 'error' });
      return;
    }

    // Use custom duration from popup or fall back to settings
    const duration = customDuration || settings.videoDuration || 5;

    // Fetch audio data if URL provided
    let audioBuffer = audioData;
    if (!audioBuffer && audioUrl) {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = new Uint8Array(arrayBuffer);
      } catch (err) {
        showToast({ title: 'couldn\'t load audio 🎵', message: 'failed to load audio file', type: 'error' });
        return;
      }
    }

    const img = new Image();
    img.onload = () => {
      generateVideo({
        photo,
        photoIndex: targetIndex,
        subIndex: selectedSubIndex || 0,
        imageWidth: img.naturalWidth,
        imageHeight: img.naturalHeight,
        sogniClient,
        setPhotos,
        resolution: settings.videoResolution || '480p',
        quality: settings.videoQuality || 'fast',
        fps: settings.videoFramerate || 16,
        duration: duration,
        positivePrompt,
        negativePrompt,
        tokenType,
        workflowType: 's2v',
        referenceAudio: audioBuffer,
        audioStart: audioStartOffset || 0,
        audioDuration: duration,
        modelVariant, // Pass model variant from popup
        // Regeneration metadata
        referenceAudioUrl: audioUrl,
        onComplete: () => {
          playSonicLogo(settings.soundEnabled);
          showToast({ title: '🎤 Sound to Video Complete!', message: 'Your video is ready!', type: 'success' });
          setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
        },
        onError: (error) => {
          showToast({ title: 'video didn\'t work 😅', message: error.message || 'video generation failed', type: 'error' });
        },
        onOutOfCredits: () => { if (onOutOfCredits) onOutOfCredits(); }
      });
    };
    img.src = imageUrl;
  }, [videoTargetPhotoIndex, selectedPhotoIndex, selectedSubIndex, photos, sogniClient, setPhotos, settings, tokenType, showToast, onOutOfCredits]);

  // Handle Sound to Video batch execution
  const handleBatchS2VExecute = useCallback(async ({ positivePrompt, negativePrompt, audioData, audioUrl, audioStartOffset, videoDuration: customDuration, workflowType, modelVariant, splitMode, perImageDuration }) => {
    setShowBatchS2VPopup(false);
    warmUpAudio();

    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({ title: 'No Images', message: 'No images available for video generation.', type: 'error' });
      return;
    }

    setShowVideoNewBadge(false);

    // CRITICAL: Clear previous workflow state to prevent stale data from persisting
    activeMontageAudioSourceRef.current = null;
    segmentPreviousVideoUrlsRef.current.clear();
    videoRetryAttempts.current.clear();

    // Fetch audio buffer first (needed for both montage source storage and video generation)
    let audioBuffer = audioData;
    if (!audioBuffer && audioUrl) {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = new Uint8Array(arrayBuffer);
      } catch (err) {
        showToast({ title: 'couldn\'t load audio 🎵', message: 'failed to load audio file', type: 'error' });
        return;
      }
    }

    // Use custom duration from popup or fall back to settings
    const baseDuration = customDuration || settings.videoDuration || 5;

    // Set up montage tracking for segment review (only in split mode)
    if (splitMode) {
      const photoIds = loadedPhotos.map(p => p.id);
      console.log(`[S2V Montage] Setting up tracking for ${photoIds.length} segments`);

      // CRITICAL: Reset ALL montage state to prevent stale data from previous batches
      setActiveMontagePhotoIds(photoIds);
      setActiveMontageWorkflowType('s2v');
      montageCompletedRef.current.clear();
      montageStitchCompletedRef.current = false; // Reset for new batch
      montageAutoStitchInProgressRef.current = false; // Reset auto-stitch flag

      // Clear any previous segment review data and version history
      setPendingSegments([]);
      setSegmentReviewData(null);
      setSegmentVersionHistories(new Map()); // Clear version histories for new workflow
      setSelectedSegmentVersions(new Map()); // Clear selected versions for new workflow
      setShowStitchedVideoOverlay(false);
      setShowSegmentReview(false);

      // Clear batch-transition state to prevent the Remix useEffect from repopulating
      setIsTransitionMode(false);
      setTransitionVideoQueue([]);
      setAllTransitionVideosComplete(false);

      // Initialize segment review with generating status immediately (like Infinite Loop)
      const initialSegments = photoIds.map((photoId, index) => {
        const photo = loadedPhotos.find(p => p.id === photoId);
        return {
          url: '',
          index,
          photoId,
          status: 'generating',
          thumbnail: photo?.enhancedImageUrl || photo?.images?.[0] || photo?.originalDataUrl
        };
      });
      setPendingSegments(initialSegments);

      // Build audioSource for S2V montage stitching (mutes individual clips, uses single parent audio)
      // S2V workflow skips first 3 video frames (ImageFromBatch batch_index=3) but audio starts at 0
      // Plus AAC encoder adds ~2048 samples priming delay (~0.75 frames at 16fps)
      // Total compensation: 4 frames at 16fps = 0.25s to the parent audio startOffset
      const S2V_SKIPPED_FRAMES_OFFSET = 4 / 16; // 0.25 seconds (3 skipped frames + ~1 for AAC priming)
      const audioSourceForStitch = {
        type: 's2v',
        audioBuffer: audioBuffer,
        audioUrl: audioUrl,
        startOffset: (audioStartOffset || 0) + S2V_SKIPPED_FRAMES_OFFSET,
        duration: baseDuration
      };

      setSegmentReviewData({
        workflowType: 's2v',
        photoIds: [...photoIds],
        photos: loadedPhotos,
        audioSource: audioSourceForStitch
      });
      
      // Show VideoReviewPopup immediately for segment review
      setShowSegmentReview(true);

      // Also store in ref for backward compatibility / other code paths
      activeMontageAudioSourceRef.current = audioSourceForStitch;
    }

    // In split mode, each image gets perImageDuration at sequential offsets
    // In normal mode, all images use the same duration and offset
    const imageCount = loadedPhotos.length;

    showToast({
      title: '🎤 Batch Sound to Video',
      message: splitMode
        ? `Starting ${imageCount} videos (${perImageDuration.toFixed(2)}s each, split from ${baseDuration.toFixed(2)}s selection)...`
        : `Starting video generation for ${imageCount} image${imageCount > 1 ? 's' : ''}...`,
      type: 'info',
      timeout: 3000
    });

    loadedPhotos.forEach((photo, batchIndex) => {
      const photoIndex = photos.findIndex(p => p.id === photo.id);
      if (photoIndex === -1 || photo.generatingVideo) return;

      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
      if (!imageUrl) return;

      // Calculate per-image duration and audio start offset for split mode
      const imageDuration = splitMode ? perImageDuration : baseDuration;
      const imageAudioStartOffset = splitMode
        ? audioStartOffset + (batchIndex * perImageDuration)
        : audioStartOffset;

      // DEBUG: Log audioStart calculation for each clip
      console.log(`[S2V Montage] Clip ${batchIndex}: audioStartOffset=${audioStartOffset}, batchIndex=${batchIndex}, perImageDuration=${perImageDuration}, imageAudioStartOffset=${imageAudioStartOffset}, imageDuration=${imageDuration}`);

      const img = new Image();
      img.onload = () => {
        // DEBUG: Log inside onload to verify closure captured correct values
        console.log(`[S2V Montage] Image loaded for clip ${batchIndex}, using audioStart=${imageAudioStartOffset}`);

        // Store workflow type and regeneration params BEFORE calling generateVideo
        // This ensures params are available for redo even if the video is cancelled or fails
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[photoIndex]) {
            updated[photoIndex] = {
              ...updated[photoIndex],
              videoWorkflowType: 's2v',
              videoMotionPrompt: positivePrompt || '',
              videoNegativePrompt: negativePrompt || '',
              videoRegenerateParams: {
                referenceAudioUrl: audioUrl,
                audioStart: imageAudioStartOffset || 0,
                audioDuration: imageDuration,
                isMontageSegment: splitMode,
                segmentIndex: splitMode ? batchIndex : undefined
              }
            };
          }
          return updated;
        });

        // Helper function to generate video with retry capability
        const attemptGeneration = (retryCount = 0) => {
          generateVideo({
            photo,
            photoIndex,
            subIndex: 0,
            imageWidth: img.naturalWidth,
            imageHeight: img.naturalHeight,
            sogniClient,
            setPhotos,
            resolution: settings.videoResolution || '480p',
            quality: settings.videoQuality || 'fast',
            fps: settings.videoFramerate || 16,
            duration: imageDuration,
            positivePrompt,
            negativePrompt,
            tokenType,
            workflowType: 's2v',
            referenceAudio: audioBuffer,
            audioStart: imageAudioStartOffset || 0,
            audioDuration: imageDuration,
            modelVariant, // Pass model variant from popup
            // Regeneration metadata
            referenceAudioUrl: audioUrl,
            isMontageSegment: splitMode,
            segmentIndex: splitMode ? batchIndex : undefined,
            onComplete: (videoUrl) => {
              // Clear retry count on success
              videoRetryAttempts.current.delete(photo.id);
              playSonicLogo(settings.soundEnabled);

              // Update pendingSegments to mark this segment as ready
              if (splitMode) {
                setPendingSegments(prev => {
                  const updated = [...prev];
                  const segmentIndex = updated.findIndex(s => s.photoId === photo.id);
                  if (segmentIndex !== -1) {
                    updated[segmentIndex] = { ...updated[segmentIndex], url: videoUrl, status: 'ready' };
                    // Initialize version history for this segment (first successful generation)
                    setSegmentVersionHistories(prevHistories => {
                      const newHistories = new Map(prevHistories);
                      const history = newHistories.get(segmentIndex) || [];
                      if (!history.includes(videoUrl)) {
                        newHistories.set(segmentIndex, [...history, videoUrl]);
                      }
                      return newHistories;
                    });
                    setSelectedSegmentVersions(prevVersions => {
                      const newVersions = new Map(prevVersions);
                      const history = segmentVersionHistories.get(segmentIndex) || [];
                      newVersions.set(segmentIndex, history.length); // Latest version
                      return newVersions;
                    });
                  }
                  return updated;
                });
              }

              // Don't auto-play videos during segment review mode
              if (!splitMode) {
                setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
              }
            },
            onError: (error) => {
              console.error('[BATCH S2V] Error:', error);

              // Update pendingSegments to mark this segment as failed (before retry)
              if (splitMode) {
                setPendingSegments(prev => {
                  const updated = [...prev];
                  const segmentIndex = updated.findIndex(s => s.photoId === photo.id);
                  if (segmentIndex !== -1 && retryCount >= 2) {
                    // Only mark as failed after retries exhausted
                    updated[segmentIndex] = { ...updated[segmentIndex], status: 'failed' };
                  }
                  return updated;
                });
              }

              // Check if this is a montage mode video and we haven't exhausted retries (2 automatic retries = 3 total attempts)
              if (splitMode && retryCount < 2) {
                const nextRetryCount = retryCount + 1;
                videoRetryAttempts.current.set(photo.id, nextRetryCount);

                console.log(`[BATCH S2V] Retrying segment ${batchIndex + 1} (attempt ${nextRetryCount + 1}/3)...`);

                // Show retry toast only for montage segments
                showToast({
                  title: 'retrying segment ♻️',
                  message: `segment ${batchIndex + 1} didn't work, trying again (${nextRetryCount + 1}/3)...`,
                  type: 'warning',
                  timeout: 3000
                });

                // Retry after a brief delay
                setTimeout(() => attemptGeneration(nextRetryCount), 1000);
              } else {
                // Exhausted retries or not montage mode
                videoRetryAttempts.current.delete(photo.id);

                if (splitMode && retryCount >= 2) {
                  showToast({
                    title: 'segment didn\'t work 😅',
                    message: `segment ${batchIndex + 1} failed after 3 tries. this might affect the full montage`,
                    type: 'error',
                    timeout: 5000
                  });
                }
              }
            },
            onOutOfCredits: () => { if (onOutOfCredits) onOutOfCredits(); }
          });
        };
        
        // Start generation
        attemptGeneration();
      };
      img.src = imageUrl;
    });
  }, [photos, sogniClient, setPhotos, settings, tokenType, showToast, onOutOfCredits]);

  // ============================================
  // Camera Angle Generation Handlers
  // ============================================

  // Handle camera angle generation (single image) - uses SDK directly like VideoGenerator
  const handleCameraAngleGenerate = useCallback(async (params) => {
    setShowCameraAnglePopup(false);

    const targetIndex = selectedPhotoIndex;
    if (targetIndex === null || !sogniClient) return;

    const photo = photos[targetIndex];
    if (!photo || photo.loading || photo.generating || photo.generatingCameraAngle) return;

    const imageUrl = photo.enhancedImageUrl || photo.images?.[selectedSubIndex || 0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({
        title: 'No Image',
        message: 'No image available for camera angle generation.',
        type: 'error'
      });
      return;
    }

    // Get image dimensions first
    const img = new Image();
    img.crossOrigin = 'anonymous';

    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });
    } catch {
      showToast({
        title: 'Image Load Error',
        message: 'Could not load the source image.',
        type: 'error'
      });
      return;
    }

    const width = img.naturalWidth;
    const height = img.naturalHeight;

    showToast({
      title: '📐 Generating New Angle',
      message: `Creating ${params.azimuth} view...`,
      type: 'info',
      timeout: 3000
    });

    // Use the CameraAngleGenerator service (same pattern as VideoGenerator)
    generateCameraAngle({
      photo,
      photoIndex: targetIndex,
      subIndex: selectedSubIndex || 0,
      imageWidth: width,
      imageHeight: height,
      sogniClient,
      setPhotos,
      azimuth: params.azimuth,
      elevation: params.elevation,
      distance: params.distance,
      loraStrength: params.loraStrength,
      tokenType,
      onComplete: (resultUrl) => {
        showToast({
          title: '📐 New Angle Ready!',
          message: 'Swipe to view the new angle!',
          type: 'success'
        });
      },
      onError: (error) => {
        showToast({
          title: 'Generation Failed',
          message: error.message || 'Camera angle generation failed',
          type: 'error'
        });
      },
      onOutOfCredits
    });
  }, [selectedPhotoIndex, selectedSubIndex, photos, sogniClient, setPhotos, tokenType, showToast, onOutOfCredits]);

  // Handle batch camera angle generation - uses SDK directly like VideoGenerator
  const handleBatchCameraAngleGenerate = useCallback(async (params) => {
    setShowCameraAnglePopup(false);

    if (!sogniClient) {
      showToast({
        title: 'Not Connected',
        message: 'Please wait for connection to complete.',
        type: 'error'
      });
      return;
    }

    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.generatingCameraAngle && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({
        title: 'No Images',
        message: 'No images available for camera angle generation.',
        type: 'error'
      });
      return;
    }

    showToast({
      title: '📐 Batch Camera Angle',
      message: `Generating ${params.azimuth} view for ${loadedPhotos.length} images...`,
      type: 'info',
      timeout: 4000
    });

    // Process each photo using the CameraAngleGenerator service
    for (const photo of loadedPhotos) {
      const photoIndex = photos.findIndex(p => p.id === photo.id);
      if (photoIndex === -1 || photo.generatingCameraAngle) continue;

      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
      if (!imageUrl) continue;

      // Get image dimensions
      const img = new Image();
      img.crossOrigin = 'anonymous';

      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUrl;
        });
      } catch {
        console.error(`[BatchCameraAngle] Failed to load image for photo ${photo.id}`);
        continue;
      }

      const width = img.naturalWidth;
      const height = img.naturalHeight;

      // Use the CameraAngleGenerator service (same pattern as VideoGenerator)
      generateCameraAngle({
        photo,
        photoIndex,
        subIndex: 0,
        imageWidth: width,
        imageHeight: height,
        sogniClient,
        setPhotos,
        azimuth: params.azimuth,
        elevation: params.elevation,
        distance: params.distance,
        loraStrength: params.loraStrength,
        tokenType,
        onComplete: () => {
          showToast({
            title: '📐 Angle Added',
            message: 'New angle ready!',
            type: 'success',
            timeout: 2000
          });
        },
        onError: (error) => {
          console.error(`[BatchCameraAngle] Error for photo ${photo.id}:`, error);
          showToast({
            title: '📐 Angle Failed',
            message: error.message || 'Camera angle generation failed',
            type: 'error',
            timeout: 3000
          });
        },
        onOutOfCredits
      });
    }
  }, [photos, sogniClient, setPhotos, tokenType, showToast, onOutOfCredits]);

  // Handle batch per-image angle generation (different angles for different images)
  const handleBatchPerImageAngleGenerate = useCallback(async (angles, mode) => {
    setShowCameraAnglePopup(false);

    if (!sogniClient) {
      showToast({
        title: 'Not Connected',
        message: 'Please wait for connection to complete.',
        type: 'error'
      });
      return;
    }

    const loadedPhotos = photos.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.generatingCameraAngle && !photo.error && photo.images && photo.images.length > 0 && !photo.isOriginal
    );

    if (loadedPhotos.length === 0) {
      showToast({
        title: 'No Images',
        message: 'No images available for camera angle generation.',
        type: 'error'
      });
      return;
    }

    // Count how many angles will actually generate (non-isOriginal slots)
    const generatingCount = angles.filter(a => !a.isOriginal).length;

    if (generatingCount === 0) {
      showToast({
        title: 'No Angles to Generate',
        message: 'All angles are set to use original perspective.',
        type: 'info'
      });
      return;
    }

    // SINGLE PHOTO: Use the multi-angle review popup flow (same as handleMultiAngleConfirm)
    // This ensures the review popup appears for single-photo batches
    if (loadedPhotos.length === 1) {
      const photo = loadedPhotos[0];
      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;

      if (!imageUrl) {
        showToast({
          title: 'No Image',
          message: 'No image available for multi-angle generation.',
          type: 'error'
        });
        return;
      }

      // Get image dimensions
      const img = new Image();
      img.crossOrigin = 'anonymous';

      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUrl;
        });
      } catch {
        showToast({
          title: 'Image Load Error',
          message: 'Could not load the source image.',
          type: 'error'
        });
        return;
      }

      const width = img.naturalWidth;
      const height = img.naturalHeight;

      // Initialize items and open review popup
      const items = createAngleGenerationItems(angles, imageUrl);
      setMultiAngleItems(items);
      setMultiAngleSourcePhoto(photo);
      setMultiAngleKeepOriginal(true);
      setMultiAngleSourceUrl(imageUrl);
      multiAngleAbortRef.current = false;
      setShowMultiAngleReview(true);

      showToast({
        title: '📐 Generating Angles',
        message: `Creating ${angles.length} camera angles...`,
        type: 'info',
        timeout: 3000
      });

      // Start generation with callbacks
      await generateMultipleAngles(
        sogniClient,
        {
          sourceImageUrl: imageUrl,
          sourcePhotoId: photo.id,
          angles,
          tokenType,
          imageWidth: width,
          imageHeight: height,
          outputFormat: settings.outputFormat
        },
        {
          onItemStart: (index, slotId) => {
            if (multiAngleAbortRef.current) return;
            setMultiAngleItems(prev => markItemStarted(prev, index));
          },
          onItemProgress: (index, progress, eta, workerName) => {
            if (multiAngleAbortRef.current) return;
            setMultiAngleItems(prev => updateItemProgress(prev, index, progress, eta, workerName));
          },
          onItemComplete: (index, resultUrl) => {
            if (multiAngleAbortRef.current) return;
            setMultiAngleItems(prev => markItemComplete(prev, index, resultUrl));
          },
          onItemError: (index, error) => {
            if (multiAngleAbortRef.current) return;
            setMultiAngleItems(prev => markItemFailed(prev, index, error));
          },
          onOutOfCredits: () => {
            showToast({
              title: 'Out of Credits',
              message: 'Please add more credits to continue.',
              type: 'error'
            });
            onOutOfCredits?.();
          },
          onAllComplete: (results) => {
            if (multiAngleAbortRef.current) return;
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            if (failCount === 0) {
              showToast({
                title: '📐 All Angles Ready!',
                message: `${successCount} angle${successCount > 1 ? 's' : ''} generated. Click "Apply to Gallery" to add them.`,
                type: 'success'
              });
            } else if (successCount > 0) {
              showToast({
                title: '📐 Some Angles Ready',
                message: `${successCount} ready, ${failCount} failed. You can regenerate failed ones.`,
                type: 'warning'
              });
            } else {
              showToast({
                title: 'Generation Failed',
                message: 'All angle generations failed. Please try again.',
                type: 'error'
              });
            }
          }
        }
      );
      return;
    }

    // MULTIPLE PHOTOS: Continue with batch processing (no review popup)
    showToast({
      title: '📐 Batch Camera Angle',
      message: `Generating ${generatingCount} angle${generatingCount !== 1 ? 's' : ''} from ${loadedPhotos.length} image${loadedPhotos.length !== 1 ? 's' : ''}...`,
      type: 'info',
      timeout: 4000
    });

    // Process each photo with its corresponding angle slot
    for (let i = 0; i < loadedPhotos.length; i++) {
      const photo = loadedPhotos[i];
      // Get the corresponding angle slot (loop if more images than slots, though shouldn't happen)
      const angleSlot = angles[i % angles.length];

      // Skip if this slot uses original perspective
      if (angleSlot.isOriginal) continue;

      const photoIndex = photos.findIndex(p => p.id === photo.id);
      if (photoIndex === -1 || photo.generatingCameraAngle) continue;

      const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
      if (!imageUrl) continue;

      // Get image dimensions
      const img = new Image();
      img.crossOrigin = 'anonymous';

      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUrl;
        });
      } catch {
        console.error(`[BatchPerImageAngle] Failed to load image for photo ${photo.id}`);
        continue;
      }

      const width = img.naturalWidth;
      const height = img.naturalHeight;

      // Use the CameraAngleGenerator service with this slot's angle settings
      generateCameraAngle({
        photo,
        photoIndex,
        subIndex: 0,
        imageWidth: width,
        imageHeight: height,
        sogniClient,
        setPhotos,
        azimuth: angleSlot.azimuth,
        elevation: angleSlot.elevation,
        distance: angleSlot.distance,
        loraStrength: 0.9,
        tokenType,
        onComplete: () => {
          showToast({
            title: '📐 Angle Added',
            message: 'New angle ready!',
            type: 'success',
            timeout: 2000
          });
        },
        onError: (error) => {
          console.error(`[BatchPerImageAngle] Error for photo ${photo.id}:`, error);
          showToast({
            title: '📐 Angle Failed',
            message: error.message || 'Camera angle generation failed',
            type: 'error',
            timeout: 3000
          });
        },
        onOutOfCredits
      });
    }
  }, [photos, sogniClient, setPhotos, tokenType, showToast, onOutOfCredits]);

  // Handle multi-angle camera generation (single image → multiple angles)
  const handleMultiAngleConfirm = useCallback(async (angles, mode) => {
    setShowCameraAnglePopup(false);

    const targetIndex = selectedPhotoIndex;
    if (targetIndex === null || !sogniClient) return;

    const photo = photos[targetIndex];
    if (!photo || photo.loading || photo.generating || photo.generatingCameraAngle) return;

    const imageUrl = photo.enhancedImageUrl || photo.images?.[selectedSubIndex || 0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({
        title: 'No Image',
        message: 'No image available for multi-angle generation.',
        type: 'error'
      });
      return;
    }

    // Get image dimensions
    const img = new Image();
    img.crossOrigin = 'anonymous';

    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });
    } catch {
      showToast({
        title: 'Image Load Error',
        message: 'Could not load the source image.',
        type: 'error'
      });
      return;
    }

    const width = img.naturalWidth;
    const height = img.naturalHeight;

    // Initialize items and open review popup
    const items = createAngleGenerationItems(angles, imageUrl);
    setMultiAngleItems(items);
    setMultiAngleSourcePhoto(photo);
    setMultiAngleKeepOriginal(true);
    setMultiAngleSourceUrl(imageUrl);
    multiAngleAbortRef.current = false;
    setShowMultiAngleReview(true);

    showToast({
      title: '📐 Generating Angles',
      message: `Creating ${angles.length} camera angles...`,
      type: 'info',
      timeout: 3000
    });

    // Start generation with callbacks
    await generateMultipleAngles(
      sogniClient,
      {
        sourceImageUrl: imageUrl,
        sourcePhotoId: photo.id,
        angles,
        tokenType,
        imageWidth: width,
        imageHeight: height,
        outputFormat: settings.outputFormat
      },
      {
        onItemStart: (index, slotId) => {
          if (multiAngleAbortRef.current) return;
          setMultiAngleItems(prev => markItemStarted(prev, index));
        },
        onItemProgress: (index, progress, eta, workerName) => {
          if (multiAngleAbortRef.current) return;
          setMultiAngleItems(prev => updateItemProgress(prev, index, progress, eta, workerName));
        },
        onItemComplete: (index, resultUrl) => {
          if (multiAngleAbortRef.current) return;
          setMultiAngleItems(prev => markItemComplete(prev, index, resultUrl));
        },
        onItemError: (index, error) => {
          if (multiAngleAbortRef.current) return;
          setMultiAngleItems(prev => markItemFailed(prev, index, error));
        },
        onOutOfCredits: () => {
          showToast({
            title: 'Out of Credits',
            message: 'Please add more credits to continue.',
            type: 'error'
          });
          onOutOfCredits?.();
        },
        onAllComplete: (results) => {
          if (multiAngleAbortRef.current) return;
          const successCount = results.filter(r => r.success).length;
          const failCount = results.filter(r => !r.success).length;

          if (failCount === 0) {
            showToast({
              title: '📐 All Angles Ready!',
              message: `${successCount} angle${successCount > 1 ? 's' : ''} generated. Click "Apply to Gallery" to add them.`,
              type: 'success'
            });
          } else if (successCount > 0) {
            showToast({
              title: '📐 Some Angles Ready',
              message: `${successCount} ready, ${failCount} failed. You can regenerate failed ones.`,
              type: 'warning'
            });
          } else {
            showToast({
              title: 'Generation Failed',
              message: 'All angle generations failed. Please try again.',
              type: 'error'
            });
          }
        }
      }
    );
  }, [selectedPhotoIndex, selectedSubIndex, photos, sogniClient, tokenType, showToast, onOutOfCredits]);

  // Handle regenerating a single item in multi-angle review
  const handleMultiAngleRegenerate = useCallback(async (index) => {
    if (!sogniClient || !multiAngleSourceUrl) return;

    const item = multiAngleItems[index];
    if (!item || item.status === 'generating') return;

    // Debug logging for regeneration
    console.log(`[PhotoGallery] Regenerating angle at index ${index}`);
    console.log(`[PhotoGallery] Item being regenerated:`, {
      slotId: item.slotId,
      angleConfig: item.angleConfig,
      previousResultUrl: item.resultUrl,
      versionCount: item.versionHistory.length
    });
    console.log(`[PhotoGallery] Source URL: ${multiAngleSourceUrl}`);

    // Reset item for regeneration
    setMultiAngleItems(prev => resetItemForRegeneration(prev, index));

    // Get dimensions from a working image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = multiAngleSourceUrl;
      });
    } catch {
      setMultiAngleItems(prev => markItemFailed(prev, index, 'Failed to load source image'));
      return;
    }

    const width = img.naturalWidth;
    const height = img.naturalHeight;

    // Regenerate just this one
    await generateMultipleAngles(
      sogniClient,
      {
        sourceImageUrl: multiAngleSourceUrl,
        sourcePhotoId: multiAngleSourcePhoto?.id || '',
        angles: [{
          id: item.slotId,
          azimuth: item.angleConfig.azimuth,
          elevation: item.angleConfig.elevation,
          distance: item.angleConfig.distance
        }],
        tokenType,
        imageWidth: width,
        imageHeight: height,
        outputFormat: settings.outputFormat
      },
      {
        onItemStart: () => {
          setMultiAngleItems(prev => markItemStarted(prev, index));
        },
        onItemProgress: (_, progress, eta, workerName) => {
          setMultiAngleItems(prev => updateItemProgress(prev, index, progress, eta, workerName));
        },
        onItemComplete: (_, resultUrl) => {
          setMultiAngleItems(prev => markItemComplete(prev, index, resultUrl));
          showToast({
            title: '📐 Angle Regenerated',
            message: 'New version ready!',
            type: 'success',
            timeout: 2000
          });
        },
        onItemError: (_, error) => {
          setMultiAngleItems(prev => markItemFailed(prev, index, error));
          showToast({
            title: 'Regeneration Failed',
            message: error,
            type: 'error'
          });
        },
        onOutOfCredits: () => {
          onOutOfCredits?.();
        }
      }
    );
  }, [multiAngleItems, sogniClient, multiAngleSourceUrl, multiAngleSourcePhoto, tokenType, showToast, onOutOfCredits]);

  // Handle version change in multi-angle review
  const handleMultiAngleVersionChange = useCallback((index, version) => {
    setMultiAngleItems(prev => prev.map((item, i) =>
      i === index ? { ...item, selectedVersion: version } : item
    ));
  }, []);

  // Handle applying multi-angle results to gallery
  const handleMultiAngleApply = useCallback((finalUrls) => {
    if (!multiAngleSourcePhoto || finalUrls.length === 0) {
      setShowMultiAngleReview(false);
      return;
    }

    // Create new photo entries for each angle result
    // Note: Don't set isOriginal flag - all photos should participate in transitions equally
    const newPhotos = finalUrls.map((url, idx) => ({
      id: `${multiAngleSourcePhoto.id}-angle-${Date.now()}-${idx}`,
      generating: false,
      images: [url],
      originalDataUrl: url,
      newlyArrived: true,
      selectedStyle: multiAngleSourcePhoto.selectedStyle,
      promptKey: multiAngleSourcePhoto.promptKey
    }));

    // REPLACE the gallery with the new photos (don't append)
    setPhotos(newPhotos);

    showToast({
      title: '📐 Gallery Updated',
      message: `Replaced gallery with ${finalUrls.length} image${finalUrls.length > 1 ? 's' : ''}.`,
      type: 'success'
    });

    // Close review popup and reset state
    setShowMultiAngleReview(false);
    setMultiAngleItems([]);
    setMultiAngleSourcePhoto(null);
    setMultiAngleSourceUrl(null);
  }, [multiAngleSourcePhoto, setPhotos, showToast]);

  // Handle canceling multi-angle generation
  const handleMultiAngleCancelGeneration = useCallback(() => {
    multiAngleAbortRef.current = true;
    showToast({
      title: 'Generation Cancelled',
      message: 'Multi-angle generation stopped.',
      type: 'info',
      timeout: 2000
    });
  }, [showToast]);

  // Handle angle regeneration for a single photo using stored parameters
  const handleRegenerateAngle = useCallback(async (photo, photoIndex) => {
    if (!photo || photo.generatingCameraAngle) return;

    const regenerateParams = photo.cameraAngleRegenerateParams;
    if (!regenerateParams) {
      showToast({
        title: 'Can\'t Regenerate',
        message: 'Angle regeneration info not available.',
        type: 'warning',
        timeout: 4000
      });
      return;
    }

    // Use the stored source URL (original image before any angle was applied)
    const imageUrl = photo.cameraAngleSourceUrl;
    if (!imageUrl) {
      showToast({ title: 'Can\'t Regenerate', message: 'Original image not available.', type: 'error' });
      return;
    }

    showToast({
      title: '🔄 Regenerating Angle',
      message: 'Generating new camera angle...',
      type: 'info',
      timeout: 3000
    });

    // Load image dimensions
    const img = new Image();
    img.crossOrigin = 'anonymous';

    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      await generateCameraAngle({
        photo,
        photoIndex,
        subIndex: 0,
        imageWidth: img.naturalWidth,
        imageHeight: img.naturalHeight,
        sogniClient,
        setPhotos,
        azimuth: regenerateParams.azimuth,
        elevation: regenerateParams.elevation,
        distance: regenerateParams.distance,
        loraStrength: regenerateParams.loraStrength,
        tokenType,
        onComplete: () => {
          showToast({
            title: '📐 Angle Regenerated',
            message: 'New angle version ready!',
            type: 'success',
            timeout: 3000
          });
        },
        onError: (error) => {
          showToast({
            title: 'Regeneration Failed',
            message: error.message || 'Failed to regenerate angle',
            type: 'error'
          });
        },
        onOutOfCredits
      });
    } catch (error) {
      showToast({
        title: 'Regeneration Failed',
        message: error.message || 'Failed to load source image',
        type: 'error'
      });
    }
  }, [sogniClient, setPhotos, tokenType, showToast, onOutOfCredits]);

  // Handle video regeneration for a single photo using stored parameters
  const handleRegenerateVideo = useCallback(async (photo, photoIndex) => {
    if (!photo || photo.generatingVideo) return;

    const workflowType = photo.videoWorkflowType || 'default';
    const regenerateParams = photo.videoRegenerateParams;

    // For S2V, Animate Move, Animate Replace, Batch Transition - check if we have regeneration params
    const isAdvancedWorkflow = ['s2v', 'animate-move', 'animate-replace', 'batch-transition'].includes(workflowType);
    if (isAdvancedWorkflow && !regenerateParams) {
      showToast({
        title: 'can\'t regenerate 🤔',
        message: 'regeneration info not available. try creating a new video?',
        type: 'warning',
        timeout: 4000
      });
      return;
    }

    const imageUrl = photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl;
    if (!imageUrl) {
      showToast({ title: 'couldn\'t regenerate 😅', message: 'no image available', type: 'error' });
      return;
    }

    warmUpAudio();

    // Get workflow display name
    const workflowNames = {
      's2v': 'Sound to Video',
      'animate-move': 'Animate Move',
      'animate-replace': 'Animate Replace',
      'batch-transition': 'Transition',
      'default': 'Video',
      'i2v': 'Video'
    };
    const segmentInfo = regenerateParams?.isMontageSegment
      ? ` (Segment ${(regenerateParams.segmentIndex || 0) + 1})`
      : '';
    
    showToast({
      title: '🔄 Regenerating Video',
      message: `Regenerating ${workflowNames[workflowType] || 'video'}${segmentInfo}...`,
      type: 'info',
      timeout: 3000
    });

    // Load image dimensions
    const img = new Image();
    img.onload = async () => {
      try {
        // Fetch reference media if needed (only for advanced workflows)
        // Falls back to IndexedDB if blob URL fails (e.g., after page refresh or blob revocation)
        let referenceBuffer = null;
        
        if (workflowType === 's2v' && regenerateParams?.referenceAudioUrl) {
          try {
            const response = await fetch(regenerateParams.referenceAudioUrl);
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            referenceBuffer = new Uint8Array(arrayBuffer);
          } catch (fetchError) {
            console.warn('[Regenerate] Audio URL fetch failed, trying IndexedDB fallback:', fetchError);
            // Fallback to last stored recording from IndexedDB
            const storedRecording = await getLastRecording('audio');
            if (storedRecording) {
              const arrayBuffer = await storedRecording.blob.arrayBuffer();
              referenceBuffer = new Uint8Array(arrayBuffer);
              console.log('[Regenerate] Using stored audio from IndexedDB');
            } else {
              throw new Error('Could not load audio. Please record a new audio clip.');
            }
          }
        } else if ((workflowType === 'animate-move' || workflowType === 'animate-replace') && regenerateParams?.referenceVideoUrl) {
          try {
            const response = await fetch(regenerateParams.referenceVideoUrl);
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            referenceBuffer = new Uint8Array(arrayBuffer);
          } catch (fetchError) {
            console.warn('[Regenerate] Video URL fetch failed, trying IndexedDB fallback:', fetchError);
            // Fallback to last stored recording from IndexedDB
            const storedRecording = await getLastRecording('video');
            if (storedRecording) {
              const arrayBuffer = await storedRecording.blob.arrayBuffer();
              referenceBuffer = new Uint8Array(arrayBuffer);
              console.log('[Regenerate] Using stored video from IndexedDB');
            } else {
              throw new Error('Could not load video. Please record a new video.');
            }
          }
        }

        // Build generation options based on workflow type
        const baseOptions = {
          photo,
          photoIndex,
          subIndex: 0,
          imageWidth: img.naturalWidth,
          imageHeight: img.naturalHeight,
          sogniClient,
          setPhotos,
          resolution: photo.videoResolution || settings.videoResolution || '480p',
          quality: settings.videoQuality || 'fast',
          fps: photo.videoFramerate || settings.videoFramerate || 16,
          duration: photo.videoDuration || settings.videoDuration || 5,
          positivePrompt: photo.videoMotionPrompt || '',
          negativePrompt: photo.videoNegativePrompt || '',
          tokenType,
          // For I2V/default, don't pass workflowType so it uses default
          workflowType: isAdvancedWorkflow ? workflowType : undefined,
          modelVariant: photo.videoModelVariant,
          // Regeneration metadata (preserve for next regeneration)
          isMontageSegment: regenerateParams?.isMontageSegment,
          segmentIndex: regenerateParams?.segmentIndex,
          onComplete: () => {
            playSonicLogo(settings.soundEnabled);
            showToast({
              title: '✅ Video Regenerated',
              message: `${workflowNames[workflowType] || 'Video'}${segmentInfo} complete!`,
              type: 'success',
              timeout: 3000
            });
            setPlayingGeneratedVideoIds(prev => new Set([...prev, photo.id]));
          },
          onError: (error) => {
            showToast({
              title: 'regeneration didn\'t work 😅',
              message: error.message || 'video regeneration failed',
              type: 'error',
              timeout: 5000
            });
          },
          onOutOfCredits: () => { if (onOutOfCredits) onOutOfCredits(); }
        };

        // Add workflow-specific options
        if (workflowType === 's2v') {
          generateVideo({
            ...baseOptions,
            referenceAudio: referenceBuffer,
            audioStart: regenerateParams.audioStart || 0,
            audioDuration: regenerateParams.audioDuration || photo.videoDuration || 5,
            referenceAudioUrl: regenerateParams.referenceAudioUrl
          });
        } else if (workflowType === 'animate-move') {
          generateVideo({
            ...baseOptions,
            referenceVideo: referenceBuffer,
            videoStart: regenerateParams.videoStart || 0,
            referenceVideoUrl: regenerateParams.referenceVideoUrl
          });
        } else if (workflowType === 'animate-replace') {
          generateVideo({
            ...baseOptions,
            referenceVideo: referenceBuffer,
            videoStart: regenerateParams.videoStart || 0,
            sam2Coordinates: regenerateParams.sam2Coordinates,
            referenceVideoUrl: regenerateParams.referenceVideoUrl
          });
        } else if (workflowType === 'batch-transition') {
          // Batch transition requires the next photo's image for the end frame
          const nextPhotoId = regenerateParams?.nextPhotoId;
          const nextPhoto = photos.find(p => p.id === nextPhotoId);

          if (!nextPhoto) {
            showToast({
              title: 'Can\'t Regenerate',
              message: 'Next image in sequence not found.',
              type: 'error'
            });
            return;
          }

          const nextImageUrl = nextPhoto.enhancedImageUrl || nextPhoto.images?.[0] || nextPhoto.originalDataUrl;

          // Load both images using module-level loadImageAsBuffer helper
          const [currentImage, nextImage] = await Promise.all([
            loadImageAsBuffer(imageUrl),
            loadImageAsBuffer(nextImageUrl)
          ]);

          generateVideo({
            ...baseOptions,
            workflowType: 'batch-transition',
            referenceImage: currentImage.buffer,
            referenceImageEnd: nextImage.buffer,
            // Pass nextPhotoId so it gets stored again for subsequent regenerations
            nextPhotoId,
            // Trim last frame for seamless stitching with next segment
            trimEndFrame: settings.videoTrimEndFrame ?? false
          });
        } else {
          // Default I2V workflow
          generateVideo({ ...baseOptions });
        }
      } catch (error) {
        console.error('[Regenerate] Error:', error);
        showToast({
          title: 'couldn\'t load media 😅',
          message: 'failed to load reference media. try creating a new video?',
          type: 'error',
          timeout: 5000
        });
      }
    };
    
    img.onerror = () => {
      showToast({ title: 'couldn\'t regenerate 😅', message: 'failed to load image', type: 'error' });
    };
    
    img.src = imageUrl;
  }, [sogniClient, setPhotos, settings, tokenType, showToast, onOutOfCredits]);

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
        title: 'oops! no images 📸',
        message: 'need some images to make videos!',
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
                title: 'all done! 🎉',
                message: `all ${successCount} video${successCount > 1 ? 's' : ''} generated!`,
                type: 'success',
                timeout: 5000
              });
            }
          },
          onError: (error) => {
            errorCount++;
            if (errorCount === loadedPhotos.length) {
              showToast({
                title: 'batch didn\'t work 😅',
                message: 'all video generations failed. wanna try again?',
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
                title: 'all done! 🎉',
                message: `all ${successCount} video${successCount > 1 ? 's' : ''} generated!`,
                type: 'success',
                timeout: 5000
              });
            }
          },
          onError: (error) => {
            errorCount++;
            if (errorCount === loadedPhotos.length) {
              showToast({
                title: 'batch didn\'t work 😅',
                message: 'all video generations failed. wanna try again?',
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
        title: 'stitching didn\'t work 😅',
        message: 'failed to generate stitched video. wanna try again?',
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
        title: 'oops! no images 📸',
        message: 'need some images for transition videos!',
        type: 'error'
      });
      return;
    }

    // Set transition mode and store the queue of photo IDs in order
    const photoIds = loadedPhotos.map(p => p.id);
    setIsTransitionMode(true);
    setTransitionVideoQueue(photoIds);
    setAllTransitionVideosComplete(false);  // Reset sync mode for new batch
    setTransitionVideoDownloaded(false);  // Reset download flag for new batch
    setCurrentVideoIndexByPhoto({});  // Reset video indices

    // Clean up music state for new batch
    if (appliedMusic?.audioUrl) {
      URL.revokeObjectURL(appliedMusic.audioUrl);
    }
    setAppliedMusic(null);
    setIsInlineAudioMuted(false);

    // CRITICAL: Reset ALL montage/segment state to prevent stale data from previous batches
    montageStitchCompletedRef.current = false;
    montageAutoStitchInProgressRef.current = false;
    activeMontageAudioSourceRef.current = null;
    segmentPreviousVideoUrlsRef.current.clear();
    videoRetryAttempts.current.clear();

    // Clear any previous segment review data and version history
    setPendingSegments([]);
    setSegmentReviewData(null);
    setSegmentVersionHistories(new Map()); // Clear version histories for new workflow
    setSelectedSegmentVersions(new Map()); // Clear selected versions for new workflow
    setShowStitchedVideoOverlay(false);
    setShowSegmentReview(false);

    // Initialize segment review with generating status immediately (like Infinite Loop)
    const initialSegments = photoIds.map((photoId, index) => {
      const photo = loadedPhotos.find(p => p.id === photoId);
      return {
        url: '',
        index,
        photoId,
        status: 'generating',
        thumbnail: photo?.enhancedImageUrl || photo?.images?.[0] || photo?.originalDataUrl
      };
    });
    setPendingSegments(initialSegments);
    setSegmentReviewData({
      workflowType: 'batch-transition',
      photoIds: [...photoIds],
      photos: loadedPhotos
    });
    
    // Show segment review popup immediately (like Infinite Loop's TransitionReviewPopup)
    setShowSegmentReview(true);
    if (inlineAudioRef.current) {
      inlineAudioRef.current.pause();
    }

    // Hide the NEW badge after first video generation attempt
    setShowVideoNewBadge(false);

    // NOTE: Batch Transition uses its own existing flow with transitionVideoQueue,
    // allTransitionVideosComplete, music integration, and notification popup.
    // Do NOT add montage tracking here - it would conflict with the existing flow.

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
      const nextPhotoId = nextPhoto.id;

      return { photo, photoIndex, currentPhoto, currentImageUrl, nextImageUrl, generatingPhotoId, nextPhotoId, i };
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
            // Batch Transition uses VideoReviewPopup (shown immediately at start)
            // So we don't need the "Your Video is Ready!" notification
            // User can stitch directly from the review popup when ready
            console.log('[Transition] All videos complete. User can stitch from VideoReviewPopup.');
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
      const { photo, photoIndex, currentPhoto, currentImageUrl, nextImageUrl, nextPhotoId, i } = photoData;
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

        // Store workflow type and regeneration params BEFORE calling generateVideo
        // This ensures params are available for redo even if the video is cancelled or fails
        setPhotos(prev => {
          const updated = [...prev];
          if (updated[photoIndex]) {
            updated[photoIndex] = {
              ...updated[photoIndex],
              videoWorkflowType: 'batch-transition',
              videoRegenerateParams: {
                nextPhotoId,
                isMontageSegment: true,
                segmentIndex: i
              }
            };
          }
          return updated;
        });

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
          workflowType: 'batch-transition',
          referenceImage: currentImage.buffer,
          referenceImageEnd: nextImage.buffer,
          // Trim last frame for seamless stitching with next segment
          trimEndFrame: settings.videoTrimEndFrame ?? false,
          // Regeneration metadata for redo functionality
          nextPhotoId,
          isMontageSegment: true,
          segmentIndex: i,
          onComplete: (videoUrl) => {
            successCount++;
            console.log(`[Transition]${retryLabel} Video ${i + 1} completed successfully`);

            // Play sonic logo and auto-play this video immediately as it completes
            playSonicLogo(settings.soundEnabled);

            // Update pendingSegments to mark this segment as ready
            setPendingSegments(prev => {
              const updated = [...prev];
              const segmentIndex = updated.findIndex(s => s.photoId === photo.id);
              if (segmentIndex !== -1) {
                updated[segmentIndex] = { ...updated[segmentIndex], url: videoUrl, status: 'ready' };
                // Initialize version history for this segment (first successful generation)
                setSegmentVersionHistories(prevHistories => {
                  const newHistories = new Map(prevHistories);
                  const history = newHistories.get(segmentIndex) || [];
                  if (!history.includes(videoUrl)) {
                    newHistories.set(segmentIndex, [...history, videoUrl]);
                  }
                  return newHistories;
                });
                setSelectedSegmentVersions(prevVersions => {
                  const newVersions = new Map(prevVersions);
                  const history = segmentVersionHistories.get(segmentIndex) || [];
                  newVersions.set(segmentIndex, history.length); // Latest version
                  return newVersions;
                });
              }
              return updated;
            });

            // Set this polaroid to play its own video
            setCurrentVideoIndexByPhoto(prev => ({
              ...prev,
              [photo.id]: i
            }));

            // Don't auto-play videos on polaroids during segment review mode
            // (they can preview in the segment review popup)

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
              
              // Update pendingSegments to mark this segment as failed
              setPendingSegments(prev => {
                const updated = [...prev];
                const segmentIndex = updated.findIndex(s => s.photoId === photo.id);
                if (segmentIndex !== -1) {
                  updated[segmentIndex] = { ...updated[segmentIndex], status: 'failed' };
                }
                return updated;
              });
              
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

    const usesContextImages = selectedModel && isContextImageModel(selectedModel);
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
      
      // Check if any theme group filters are enabled (for all models)
      const enabledThemeGroups = Object.entries(themeGroupState)
        .filter(([groupId, enabled]) => enabled && groupId !== 'favorites')
        .map(([groupId]) => groupId);
      
      if (enabledThemeGroups.length > 0) {
        enabledFilters.push('themes');
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
      
      // Check theme group filters (for all models)
      if (!matchesAnyFilter) {
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

  // Auto-play generated video when entering slideshow mode
  // Note: Must be defined after filteredPhotos to avoid temporal dead zone
  useEffect(() => {
    if (selectedPhotoIndex !== null) {
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
      const selectedPhoto = currentPhotosArray[selectedPhotoIndex];
      
      // If the selected photo has a generated video, add it to playing set so it auto-plays with audio and loops
      if (selectedPhoto?.videoUrl && selectedPhoto?.id && !selectedPhoto.generatingVideo) {
        setPlayingGeneratedVideoIds(prev => {
          const newSet = new Set(prev);
          newSet.add(selectedPhoto.id);
          return newSet;
        });
      }
    }
  }, [selectedPhotoIndex, isPromptSelectorMode, filteredPhotos, photos]);

  // Show infinite loop stitch tip when batch videos complete (non-transition mode)
  // Note: Must be defined after filteredPhotos to avoid temporal dead zone
  useEffect(() => {
    // Only show once per batch (not per user lifetime)
    if (hasShownInfiniteLoopTipThisBatch) {
      return;
    }

    // Only show in non-transition mode
    if (isTransitionMode || transitionVideoQueue.length > 0) {
      return;
    }

    // Don't show for Batch Transition, Infinite Loop, or montage mode workflows
    // (S2V, Animate Move, Animate Replace when done in batch/montage mode)
    if (segmentReviewData) {
      const workflowType = segmentReviewData.workflowType;
      // Skip if: batch-transition, or any montage mode workflow (s2v, animate-move, animate-replace)
      if (workflowType === 'batch-transition' || 
          ['s2v', 'animate-move', 'animate-replace'].includes(workflowType)) {
        return;
      }
    }

    // Check if we have at least 2 completed videos (ready to stitch)
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    const completedVideos = currentPhotosArray.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
    );

    // Check if any videos are currently generating
    const hasGeneratingVideo = currentPhotosArray.some(photo => photo.generatingVideo);

    // Show tip if we have 2+ completed videos and nothing is generating
    if (completedVideos.length >= 2 && !hasGeneratingVideo && !showDownloadTip && !showInfiniteLoopPreview) {
      // Delay showing the tip by 1.5 seconds after completion
      const showTimer = setTimeout(() => {
        setShowDownloadTip(true);
        // Mark as shown for this batch session
        setHasShownInfiniteLoopTipThisBatch(true);
        // Auto-hide after 10 seconds
        setTimeout(() => {
          setShowDownloadTip(false);
        }, 10000);
      }, 1500);

      return () => clearTimeout(showTimer);
    }
  }, [photos, filteredPhotos, isPromptSelectorMode, isTransitionMode, transitionVideoQueue, showDownloadTip, showInfiniteLoopPreview, hasShownInfiniteLoopTipThisBatch, segmentReviewData]);

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
    
    // Try stylePrompt first (strip transformation prefix for matching)
    if (photo.stylePrompt) {
      const strippedStylePrompt = stripTransformationPrefix(photo.stylePrompt);
      const foundStyleKey = Object.entries(stylePrompts).find(
        ([, value]) => value === strippedStylePrompt
      )?.[0];

      if (foundStyleKey && foundStyleKey !== 'custom' && foundStyleKey !== 'random' && foundStyleKey !== 'randomMix' && foundStyleKey !== 'browseGallery') {
        return styleIdToDisplay(foundStyleKey);
      }
    }

    // Try positivePrompt next (strip transformation prefix for matching)
    if (photo.positivePrompt) {
      const strippedPositivePrompt = stripTransformationPrefix(photo.positivePrompt);
      const foundStyleKey = Object.entries(stylePrompts).find(
        ([, value]) => value === strippedPositivePrompt
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

  // Handle stitching all videos into one concatenated video (works with any workflow)
  const handleStitchAllVideos = useCallback(async () => {
    if (isBulkDownloading) {
      console.log('Bulk download already in progress');
      return;
    }

    try {
      // Get the correct photos array based on mode
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;

      // Get photos with videos (excluding hidden/discarded ones)
      const photosWithVideos = currentPhotosArray.filter(
        photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
      );

      if (photosWithVideos.length === 0) {
        showToast({
          title: 'No Videos',
          message: 'No videos available to stitch.',
          type: 'info'
        });
        return;
      }

      if (photosWithVideos.length === 1) {
        showToast({
          title: 'Single Video',
          message: 'Need at least 2 videos to stitch together. Use "Download All Videos" for a single video.',
          type: 'info'
        });
        return;
      }

      // Generate hash of photo IDs to check cache validity
      const photosHash = photosWithVideos.map(p => p.id).sort().join('-');

      // Check for cached version
      if (cachedStitchedVideoBlob && cachedStitchedVideoPhotosHash === photosHash) {
        // Use cached version
        downloadBlob(cachedStitchedVideoBlob, 'stitched-video.mp4');
        setIsBulkDownloading(false);
        return;
      }

      // No cached version - generate stitched video
      setIsBulkDownloading(true);
      setIsGeneratingStitchedVideo(true);
      setBulkDownloadProgress({ current: 0, total: photosWithVideos.length, message: 'Stitching videos...' });

      const startTime = performance.now();

      // Prepare videos array in order
      const videosToStitch = photosWithVideos.map((photo, index) => ({
        url: photo.videoUrl,
        filename: `video-${index + 1}.mp4`
      }));

      // Check if this is from a montage mode (S2V, Animate Move, Animate Replace) with stored audio source
      // If so, use the parent audio technique (strip individual clip audio, use single parent audio)
      let audioOptions = null;

      // Try segmentReviewData first, then fall back to ref
      let audioSource = segmentReviewData?.audioSource;

      // Fallback to ref if audioSource is missing from segmentReviewData
      if (!audioSource && activeMontageAudioSourceRef.current) {
        audioSource = activeMontageAudioSourceRef.current;
      }

      if (audioSource && ['s2v', 'animate-move', 'animate-replace'].includes(segmentReviewData?.workflowType || audioSource.type)) {
        try {
          if (audioSource.type === 's2v') {
            // For S2V: Use the audio file directly
            setBulkDownloadProgress({ current: 0, total: photosWithVideos.length, message: 'Preparing audio track...' });
            
            // Convert Uint8Array to ArrayBuffer properly
            let audioBuffer = audioSource.audioBuffer;
            if (audioBuffer instanceof Uint8Array) {
              audioBuffer = audioBuffer.buffer.slice(
                audioBuffer.byteOffset,
                audioBuffer.byteOffset + audioBuffer.byteLength
              );
            }
            
            if (audioBuffer) {
              audioOptions = {
                buffer: audioBuffer,
                startOffset: audioSource.startOffset || 0
              };
            }
          } else if (audioSource.type === 'animate-move' || audioSource.type === 'animate-replace') {
            // For Animate Move/Replace: Extract audio from the source video
            setBulkDownloadProgress({ current: 0, total: photosWithVideos.length, message: 'Extracting audio from source video...' });
            
            // Convert Uint8Array to ArrayBuffer properly
            let videoBuffer = audioSource.videoBuffer;
            if (videoBuffer instanceof Uint8Array) {
              videoBuffer = videoBuffer.buffer.slice(
                videoBuffer.byteOffset,
                videoBuffer.byteOffset + videoBuffer.byteLength
              );
            }
            
            if (videoBuffer) {
              audioOptions = {
                buffer: videoBuffer,
                startOffset: audioSource.startOffset || 0,
                isVideoSource: true
              };
            }
          }
        } catch (audioError) {
          console.warn('[Stitch] Failed to prepare parent audio, using individual clip audio:', audioError);
        }
      }

      // Use the working concatenation (CO strategy - extract + ctts) with optional parent audio
      const blob = await concatenateVideos(
        videosToStitch,
        (current, total, message) => {
          setBulkDownloadProgress({
            current,
            total,
            message
          });
        },
        audioOptions, // Pass audio options for parent audio (null if not montage mode)
        !audioOptions // If no parent audio, preserve source audio from clips
      );

      const elapsedMs = performance.now() - startTime;
      const elapsedSec = (elapsedMs / 1000).toFixed(2);

      // Download the stitched video
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `stitched-video-${timestamp}.mp4`;
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      setIsGeneratingStitchedVideo(false);

      showToast({
        title: 'Video Created',
        message: `Stitched ${photosWithVideos.length} videos in ${elapsedSec}s`,
        type: 'success'
      });

      // Reset after a delay
      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);

    } catch (error) {
      console.error('[Stitch] Error:', error);
      setIsGeneratingStitchedVideo(false);
      setBulkDownloadProgress({
        current: 0,
        total: 0,
        message: `Error: ${error.message}`
      });

      showToast({
        title: 'Stitch Failed',
        message: 'Failed to stitch videos. Please try downloading individually instead.',
        type: 'error'
      });

      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }, 3000);
    }
  }, [photos, filteredPhotos, isPromptSelectorMode, isBulkDownloading, cachedStitchedVideoBlob, cachedStitchedVideoPhotosHash, segmentReviewData, showToast, setIsBulkDownloading, setBulkDownloadProgress]);

  // Handle Infinite Loop Stitch - generates AI transitions between videos for seamless looping
  const handleInfiniteLoopStitch = useCallback(async () => {
    if (isBulkDownloading || isGeneratingInfiniteLoop) {
      console.log('[Infinite Loop] Already in progress');
      return;
    }

    // Reset cancellation flag and clear previous workflow state at start
    infiniteLoopCancelledRef.current = false;
    transitionPreviousVideoUrlsRef.current.clear();

    try {
      // Get the correct photos array based on mode
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;

      // Get photos with videos (excluding hidden/discarded ones)
      const photosWithVideos = currentPhotosArray.filter(
        photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
      );

      if (photosWithVideos.length < 2) {
        showToast({
          title: 'Not Enough Videos',
          message: 'Need at least 2 videos for Infinite Loop.',
          type: 'info'
        });
        setShowStitchOptionsPopup(false);
        return;
      }

      // Detect video duration from the first video
      const getVideoDuration = (videoUrl) => {
        return new Promise((resolve, reject) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => {
            resolve(video.duration);
            video.src = '';
          };
          video.onerror = () => reject(new Error('Failed to load video metadata'));
          video.src = videoUrl;
        });
      };

      // Get video parameters from the first video to ensure consistency
      // This is critical for MP4Box concatenation - all videos must have matching parameters
      const firstPhoto = photosWithVideos[0];
      const transitionResolution = firstPhoto.videoResolution || settings.videoResolution || '480p';
      const transitionFramerate = firstPhoto.videoFramerate || settings.videoFramerate || 16;
      
      // Log source video metadata for debugging
      console.log(`[Infinite Loop] Source video metadata - workflow: ${firstPhoto.videoWorkflowType || 'i2v'}, stored duration: ${firstPhoto.videoDuration}s, resolution: ${transitionResolution}, fps: ${transitionFramerate}`);
      
      // CRITICAL: Calculate exact frame count from video duration to ensure perfect matching
      // Transitions MUST have the exact same frame count as segment videos for concatenation
      let transitionFrames;
      let transitionDuration;
      try {
        const videoDuration = await getVideoDuration(firstPhoto.videoUrl);
        // WAN 2.2 specific: Calculate exact frames using duration * 16 + 1
        // (WAN 2.2 always generates at 16fps internally, regardless of fps setting)
        // Round the entire calculation to handle floating point precision issues
        const calculatedFrames = Math.round(videoDuration * 16 + 1);
        
        // VALIDATION: Check if video exceeds i2v transition workflow limit (161 frames = 10s)
        if (calculatedFrames > 161) {
          const maxDuration = (161 - 1) / 16; // 10 seconds
          showToast({
            title: 'Videos Too Long',
            message: `Infinite Loop requires videos to be ${maxDuration}s or shorter. Your videos are ${videoDuration.toFixed(1)}s. Please use shorter videos or regenerate with a shorter duration.`,
            type: 'error'
          });
          setIsGeneratingInfiniteLoop(false);
          setInfiniteLoopProgress(null);
          setShowStitchOptionsPopup(false);
          return;
        }
        
        transitionFrames = calculatedFrames;
        // Calculate duration from frames for display/logging
        transitionDuration = (transitionFrames - 1) / 16;
        console.log(`[Infinite Loop] Video params - detected duration: ${videoDuration}s, calculated frames: ${calculatedFrames}, transition frames: ${transitionFrames}, transition duration: ${transitionDuration}s, resolution: ${transitionResolution}, fps: ${transitionFramerate}`);
      } catch (error) {
        console.warn('[Infinite Loop] Could not detect video duration, using default 5s = 81 frames');
        transitionFrames = (firstPhoto.videoDuration || 5) * 16 + 1;
        transitionDuration = (transitionFrames - 1) / 16;
      }

      // Generate hash to check for cached version (includes all video parameters for proper cache invalidation)
      const photosHash = photosWithVideos.map(p => p.id + '-' + p.videoUrl).join('|') + `-frames${transitionFrames}-res${transitionResolution}-fps${transitionFramerate}`;

      // Note: We don't check for cached version here anymore - always regenerate when user clicks
      // The "Download Cached" button in StitchOptionsPopup provides access to the previous version

      console.log(`[Infinite Loop] Starting with ${photosWithVideos.length} videos, ${transitionFrames} frames (${transitionDuration}s) transitions`);
      
      // Log all video URLs to debug potential corruption
      console.group('[Infinite Loop] Video URLs');
      photosWithVideos.forEach((photo, i) => {
        console.log(`  ${i + 1}. ${photo.id} - ${photo.videoUrl?.substring(0, 100)}...`);
        console.log(`     Resolution: ${photo.videoResolution}, FPS: ${photo.videoFramerate}, Duration: ${photo.videoDuration}`);
      });
      console.groupEnd();

      const transitionCount = photosWithVideos.length;

      // Initialize transition status for parallel tracking
      const initialTransitionStatus = Array(transitionCount).fill('pending');

      // IMPORTANT: Close the StitchOptionsPopup BEFORE showing any generation UI
      // This prevents the yellow popup from flashing during the transition to VideoReviewPopup
      setShowStitchOptionsPopup(false);

      setIsGeneratingInfiniteLoop(true);
      setInfiniteLoopProgress({
        phase: 'extracting',
        current: 0,
        total: photosWithVideos.length * 2, // Extract both first AND last frames
        message: 'Preparing to extract video frames...',
        transitionStatus: initialTransitionStatus
      });

      // Show VideoReviewPopup immediately for better UX
      // Initialize with empty transitions that will be populated during generation
      const initialTransitions = Array(transitionCount).fill(null).map((_, i) => ({
        url: '',
        index: i,
        fromVideoIndex: i,
        toVideoIndex: (i + 1) % photosWithVideos.length,
        status: 'generating',
        // Include thumbnail data for preview during generation
        startThumbnail: null, // Will be populated after frame extraction
        endThumbnail: null
      }));
      setPendingTransitions(initialTransitions);
      setShowTransitionReview(true);

      // Phase 1: Extract BOTH first and last frames from each video (in parallel)
      // - Last frame of video N = START of transition N
      // - First frame of video N+1 = END of transition N
      // This ensures transitions work correctly for animate-move/animate-replace workflows
      // where the video content doesn't match the original reference photo
      const lastFramePromises = photosWithVideos.map((photo, i) =>
        extractLastFrame(photo.videoUrl).then(frame => {
          console.log(`[Infinite Loop] Extracted last frame ${i + 1}: ${frame.width}x${frame.height}`);
          return { index: i, frame, type: 'last' };
        })
      );

      const firstFramePromises = photosWithVideos.map((photo, i) =>
        extractFirstFrame(photo.videoUrl).then(frame => {
          console.log(`[Infinite Loop] Extracted first frame ${i + 1}: ${frame.width}x${frame.height}`);
          return { index: i, frame, type: 'first' };
        })
      );

      // Update progress as frames complete
      let extractedCount = 0;
      const lastFrames = new Array(photosWithVideos.length);
      const firstFrames = new Array(photosWithVideos.length);
      const totalFramesToExtract = photosWithVideos.length * 2;

      // Process all frame extractions
      const allFramePromises = [...lastFramePromises, ...firstFramePromises];
      for (const promise of allFramePromises) {
        try {
          const result = await promise;
          if (result.type === 'last') {
            lastFrames[result.index] = result.frame;
          } else {
            firstFrames[result.index] = result.frame;
          }
          extractedCount++;
          setInfiniteLoopProgress(prev => ({
            ...prev,
            current: extractedCount,
            message: `Extracting frames ${extractedCount}/${totalFramesToExtract}...`
          }));
        } catch (error) {
          console.error(`[Infinite Loop] Frame extraction failed:`, error);
          showToast({
            title: 'Frame Extraction Failed',
            message: 'Could not extract frames from videos. Please try again.',
            type: 'error'
          });
          setIsGeneratingInfiniteLoop(false);
          setInfiniteLoopProgress(null);
          setShowStitchOptionsPopup(false);
          return;
        }
      }

      // Use the transition prompt from settings
      const motionPrompt = settings.videoTransitionPrompt || DEFAULT_SETTINGS.videoTransitionPrompt;
      const negativePrompt = settings.videoNegativePrompt || '';

      // Check if cancelled during frame extraction
      if (infiniteLoopCancelledRef.current) {
        console.log('[Infinite Loop] Cancelled during frame extraction phase');
        return;
      }

      // Build end images array from first frames of NEXT videos
      // Transition N goes from last frame of video N → first frame of video N+1
      const endImages = firstFrames.map((_, i) => {
        const nextIndex = (i + 1) % photosWithVideos.length;
        return firstFrames[nextIndex];
      });

      // Update pendingTransitions with extracted frame thumbnails for preview
      // The frame.buffer contains PNG-encoded data, so we convert it to a data URL via Blob
      const frameToDataUrl = (frame) => {
        if (!frame || !frame.buffer) return null;
        try {
          const blob = new Blob([frame.buffer], { type: 'image/png' });
          return URL.createObjectURL(blob);
        } catch (error) {
          console.warn('[Infinite Loop] Failed to create thumbnail URL:', error);
          return null;
        }
      };

      setPendingTransitions(prev => prev.map((t, i) => ({
        ...t,
        startThumbnail: frameToDataUrl(lastFrames[i]),
        endThumbnail: frameToDataUrl(endImages[i])
      })));

      // Store review data for remix functionality
      setTransitionReviewData({
        photosWithVideos,
        lastFrames,
        firstFrames,
        endImages,
        transitionFrames,
        transitionResolution,
        transitionFramerate,
        motionPrompt,
        negativePrompt
      });

      console.log(`[Infinite Loop] Using extracted first frames for transition endpoints (supports animate-move/animate-replace workflows)`);

      // Phase 2: Generate ALL transition videos in parallel
      const generatedTransitionUrls = new Array(transitionCount);

      setInfiniteLoopProgress({
        phase: 'generating',
        current: 0,
        total: transitionCount,
        message: `Generating ${transitionCount} transitions in parallel...`,
        transitionStatus: Array(transitionCount).fill('generating'),
        transitionETAs: Array(transitionCount).fill(null),
        transitionProgress: Array(transitionCount).fill(0),
        transitionWorkers: Array(transitionCount).fill(null),
        transitionStatuses: Array(transitionCount).fill(null),
        transitionElapsed: Array(transitionCount).fill(null),
        maxETA: null
      });

      // Helper function to generate a single transition with retry support
      const generateSingleTransition = (i, startFrame, endImage, isRetry = false) => {
        const nextIndex = (i + 1) % photosWithVideos.length;
        
        return new Promise((resolve, reject) => {
          const tempPhotoId = `infinite-loop-transition-${i}-${Date.now()}`;
          
          // Create a temporary photo object to track this transition's ETA
          // Use 'let' so we can accumulate state across updates (important for workerName fallback)
          let currentTempPhoto = { 
            id: tempPhotoId, 
            images: [], 
            generatingVideo: false,
            videoETA: null,
            videoElapsed: null,
            videoWorkerName: null
          };

          // Custom setPhotos function that captures ETA updates for this specific transition
          // IMPORTANT: We must persist state between updates because workerName is only sent
          // in certain events (like 'started') and subsequent 'progress' events use fallback
          const captureETAUpdates = (updateFn) => {
            const updated = updateFn([currentTempPhoto]);
            if (updated[0]) {
              // Persist the updated state for next update call
              currentTempPhoto = updated[0];
              const { videoETA, videoProgress, videoWorkerName, videoStatus, videoElapsed } = updated[0];
              
              // Update immediately - no throttling needed since each transition has its own display
              setInfiniteLoopProgress(prev => {
                if (!prev || prev.transitionStatus?.[i] === 'complete') return prev;
                
                const newETAs = [...(prev.transitionETAs || [])];
                const newProgress = [...(prev.transitionProgress || [])];
                const newWorkers = [...(prev.transitionWorkers || [])];
                const newStatuses = [...(prev.transitionStatuses || [])];
                const newElapsed = [...(prev.transitionElapsed || [])];
                
                newETAs[i] = videoETA;
                newProgress[i] = videoProgress || 0;
                newWorkers[i] = videoWorkerName;
                newStatuses[i] = videoStatus;
                newElapsed[i] = videoElapsed;
                
                // Calculate the maximum ETA across all active transitions
                const maxETA = Math.max(...newETAs.filter(eta => eta !== null && eta > 0), 0);
                
                return {
                  ...prev,
                  transitionETAs: newETAs,
                  transitionProgress: newProgress,
                  transitionWorkers: newWorkers,
                  transitionStatuses: newStatuses,
                  transitionElapsed: newElapsed,
                  maxETA: maxETA > 0 ? maxETA : null
                };
              });
            }
          };

          console.log(`[Infinite Loop] ${isRetry ? 'RETRY: ' : ''}Starting transition ${i + 1}: video ${i + 1} → photo ${nextIndex + 1}, ${transitionFrames} frames`);

          generateVideo({
            photo: currentTempPhoto,
            photoIndex: 0,
            subIndex: 0,
            imageWidth: startFrame.width,
            imageHeight: startFrame.height,
            sogniClient,
            setPhotos: captureETAUpdates,
            resolution: transitionResolution,
            quality: settings.videoQuality || 'fast',
            fps: transitionFramerate,
            frames: transitionFrames, // Use explicit frames for exact matching
            positivePrompt: motionPrompt,
            negativePrompt: negativePrompt,
            tokenType: tokenType,
            referenceImage: startFrame.buffer,
            referenceImageEnd: endImage.buffer,
            // Trim last frame for seamless stitching with next segment
            trimEndFrame: settings.videoTrimEndFrame ?? false,
            onComplete: (videoUrl) => {
              console.log(`[Infinite Loop] Transition ${i + 1} complete: ${videoUrl}`);
              generatedTransitionUrls[i] = videoUrl;
              playSonicLogo(settings.soundEnabled);

              // Update pendingTransitions for VideoReviewPopup
              setPendingTransitions(prev => {
                const updated = [...prev];
                updated[i] = { ...updated[i], url: videoUrl, status: 'ready' };
                return updated;
              });

              // Use functional update to ensure we get the latest state
              setInfiniteLoopProgress(prev => {
                if (!prev) return prev;
                
                // Create new status array with this transition marked complete
                const newStatus = [...prev.transitionStatus];
                newStatus[i] = 'complete';
                
                // Create new ETAs array with this transition cleared
                const newETAs = [...(prev.transitionETAs || [])];
                newETAs[i] = 0;
                
                // Count completed
                const completedCount = newStatus.filter(s => s === 'complete').length;
                
                // Calculate remaining max ETA
                const maxETA = Math.max(...newETAs.filter(eta => eta !== null && eta > 0), 0);
                
                return {
                  ...prev,
                  phase: 'generating',
                  current: completedCount,
                  message: `${completedCount}/${prev.total} transitions complete`,
                  transitionStatus: newStatus,
                  transitionETAs: newETAs,
                  maxETA: maxETA > 0 ? maxETA : null
                };
              });

              resolve({ index: i, url: videoUrl });
            },
            onError: (error) => {
              console.error(`[Infinite Loop] Transition ${i + 1} failed${isRetry ? ' (retry)' : ''}:`, error);

              // Update pendingTransitions for VideoReviewPopup
              setPendingTransitions(prev => {
                const updated = [...prev];
                updated[i] = { ...updated[i], status: 'failed' };
                return updated;
              });

              // Use functional update for error state
              setInfiniteLoopProgress(prev => {
                if (!prev) return prev;
                
                const newStatus = [...prev.transitionStatus];
                newStatus[i] = 'failed';
                
                const newETAs = [...(prev.transitionETAs || [])];
                newETAs[i] = 0;
                
                return {
                  ...prev,
                  transitionStatus: newStatus,
                  transitionETAs: newETAs
                };
              });

              reject({ index: i, error, isRetry });
            }
          });
        });
      };

      // Create all transition generation promises
      const transitionPromises = lastFrames.map((startFrame, i) => {
        const endImage = endImages[i];
        return generateSingleTransition(i, startFrame, endImage, false);
      });

      // Wait for all transitions to complete (first attempt)
      const results = await Promise.allSettled(transitionPromises);

      // Check if cancelled during video generation
      if (infiniteLoopCancelledRef.current) {
        console.log('[Infinite Loop] Cancelled during video generation phase');
        setShowTransitionReview(false);
        return;
      }

      // Check for failures and retry once
      const failedResults = results
        .map((result, i) => ({ result, index: i }))
        .filter(({ result }) => result.status === 'rejected');

      if (failedResults.length > 0) {
        console.log(`[Infinite Loop] ${failedResults.length} transition(s) failed, retrying...`);
        
        // Update status to show retrying
        setInfiniteLoopProgress(prev => {
          if (!prev) return prev;
          const newStatus = [...prev.transitionStatus];
          failedResults.forEach(({ index }) => {
            newStatus[index] = 'generating'; // Reset to generating for retry
          });
          return {
            ...prev,
            transitionStatus: newStatus,
            message: `Retrying ${failedResults.length} failed transition(s)...`
          };
        });

        // Retry failed transitions
        const retryPromises = failedResults.map(({ index }) => {
          const startFrame = lastFrames[index];
          const endImage = endImages[index];
          return generateSingleTransition(index, startFrame, endImage, true);
        });

        const retryResults = await Promise.allSettled(retryPromises);
        
        // Check if retries succeeded
        const stillFailed = retryResults.filter(r => r.status === 'rejected');
        
        if (stillFailed.length > 0) {
          const failedIndices = stillFailed.map(r => r.reason?.index + 1).join(', ');
          showToast({
            title: 'Transitions Failed',
            message: `Transition(s) ${failedIndices} failed after retry. Please try again.`,
            type: 'error'
          });
          setIsGeneratingInfiniteLoop(false);
          setInfiniteLoopProgress(null);
          setShowStitchOptionsPopup(false);
          return;
        }
        
        console.log(`[Infinite Loop] All retries succeeded!`);
      }

      // Check if cancelled before stitching
      if (infiniteLoopCancelledRef.current) {
        console.log('[Infinite Loop] Cancelled before stitching phase');
        setShowTransitionReview(false);
        return;
      }

      // Phase 3: All transitions generated - update state and let user decide when to stitch
      // User can now preview each transition, regenerate any they don't like, and click "Stitch All Videos"
      console.log('[Infinite Loop] All transitions generated, waiting for user to stitch...');

      // Update transitionReviewData with endImages (needed for regeneration)
      // pendingTransitions already have the URLs from the onComplete callbacks
      setTransitionReviewData(prev => ({
        ...prev,
        endImages,
        transitionCount,
        photosHash
      }));

      // Generation complete - reset generation state but keep review popup open
      setIsGeneratingInfiniteLoop(false);
      setInfiniteLoopProgress(null);

      // VideoReviewPopup is already open (set earlier)
      // All transitions now have status: 'ready' from the onComplete callbacks
      // User can preview, regenerate, and manually click "Stitch All Videos"

    } catch (error) {
      console.error('[Infinite Loop] Error:', error);
      showToast({
        title: 'Infinite Loop Failed',
        message: error.message || 'Failed to create infinite loop. Please try again.',
        type: 'error'
      });
      setIsGeneratingInfiniteLoop(false);
      setInfiniteLoopProgress(null);
      setShowStitchOptionsPopup(false);
      setShowTransitionReview(false);
    }
  }, [photos, filteredPhotos, isPromptSelectorMode, isBulkDownloading, isGeneratingInfiniteLoop, sogniClient, settings, tokenType, showToast, cachedInfiniteLoopBlob, cachedInfiniteLoopHash]);

  // Handle regenerating a single transition (supports multiple simultaneous regenerations)
  const handleRegenerateTransition = useCallback(async (transitionIndex) => {
    if (!transitionReviewData || !pendingTransitions[transitionIndex]) {
      console.error('[Transition Review] No data for regeneration');
      return;
    }

    const { lastFrames, firstFrames, transitionFrames, transitionResolution, transitionFramerate, motionPrompt, negativePrompt, photosWithVideos } = transitionReviewData;
    
    console.log(`[Transition Review] Regenerating transition ${transitionIndex + 1}`);
    
    // Store the previous URL to detect actual completion
    const previousUrl = pendingTransitions[transitionIndex]?.url || null;
    transitionPreviousVideoUrlsRef.current.set(transitionIndex, previousUrl);
    
    // Mark transition as regenerating
    setPendingTransitions(prev => prev.map((t, i) => 
      i === transitionIndex ? { ...t, status: 'regenerating' } : t
    ));
    
    // Add to regenerating set (supports multiple simultaneous regenerations)
    setRegeneratingTransitionIndices(prev => new Set([...prev, transitionIndex]));
    
    // Initialize progress for this transition
    setTransitionRegenerationProgresses(prev => {
      const updated = new Map(prev);
      updated.set(transitionIndex, { progress: 0, eta: null, message: 'Starting regeneration...' });
      return updated;
    });

    try {
      const startFrame = lastFrames[transitionIndex];
      const nextIndex = (transitionIndex + 1) % photosWithVideos.length;
      const endImage = firstFrames[nextIndex];
      
      // Generate the transition
      const newTransitionUrl = await new Promise((resolve, reject) => {
        const tempPhotoId = `transition-regen-${transitionIndex}-${Date.now()}`;
        // Use 'let' so we can accumulate state across updates (important for workerName fallback)
        let currentTempPhoto = { 
          id: tempPhotoId, 
          images: [], 
          generatingVideo: false,
          videoETA: null,
          videoWorkerName: null
        };

        // Capture ETA updates including worker info, status, elapsed time
        // IMPORTANT: We must persist state between updates because workerName is only sent
        // in certain events (like 'started') and subsequent 'progress' events use fallback
        const captureETAUpdates = (updateFn) => {
          const updated = updateFn([currentTempPhoto]);
          if (updated[0]) {
            // Persist the updated state for next update call
            currentTempPhoto = updated[0];
            const { videoETA, videoProgress, videoWorkerName, videoStatus, videoElapsed } = updated[0];
            // Update progress Map for this specific transition index
            setTransitionRegenerationProgresses(prev => {
              const newMap = new Map(prev);
              newMap.set(transitionIndex, {
                progress: videoProgress || 0,
                eta: videoETA,
                workerName: videoWorkerName,
                status: videoStatus,
                elapsed: videoElapsed,
                message: videoETA ? `~${Math.ceil(videoETA)}s remaining` : (videoStatus || 'Generating...')
              });
              return newMap;
            });
          }
        };

        generateVideo({
          photo: currentTempPhoto,
          photoIndex: 0,
          subIndex: 0,
          imageWidth: startFrame.width,
          imageHeight: startFrame.height,
          sogniClient,
          setPhotos: captureETAUpdates,
          resolution: transitionResolution,
          quality: settings.videoQuality || 'fast',
          fps: transitionFramerate,
          frames: transitionFrames,
          positivePrompt: motionPrompt,
          negativePrompt: negativePrompt,
          tokenType: tokenType,
          referenceImage: startFrame.buffer,
          referenceImageEnd: endImage.buffer,
          // Trim last frame for seamless stitching with next segment
          trimEndFrame: settings.videoTrimEndFrame ?? false,
          onComplete: (videoUrl) => {
            console.log(`[Transition Review] Transition ${transitionIndex + 1} regenerated: ${videoUrl}`);
            resolve(videoUrl);
          },
          onError: (error) => {
            console.error(`[Transition Review] Transition ${transitionIndex + 1} regeneration failed:`, error);
            reject(error);
          }
        });
      });

      // Update the transition with new URL
      setPendingTransitions(prev => prev.map((t, i) => 
        i === transitionIndex ? { ...t, url: newTransitionUrl, status: 'ready' } : t
      ));
      
      showToast({
        title: '✨ Transition Regenerated!',
        message: `Transition ${transitionIndex + 1} has been regenerated.`,
        type: 'success',
        timeout: 3000
      });

    } catch (error) {
      console.error(`[Transition Review] Regeneration failed:`, error);
      
      // Mark as failed but keep old URL
      setPendingTransitions(prev => prev.map((t, i) => 
        i === transitionIndex ? { ...t, status: 'ready' } : t // Keep as ready so user can try again
      ));
      
      showToast({
        title: 'Regeneration Failed',
        message: error.message || 'Failed to regenerate transition. Try again.',
        type: 'error',
        timeout: 4000
      });
    } finally {
      // Clean up tracking state for this transition
      setRegeneratingTransitionIndices(prev => {
        const updated = new Set(prev);
        updated.delete(transitionIndex);
        return updated;
      });
      setTransitionRegenerationProgresses(prev => {
        const updated = new Map(prev);
        updated.delete(transitionIndex);
        return updated;
      });
      transitionPreviousVideoUrlsRef.current.delete(transitionIndex);
    }
  }, [transitionReviewData, pendingTransitions, sogniClient, settings, tokenType, showToast]);

  // Handle final stitching after review
  const handleStitchAfterReview = useCallback(async () => {
    if (!transitionReviewData || pendingTransitions.length === 0) {
      console.error('[Transition Review] No data for stitching');
      return;
    }

    const { photosWithVideos, photosHash } = transitionReviewData;
    const transitionCount = pendingTransitions.length;
    
    console.log(`[Transition Review] Starting final stitch with ${photosWithVideos.length} videos and ${transitionCount} transitions`);
    
    // Close review immediately and show preview with stitching progress
    setShowTransitionReview(false);
    
    // Small delay to allow review popup to close smoothly before showing preview
    await new Promise(resolve => setTimeout(resolve, 100));
    
    setIsGeneratingInfiniteLoop(true);
    setInfiniteLoopProgress({
      phase: 'stitching',
      current: 0,
      total: photosWithVideos.length + transitionCount,
      message: 'Stitching all videos together...'
    });
    
    // Show infinite loop preview immediately with stitching progress
    setShowInfiniteLoopPreview(true);

    try {
      // Build the final video sequence: video1, trans1, video2, trans2, ..., videoN, transN
      const allVideosToStitch = [];
      for (let i = 0; i < photosWithVideos.length; i++) {
        allVideosToStitch.push({
          url: photosWithVideos[i].videoUrl,
          filename: `video-${i + 1}.mp4`
        });
        allVideosToStitch.push({
          url: pendingTransitions[i].url,
          filename: `transition-${i + 1}.mp4`
        });
      }

      console.log(`[Transition Review] Stitching ${allVideosToStitch.length} videos`);
      
      // Validate all videos before stitching
      console.group('[Transition Review] Pre-stitch validation');
      for (let i = 0; i < allVideosToStitch.length; i++) {
        console.log(`  ${i + 1}. ${allVideosToStitch[i].filename} - ${allVideosToStitch[i].url?.substring(0, 80)}...`);
      }
      console.groupEnd();

      const concatenatedBlob = await concatenateVideos(
        allVideosToStitch,
        (current, total, message) => {
          setInfiniteLoopProgress(prev => ({
            ...prev,
            phase: 'stitching',
            current,
            total,
            message
          }));
        },
        null, // No external audio file
        false // Audio preservation disabled for now
      );

      // Cache the result and create stable URL
      setCachedInfiniteLoopBlob(concatenatedBlob);
      setCachedInfiniteLoopHash(photosHash);
      // Revoke old URL if exists, then create new stable URL
      if (cachedInfiniteLoopUrl) {
        URL.revokeObjectURL(cachedInfiniteLoopUrl);
      }
      setCachedInfiniteLoopUrl(URL.createObjectURL(concatenatedBlob));

      // Complete!
      setInfiniteLoopProgress({
        phase: 'complete',
        current: 1,
        total: 1,
        message: 'Infinite loop ready!'
      });

      showToast({
        title: '♾️ Infinite Loop Complete!',
        message: `Created seamless loop with ${photosWithVideos.length} videos and ${transitionCount} AI transitions.`,
        type: 'success',
        timeout: 5000
      });

      // Complete - clear stitching progress
      setIsGeneratingInfiniteLoop(false);
      setInfiniteLoopProgress(null);
      // Preview is already showing from earlier, just update it with completed state

    } catch (error) {
      console.error('[Transition Review] Stitching failed:', error);
      showToast({
        title: 'Stitching Failed',
        message: error.message || 'Failed to stitch videos. Please try again.',
        type: 'error'
      });
      setIsGeneratingInfiniteLoop(false);
      setInfiniteLoopProgress(null);
      // Go back to review instead of closing
      setShowTransitionReview(true);
    }
  }, [transitionReviewData, pendingTransitions, cachedInfiniteLoopUrl, showToast]);

  // Handle closing transition review - go back to infinite loop preview
  const handleCloseTransitionReview = useCallback(async () => {
    console.log('[Transition Review] User closed review');

    // Cancel any active regeneration (in case regeneration is in progress)
    if (regeneratingTransitionIndices.size > 0) {
      try {
        await cancelAllActiveVideoProjects(setPhotos);
      } catch (error) {
        console.error('[Transition Review] Error cancelling projects:', error);
      }
      setRegeneratingTransitionIndices(new Set());
      setTransitionRegenerationProgresses(new Map());
      transitionPreviousVideoUrlsRef.current.clear();
    }

    // Close the review popup
    setShowTransitionReview(false);

    // If we have a cached infinite loop video, show it again
    if (cachedInfiniteLoopUrl) {
      setShowInfiniteLoopPreview(true);
    }
  }, [setPhotos, regeneratingTransitionIndices, cachedInfiniteLoopUrl]);

  // Handle cancelling a single transition (for stuck/slow jobs)
  const handleCancelTransitionItem = useCallback(async (transitionIndex) => {
    const transition = pendingTransitions[transitionIndex];
    if (!transition) {
      console.error('[Transition Cancel Item] Transition not found:', transitionIndex);
      return;
    }

    console.log(`[Transition Cancel Item] Cancelling transition ${transitionIndex + 1} (status: ${transition.status})`);

    // Transitions don't have a direct photo reference, but they have a projectId if generating
    // We need to find and cancel the active project for this transition
    // The projectId format is typically 'infinite-loop-transition-{index}' or similar

    // Try to get the active project ID for this transition
    const projectIds = getActiveVideoProjectIds('infinite-loop');
    console.log('[Transition Cancel Item] Active infinite loop projects:', projectIds);

    // Cancel the first matching project (transitions generate sequentially usually)
    for (const projectId of projectIds) {
      try {
        const result = await cancelVideoGeneration(projectId, sogniClient, setPhotos);
        console.log(`[Transition Cancel Item] Cancel result for ${projectId}:`, result);
        if (result.success) break;
      } catch (error) {
        console.error('[Transition Cancel Item] Error cancelling project:', error);
      }
    }

    // If this was a regenerating transition, clear its regeneration state
    if (regeneratingTransitionIndices.has(transitionIndex)) {
      setRegeneratingTransitionIndices(prev => {
        const updated = new Set(prev);
        updated.delete(transitionIndex);
        return updated;
      });
      setTransitionRegenerationProgresses(prev => {
        const updated = new Map(prev);
        updated.delete(transitionIndex);
        return updated;
      });
      transitionPreviousVideoUrlsRef.current.delete(transitionIndex);
    }

    // Mark transition as failed so user can retry
    setPendingTransitions(prev => {
      const updated = [...prev];
      updated[transitionIndex] = {
        ...updated[transitionIndex],
        status: 'failed',
        error: 'Cancelled - click retry to generate again'
      };
      return updated;
    });

    showToast({
      title: '🛑 Transition Cancelled',
      message: `Transition ${transitionIndex + 1} was cancelled. Click "🔄 redo" to retry.`,
      type: 'info',
      timeout: 4000
    });
  }, [pendingTransitions, sogniClient, setPhotos, regeneratingTransitionIndices, showToast]);

  // Handle cancelling infinite loop generation during initial creation
  // This shows the CancelConfirmationPopup with refund estimate
  const handleCancelInfiniteLoopGeneration = useCallback(() => {
    console.log('[Infinite Loop Cancel] Cancel requested, pendingTransitions:', pendingTransitions?.length);
    
    if (!pendingTransitions || pendingTransitions.length === 0) {
      // Nothing to cancel - just close
      console.log('[Infinite Loop Cancel] No transitions to cancel, closing...');
      setShowTransitionReview(false);
      setIsGeneratingInfiniteLoop(false);
      setInfiniteLoopProgress(null);
      infiniteLoopCancelledRef.current = true;
      return;
    }

    // Calculate progress
    const completedCount = pendingTransitions.filter(t => t.status === 'ready').length;
    const generatingCount = pendingTransitions.filter(t => t.status === 'generating').length;
    const totalCount = pendingTransitions.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    console.log(`[Infinite Loop Cancel] Status - completed: ${completedCount}, generating: ${generatingCount}, total: ${totalCount}, progress: ${progress}%`);

    // Perform cancellation action
    const performCancel = async () => {
      console.log('[Infinite Loop Cancel] Performing cancellation...');
      infiniteLoopCancelledRef.current = true;
      
      try {
        // Cancel all active video projects (this will cancel transitions across all projects)
        const result = await cancelAllActiveVideoProjects(setPhotos);
        console.log('[Infinite Loop Cancel] Cancel result:', result);
      } catch (error) {
        console.error('[Infinite Loop Cancel] Error cancelling projects:', error);
      }

      // Clean up state
      setShowTransitionReview(false);
      setIsGeneratingInfiniteLoop(false);
      setInfiniteLoopProgress(null);
      setPendingTransitions([]);
      setTransitionReviewData(null);

      showToast({
        title: 'Generation Cancelled',
        message: `Cancelled infinite loop generation. ${completedCount} of ${totalCount} transitions were completed.`,
        type: 'info'
      });
    };

    // If nothing is actively generating (all done or failed), just close without confirmation
    if (generatingCount === 0) {
      console.log('[Infinite Loop Cancel] Nothing generating, just closing...');
      setShowTransitionReview(false);
      // Don't show infinite loop preview - transitions may be incomplete
      return;
    }

    // Check if user has opted out of confirmation
    if (shouldSkipConfirmation()) {
      console.log('[Infinite Loop Cancel] User opted out of confirmation, cancelling immediately...');
      performCancel();
      return;
    }

    // Temporarily hide the VideoReviewPopup to show the cancel confirmation popup
    console.log('[Infinite Loop Cancel] Temporarily hiding VideoReviewPopup to show cancel confirmation...');
    setShowTransitionReview(false);

    // Show confirmation popup with refund estimate
    console.log('[Infinite Loop Cancel] Showing cancel confirmation popup...');
    requestCancel({
      projectId: 'infinite-loop-transitions',
      projectType: 'video',
      progress,
      itemsCompleted: completedCount,
      totalItems: totalCount,
      onConfirm: performCancel,
      onCancel: () => {
        // User cancelled the cancellation - re-show the VideoReviewPopup
        console.log('[Infinite Loop Cancel] User cancelled the cancellation, re-showing VideoReviewPopup...');
        setShowTransitionReview(true);
      }
    });
  }, [pendingTransitions, setPhotos, showToast, requestCancel]);

  // Handle regenerating a single segment in montage review
  // customPrompts is optional: { positivePrompt, negativePrompt }
  const handleRegenerateSegment = useCallback(async (segmentIndex, customPrompts) => {
    if (!segmentReviewData || !pendingSegments[segmentIndex]) {
      console.error('[Segment Review] No data for regeneration');
      return;
    }

    const segment = pendingSegments[segmentIndex];
    const photo = photos.find(p => p.id === segment.photoId);
    const photoIndex = photos.findIndex(p => p.id === segment.photoId);

    if (!photo || photoIndex === -1) {
      console.error('[Segment Review] Photo not found for regeneration');
      showToast({
        title: 'Regeneration Failed',
        message: 'Could not find the photo for this segment.',
        type: 'error'
      });
      return;
    }

    // For advanced workflows (S2V, Animate Move, Animate Replace, Batch Transition), check regeneration params
    // For I2V/default workflow, regeneration params are optional (uses stored prompts on photo)
    const isAdvancedWorkflow = ['s2v', 'animate-move', 'animate-replace', 'batch-transition'].includes(photo.videoWorkflowType);
    if (isAdvancedWorkflow && !photo.videoRegenerateParams) {
      console.error('[Segment Review] No regeneration params for advanced workflow');
      showToast({
        title: 'Cannot Regenerate',
        message: 'Regeneration parameters not available for this segment.',
        type: 'warning'
      });
      return;
    }

    console.log(`[Segment Review] Regenerating segment ${segmentIndex + 1} (photo: ${photo.id}, workflow: ${photo.videoWorkflowType || 'default'})`);

    // If the segment is currently generating, cancel the existing generation first
    if (segment.status === 'generating' || photo.generatingVideo) {
      console.log(`[Segment Review] Cancelling existing generation for segment ${segmentIndex + 1} before redo`);

      // Cancel the video project if it exists
      if (photo.videoProjectId) {
        try {
          await cancelVideoGeneration(photo.videoProjectId, sogniClient, setPhotos);
          console.log(`[Segment Review] Cancelled existing project ${photo.videoProjectId}`);
        } catch (error) {
          console.error('[Segment Review] Error cancelling existing project:', error);
          // Continue anyway - the old project may have already finished or failed
        }
      }
    }

    // Clear any error states and generating state from the photo before regenerating
    // Also update prompts if custom prompts were provided
    setPhotos(prev => {
      const updated = [...prev];
      if (updated[photoIndex]) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          videoError: undefined,
          timedOut: false,
          generatingVideo: false,
          videoETA: undefined,
          videoProjectId: undefined,
          videoStatus: undefined,
          ...(customPrompts ? {
            videoMotionPrompt: customPrompts.positivePrompt,
            videoNegativePrompt: customPrompts.negativePrompt
          } : {})
        };
      }
      return updated;
    });

    // Store the previous video URL to detect when regeneration actually completes
    // (prevents instant success toast from stale videoUrl)
    segmentPreviousVideoUrlsRef.current.set(segmentIndex, photo.videoUrl || null);

    // Update segment status to regenerating
    setPendingSegments(prev => {
      const updated = [...prev];
      updated[segmentIndex] = { ...updated[segmentIndex], status: 'regenerating', error: undefined };
      return updated;
    });

    // Add to regenerating set (supports multiple simultaneous regenerations)
    setRegeneratingSegmentIndices(prev => new Set([...prev, segmentIndex]));

    // Get the fresh photo after state updates (the original 'photo' variable is stale after cancellation)
    // This ensures we don't hit the generatingVideo guard clause in handleRegenerateVideo
    const freshPhoto = await new Promise((resolve) => {
      setPhotos(prev => {
        const updatedPhoto = prev.find(p => p.id === segment.photoId);
        resolve(updatedPhoto);
        return prev; // Don't modify state, just read it
      });
    });

    if (!freshPhoto) {
      console.error('[Segment Review] Could not find fresh photo after state update');
      return;
    }

    // Call the regeneration handler with fresh photo data
    await handleRegenerateVideo(freshPhoto, photoIndex);

    // The regeneration happens asynchronously via generateVideo callbacks
    // We'll detect completion via the useEffect that watches photos changes
  }, [segmentReviewData, pendingSegments, photos, handleRegenerateVideo, showToast, setPhotos, sogniClient]);

  // Handle playing a single segment in fullscreen
  const handlePlaySegment = useCallback((segmentIndex) => {
    const segment = pendingSegments[segmentIndex];
    if (!segment || !segment.url) {
      console.error('[Segment Review] No video URL for segment:', segmentIndex);
      return;
    }

    console.log(`[Segment Review] Playing segment ${segmentIndex + 1} in fullscreen`);

    // Create a temporary blob URL if needed and show in stitched video overlay
    setStitchedVideoUrl(segment.url);
    setShowStitchedVideoOverlay(true);
    setShowSegmentReview(false); // Hide segment review while playing
    setStitchedVideoReturnToSegmentReview(true); // Mark that we should return to segment review on close
  }, [pendingSegments]);

  // Handle version change for a segment (user navigating between successful generations)
  const handleSegmentVersionChange = useCallback((segmentIndex, newVersionIndex) => {
    const history = segmentVersionHistories.get(segmentIndex) || [];
    if (newVersionIndex < 0 || newVersionIndex >= history.length) {
      console.error('[Segment Review] Invalid version index:', newVersionIndex, 'for segment', segmentIndex);
      return;
    }

    console.log(`[Segment Review] Changing segment ${segmentIndex + 1} to version ${newVersionIndex + 1} of ${history.length}`);

    const selectedUrl = history[newVersionIndex];

    // Update the selected version
    setSelectedSegmentVersions(prev => {
      const updated = new Map(prev);
      updated.set(segmentIndex, newVersionIndex);
      return updated;
    });

    // Update the segment URL to show the selected version
    setPendingSegments(prev => {
      const updated = [...prev];
      if (updated[segmentIndex]) {
        updated[segmentIndex] = {
          ...updated[segmentIndex],
          url: selectedUrl
        };
      }
      return updated;
    });

    // IMPORTANT: Also update the photo's videoUrl so the selected version persists in the Photo Gallery grid
    const segment = pendingSegments[segmentIndex];
    if (segment?.photoId) {
      setPhotos(prev => prev.map(photo => 
        photo.id === segment.photoId
          ? { ...photo, videoUrl: selectedUrl }
          : photo
      ));
    }
  }, [segmentVersionHistories, pendingSegments, setPhotos]);

  // Watch for segment regeneration completion (success, failure, or timeout) AND track progress
  // Now supports multiple simultaneous regenerating segments
  useEffect(() => {
    if (regeneratingSegmentIndices.size === 0) {
      return;
    }

    const indicesToRemove = [];
    let hasProgressChanges = false;

    // Process each regenerating segment
    regeneratingSegmentIndices.forEach(segmentIndex => {
      const segment = pendingSegments[segmentIndex];
      if (!segment) {
        indicesToRemove.push(segmentIndex);
        return;
      }

      const photo = photos.find(p => p.id === segment.photoId);
      if (!photo) return;

      // Get the previous video URL to detect actual completion (not stale state)
      const previousVideoUrl = segmentPreviousVideoUrlsRef.current.get(segmentIndex);

      // Check if video regeneration completed successfully:
      // - Has a video URL that's DIFFERENT from the previous one (or previous was null)
      // - Not generating anymore
      // - Segment status is 'regenerating'
      const hasNewUrl = photo.videoUrl && photo.videoUrl !== previousVideoUrl;
      if (hasNewUrl && !photo.generatingVideo && segment.status === 'regenerating') {
        console.log(`[Segment Review] Segment ${segmentIndex + 1} regeneration complete`);

        // Add the new successful URL to version history
        setSegmentVersionHistories(prev => {
          const updated = new Map(prev);
          const history = updated.get(segmentIndex) || [];
          // Only add if not already in history (avoid duplicates)
          if (!history.includes(photo.videoUrl)) {
            updated.set(segmentIndex, [...history, photo.videoUrl]);
          }
          return updated;
        });

        // Update selected version to the new one (latest)
        setSelectedSegmentVersions(prev => {
          const updated = new Map(prev);
          const history = segmentVersionHistories.get(segmentIndex) || [];
          // New version will be at index = current history length (since we're adding it)
          updated.set(segmentIndex, history.length);
          return updated;
        });

        // Update segment with new URL
        setPendingSegments(prev => {
          const updated = [...prev];
          updated[segmentIndex] = {
            ...updated[segmentIndex],
            url: photo.videoUrl,
            status: 'ready',
            thumbnail: photo.enhancedImageUrl || photo.images?.[0] || photo.originalDataUrl
          };
          return updated;
        });

        // Cleanup tracking state for this segment
        indicesToRemove.push(segmentIndex);
        segmentPreviousVideoUrlsRef.current.delete(segmentIndex);

        showToast({
          title: '✨ Segment Regenerated!',
          message: `Segment ${segmentIndex + 1} has been regenerated.`,
          type: 'success',
          timeout: 3000
        });
      }
      // Check if video regeneration failed (error or timeout, not generating anymore)
      else if (!photo.generatingVideo && (photo.videoError || photo.timedOut)) {
        console.log(`[Segment Review] Segment ${segmentIndex + 1} regeneration failed:`, photo.videoError || 'Timeout');

        // DON'T add failed URL to version history - keep previous successful version
        // Get the previously selected version's URL to fall back to
        const history = segmentVersionHistories.get(segmentIndex) || [];
        const selectedVersionIdx = selectedSegmentVersions.get(segmentIndex) ?? (history.length - 1);
        const fallbackUrl = history[selectedVersionIdx] || previousVideoUrl;

        // Update segment status to failed but KEEP the previous successful URL for display
        setPendingSegments(prev => {
          const updated = [...prev];
          updated[segmentIndex] = {
            ...updated[segmentIndex],
            status: 'failed',
            error: photo.videoError || 'Generation timed out',
            // Keep the fallback URL so user can still see/use previous version
            url: fallbackUrl || updated[segmentIndex].url
          };
          return updated;
        });

        // Cleanup tracking state for this segment
        indicesToRemove.push(segmentIndex);
        segmentPreviousVideoUrlsRef.current.delete(segmentIndex);

        showToast({
          title: '❌ Segment Failed',
          message: `Segment ${segmentIndex + 1} failed: ${photo.videoError || 'Timeout'}. You can retry it.`,
          type: 'error',
          timeout: 5000
        });
      }
      // Still generating - check if progress changed
      else if (photo.generatingVideo) {
        hasProgressChanges = true;
      }
    });

    // Remove completed/failed segments from tracking
    if (indicesToRemove.length > 0) {
      setRegeneratingSegmentIndices(prev => {
        const updated = new Set(prev);
        indicesToRemove.forEach(idx => updated.delete(idx));
        return updated;
      });
      // Also clean up progress map for removed indices
      setSegmentRegenerationProgresses(prev => {
        const updated = new Map(prev);
        indicesToRemove.forEach(idx => updated.delete(idx));
        return updated;
      });
    }

    // Update progress map for segments still generating (only if there are changes)
    if (hasProgressChanges) {
      setSegmentRegenerationProgresses(prev => {
        const updated = new Map(prev);
        regeneratingSegmentIndices.forEach(segmentIndex => {
          const segment = pendingSegments[segmentIndex];
          if (!segment) return;
          const photo = photos.find(p => p.id === segment.photoId);
          if (!photo || !photo.generatingVideo) return;

          updated.set(segmentIndex, {
            progress: photo.videoProgress || 0,
            eta: photo.videoETA || 0,
            workerName: photo.videoWorkerName || null,
            status: photo.videoStatus || null,
            elapsed: photo.videoElapsed || 0
          });
        });
        return updated;
      });
    }
  }, [photos, regeneratingSegmentIndices, pendingSegments, showToast]);

  // Handle final stitching after segment review
  const handleStitchAfterSegmentReview = useCallback(async () => {
    if (!segmentReviewData || pendingSegments.length === 0) {
      console.error('[Segment Review] No data for stitching');
      return;
    }

    const segmentCount = pendingSegments.length;

    // Try segmentReviewData first, then fall back to ref
    let audioSource = segmentReviewData.audioSource;
    if (!audioSource && activeMontageAudioSourceRef.current) {
      audioSource = activeMontageAudioSourceRef.current;
    }

    setShowSegmentReview(false);
    setIsGeneratingStitchedVideo(true);
    setBulkDownloadProgress({
      current: 0,
      total: segmentCount,
      message: 'Stitching all segments together...'
    });

    try {
      // Build the video sequence in order, using the selected version URL for each segment
      // Filter out segments that don't have a valid URL (failed without any successful versions)
      const videosToStitch = pendingSegments
        .map((segment, segmentIndex) => {
          // Get the selected version's URL from history, or fall back to segment.url
          const history = segmentVersionHistories.get(segmentIndex) || [];
          const selectedVersionIdx = selectedSegmentVersions.get(segmentIndex) ?? (history.length - 1);
          const selectedUrl = history[selectedVersionIdx] || segment.url;

          // A segment is usable if it has a successful version URL (even if current status is 'failed')
          // This allows using previous successful versions when the latest generation failed
          const hasUsableUrl = selectedUrl && selectedUrl.length > 0;

          return {
            url: selectedUrl,
            segmentIndex,
            status: segment.status,
            hasUsableUrl
          };
        })
        .filter(item => item.hasUsableUrl)
        .map((item, index) => ({
          url: item.url,
          filename: `segment-${index + 1}.mp4`
        }));

      if (videosToStitch.length === 0) {
        throw new Error('No ready segments to stitch');
      }

      const readySegmentCount = videosToStitch.length;
      const failedSegmentCount = segmentCount - readySegmentCount;

      if (failedSegmentCount > 0) {
        console.log(`[Segment Review] Stitching ${readySegmentCount} ready segments, skipping ${failedSegmentCount} failed`);
        showToast({
          title: '⚠️ Skipping Failed Segments',
          message: `Stitching ${readySegmentCount} successful segments, skipping ${failedSegmentCount} failed.`,
          type: 'warning',
          timeout: 4000
        });
      } else {
        console.log(`[Segment Review] Stitching all ${readySegmentCount} segments`);
      }

      // Update progress total to reflect only segments being stitched
      setBulkDownloadProgress({
        current: 0,
        total: readySegmentCount,
        message: 'Stitching all segments together...'
      });

      // Prepare audio options from the stored audio source (for parent audio overlay)
      let audioOptions = null;

      // For batch-transition, check appliedMusic first (user-selected music track)
      if (segmentReviewData?.workflowType === 'batch-transition' && appliedMusic?.file) {
        try {
          setBulkDownloadProgress({ current: 0, total: readySegmentCount, message: 'Preparing audio track...' });

          let audioBuffer;

          // Check if this is a preset (has presetUrl) or a user-uploaded file
          if (appliedMusic.file.isPreset && appliedMusic.file.presetUrl) {
            const presetUrl = appliedMusic.file.presetUrl;
            const isMP3 = presetUrl.toLowerCase().endsWith('.mp3');

            if (isMP3) {
              // MP3 preset - fetch and transcode via backend
              setBulkDownloadProgress({ current: 0, total: readySegmentCount, message: 'Converting audio track...' });
              console.log(`[Stitch] Fetching and transcoding MP3 preset from: ${presetUrl}`);

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
              console.log(`[Stitch] MP3 transcoded to M4A: ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
            } else {
              // M4A preset - fetch directly
              setBulkDownloadProgress({ current: 0, total: readySegmentCount, message: 'Fetching audio track...' });
              console.log(`[Stitch] Fetching preset audio from: ${presetUrl}`);

              const response = await fetch(presetUrl);
              if (!response.ok) {
                throw new Error(`Failed to fetch preset audio: ${response.status}`);
              }
              audioBuffer = await response.arrayBuffer();
            }
          } else {
            // User-uploaded file - read directly
            audioBuffer = await appliedMusic.file.arrayBuffer();
          }

          audioOptions = {
            buffer: audioBuffer,
            startOffset: appliedMusic.startOffset || 0
          };
          console.log(`[Stitch] Batch-transition audio prepared: ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)}MB, offset: ${appliedMusic.startOffset}s`);
        } catch (audioError) {
          console.warn('[Stitch] Failed to prepare batch-transition audio, continuing without:', audioError);
          showToast({
            title: 'Audio Error',
            message: 'Failed to load audio track. Video will be created without music.',
            type: 'warning'
          });
        }
      } else if (audioSource) {
        try {
          if (audioSource.type === 's2v') {
            // For S2V: Use the audio file directly
            setBulkDownloadProgress({ current: 0, total: readySegmentCount, message: 'Preparing audio track...' });

            // Convert Uint8Array to ArrayBuffer properly
            let audioBuffer = audioSource.audioBuffer;
            if (audioBuffer instanceof Uint8Array) {
              // Slice to create a clean ArrayBuffer (handles byte offset issues)
              audioBuffer = audioBuffer.buffer.slice(
                audioBuffer.byteOffset,
                audioBuffer.byteOffset + audioBuffer.byteLength
              );
            }

            if (audioBuffer) {
              audioOptions = {
                buffer: audioBuffer,
                startOffset: audioSource.startOffset || 0
              };
            }
          } else if (audioSource.type === 'animate-move' || audioSource.type === 'animate-replace') {
            // For Animate Move/Replace: Extract audio from the source video
            setBulkDownloadProgress({ current: 0, total: readySegmentCount, message: 'Extracting audio from source video...' });

            // Convert Uint8Array to ArrayBuffer properly
            let videoBuffer = audioSource.videoBuffer;
            if (videoBuffer instanceof Uint8Array) {
              // Slice to create a clean ArrayBuffer (handles byte offset issues)
              videoBuffer = videoBuffer.buffer.slice(
                videoBuffer.byteOffset,
                videoBuffer.byteOffset + videoBuffer.byteLength
              );
            }

            if (videoBuffer) {
              audioOptions = {
                buffer: videoBuffer,
                startOffset: audioSource.startOffset || 0,
                isVideoSource: true // Flag to indicate this is a video file to extract audio from
              };
            }
          }
        } catch (audioError) {
          console.warn('[Stitch] Failed to prepare audio options, continuing without parent audio:', audioError);
          // Continue without audio rather than failing
        }
      }

      const concatenatedBlob = await concatenateVideos(
        videosToStitch,
        (current, total, message) => {
          setBulkDownloadProgress({
            current,
            total,
            message
          });
        },
        audioOptions, // Pass audio options to mux parent audio track
        false // Don't preserve source audio from individual clips (we're using parent audio)
      );

      // Create blob URL for preview and show overlay directly
      const blobUrl = URL.createObjectURL(concatenatedBlob);
      setStitchedVideoUrl(blobUrl);

      // Complete!
      setIsGeneratingStitchedVideo(false);
      setBulkDownloadProgress({ current: 0, total: 0, message: '' });

      // Close segment review and show video overlay directly (user already reviewed segments)
      setShowSegmentReview(false);
      setShowStitchedVideoOverlay(true);

      // Keep pendingSegments and segmentReviewData for Remix functionality
      // But clear the active montage tracking to prevent re-stitching
      setActiveMontagePhotoIds(null);
      setActiveMontageWorkflowType(null);
      montageCompletedRef.current.clear();
      // CRITICAL: Clear audio source ref to prevent stale audio persisting to next workflow
      activeMontageAudioSourceRef.current = null;

    } catch (error) {
      console.error('[Segment Review] Stitching failed:', error);
      showToast({
        title: 'Stitching Failed',
        message: error.message || 'Failed to stitch videos. Please try again.',
        type: 'error'
      });
      setIsGeneratingStitchedVideo(false);
      setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      // Go back to review instead of closing
      setShowSegmentReview(true);
    }
  }, [segmentReviewData, pendingSegments, showToast, appliedMusic]);

  // Handle closing segment review - go back to video preview
  const handleCloseSegmentReview = useCallback(async () => {
    console.log('[Segment Review] User closed review');

    // Cancel any active regeneration (in case regeneration is in progress)
    if (regeneratingSegmentIndices.size > 0) {
      try {
        await cancelAllActiveVideoProjects(setPhotos);
      } catch (error) {
        console.error('[Segment Review] Error cancelling projects:', error);
      }
      setRegeneratingSegmentIndices(new Set());
      setSegmentRegenerationProgresses(new Map());
      segmentPreviousVideoUrlsRef.current.clear();
    }

    // Close the review popup
    setShowSegmentReview(false);

    // If we have a stitched video, show it again
    if (stitchedVideoUrl) {
      setShowStitchedVideoOverlay(true);
    }
  }, [setPhotos, regeneratingSegmentIndices, stitchedVideoUrl]);

  // Handle cancelling a single segment (for stuck/slow jobs)
  const handleCancelSegmentItem = useCallback(async (segmentIndex) => {
    const segment = pendingSegments[segmentIndex];
    if (!segment) {
      console.error('[Segment Cancel Item] Segment not found:', segmentIndex);
      return;
    }

    console.log(`[Segment Cancel Item] Cancelling segment ${segmentIndex + 1} (status: ${segment.status})`);

    // Find the photo for this segment
    const photo = photos.find(p => p.id === segment.photoId);
    if (!photo) {
      console.error('[Segment Cancel Item] Photo not found for segment:', segment.photoId);
      return;
    }

    // Try to cancel the video project if it exists
    if (photo.videoProjectId) {
      try {
        const result = await cancelVideoGeneration(photo.videoProjectId, sogniClient, setPhotos);
        console.log(`[Segment Cancel Item] Cancel result for project ${photo.videoProjectId}:`, result);
      } catch (error) {
        console.error('[Segment Cancel Item] Error cancelling project:', error);
      }
    }

    // Clear photo's generating state
    setPhotos(prev => {
      const updated = [...prev];
      const photoIndex = updated.findIndex(p => p.id === segment.photoId);
      if (photoIndex !== -1) {
        updated[photoIndex] = {
          ...updated[photoIndex],
          generatingVideo: false,
          videoETA: undefined,
          videoProjectId: undefined,
          videoError: 'Cancelled by user',
          videoStatus: undefined
        };
      }
      return updated;
    });

    // If this was a regenerating segment, clear its regeneration state
    if (regeneratingSegmentIndices.has(segmentIndex)) {
      setRegeneratingSegmentIndices(prev => {
        const updated = new Set(prev);
        updated.delete(segmentIndex);
        return updated;
      });
      setSegmentRegenerationProgresses(prev => {
        const updated = new Map(prev);
        updated.delete(segmentIndex);
        return updated;
      });
      segmentPreviousVideoUrlsRef.current.delete(segmentIndex);
    }

    // Mark segment as failed/cancelled so user can retry
    setPendingSegments(prev => {
      const updated = [...prev];
      updated[segmentIndex] = {
        ...updated[segmentIndex],
        status: 'failed',
        error: 'Cancelled - click retry to generate again'
      };
      return updated;
    });

    showToast({
      title: '🛑 Segment Cancelled',
      message: `Segment ${segmentIndex + 1} was cancelled. Click "🔄 redo" to retry.`,
      type: 'info',
      timeout: 4000
    });
  }, [pendingSegments, photos, sogniClient, setPhotos, regeneratingSegmentIndices, showToast]);

  // Handle cancelling segment generation during initial creation
  // This shows the CancelConfirmationPopup with refund estimate
  const handleCancelSegmentGeneration = useCallback(async () => {
    console.log('[Segment Cancel] Cancel requested, pendingSegments:', pendingSegments?.length);

    if (!pendingSegments || pendingSegments.length === 0) {
      // Nothing to cancel - just close
      console.log('[Segment Cancel] No segments to cancel, closing...');
      setShowSegmentReview(false);
      setSegmentProgress(null);
      return;
    }

    // Count in-progress segments
    const generatingSegments = pendingSegments.filter(s => s.status === 'generating' || s.status === 'regenerating');
    console.log('[Segment Cancel] Generating segments:', generatingSegments.length);

    if (generatingSegments.length === 0) {
      // Nothing generating - just close
      setShowSegmentReview(false);
      setSegmentProgress(null);
      return;
    }

    // Temporarily hide the VideoReviewPopup to show the cancel confirmation popup
    console.log('[Segment Cancel] Temporarily hiding VideoReviewPopup to show cancel confirmation...');
    setShowSegmentReview(false);

    // Request cancellation through the centralized cancel confirmation flow
    requestCancel({
      projectType: 'video',
      progress: Math.round((pendingSegments.filter(s => s.status === 'ready').length / pendingSegments.length) * 100),
      itemsCompleted: pendingSegments.filter(s => s.status === 'ready').length,
      totalItems: pendingSegments.length,
      onConfirm: async () => {
        try {
          // Cancel all active video projects
          await cancelAllActiveVideoProjects(setPhotos);

          // Close popup and clear state (including version history)
          setShowSegmentReview(false);
          setSegmentProgress(null);
          setPendingSegments([]);
          setSegmentReviewData(null);
          setSegmentVersionHistories(new Map()); // Clear version histories
          setSelectedSegmentVersions(new Map()); // Clear selected versions
          setActiveMontagePhotoIds(null);
          setActiveMontageWorkflowType(null);
          montageCompletedRef.current.clear();
          montageStitchCompletedRef.current = false;
          montageAutoStitchInProgressRef.current = false;
          // CRITICAL: Clear audio source ref to prevent stale audio persisting to next workflow
          activeMontageAudioSourceRef.current = null;

          showToast({
            title: 'Generation Cancelled',
            message: 'Your credits will be refunded for any incomplete work.',
            type: 'info'
          });
        } catch (error) {
          console.error('[Segment Cancel] Error cancelling:', error);
          showToast({
            title: 'Cancel Failed',
            message: 'Failed to cancel generation. Please try again.',
            type: 'error'
          });
        }
      },
      onCancel: () => {
        // User cancelled the cancellation - re-show the VideoReviewPopup
        console.log('[Segment Cancel] User cancelled the cancellation, re-showing VideoReviewPopup...');
        setShowSegmentReview(true);
      }
    });
  }, [pendingSegments, setPhotos, requestCancel, showToast]);

  // Handle sharing stitched video - stitches if needed, then shares via Web Share API
  const handleShareStitchedVideo = useCallback(async () => {
    if (isBulkDownloading) {
      console.log('Bulk operation already in progress');
      return;
    }

    try {
      // Get the correct photos array based on mode
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;

      // Get photos with videos (excluding hidden/discarded ones)
      const photosWithVideos = currentPhotosArray.filter(
        photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
      );

      if (photosWithVideos.length === 0) {
        showToast({
          title: 'No Videos',
          message: 'No videos available to share.',
          type: 'info'
        });
        return;
      }

      if (photosWithVideos.length === 1) {
        showToast({
          title: 'Single Video',
          message: 'Need at least 2 videos to create a stitched video for sharing.',
          type: 'info'
        });
        return;
      }

      let videoBlob;

      // Priority 1: Check for cached infinite loop video (most advanced - includes AI transitions)
      if (cachedInfiniteLoopBlob) {
        console.log('[Share Stitched] Using cached infinite loop video');
        videoBlob = cachedInfiniteLoopBlob;
      }
      // Priority 2: Check for cached transition video
      else if (readyTransitionVideo?.blob && isTransitionMode && transitionVideoQueue.length >= 2) {
        console.log('[Share Stitched] Using cached transition video');
        videoBlob = readyTransitionVideo.blob;
      }
      // Priority 3: Check if we have a stitched video URL from the overlay, fetch the blob
      else if (stitchedVideoUrl && isTransitionMode) {
        console.log('[Share Stitched] Fetching blob from stitched video URL');
        try {
          const response = await fetch(stitchedVideoUrl);
          videoBlob = await response.blob();
        } catch (fetchError) {
          console.log('[Share Stitched] Could not fetch from stitchedVideoUrl, will stitch fresh');
          videoBlob = null;
        }
      }
      // Priority 4: Check for cached regular stitched video
      else {
        const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
        
        if (cachedStitchedVideoBlob && cachedStitchedVideoPhotosHash === photosHash) {
          console.log('[Share Stitched] Using cached stitched video');
          videoBlob = cachedStitchedVideoBlob;
        }
      }

      if (!videoBlob) {
        // Need to stitch the videos first
        console.log('[Share Stitched] Stitching videos before sharing...');
        setIsBulkDownloading(true);
        setIsGeneratingStitchedVideo(true);
        setBulkDownloadProgress({ current: 0, total: photosWithVideos.length, message: 'Stitching videos for sharing...' });

        const startTime = performance.now();

        const videosToStitch = photosWithVideos.map((photo, index) => ({
          url: photo.videoUrl,
          filename: `video-${index + 1}.mp4`
        }));

        // Check if this is from a montage mode with stored audio source
        let audioOptions = null;

        // Try segmentReviewData first, then fall back to ref
        let audioSource = segmentReviewData?.audioSource;
        if (!audioSource && activeMontageAudioSourceRef.current) {
          audioSource = activeMontageAudioSourceRef.current;
        }

        if (audioSource && ['s2v', 'animate-move', 'animate-replace'].includes(segmentReviewData?.workflowType || audioSource.type)) {
          try {
            if (audioSource.type === 's2v') {
              let audioBuffer = audioSource.audioBuffer;
              if (audioBuffer instanceof Uint8Array) {
                audioBuffer = audioBuffer.buffer.slice(
                  audioBuffer.byteOffset,
                  audioBuffer.byteOffset + audioBuffer.byteLength
                );
              }
              if (audioBuffer) {
                audioOptions = {
                  buffer: audioBuffer,
                  startOffset: audioSource.startOffset || 0
                };
                console.log(`[Share Stitched] Using S2V parent audio`);
              }
            } else if (audioSource.type === 'animate-move' || audioSource.type === 'animate-replace') {
              let videoBuffer = audioSource.videoBuffer;
              if (videoBuffer instanceof Uint8Array) {
                videoBuffer = videoBuffer.buffer.slice(
                  videoBuffer.byteOffset,
                  videoBuffer.byteOffset + videoBuffer.byteLength
                );
              }
              if (videoBuffer) {
                audioOptions = {
                  buffer: videoBuffer,
                  startOffset: audioSource.startOffset || 0,
                  isVideoSource: true
                };
                console.log(`[Share Stitched] Using ${audioSource.type} parent audio`);
              }
            }
          } catch (audioError) {
            console.warn('[Share Stitched] Failed to prepare parent audio:', audioError);
          }
        }

        // Concatenate videos into one seamless video (with optional parent audio for montage mode)
        const concatenatedBlob = await concatenateVideos(
          videosToStitch,
          (current, total, message) => {
            setBulkDownloadProgress({ current, total, message });
          },
          audioOptions,
          !audioOptions // Preserve source audio only if not using parent audio
        );

        const elapsedMs = performance.now() - startTime;
        console.log(`[Share Stitched] ✅ Stitching complete in ${(elapsedMs / 1000).toFixed(2)}s`);

        // Cache the stitched video
        const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
        setCachedStitchedVideoBlob(concatenatedBlob);
        setCachedStitchedVideoPhotosHash(photosHash);

        videoBlob = concatenatedBlob;
        setIsGeneratingStitchedVideo(false);
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }

      // Now share the video
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `sogni-photobooth-stitched-${timestamp}.mp4`;

      // Check if Web Share API is available and supports files
      if (navigator.share && navigator.canShare) {
        const file = new File([videoBlob], filename, { type: 'video/mp4' });

        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: 'My Sogni Photobooth Video',
              text: 'Check out my stitched video from Sogni AI Photobooth!'
            });
            console.log('[Share Stitched] Successfully shared via Web Share API');

            showToast({
              title: 'Shared!',
              message: 'Your stitched video was shared successfully.',
              type: 'success'
            });
            return;
          } catch (shareError) {
            if (shareError.name === 'AbortError') {
              console.log('[Share Stitched] User cancelled share');
              return;
            }
            console.log('[Share Stitched] Web Share completed with potential error:', shareError);
            return;
          }
        }
      }

      // Fallback: Web Share not available - download the video instead
      console.log('[Share Stitched] Web Share not available, falling back to download');
      const blobUrl = URL.createObjectURL(videoBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      showToast({
        title: 'Downloaded',
        message: 'Web Share not available on this device. Video downloaded instead.',
        type: 'info'
      });

    } catch (error) {
      console.error('[Share Stitched] Error:', error);
      setIsGeneratingStitchedVideo(false);
      setIsBulkDownloading(false);
      setBulkDownloadProgress({ current: 0, total: 0, message: '' });

      showToast({
        title: 'Share Failed',
        message: 'Failed to share stitched video. Please try again.',
        type: 'error'
      });
    }
  }, [photos, filteredPhotos, isPromptSelectorMode, isBulkDownloading, cachedInfiniteLoopBlob, cachedStitchedVideoBlob, cachedStitchedVideoPhotosHash, readyTransitionVideo, isTransitionMode, transitionVideoQueue, stitchedVideoUrl, segmentReviewData, showToast, setIsBulkDownloading, setBulkDownloadProgress]);

  // Handle sharing stitched video to Twitter - stitch if needed, then open Twitter share modal
  const handleShareStitchedVideoToTwitter = useCallback(async () => {
    try {
      // Get the correct photos array based on mode
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
      const photosWithVideos = currentPhotosArray.filter(
        photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
      );

      if (photosWithVideos.length < 2) {
        showToast({
          title: 'Not Enough Videos',
          message: 'Need at least 2 videos to create a stitched video.',
          type: 'info'
        });
        return;
      }

      let videoBlob = null;

      // Priority 1: Check for cached infinite loop video (most advanced - includes AI transitions)
      if (cachedInfiniteLoopBlob) {
        console.log('[Twitter Share Stitched] Using cached infinite loop video');
        videoBlob = cachedInfiniteLoopBlob;
      }
      // Priority 2: Check for cached transition video
      else if (readyTransitionVideo?.blob && isTransitionMode && transitionVideoQueue.length >= 2) {
        console.log('[Twitter Share Stitched] Using cached transition video');
        videoBlob = readyTransitionVideo.blob;
      }
      // Priority 3: Check for cached regular stitched video
      else {
        const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
        
        if (cachedStitchedVideoBlob && cachedStitchedVideoPhotosHash === photosHash) {
          console.log('[Twitter Share Stitched] Using cached stitched video');
          videoBlob = cachedStitchedVideoBlob;
        }
      }
      
      if (!videoBlob) {
        // Need to stitch first
        console.log('[Twitter Share Stitched] Stitching videos before sharing to Twitter...');
        setIsBulkDownloading(true);
        setIsGeneratingStitchedVideo(true);
        setBulkDownloadProgress({ current: 0, total: photosWithVideos.length, message: 'Stitching videos for Twitter...' });

        const videosToStitch = photosWithVideos.map((photo, index) => ({
          url: photo.videoUrl,
          filename: `video-${index + 1}.mp4`
        }));

        // Check if this is from a montage mode with stored audio source
        let audioOptions = null;

        // Try segmentReviewData first, then fall back to ref
        let audioSource = segmentReviewData?.audioSource;
        if (!audioSource && activeMontageAudioSourceRef.current) {
          audioSource = activeMontageAudioSourceRef.current;
        }

        if (audioSource && ['s2v', 'animate-move', 'animate-replace'].includes(segmentReviewData?.workflowType || audioSource.type)) {
          try {
            if (audioSource.type === 's2v') {
              let audioBuffer = audioSource.audioBuffer;
              if (audioBuffer instanceof Uint8Array) {
                audioBuffer = audioBuffer.buffer.slice(
                  audioBuffer.byteOffset,
                  audioBuffer.byteOffset + audioBuffer.byteLength
                );
              }
              if (audioBuffer) {
                audioOptions = {
                  buffer: audioBuffer,
                  startOffset: audioSource.startOffset || 0
                };
                console.log(`[Twitter Share Stitched] Using S2V parent audio`);
              }
            } else if (audioSource.type === 'animate-move' || audioSource.type === 'animate-replace') {
              let videoBuffer = audioSource.videoBuffer;
              if (videoBuffer instanceof Uint8Array) {
                videoBuffer = videoBuffer.buffer.slice(
                  videoBuffer.byteOffset,
                  videoBuffer.byteOffset + videoBuffer.byteLength
                );
              }
              if (videoBuffer) {
                audioOptions = {
                  buffer: videoBuffer,
                  startOffset: audioSource.startOffset || 0,
                  isVideoSource: true
                };
                console.log(`[Twitter Share Stitched] Using ${audioSource.type} parent audio`);
              }
            }
          } catch (audioError) {
            console.warn('[Twitter Share Stitched] Failed to prepare parent audio:', audioError);
          }
        }

        videoBlob = await concatenateVideos(
          videosToStitch,
          (current, total, message) => {
            setBulkDownloadProgress({ current, total, message });
          },
          audioOptions,
          !audioOptions
        );

        // Cache the stitched video
        const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
        setCachedStitchedVideoBlob(videoBlob);
        setCachedStitchedVideoPhotosHash(photosHash);

        setIsGeneratingStitchedVideo(false);
        setIsBulkDownloading(false);
        setBulkDownloadProgress({ current: 0, total: 0, message: '' });
      }

      // Convert blob to data URL so the backend can process it
      // (blob URLs are browser-local and can't be accessed by the server)
      console.log('[Twitter Share Stitched] Converting video blob to data URL...');
      setIsBulkDownloading(true);
      setBulkDownloadProgress({ current: 0, total: 1, message: 'Preparing video for Twitter...' });

      const videoDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to convert video'));
        reader.readAsDataURL(videoBlob);
      });

      console.log('[Twitter Share Stitched] Video converted, data URL length:', videoDataUrl.length);
      setIsBulkDownloading(false);
      setBulkDownloadProgress({ current: 0, total: 0, message: '' });

      // Open Twitter share modal with the stitched video data URL
      // Use handleShareToX from props with a synthetic photo object containing the video
      // Custom statusText for stitched videos
      const syntheticPhoto = {
        id: 'stitched-video',
        videoUrl: videoDataUrl, // Use data URL instead of blob URL
        images: photosWithVideos[0]?.images || [], // Use first photo's image as fallback
        statusText: 'Just created this video with @sogni_protocol AI photobooth. Pretty sweet. https://photobooth.sogni.ai'
        // Note: Omitting promptKey so it doesn't generate a hashtag in the share message
      };

      handleShareToX(0, syntheticPhoto);

    } catch (error) {
      console.error('[Twitter Share Stitched] Error:', error);
      setIsGeneratingStitchedVideo(false);
      setIsBulkDownloading(false);
      setBulkDownloadProgress({ current: 0, total: 0, message: '' });

      showToast({
        title: 'Share Failed',
        message: 'Failed to prepare stitched video for Twitter. Please try again.',
        type: 'error'
      });
    }
  }, [photos, filteredPhotos, isPromptSelectorMode, cachedInfiniteLoopBlob, cachedStitchedVideoBlob, cachedStitchedVideoPhotosHash, readyTransitionVideo, isTransitionMode, transitionVideoQueue, segmentReviewData, handleShareToX, showToast, setIsBulkDownloading, setBulkDownloadProgress]);

  // Handle sharing stitched video via Web Share API
  const handleShareStitchedVideoViaWebShare = useCallback(async () => {
    // This just calls the existing handleShareStitchedVideo function
    await handleShareStitchedVideo();
  }, [handleShareStitchedVideo]);

  // Handle sharing stitched video via QR Code
  const handleShareStitchedVideoQRCode = useCallback(async () => {
    if (!handleStitchedVideoQRShare) {
      showToast({
        title: 'QR Code Unavailable',
        message: 'QR Code sharing is not available in this context.',
        type: 'info'
      });
      return;
    }

    // Get videos
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    const photosWithVideos = currentPhotosArray.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
    );

    if (photosWithVideos.length < 2) {
      showToast({
        title: 'Not Enough Videos',
        message: 'Need at least 2 videos to share.',
        type: 'info'
      });
      return;
    }

    let videoBlob = null;

    // Priority 1: Check for cached infinite loop video (most advanced - includes AI transitions)
    if (cachedInfiniteLoopBlob) {
      console.log('[QR Share Stitched] Using cached infinite loop video');
      videoBlob = cachedInfiniteLoopBlob;
    }
    // Priority 2: Check for cached transition video
    else if (readyTransitionVideo?.blob && isTransitionMode && transitionVideoQueue.length >= 2) {
      console.log('[QR Share Stitched] Using cached transition video');
      videoBlob = readyTransitionVideo.blob;
    }
    // Priority 3: Check for cached regular stitched video
    else {
      const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
      
      if (cachedStitchedVideoBlob && cachedStitchedVideoPhotosHash === photosHash) {
        console.log('[QR Share Stitched] Using cached stitched video');
        videoBlob = cachedStitchedVideoBlob;
      }
    }
    
    if (!videoBlob) {
      // Need to stitch the videos first
      console.log('[QR Share Stitched] Stitching videos for QR share...');
      showToast({
        title: 'Preparing Video',
        message: 'Stitching videos for sharing...',
        type: 'info'
      });

      try {
        const videosToStitch = photosWithVideos.map((photo, index) => ({
          url: photo.videoUrl,
          filename: `video-${index + 1}.mp4`
        }));

        videoBlob = await concatenateVideos(
          videosToStitch,
          null,
          null
        );

        // Cache the stitched video
        const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
        setCachedStitchedVideoBlob(videoBlob);
        setCachedStitchedVideoPhotosHash(photosHash);
      } catch (error) {
        console.error('[QR Share Stitched] Failed to stitch videos:', error);
        showToast({
          title: 'Error',
          message: 'Failed to prepare video for sharing.',
          type: 'error'
        });
        return;
      }
    }

    // Get thumbnail from first photo
    const thumbnailUrl = photosWithVideos[0]?.images?.[0] || null;

    // Call the App.jsx handler to create QR code
    await handleStitchedVideoQRShare(videoBlob, thumbnailUrl);
  }, [handleStitchedVideoQRShare, isPromptSelectorMode, filteredPhotos, photos, cachedInfiniteLoopBlob, cachedStitchedVideoBlob, cachedStitchedVideoPhotosHash, readyTransitionVideo, isTransitionMode, transitionVideoQueue, showToast]);

  // State for stitched video gallery submission
  const [showStitchedGalleryConfirm, setShowStitchedGalleryConfirm] = useState(false);
  const [stitchedGallerySubmissionPending, setStitchedGallerySubmissionPending] = useState(false);
  const [stitchedVideoPreviewUrl, setStitchedVideoPreviewUrl] = useState(null);

  // Handle submitting stitched video to gallery - shows confirmation popup
  const handleSubmitStitchedVideoToGallery = useCallback(async () => {
    // Get videos to check if we have enough
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    const photosWithVideos = currentPhotosArray.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
    );

    if (photosWithVideos.length < 2) {
      showToast({
        title: 'Not Enough Videos',
        message: 'Need at least 2 videos to submit a stitched video.',
        type: 'info'
      });
      return;
    }

    let videoBlob = null;

    // Priority 1: Check for cached infinite loop video (most advanced)
    if (cachedInfiniteLoopBlob) {
      console.log('[Gallery Submit] Using cached infinite loop video for preview');
      videoBlob = cachedInfiniteLoopBlob;
    }
    // Priority 2: Check for cached transition video
    else if (readyTransitionVideo?.blob && isTransitionMode && transitionVideoQueue.length >= 2) {
      console.log('[Gallery Submit] Using cached transition video for preview');
      videoBlob = readyTransitionVideo.blob;
    }
    // Priority 3: Check for cached regular stitched video
    else {
      // Generate hash of photo IDs to check cache validity for regular stitch
      const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
      
      if (cachedStitchedVideoBlob && cachedStitchedVideoPhotosHash === photosHash) {
        console.log('[Gallery Submit] Using cached stitched video for preview');
        videoBlob = cachedStitchedVideoBlob;
      } else {
        // Need to stitch the videos first for preview
        console.log('[Gallery Submit] Stitching videos for preview...');
        showToast({
          title: 'Preparing Preview',
          message: 'Stitching videos...',
          type: 'info'
        });

        try {
          const videosToStitch = photosWithVideos.map((photo, index) => ({
            url: photo.videoUrl,
            filename: `video-${index + 1}.mp4`
          }));

          videoBlob = await concatenateVideos(
            videosToStitch,
            null,
            null
          );

          // Cache the stitched video for later use
          setCachedStitchedVideoBlob(videoBlob);
          setCachedStitchedVideoPhotosHash(photosHash);
        } catch (error) {
          console.error('[Gallery Submit] Failed to stitch videos for preview:', error);
          showToast({
            title: 'Error',
            message: 'Failed to prepare video preview.',
            type: 'error'
          });
          return;
        }
      }
    }

    // Create blob URL for preview
    if (videoBlob) {
      const previewUrl = URL.createObjectURL(videoBlob);
      setStitchedVideoPreviewUrl(previewUrl);
    }

    // Show confirmation popup
    setShowStitchedGalleryConfirm(true);
  }, [isPromptSelectorMode, filteredPhotos, photos, showToast, cachedInfiniteLoopBlob, cachedStitchedVideoBlob, cachedStitchedVideoPhotosHash, readyTransitionVideo, isTransitionMode, transitionVideoQueue]);

  // Handle stitched video gallery submission confirm
  const handleStitchedGallerySubmitConfirm = useCallback(async () => {
    if (stitchedGallerySubmissionPending) return;

    setStitchedGallerySubmissionPending(true);
    setShowStitchedGalleryConfirm(false);

    try {
      // Get videos
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
      const photosWithVideos = currentPhotosArray.filter(
        photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
      );

      if (photosWithVideos.length < 2) {
        throw new Error('Not enough videos');
      }

      let videoBlob = null;

      // Priority 1: Check for cached infinite loop video (most advanced - includes AI transitions)
      if (cachedInfiniteLoopBlob) {
        console.log('[Gallery Submit Stitched] Using cached infinite loop video');
        videoBlob = cachedInfiniteLoopBlob;
      }
      // Priority 2: Check for cached transition video
      else if (readyTransitionVideo?.blob && isTransitionMode && transitionVideoQueue.length >= 2) {
        console.log('[Gallery Submit Stitched] Using cached transition video');
        videoBlob = readyTransitionVideo.blob;
      }
      // Priority 3: Check for cached regular stitched video
      else {
        // Generate hash of photo IDs to check cache validity for regular stitch
        const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
        
        if (cachedStitchedVideoBlob && cachedStitchedVideoPhotosHash === photosHash) {
          console.log('[Gallery Submit Stitched] Using cached stitched video');
          videoBlob = cachedStitchedVideoBlob;
        } else {
          // Need to stitch the videos first
          console.log('[Gallery Submit Stitched] Stitching videos before submission...');
          showToast({
            title: 'Preparing Video',
            message: 'Stitching videos for submission...',
            type: 'info'
          });

          const videosToStitch = photosWithVideos.map((photo, index) => ({
            url: photo.videoUrl,
            filename: `video-${index + 1}.mp4`
          }));

          videoBlob = await concatenateVideos(
            videosToStitch,
            null,
            null
          );

          // Cache the stitched video
          setCachedStitchedVideoBlob(videoBlob);
          setCachedStitchedVideoPhotosHash(photosHash);
        }
      }

      // Get thumbnail from first photo
      const thumbnailUrl = photosWithVideos[0]?.images?.[0];
      let imageDataUrl = thumbnailUrl;

      // Convert thumbnail to data URL if it's a blob
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

      // Convert video blob to data URL
      let videoDataUrl = null;
      try {
        videoDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(videoBlob);
        });
      } catch (err) {
        console.error('Failed to convert video to data URL:', err);
        throw new Error('Failed to prepare video for submission');
      }

      // Build metadata for stitched video
      const metadata = {
        model: 'multiple', // Stitched videos may contain multiple models
        promptKey: 'stitched-video',
        promptText: 'Stitched Video',
        isVideo: true,
        isStitchedVideo: true,
        videoCount: photosWithVideos.length,
        // Video-specific metadata from settings
        videoResolution: settings.videoResolution || '480p',
        videoFramerate: settings.videoFramerate || 16,
        videoDuration: photosWithVideos.length * (settings.videoDuration || 5) // Approximate total duration
      };

      // Submit to gallery API
      const response = await fetch('/api/contest/gallery-submissions/entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          imageUrl: imageDataUrl,
          videoUrl: videoDataUrl,
          isVideo: true,
          promptKey: 'stitched-video',
          username: user?.username,
          address: user?.address,
          metadata
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit to gallery');
      }

      const data = await response.json();
      console.log('Stitched video gallery submission successful:', data);

      // Show success toast notification
      showToast({
        type: 'success',
        title: '✨ Successfully submitted to gallery!',
        message: 'Your stitched video will be reviewed by moderators.',
        timeout: 5000
      });

    } catch (error) {
      console.error('Error submitting stitched video to gallery:', error);

      showToast({
        type: 'error',
        title: '❌ Submission Failed',
        message: 'Failed to submit stitched video to gallery. Please try again.',
        timeout: 5000
      });
    } finally {
      setStitchedGallerySubmissionPending(false);
      // Clean up the preview URL
      if (stitchedVideoPreviewUrl) {
        URL.revokeObjectURL(stitchedVideoPreviewUrl);
        setStitchedVideoPreviewUrl(null);
      }
    }
  }, [isPromptSelectorMode, filteredPhotos, photos, cachedStitchedVideoBlob, cachedStitchedVideoPhotosHash, readyTransitionVideo, isTransitionMode, transitionVideoQueue, settings, user, showToast, stitchedGallerySubmissionPending, stitchedVideoPreviewUrl]);

  // Handle stitched video gallery submission cancel
  const handleStitchedGallerySubmitCancel = useCallback(() => {
    setShowStitchedGalleryConfirm(false);
    // Revoke the preview blob URL to free memory
    if (stitchedVideoPreviewUrl) {
      URL.revokeObjectURL(stitchedVideoPreviewUrl);
      setStitchedVideoPreviewUrl(null);
    }
  }, [stitchedVideoPreviewUrl]);

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

  // Stop track browser preview audio
  const stopTransitionTrackPreview = useCallback(() => {
    if (trackPreviewAudioRef.current) {
      trackPreviewAudioRef.current.pause();
      trackPreviewAudioRef.current.currentTime = 0;
    }
    setTrackPreviewingId(null);
    setIsTrackPreviewPlaying(false);
  }, []);

  // Handle AI-generated music track selection for transition video
  const handleTransitionGeneratedTrackSelect = useCallback(async (track) => {
    setShowTransitionMusicGenerator(false);
    setSelectedPresetId(null);
    stopTransitionTrackPreview();
    setShowTrackBrowser(false);

    try {
      // Create placeholder File object matching preset pattern
      const generatedFile = new File([], `ai-generated-${Date.now()}.mp3`, { type: 'audio/mpeg' });
      generatedFile.presetUrl = track.url;
      generatedFile.isPreset = true;
      generatedFile.isGenerated = true;

      // Get duration via Audio element
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => {
          setAudioDuration(audio.duration);
          resolve();
        };
        audio.onerror = () => {
          // Fallback: use track duration if available
          if (track.duration) {
            setAudioDuration(track.duration);
          }
          resolve();
        };
        audio.src = track.url;
      });

      setMusicFile(generatedFile);

      // Set up audio preview
      if (audioPreviewRef.current) {
        audioPreviewRef.current.src = track.url;
        audioPreviewRef.current.crossOrigin = 'anonymous';
      }

      // Generate placeholder waveform (same as presets - avoids CORS issues)
      const samples = 200;
      const waveformData = [];
      for (let i = 0; i < samples; i++) {
        const seed = (track.url || '').charCodeAt(i % Math.max((track.url || '').length, 1));
        const noise = Math.sin(i * 0.1 + seed) * 0.3 + 0.5;
        const envelope = Math.sin((i / samples) * Math.PI) * 0.3 + 0.7;
        waveformData.push(noise * envelope);
      }
      setAudioWaveform(waveformData);
      setMusicStartOffset(0);
    } catch (error) {
      console.error('Failed to load generated track:', error);
      showToast({
        title: 'Load Error',
        message: 'Failed to load generated track. Please try again.',
        type: 'error'
      });
    }
  }, [showToast]);

  // Toggle play/pause for a track in the browser
  const handleTransitionPreviewToggle = useCallback((track) => {
    const audio = trackPreviewAudioRef.current;
    if (!audio) return;

    if (trackPreviewingId === track.id) {
      if (isTrackPreviewPlaying) {
        audio.pause();
        setIsTrackPreviewPlaying(false);
      } else {
        audio.play().catch(() => setIsTrackPreviewPlaying(false));
        setIsTrackPreviewPlaying(true);
      }
    } else {
      audio.pause();
      audio.src = track.url;
      audio.load();
      audio.play().catch(() => setIsTrackPreviewPlaying(false));
      setTrackPreviewingId(track.id);
      setIsTrackPreviewPlaying(true);
    }
  }, [trackPreviewingId, isTrackPreviewPlaying]);

  // Clear preset selection when choosing custom file
  const handleCustomFileSelect = useCallback(async (e) => {
    setSelectedPresetId(null);
    stopTransitionTrackPreview();
    setShowTrackBrowser(false);
    await handleMusicFileSelect(e);
  }, [handleMusicFileSelect, stopTransitionTrackPreview]);

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

  // Keep videoDurationRef in sync for animation frame access (prevents stale closure)
  useEffect(() => {
    videoDurationRef.current = getVideoDuration();
  }, [getVideoDuration]);

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
          
          // Read current values from refs (prevents stale closure when duration changes)
          const currentOffset = musicStartOffsetRef.current;
          const videoDuration = videoDurationRef.current;
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
      if (trackPreviewAudioRef.current) {
        trackPreviewAudioRef.current.pause();
        trackPreviewAudioRef.current.currentTime = 0;
      }
      setIsPlayingPreview(false);
      setTrackPreviewingId(null);
      setIsTrackPreviewPlaying(false);
      setShowTrackBrowser(false);
      setTrackSearchQuery('');
      setShowTransitionMusicGenerator(false);
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
            // Use statusText directly if it's a hashtag (but not #SogniPhotobooth), otherwise use styleDisplayText
            const photoLabel = (photo?.statusText && photo.statusText.includes('#') && photo.statusText !== '#SogniPhotobooth') 
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
              // Use S3 fetch with CORS fallback for HTTP URLs (blob URLs don't need it)
              const response = imageUrl.startsWith('blob:')
                ? await fetch(imageUrl)
                : await fetchS3WithFallback(imageUrl);
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

  // Handle saving images to a local project
  const handleSaveToLocalProject = useCallback(async (projectName) => {
    if (!isLocalProjectsSupported) {
      showToast({
        type: 'error',
        message: 'Local projects are not supported in this browser'
      });
      return;
    }

    try {
      setIsSavingToLocalProject(true);

      // Get the correct photos array based on mode
      const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;

      // Get loaded photos (excluding hidden/discarded ones)
      const loadedPhotos = currentPhotosArray.filter(
        photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0
      );

      if (loadedPhotos.length === 0) {
        showToast({
          type: 'error',
          message: 'No images to save'
        });
        setIsSavingToLocalProject(false);
        return;
      }

      // Create the new project
      const project = await createLocalProject(projectName);
      if (!project) {
        showToast({
          type: 'error',
          message: 'Failed to create project'
        });
        setIsSavingToLocalProject(false);
        return;
      }

      // Convert image URLs to File objects
      const files = [];
      for (let i = 0; i < loadedPhotos.length; i++) {
        const photo = loadedPhotos[i];
        // Get raw image URL (first image, or enhanced if available)
        const imageUrl = photo.enhancedImageUrl || (photo.images && photo.images[0]);
        if (!imageUrl) continue;

        try {
          // Fetch the image as blob with S3 CORS fallback
          const blob = await fetchS3AsBlob(imageUrl);

          // Determine filename and extension
          const mimeType = blob.type || 'image/png';
          const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';

          // Generate filename using style name if available
          let styleName = 'image';
          if (photo.customSceneName) {
            styleName = photo.customSceneName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
          } else if (photo.promptKey && photo.promptKey !== 'custom' && photo.promptKey !== 'random') {
            styleName = styleIdToDisplay(photo.promptKey).replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
          }

          const filename = `${styleName}-${i + 1}.${extension}`;

          // Create File object
          const file = new File([blob], filename, { type: mimeType });
          files.push(file);
        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error);
        }
      }

      if (files.length === 0) {
        showToast({
          type: 'error',
          message: 'Failed to process images'
        });
        setIsSavingToLocalProject(false);
        return;
      }

      // Add images to the project
      const result = await addLocalImages(project.id, files);

      if (result.added > 0) {
        showToast({
          type: 'success',
          message: `Saved ${result.added} image${result.added !== 1 ? 's' : ''} to "${projectName}"`
        });
        setShowSaveToLocalProjectPopup(false);
      } else {
        showToast({
          type: 'error',
          message: result.error || 'Failed to save images'
        });
      }

    } catch (error) {
      console.error('Error saving to local project:', error);
      showToast({
        type: 'error',
        message: 'Failed to save images to project'
      });
    } finally {
      setIsSavingToLocalProject(false);
    }
  }, [isLocalProjectsSupported, isPromptSelectorMode, filteredPhotos, photos, createLocalProject, addLocalImages, showToast]);

  // Generate default project name for save popup
  const defaultLocalProjectName = useMemo(() => {
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    return generateDefaultProjectName(currentPhotosArray, styleIdToDisplay);
  }, [isPromptSelectorMode, filteredPhotos, photos]);

  // Count of completed photos for save popup
  const completedPhotosCount = useMemo(() => {
    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
    return currentPhotosArray.filter(
      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.images && photo.images.length > 0
    ).length;
  }, [isPromptSelectorMode, filteredPhotos, photos]);

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
        // Note: Don't reopen VideoSelectionPopup on outside clicks, only on explicit close button
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
    // Close dropdowns if open
    if (showMoreDropdown) {
      setShowMoreDropdown(false);
    }
    if (showSlideshowDownloadDropdown) {
      setShowSlideshowDownloadDropdown(false);
    }
    
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
  }, [selectedPhotoIndex, setSelectedPhotoIndex, preGenerateAdjacentFrames, isPromptSelectorMode, filteredPhotos, photos, onPromptSelect, handleBackToCamera, isExtensionMode, showMoreDropdown, showSlideshowDownloadDropdown]);


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

  // Clear previousFramedImage after the selected photo's frame is ready
  // This runs AFTER render (via useEffect) to avoid React #310 infinite loop error
  useEffect(() => {
    if (previousFramedImage && selectedPhotoIndex !== null) {
      const photosArray = isPromptSelectorMode ? filteredPhotos : photos;
      const selectedPhoto = photosArray[selectedPhotoIndex];
      
      if (selectedPhoto) {
        const currentSubIndex = selectedPhoto.enhanced && selectedPhoto.enhancedImageUrl
          ? -1
          : (selectedSubIndex || 0);
        const photoTaipeiFrameNumber = selectedPhoto.taipeiFrameNumber || 1;
        const frameKey = generateFrameKey(selectedPhotoIndex, currentSubIndex, photoTaipeiFrameNumber);
        
        // If the frame for the selected photo is ready, clear the previous frame
        if (framedImageUrls[frameKey]) {
          // Use a small delay to allow any visual transition to complete
          const timeoutId = setTimeout(() => {
            setPreviousFramedImage(null);
          }, 100);
          return () => clearTimeout(timeoutId);
        }
      }
    }
  }, [previousFramedImage, selectedPhotoIndex, photos, filteredPhotos, isPromptSelectorMode, selectedSubIndex, framedImageUrls, generateFrameKey]);

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
      
      // Standard desktop download with S3 CORS fallback
      const blob = await fetchS3AsBlob(imageUrl);
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
      
      // Use statusText directly if it's a hashtag (but not #SogniPhotobooth), otherwise use styleDisplayText
      const photoLabel = (targetPhoto?.statusText && targetPhoto.statusText.includes('#') && targetPhoto.statusText !== '#SogniPhotobooth') 
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
          // Use S3 fetch with CORS fallback for HTTP URLs (blob URLs don't need it)
          const response = imageUrl.startsWith('blob:')
            ? await fetch(imageUrl)
            : await fetchS3WithFallback(imageUrl);
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
          styleReferenceImage={styleReferenceImage}
          onEditStyleReference={onEditStyleReference}
          onCopyImageStyle={() => {
            console.log('PhotoGallery: Copy Image Style triggered from StyleDropdown');
            // Create a file input for the user to select an image
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png, image/jpeg, image/jpg';
            input.onchange = async (e) => {
              const file = e.target.files?.[0];
              if (file && onCopyImageStyleSelect) {
                await onCopyImageStyleSelect(file);
              }
            };
            input.click();
          }}
          showToast={showToast}
          onNavigateToVibeExplorer={onNavigateToVibeExplorer}
          slideInPanel={true}
          onCustomPromptChange={(prompt, sceneName) => {
            // Update the settings using the context's updateSetting function
            console.log('🎨 [PhotoGallery] Custom prompt change:', { prompt, sceneName });
            updateSetting('positivePrompt', prompt);
            updateSetting('customSceneName', sceneName || '');
            console.log('🎨 [PhotoGallery] After updateSetting - settings:', { 
              positivePrompt: settings.positivePrompt, 
              customSceneName: settings.customSceneName 
            });
          }}
          currentCustomPrompt={settings.positivePrompt || ''}
          currentCustomSceneName={settings.customSceneName || ''}
        />
      )}

      {/* Bottom right button container - holds separate Download and Video buttons */}
      {/* Show when: has completed photos with images, OR has generating/loading photos (for cancel button), OR can start new batch */}
      {!isPromptSelectorMode && selectedPhotoIndex === null && (
        (photos && photos.length > 0 && (
          photos.filter(p => !p.hidden && !p.error && p.images && p.images.length > 0).length > 0 ||
          photos.some(p => !p.hidden && (p.generating || p.loading)) ||
          hasGeneratingVideos
        )) ||
        lastPhotoData?.blob // Show container if user can start a new batch (even after full cancellation)
      ) && (
        <div style={{ 
          position: 'fixed', 
          right: '32px', 
          bottom: '32px', 
          display: 'flex', 
          gap: '8px', 
          alignItems: 'center',
          zIndex: 10000000 
        }}>
          {/* Download Button - Only show when there are completed images */}
          {photos && photos.filter(p => !p.hidden && !p.error && p.images && p.images.length > 0).length > 0 && (
            <div 
              className="batch-download-button-container" 
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
              className="batch-action-button batch-download-button"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Hide download tip when button is clicked
                if (showDownloadTip) {
                  setShowDownloadTip(false);
                }
                // Close slideshow download dropdown if open
                if (showSlideshowDownloadDropdown) {
                  setShowSlideshowDownloadDropdown(false);
                }
                // Always show download options dropdown
                setShowMoreDropdown(prev => !prev);
              }}
              disabled={isBulkDownloading}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                padding: '6px 14px',
                paddingBottom: '8px',
                borderRadius: '8px',
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
              title="Download all images"
            >
              {showDownloadTip && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '12px',
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
                    color: '#fff',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: '600',
                    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 8px 24px rgba(147, 51, 234, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
                    zIndex: 10000,
                    pointerEvents: 'none',
                    animation: 'fadeInBounce 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    letterSpacing: '0.01em'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>♾️</span>
                    <span>Stitch videos together in a loop?</span>
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '8px solid transparent',
                      borderRight: '8px solid transparent',
                      borderTop: '8px solid #7c3aed'
                    }}
                  />
                </div>
              )}
              <span>⬇️</span>
            </button>
            
            {/* Download options dropdown - portaled to escape stacking context */}
            {showMoreDropdown && !isBulkDownloading && createPortal(
              (
                <div
                  className="more-dropdown-menu"
                  style={{
                    position: 'fixed',
                    bottom: (() => {
                      // Position dropdown above the batch download button
                      const batchButton = document.querySelector('.batch-download-button-container');
                      if (batchButton) {
                        const rect = batchButton.getBoundingClientRect();
                        return window.innerHeight - rect.top + 10; // 10px gap above the button
                      }
                      return 88; // fallback
                    })(),
                    left: (() => {
                      // Position dropdown aligned with the batch download button (right-aligned)
                      const batchButton = document.querySelector('.batch-download-button-container');
                      if (batchButton) {
                        const rect = batchButton.getBoundingClientRect();
                        const dropdownWidth = 200;
                        let leftPos = rect.right - dropdownWidth; // Align right edge of dropdown with right edge of button
                        
                        // Ensure dropdown doesn't go off-screen
                        if (leftPos < 10) leftPos = 10;
                        if (leftPos + dropdownWidth > window.innerWidth - 10) {
                          leftPos = window.innerWidth - dropdownWidth - 10;
                        }
                        
                        return leftPos;
                      }
                      return 'auto'; // fallback
                    })(),
                    right: (() => {
                      // Only use right if button not found
                      const batchButton = document.querySelector('.batch-download-button-container');
                      return batchButton ? 'auto' : '20px'; // fallback
                    })(),
                    transform: 'none',
                    background: 'rgba(255, 255, 255, 0.98)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    overflow: 'hidden',
                    minWidth: '200px',
                    animation: 'fadeIn 0.2s ease-out',
                    zIndex: 9999999
                  }}
                  onClick={(e) => e.stopPropagation()}
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
                    <span>⬇️</span> Download Images Raw
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
                    <span>🖼️</span> Download Images Framed
                  </button>
                  {isLocalProjectsSupported && (
                    <button
                      className="more-dropdown-option"
                      onClick={() => {
                        setShowMoreDropdown(false);
                        setShowSaveToLocalProjectPopup(true);
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
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span>💾</span> Save To Local Project
                    </button>
                  )}
                  {(() => {
                    // Check if any photos have videos
                    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
                    const photosWithVideos = currentPhotosArray.filter(
                      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
                    );

                    if (photosWithVideos.length > 0) {
                      return (
                        <button
                          className="more-dropdown-option"
                          onClick={() => {
                            setShowMoreDropdown(false);
                            // Always download as ZIP (individual videos)
                            handleDownloadAllVideos();
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
                          <span>🎬</span> Download All Videos
                        </button>
                      );
                    }
                    return null;
                  })()}
                  {(() => {
                    // Check if we have at least 2 videos to stitch
                    const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
                    const photosWithVideos = currentPhotosArray.filter(
                      photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
                    );

                    // Show stitch option when there are 2+ videos (in any mode)
                    // In transition mode, use the cached transition video
                    if (photosWithVideos.length >= 2) {
                      // Check for cached stitched video - either from manual stitch or transition workflow
                      const photosHash = photosWithVideos.map(p => p.id).sort().join('-');
                      const hasCachedStitch = (cachedStitchedVideoBlob && cachedStitchedVideoPhotosHash === photosHash) ||
                                              (isTransitionMode && (readyTransitionVideo?.blob || stitchedVideoUrl || allTransitionVideosComplete));

                      return (
                        <button
                          className="more-dropdown-option"
                          onClick={() => {
                            setShowMoreDropdown(false);
                            // In transition mode, use the transition video download (uses cached video)
                            // In non-transition mode, show stitch options popup for Simple vs Infinite Loop
                            if (isTransitionMode && transitionVideoQueue.length > 0) {
                              handleDownloadTransitionVideo();
                            } else {
                              setShowStitchOptionsPopup(true);
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
                          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 82, 82, 0.1)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span>🎞️</span> Download Stitched Video
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              ),
              document.body
            )}
          </div>
          )}

          {/* Video Button - Only show when there are completed images */}
          {photos && photos.filter(p => !p.hidden && !p.error && p.images && p.images.length > 0).length > 0 && (
            <div 
            className="batch-video-button-container" 
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
              className="batch-action-button batch-video-button"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Close download dropdown if open
                if (showMoreDropdown) {
                  setShowMoreDropdown(false);
                }
                // Show video selection popup
                if (isAuthenticated) {
                  setIsVideoSelectionBatch(true);
                  setShowVideoSelectionPopup(true);
                } else {
                  showToast({
                    title: 'hey there! 👋',
                    message: 'just need u to sign in first to create ur videos :)',
                    type: 'info'
                  });
                  // Automatically open the login modal after showing the toast
                  if (onOpenLoginModal) {
                    setTimeout(() => onOpenLoginModal(), 500);
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
                borderRadius: '8px',
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
              title="Generate videos for all images"
            >
              <span>🎬</span>
            </button>
          </div>
          )}

          {/* Batch 3D Angle Button - Shows when authenticated and there are images */}
          {isAuthenticated && photos && photos.filter(p => !p.hidden && !p.error && p.images && p.images.length > 0 && !p.isOriginal).length > 0 && (
            <div
              className="batch-camera-angle-button-container"
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
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCameraAngleBatch(true);
                  setShowCameraAnglePopup(true);
                }}
                disabled={photos.some(p => p.generatingCameraAngle)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  cursor: photos.some(p => p.generatingCameraAngle) ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'auto',
                  position: 'relative',
                  zIndex: 1,
                  minHeight: '40px',
                  opacity: photos.some(p => p.generatingCameraAngle) ? 0.5 : 1
                }}
                title="Generate 3D angles for all images"
              >
                <span>📐</span>
              </button>
            </div>
          )}

          {/* Share Button - Shows when there are 2+ videos to stitch and share */}
          {(() => {
            const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
            const photosWithVideos = currentPhotosArray.filter(
              photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
            );
            // Show share button when there are 2+ videos
            if (photosWithVideos.length >= 2) {
              return (
                <div
                  className="batch-share-button-container"
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
                  <ShareMenu
                    onShareToTwitter={handleShareStitchedVideoToTwitter}
                    onShareViaWebShare={handleShareStitchedVideoViaWebShare}
                    onShareQRCode={handleShareStitchedVideoQRCode}
                    onSubmitToGallery={handleSubmitStitchedVideoToGallery}
                    onOpen={() => setShowMoreDropdown(false)}
                    showWebShare={isWebShareSupported()}
                    isMobileDevice={isMobile()}
                    disabled={isBulkDownloading}
                    hasPromptKey={true}
                    tezdevTheme={tezdevTheme}
                  />
                </div>
              );
            }
            return null;
          })()}

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
                // Also open the video dropdown
                if (isAuthenticated) {
                  setBatchActionMode('video');
                  setShowBatchVideoDropdown(true);
                }
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

          {/* Cancel button - shown during image generation, video generation, or when project is active */}
          {/* Use hasGeneratingPhotos (local calculation) instead of isGenerating (prop) to avoid stale state */}
          {(hasGeneratingPhotos || activeProjectReference?.current || hasGeneratingVideos) && selectedPhotoIndex === null && (
            <button
              className="cancel-generation-btn"
              onMouseDown={(e) => {
                e.stopPropagation();
                // Close download dropdown if open
                if (showMoreDropdown) {
                  setShowMoreDropdown(false);
                }
                // Determine which cancel handler to call
                if (hasGeneratingPhotos || activeProjectReference?.current) {
                  handleCancelImageGeneration();
                } else if (hasGeneratingVideos) {
                  handleCancelAllVideos();
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
                color: 'white',
                border: 'none',
                padding: '6px 14px',
                paddingBottom: '8px',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                minHeight: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                fontSize: '15px',
                fontFamily: '"Permanent Marker", cursive',
              }}
              title={hasGeneratingVideos && !hasGeneratingPhotos && !activeProjectReference?.current ? "Cancel video generation" : "Cancel current generation"}
            >
              <span style={{ fontSize: '16px' }}>✕</span>
              CANCEL
            </button>
          )}

          {/* New Batch button - shown when NOT generating images AND no active project AND no videos generating */}
          {!hasGeneratingPhotos && !activeProjectReference?.current && !hasGeneratingVideos && selectedPhotoIndex === null && (
            <button
              className="more-photos-btn"
              onClick={() => {
                // Close download dropdown if open
                if (showMoreDropdown) {
                  setShowMoreDropdown(false);
                }
                handleMoreButtonClick();
              }}
              disabled={!isSogniReady || (!lastPhotoData.blob && photos.filter(p => !p.hidden && !p.error && p.images && p.images.length > 0).length === 0)}
              style={{
                background: 'linear-gradient(135deg, #ff5252, #e53935)',
                color: 'white',
                border: 'none',
                padding: '6px 14px',
                paddingBottom: '8px',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                cursor: (!isSogniReady || (!lastPhotoData.blob && photos.filter(p => !p.hidden && !p.error && p.images && p.images.length > 0).length === 0)) ? 'not-allowed' : 'pointer',
                minHeight: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                fontSize: '15px',
                fontFamily: '"Permanent Marker", cursive',
                opacity: (!isSogniReady || (!lastPhotoData.blob && photos.filter(p => !p.hidden && !p.error && p.images && p.images.length > 0).length === 0)) ? 0.6 : 1,
              }}
              title="Adjust and generate next batch"
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
            // Close download dropdown if open
            if (showMoreDropdown) {
              setShowMoreDropdown(false);
            }
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
            // Close dropdowns if open
            if (showMoreDropdown) {
              setShowMoreDropdown(false);
            }
            if (showSlideshowDownloadDropdown) {
              setShowSlideshowDownloadDropdown(false);
            }
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
            // Close dropdowns if open
            if (showMoreDropdown) {
              setShowMoreDropdown(false);
            }
            if (showSlideshowDownloadDropdown) {
              setShowSlideshowDownloadDropdown(false);
            }
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
            onClick={() => {
              // Close dropdowns if open
              if (showMoreDropdown) {
                setShowMoreDropdown(false);
              }
              if (showSlideshowDownloadDropdown) {
                setShowSlideshowDownloadDropdown(false);
              }
              setSelectedPhotoIndex(null);
            }}
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
          onClick={() => {
            // Close dropdowns if open
            if (showMoreDropdown) {
              setShowMoreDropdown(false);
            }
            if (showSlideshowDownloadDropdown) {
              setShowSlideshowDownloadDropdown(false);
            }
            setSelectedPhotoIndex(null);
          }}
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
                onOpen={() => {
                  // Close download dropdown if open
                  if (showMoreDropdown) {
                    setShowMoreDropdown(false);
                  }
                  // Close slideshow download dropdown if open
                  if (showSlideshowDownloadDropdown) {
                    setShowSlideshowDownloadDropdown(false);
                  }
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

          {/* Download Button with Dropdown - Always show in slideshow (not Vibe Explorer) */}
          {!isPromptSelectorMode && (
            <div 
              className="slideshow-download-button-container" 
              style={{ 
                position: 'relative',
                display: 'inline-flex'
              }}
            >
              <button
                className="action-button download-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  // Close main download dropdown if open
                  if (showMoreDropdown) {
                    setShowMoreDropdown(false);
                  }
                  setShowSlideshowDownloadDropdown(prev => !prev);
                }}
                disabled={
                  selectedPhoto.loading || 
                  selectedPhoto.enhancing ||
                  (!selectedPhoto.images || selectedPhoto.images.length === 0) && !selectedPhoto.videoUrl
                }
              >
                <span>⬇️</span>
                <span>Download</span>
              </button>

              {/* Download options dropdown - portaled to escape stacking context */}
              {showSlideshowDownloadDropdown && createPortal(
                (
                  <div
                    className="slideshow-download-dropdown"
                    style={{
                      position: 'fixed',
                      bottom: (() => {
                        // Position dropdown above the download button
                        const downloadButton = document.querySelector('.slideshow-download-button-container');
                        if (downloadButton) {
                          const rect = downloadButton.getBoundingClientRect();
                          return window.innerHeight - rect.top + 10; // 10px gap above the button
                        }
                        return 88; // fallback
                      })(),
                      left: (() => {
                        // Position dropdown aligned with the download button
                        const downloadButton = document.querySelector('.slideshow-download-button-container');
                        if (downloadButton) {
                          const rect = downloadButton.getBoundingClientRect();
                          const dropdownWidth = 200;
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
                        const downloadButton = document.querySelector('.slideshow-download-button-container');
                        return downloadButton ? 'none' : 'translateX(-50%)'; // Only center if no button found
                      })(),
                      background: 'rgba(255, 255, 255, 0.98)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                      overflow: 'hidden',
                      minWidth: '200px',
                      animation: 'fadeIn 0.2s ease-out',
                      zIndex: 9999999
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="more-dropdown-option"
                      onClick={() => {
                        handleDownloadRawPhoto(selectedPhotoIndex);
                        setShowSlideshowDownloadDropdown(false);
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
                      <span>⬇️</span> Download Raw Image
                    </button>
                    <button
                      className="more-dropdown-option"
                      onClick={() => {
                        handleDownloadPhoto(selectedPhotoIndex);
                        setShowSlideshowDownloadDropdown(false);
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
                      <span>🖼️</span> Download Framed Image
                    </button>
                    {selectedPhoto.videoUrl && (
                      <button
                        className="more-dropdown-option"
                        onClick={() => {
                          handleDownloadVideo();
                          setShowSlideshowDownloadDropdown(false);
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
                        <span>🎬</span> Download Video
                      </button>
                    )}
                  </div>
                ),
                document.body
              )}
            </div>
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
                    // Show the enhance options dropdown (context image models)
                    setShowEnhanceDropdown(prev => !prev);
                  }}
                  disabled={selectedPhoto.loading || selectedPhoto.enhancing}
                >
                  <span>✨ {selectedPhoto.enhancing ? 
                    (selectedPhoto.enhancementETA !== undefined && selectedPhoto.enhancementETA > 0 ? 
                      `Enhancing ${formatVideoDuration(selectedPhoto.enhancementETA)}` : 
                      'Enhancing...') : 
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
                    (selectedPhoto.enhancementETA !== undefined && selectedPhoto.enhancementETA > 0 ? 
                      `Enhancing ${formatVideoDuration(selectedPhoto.enhancementETA)}` : 
                      'Enhancing...') : 
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
                  (photos[selectedPhotoIndex].enhancementETA !== undefined && photos[selectedPhotoIndex].enhancementETA > 0 ? 
                    `Enhancing ${formatVideoDuration(photos[selectedPhotoIndex].enhancementETA)}` : 
                    'Enhancing...') : 
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
                    onClick={(e) => { e.stopPropagation(); setShowEnhanceDropdown(false); handleEnhanceWithEditModel(); }}
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
                    {isAuthenticated && !editModelLoading && formatCost(editModelCost, editModelUSD) && (
                      <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
                        {formatCost(editModelCost, editModelUSD)}
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
                <span>🎬</span>
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

              {/* Camera Angle Error message */}
              {selectedPhoto.cameraAngleError && (
                <div
                  className="camera-angle-error"
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '0',
                    right: '0',
                    marginBottom: selectedPhoto.videoError ? '32px' : '4px',
                    background: 'rgba(255, 107, 0, 0.9)',
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
                          cameraAngleError: null
                        };
                      }
                      return updated;
                    });
                  }}
                  title="Click to dismiss"
                >
                  📐 {selectedPhoto.cameraAngleError}
                </div>
              )}

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
                      background: selectedPhoto.generatingVideo ? 'rgba(30, 30, 30, 0.98)' : '#ffeb3b',
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
                      {/* Settings cog icon - left of close button (hidden during generation) */}
                      {!selectedPhoto.generatingVideo && (
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
                      )}
                      
                      {/* Close button - far right */}
                      <button
                        onClick={() => {
                          setShowVideoDropdown(false);
                          setSelectedMotionCategory(null);
                          // Don't open VideoSelectionPopup if we're canceling a generation
                          if (!isVideoSelectionBatch && !selectedPhoto.generatingVideo) {
                            setShowVideoSelectionPopup(true);
                          }
                        }}
                        title="Close"
                        style={{
                          position: 'absolute',
                          top: '0px',
                          right: '0px',
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          border: 'none',
                          background: selectedPhoto.generatingVideo ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.6)',
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
                          e.currentTarget.style.background = selectedPhoto.generatingVideo ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.8)';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = selectedPhoto.generatingVideo ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.6)';
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
                          color: 'rgba(255, 255, 255, 0.7)',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                          textAlign: 'center'
                        }}>
                          Video generating...
                        </div>
                        <button
                          onClick={() => {
                            handleCancelVideo();
                            setShowVideoDropdown(false);
                          }}
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
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 107, 107, 0.15)'}
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

                        {/* Video Settings Footer */}
                        <div style={{
                          padding: '8px 16px 12px 16px',
                          borderTop: '1px solid rgba(0, 0, 0, 0.15)',
                          color: '#000',
                          flexShrink: 0
                        }}>
                          <VideoSettingsFooter
                            videoCount={1}
                            cost={videoCostRaw}
                            costUSD={videoUSD}
                            loading={videoLoading}
                            tokenType={tokenType}
                          />
                        </div>
                        
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

                        {/* Video Settings Footer */}
                        <div style={{
                          padding: '8px 16px 12px 16px',
                          borderTop: '1px solid rgba(0, 0, 0, 0.15)',
                          color: '#000',
                          flexShrink: 0
                        }}>
                          <VideoSettingsFooter
                            videoCount={1}
                            cost={videoCostRaw}
                            costUSD={videoUSD}
                            loading={videoLoading}
                            tokenType={tokenType}
                          />
                        </div>
                        
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

          {/* 3D Camera Angle Button - Only for authenticated users with generated photos */}
          {isAuthenticated && !isPromptSelectorMode && !selectedPhoto.isOriginal && (
            <button
              className="action-button camera-angle-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsCameraAngleBatch(false);
                setShowCameraAnglePopup(true);
              }}
              disabled={selectedPhoto.loading || selectedPhoto.generatingCameraAngle}
            >
              <span>📐</span>
              <span>{selectedPhoto.generatingCameraAngle ? 'Generating...' : 'Angle'}</span>
            </button>
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
              
              {!isContextImageModel(selectedModel) && (
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
                  const isEditModel = selectedModel && isContextImageModel(selectedModel);
                  
                  // Helper to trigger file selection
                  const triggerFileSelection = () => {
                    console.log('PhotoGallery: Copy Image Style button clicked - opening file picker');
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png, image/jpeg, image/jpg';
                    input.onchange = async (e) => {
                      const file = e.target.files?.[0];
                      if (file && onCopyImageStyleSelect) {
                        await onCopyImageStyleSelect(file);
                      }
                    };
                    input.click();
                  };
                  
                  if (isEditModel) {
                    // Edit model selected - proceed with Copy Image Style
                    triggerFileSelection();
                  } else {
                    // Switch to edit model first
                    if (switchToModel) {
                      switchToModel('qwen_image_edit_2511_fp8_lightning');
                      showToast({
                        message: 'Switched to Qwen Image Edit Lightning for Copy Image Style',
                        type: 'info'
                      });
                    }
                    // Then trigger Copy Image Style after a short delay for model switch
                    setTimeout(() => triggerFileSelection(), 100);
                  }
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 5px 15px rgba(236, 72, 153, 0.4)';
                  e.currentTarget.style.background = selectedStyle === 'copyImageStyle' ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)' : 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(236, 72, 153, 0.3)';
                  e.currentTarget.style.background = selectedStyle === 'copyImageStyle' ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)' : 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)';
                }}
                style={{
                  background: selectedStyle === 'copyImageStyle' ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)' : 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)',
                  border: selectedStyle === 'copyImageStyle' ? '3px solid #fce7f3' : '3px solid transparent',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 3px 10px rgba(236, 72, 153, 0.3)',
                  color: 'white',
                  fontSize: '12px',
                  fontFamily: '"Permanent Marker", cursive',
                  fontWeight: '600',
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
                    {/* X button to remove style reference */}
                    {onRemoveStyleReference && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveStyleReference();
                        }}
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-6px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: '#ef4444',
                          border: '2px solid white',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          lineHeight: 1,
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                          transition: 'all 0.2s ease',
                          zIndex: 1
                        }}
                        onMouseOver={(e) => {
                          e.stopPropagation();
                          e.currentTarget.style.background = '#dc2626';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseOut={(e) => {
                          e.stopPropagation();
                          e.currentTarget.style.background = '#ef4444';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title="Remove style reference"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ) : (
                  <span>🎨</span>
                )}
                <span>Copy image style</span>
                {!(selectedModel && isContextImageModel(selectedModel)) && (
                  <span style={{ fontSize: '10px', opacity: 0.8 }}></span>
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
          padding: isPromptSelectorMode ? '4px 32px 120px' : '32px 32px 120px',
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
            (styleDisplayText || '');
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
                  
                  {/* Dark shadow overlay to mask white halo from blurred placeholder */}
                  {/* Shows during loading state for seamless transition to previews */}
                  {/* Reduced transparency by 30% per user feedback (0.3 -> 0.21) */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      boxShadow: 'inset 0 0 30px 15px rgba(0, 0, 0, 0.21)',
                      pointerEvents: 'none',
                      zIndex: 5 // Above placeholder image
                    }}
                  />

                  {/* Hide button, refresh button, and favorite button for loading/error state */}
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
                          <svg width="11" height="11" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'translateY(1px)' }}>
                            <path fill="#ffffff" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                          </svg>
                        </button>
                      )}
                      {/* Favorite heart button - show when not generating/loading */}
                      {!photo.generating && !photo.loading && (
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
                          {isPhotoFavorited(photo) ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path fill="#ffffff" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path fill="none" stroke="#ffffff" strokeWidth="2" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                          )}
                        </button>
                      )}
                      {/* Refresh button - show for failed images or when not generating/loading */}
                      {/* For videos with regenerate params, this will regenerate the video instead */}
                      {/* For angles with regenerate params, this will regenerate the angle instead */}
                      {(photo.error || (!photo.generating && !photo.loading)) && (photo.positivePrompt || photo.stylePrompt || photo.videoRegenerateParams || photo.cameraAngleRegenerateParams) && (
                        <button
                          className="photo-refresh-btn"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            // If photo has video regenerate params, regenerate video instead of image
                            if (photo.videoRegenerateParams && ['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType)) {
                              handleRegenerateVideo(photo, index);
                            } else if (photo.cameraAngleRegenerateParams && photo.cameraAngleSourceUrl) {
                              // If photo has angle regenerate params, regenerate angle
                              handleRegenerateAngle(photo, index);
                            } else {
                              onRefreshPhoto(index);
                            }
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
                            e.currentTarget.style.transform = 'scale(0.8)'
                          }}
                          title={photo.videoRegenerateParams && ['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType)
                            ? "Regenerate this video"
                            : (photo.cameraAngleRegenerateParams && photo.cameraAngleSourceUrl)
                              ? "Regenerate this angle"
                              : "Refresh this image"}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#ffffff" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                          </svg>
                        </button>
                      )}
                      <button
                        className="photo-hide-btn"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          
                          // If photo has a video, remove the video only
                          if (photo.videoUrl) {
                            // Stop video if playing
                            if (playingGeneratedVideoIds.has(photo.id)) {
                              setPlayingGeneratedVideoIds(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(photo.id);
                                return newSet;
                              });
                              // Also clear unmuted state if this was the unmuted video
                              setUnmutedVideoId(prev => prev === photo.id ? null : prev);
                            }
                            // Remove the video from the photo
                            setPhotos(prev => {
                              const updated = [...prev];
                              if (updated[index]) {
                                updated[index] = {
                                  ...updated[index],
                                  videoUrl: undefined,
                                  generatingVideo: false,
                                  videoProgress: undefined,
                                  videoETA: undefined,
                                  videoProjectId: undefined,
                                  videoError: undefined,
                                  videoWorkflowType: undefined,
                                  videoRegenerateParams: undefined,
                                  videoResolution: undefined,
                                  videoFramerate: undefined,
                                  videoDuration: undefined,
                                  videoMotionPrompt: undefined,
                                  videoNegativePrompt: undefined,
                                  videoMotionEmoji: undefined,
                                  videoModelVariant: undefined,
                                  videoWorkerName: undefined,
                                  videoStatus: undefined,
                                  videoElapsed: undefined
                                };
                              }
                              return updated;
                            });
                          } else if (photo.cameraAngleRegenerateParams && photo.cameraAngleSourceUrl) {
                            // Photo has camera angle - restore the original image
                            setPhotos(prev => {
                              const updated = [...prev];
                              if (updated[index]) {
                                const originalUrl = updated[index].cameraAngleSourceUrl;
                                updated[index] = {
                                  ...updated[index],
                                  images: [originalUrl],
                                  cameraAngleRegenerateParams: undefined,
                                  cameraAngleSourceUrl: undefined,
                                  cameraAngleProgress: undefined,
                                  cameraAngleETA: undefined,
                                  cameraAngleElapsed: undefined,
                                  cameraAngleProjectId: undefined,
                                  cameraAngleError: undefined,
                                  cameraAngleWorkerName: undefined,
                                  cameraAngleStatus: undefined
                                };
                              }
                              return updated;
                            });
                          } else {
                            // No video or angle, hide the photo
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
                          }
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
                        title={photo.videoUrl ? "Remove video" : (photo.cameraAngleRegenerateParams && photo.cameraAngleSourceUrl) ? "Remove angle" : "Hide this image"}
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
                      <svg width="10" height="10" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none', transform: 'translateY(1px)' }}>
                        <path fill="#ffffff" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
                          <path fill="#ffffff" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
                          <path fill="none" stroke="#ffffff" strokeWidth="2" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
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
                      ((photo.statusText && photo.statusText !== '#SogniPhotobooth') ? photo.statusText : (loadingLabel || labelText))
                      : photo.isGalleryImage ? labelText : ((photo.statusText && photo.statusText !== '#SogniPhotobooth') ? photo.statusText : (labelText + (getStyleDisplayText(photo) ? ` ${getStyleDisplayText(photo)}` : '')))}
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
              data-is-preview={photo.isPreview ? 'true' : undefined}
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
                {/* PlaceholderImage MUST be first child - same position as Block 1 */}
                {/* This allows React to preserve the DOM element and its animation state */}
                {/* CSS hides it when final image loads via .film-frame.loaded:not([data-is-preview]) .placeholder */}
                <PlaceholderImage placeholderUrl={placeholderUrl} />
                {/* Background for crossfade during 2nd+ preview transitions */}
                {/* Only render when we have a REAL previous preview (not originalDataUrl) */}
                {photo.isPreview && !isSelected && photo.previousPreviewUrl && photo.previousPreviewUrl !== photo.originalDataUrl && (
                  <img
                    src={photo.previousPreviewUrl}
                    alt="Previous preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      opacity: 1,
                      filter: 'blur(5px)',
                      zIndex: 1
                    }}
                  />
                )}
                {/* Dark shadow overlay to mask white halo from blurred previews */}
                {/* Only shows during preview state, not for final images */}
                {/* Reduced transparency by 30% per user feedback (0.3 -> 0.21) */}
                {photo.isPreview && !isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      boxShadow: 'inset 0 0 30px 15px rgba(0, 0, 0, 0.21)',
                      pointerEvents: 'none',
                      zIndex: 5 // Above images (zIndex 1, 2) but below other UI
                    }}
                  />
                )}
                <img 
                  key={`${photo.id}-${photo.isPreview ? 'preview' : 'final'}-${photo.previewUpdateCount || 0}`}
                  className={`${isSelected && photo.enhancing && photo.isPreview ? 'enhancement-preview-selected' : ''}`}
                  data-preview-count={photo.previewUpdateCount || 0}
                  data-is-preview={photo.isPreview ? 'true' : 'false'}
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
                        // Note: Don't clear previousFramedImage during render (causes React #310)
                        // It gets cleared via useEffect when photo selection changes
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
                    
                    const img = e.target;
                    const isPreview = img.dataset.isPreview === 'true';
                    const previewCount = parseInt(img.dataset.previewCount || '0', 10);
                    
                    // For PREVIEW images in THUMBNAILS: fade in with "developing" effect
                    // Skip for selected photos - they show immediately
                    const isSelectedPhoto = img.closest('.film-frame')?.classList.contains('selected');
                    
                    if (isPreview && !isSelectedPhoto) {
                      console.log(`[PREVIEW] Thumbnail loaded, preview #${previewCount}`);
                      
                      // Element starts at opacity 0 from CSS (new element each preview due to key change)
                      // Set blur for preview images
                      img.style.filter = 'blur(5px)';
                      
                      console.log(`[PREVIEW] Starting 2-second fade from 0 to 1`);
                      
                      // Animate opacity from 0 to 1
                      // Use fill: forwards to maintain opacity 1 after animation
                      // No popup issue because this is a NEW element each time (key includes previewUpdateCount)
                      img.animate([
                        { opacity: 0 },
                        { opacity: 1 }
                      ], {
                        duration: 2000,
                        easing: 'ease-in-out',
                        fill: 'forwards'
                      });
                      
                      return; // Don't add fade-in-complete for previews
                    }
                    
                    // For SELECTED preview photos - show immediately without animation
                    if (isPreview && isSelectedPhoto) {
                      console.log(`[PREVIEW] Selected photo preview loaded, showing immediately`);
                      img.style.opacity = '1';
                      img.style.filter = 'blur(5px)';
                      return;
                    }
                    
                    // For NON-PREVIEW images (final images): pop-in effect
                    console.log(`[FINAL] Image loaded, newlyArrived: ${photo.newlyArrived}, isPreview: ${isPreview}`);
                    
                    if (!img.classList.contains('fade-in-complete')) {
                      img.classList.add('fade-in-complete');
                      
                      // For newly arrived photos, use opacity fade (no scale - original behavior)
                      if (photo.newlyArrived) {
                        console.log('[FINAL] Starting fade-in for newly arrived image');
                        // Start almost invisible (0.01 prevents white flash)
                        img.style.opacity = '0.01';
                        img.style.filter = 'none';
                        
                        // Short delay then set to full opacity
                        // This matches the original simple behavior
                        setTimeout(() => {
                          img.style.opacity = '1';
                        }, 10);
                        console.log('[FINAL] Fade-in started');
                      } else {
                        // Set opacity immediately without animation
                        console.log('[FINAL] Setting opacity to 1 immediately (not newly arrived)');
                        img.style.opacity = '1';
                        img.style.filter = 'none';
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
                    // IMPORTANT: Don't set opacity here - let JavaScript control it in onLoad
                    // This prevents React from fighting with our animations
                    // NOTE: Only use absolute positioning for thumbnails (crossfade needs it)
                    // Selected photos must NOT use absolute positioning (CSS sets width/height: auto)
                    const useAbsolutePosition = !isSelected;
                    
                    const baseStyle = {
                      objectFit: 'cover',
                      // Only use absolute positioning for thumbnails, not selected photos
                      ...(useAbsolutePosition ? {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        zIndex: 2, // Above background image (zIndex 1)
                      } : {
                        // For selected photos, ensure z-index is BELOW ::after shadow (z-index: 10)
                        position: 'relative',
                        zIndex: 1
                      }),
                      display: 'block',
                      // For preview images, add blur effect (non-previews get filter:none in onLoad)
                      filter: photo.isPreview ? 'blur(5px)' : undefined,
                      // CRITICAL: Transparent background for previews so background image shows through
                      // during fade-in (CSS sets background:#000 which blocks the crossfade)
                      background: photo.isPreview && useAbsolutePosition ? 'transparent' : undefined,
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
                      const wasPlaying = playingGeneratedVideoIds.has(photo.id);
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
                      // Clear unmuted state if stopping this video
                      if (wasPlaying) {
                        setUnmutedVideoId(prev => prev === photo.id ? null : prev);
                      }
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
                  // S2V/Animate videos can have audio - only one unmuted at a time
                  // Grid mode: mutes after first play to prevent multiple videos playing audio
                  // Slideshow mode: keeps audio playing through all loops
                  // BUT: Mute audio if Segment Review popup is open (for montage modes)
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 4 }}>
                    <video
                      key={`video-${photo.id}-${photo.videoWorkflowType}`}
                      src={photo.videoUrl}
                      autoPlay
                      loop={true}
                      muted={showSegmentReview || !['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType) || unmutedVideoId !== photo.id || (!isSelected && s2vVideosPlayedOnce.has(photo.id))}
                      playsInline
                      onLoadedMetadata={(e) => {
                        // For S2V/Animate videos, try to unmute and play with audio (muting any previous)
                        // UNLESS the Segment Review popup is open
                        if (['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType) && !showSegmentReview) {
                          const videoEl = e.currentTarget;
                          // In slideshow mode (isSelected), always try to play with audio
                          // In grid mode, only unmute if this video hasn't played audio yet
                          if (isSelected || !s2vVideosPlayedOnce.has(photo.id)) {
                            // Set this as the unmuted video (will mute others)
                            setUnmutedVideoId(photo.id);
                            videoEl.muted = false;
                            // Try to play with audio - if it fails, show click-to-play overlay
                            const playPromise = videoEl.play();
                            if (playPromise !== undefined) {
                              playPromise.catch(() => {
                                // Autoplay with audio blocked, show click-to-play overlay
                                setS2vVideosNeedingClick(prev => new Set([...prev, photo.id]));
                                videoEl.muted = true;
                              });
                            }
                          } else {
                            // Already played once in grid mode, start muted
                            videoEl.muted = true;
                          }
                        }
                      }}
                      onTimeUpdate={(e) => {
                        // For S2V/Animate videos, auto-mute when video completes first play                        
                        // We use onTimeUpdate + duration check since loop=true prevents onEnded
                        // BUT: In slideshow mode (isSelected), let audio continue looping
                        if (['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType)) {
                          const videoEl = e.currentTarget;
                          const duration = videoEl.duration;
                          const currentTime = videoEl.currentTime;
                          
                          // If segment review is open, ensure video stays muted
                          if (showSegmentReview && !videoEl.muted) {
                            videoEl.muted = true;
                          }
                          
                          // If we're near the end of the video (within 0.2s) and haven't marked as played once
                          // Skip auto-mute in slideshow mode (isSelected) - let audio continue looping
                          if (!isSelected && duration > 0 && currentTime >= duration - 0.2 && !s2vVideosPlayedOnce.has(photo.id) && unmutedVideoId === photo.id) {
                            // Mark as played once and mute (grid mode only)
                            setS2vVideosPlayedOnce(prev => new Set([...prev, photo.id]));
                            setUnmutedVideoId(null);
                            videoEl.muted = true;
                          }
                        }
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        zIndex: 5,
                        pointerEvents: ['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType) && s2vVideosNeedingClick.has(photo.id) ? 'auto' : 'none'
                      }}
                    />
                    
                    {/* Mute/Unmute button for videos with audio */}
                    {['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType) && !s2vVideosNeedingClick.has(photo.id) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const videoEl = e.currentTarget.parentElement.querySelector('video');
                          if (unmutedVideoId === photo.id) {
                            // Mute this video
                            setUnmutedVideoId(null);
                            if (videoEl) videoEl.muted = true;
                          } else {
                            // Unmute this video (mutes others via state)
                            // Remove from played-once set so it can auto-mute again after next play
                            setS2vVideosPlayedOnce(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(photo.id);
                              return newSet;
                            });
                            setUnmutedVideoId(photo.id);
                            if (videoEl) {
                              videoEl.muted = false;
                              videoEl.play().catch(() => {});
                            }
                          }
                        }}
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '44px', // Positioned next to play button with minimal gap
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(0, 0, 0, 0.6)',
                          color: 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 7,
                          transition: 'all 0.2s ease',
                          backdropFilter: 'blur(4px)'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(236, 72, 153, 0.8)';
                          e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                        title={unmutedVideoId === photo.id ? 'Mute' : 'Unmute'}
                      >
                        <svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24">
                          {unmutedVideoId === photo.id ? (
                            // Speaker with sound waves (unmuted)
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                          ) : (
                            // Speaker with X (muted)
                            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                          )}
                        </svg>
                      </button>
                    )}
                    
                    {/* Click-to-play overlay for S2V/Animate videos when audio autoplay is blocked */}
                    {['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType) && s2vVideosNeedingClick.has(photo.id) && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          const videoEl = e.currentTarget.parentElement.querySelector('video');
                          if (videoEl) {
                            // Set this as the unmuted video (mutes others)
                            // Remove from played-once set so it can auto-mute again after this play
                            setS2vVideosPlayedOnce(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(photo.id);
                              return newSet;
                            });
                            setUnmutedVideoId(photo.id);
                            videoEl.muted = false;
                            videoEl.play().then(() => {
                              setS2vVideosNeedingClick(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(photo.id);
                                return newSet;
                              });
                            }).catch(() => {
                              console.log('Failed to play S2V video with audio');
                            });
                          }
                        }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(0, 0, 0, 0.6)',
                          backdropFilter: 'blur(4px)',
                          zIndex: 6,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '20px',
                          borderRadius: '16px',
                          background: 'rgba(236, 72, 153, 0.9)',
                          boxShadow: '0 8px 32px rgba(236, 72, 153, 0.4)',
                          animation: 'pulse 2s ease-in-out infinite'
                        }}>
                          <div style={{
                            fontSize: '48px',
                            lineHeight: 1
                          }}>
                            🔊
                          </div>
                          <div style={{
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: '700',
                            textAlign: 'center',
                            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                          }}>
                            Click to Play with Audio
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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

                {/* Camera Angle generation progress overlay - matches CameraAngleReviewPopup style */}
                {photo.generatingCameraAngle && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(0, 0, 0, 0.6)',
                      backdropFilter: 'blur(4px)',
                      zIndex: 5
                    }}
                  >
                    {/* Progress Ring */}
                    <svg width="56" height="56" viewBox="0 0 56 56">
                      <circle
                        cx="28"
                        cy="28"
                        r="24"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.1)"
                        strokeWidth="3"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r="24"
                        fill="none"
                        stroke="#FDFF00"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${(photo.cameraAngleProgress || 0) * 1.51} 151`}
                        transform="rotate(-90 28 28)"
                        style={{ transition: 'stroke-dasharray 0.3s ease' }}
                      />
                    </svg>

                    {/* Percentage */}
                    <div style={{
                      marginTop: '8px',
                      fontSize: '14px',
                      fontWeight: '700',
                      color: '#fff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.5)'
                    }}>
                      {photo.cameraAngleProgress !== undefined && photo.cameraAngleProgress > 0 ? (
                        `${photo.cameraAngleProgress}%`
                      ) : photo.cameraAngleStatus?.startsWith('Queue') || photo.cameraAngleStatus?.startsWith('Next') ? (
                        'In queue...'
                      ) : (
                        photo.cameraAngleStatus || 'Starting...'
                      )}
                    </div>

                    {/* ETA */}
                    {photo.cameraAngleETA !== undefined && photo.cameraAngleETA > 0 && (
                      <div style={{
                        fontSize: '11px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginTop: '2px'
                      }}>
                        ~{photo.cameraAngleETA < 60
                          ? `${Math.ceil(photo.cameraAngleETA)}s`
                          : `${Math.floor(photo.cameraAngleETA / 60)}:${Math.ceil(photo.cameraAngleETA % 60).toString().padStart(2, '0')}`
                        } left
                      </div>
                    )}

                    {/* Worker name */}
                    {photo.cameraAngleWorkerName && (
                      <div style={{
                        fontSize: '9px',
                        color: 'rgba(255, 255, 255, 0.4)',
                        marginTop: '4px',
                        maxWidth: '90%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'center'
                      }}>
                        {photo.cameraAngleWorkerName}
                      </div>
                    )}
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
                    ref={photo.promptKey === 'anime1990s' ? animeVideoRef : null}
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
                    muted={false}
                    playsInline
                    preload="metadata"
                    onEnded={() => {
                      if (photo.promptKey === 'anime1990s') {
                        const animeVideos = [
                          `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw.mp4`,
                          `${urls.assetUrl}/videos/sogni-photobooth-anime1990s-raw2.mp4`
                        ];
                        const nextIndex = (currentVideoIndex + 1) % animeVideos.length;
                        // Just update state - useEffect will handle the src change seamlessly
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
                        <svg width="11" height="11" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ transform: 'translateY(1px)' }}>
                          <path fill="#ffffff" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                        </svg>
                      </button>
                    )}
                    {/* Favorite heart button - always show for batch-generated images */}
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
                      {isPhotoFavorited(photo) ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path fill="#ffffff" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path fill="none" stroke="#ffffff" strokeWidth="2" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      )}
                    </button>
                    {/* Motion video button - show for batch-generated images, hide during video generation */}
                    {!photo.generatingVideo && (photo.positivePrompt || photo.stylePrompt) && (
                      <button
                        className="photo-motion-btn-batch"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
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
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 999,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                          opacity: '0',
                          transform: 'scale(0.8)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = 'rgba(139, 92, 246, 0.9)';
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.opacity = '1';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
                          e.currentTarget.style.transform = 'scale(0.8)';
                          e.currentTarget.style.opacity = '0';
                        }}
                        title="Generate motion video"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path fill="#ffffff" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                        </svg>
                      </button>
                    )}
                    {/* Refresh button - only show if photo has a prompt or video regenerate params */}
                    {/* For videos with regenerate params, this will regenerate the video instead */}
                    {(photo.positivePrompt || photo.stylePrompt || photo.videoRegenerateParams) && (
                      <button
                        className="photo-refresh-btn"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          // If photo has video regenerate params, regenerate video instead of image
                          if (photo.videoRegenerateParams && ['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType)) {
                            handleRegenerateVideo(photo, index);
                          } else {
                            onRefreshPhoto(index);
                          }
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
                        title={photo.videoRegenerateParams && ['s2v', 'animate-move', 'animate-replace'].includes(photo.videoWorkflowType) 
                          ? "Regenerate this video" 
                          : "Refresh this image"}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path fill="#ffffff" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                        </svg>
                      </button>
                    )}
                    <button
                      className="photo-hide-btn"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        
                        // If photo has a video, remove the video only
                        if (photo.videoUrl) {
                          // Stop video if playing
                          if (playingGeneratedVideoIds.has(photo.id)) {
                            setPlayingGeneratedVideoIds(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(photo.id);
                              return newSet;
                            });
                            // Also clear unmuted state if this was the unmuted video
                            setUnmutedVideoId(prev => prev === photo.id ? null : prev);
                          }
                          // Remove the video from the photo
                          setPhotos(prev => {
                            const updated = [...prev];
                            if (updated[index]) {
                              updated[index] = {
                                ...updated[index],
                                videoUrl: undefined,
                                generatingVideo: false,
                                videoProgress: undefined,
                                videoETA: undefined,
                                videoProjectId: undefined,
                                videoError: undefined,
                                videoWorkflowType: undefined,
                                videoRegenerateParams: undefined,
                                videoResolution: undefined,
                                videoFramerate: undefined,
                                videoDuration: undefined,
                                videoMotionPrompt: undefined,
                                videoNegativePrompt: undefined,
                                videoMotionEmoji: undefined,
                                videoModelVariant: undefined,
                                videoWorkerName: undefined,
                                videoStatus: undefined,
                                videoElapsed: undefined
                              };
                            }
                            return updated;
                          });
                        } else {
                          // No video, hide the photo
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
                        }
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
                      title={playingGeneratedVideoIds.has(photo.id) ? "Stop video" : "Hide this image"}
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
                    // On touch devices, always show icons; on desktop, show on hover or when video playing or favorited
                    opacity: (('ontouchstart' in window || navigator.maxTouchPoints > 0) || (activeVideoPhotoId === (photo.id || photo.promptKey)) || (isPhotoFavorited(photo) && !isMobile()) || isTouchHovered) ? '1' : '0',
                    transition: 'opacity 0.2s ease',
                    pointerEvents: 'all'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
                    const isPlaying = activeVideoPhotoId === (photo.id || photo.promptKey);
                    // On touch devices, keep icons visible; on desktop, hide unless video playing or favorited
                    e.currentTarget.style.opacity = (isTouchDevice || isPlaying || (isPhotoFavorited(photo) && !isMobile()) || isTouchHovered) ? '1' : '0';
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
                        <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
                          <path fill="#ffffff" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
                          <path fill="none" stroke="#ffffff" strokeWidth="2" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
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
                        <svg width="10" height="10" viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
                          {(activeVideoPhotoId === (photo.id || photo.promptKey)) ? (
                            <path fill="#ffffff" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                          ) : (
                            <path fill="#ffffff" d="M8 5v14l11-7z"/>
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
                      <svg width="10" height="10" viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
                        <path fill="#ffffff" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
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
                        <svg width="10" height="10" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none', transform: 'translateY(1px)' }}>
                          <path fill="#ffffff" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* No special label for selected view - use standard grid label below */}
              <div className="photo-label">
                {photo.loading || photo.generating ? 
                  ((photo.statusText && photo.statusText !== '#SogniPhotobooth') ? photo.statusText : labelText)
                  : photo.isGalleryImage ? labelText : ((photo.statusText && photo.statusText !== '#SogniPhotobooth') ? photo.statusText : labelText)}
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

      {/* Custom Prompt Modal for Context Image Edit Enhancement */}
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

      {/* Save to Local Project Popup */}
      <SaveToLocalProjectPopup
        isOpen={showSaveToLocalProjectPopup}
        onClose={() => setShowSaveToLocalProjectPopup(false)}
        onSave={handleSaveToLocalProject}
        defaultName={defaultLocalProjectName}
        imageCount={completedPhotosCount}
        isSaving={isSavingToLocalProject}
      />

      {/* Stitch Options Popup - Choose between Simple Stitch and Infinite Loop */}
      <StitchOptionsPopup
        visible={showStitchOptionsPopup}
        onClose={() => {
          if (!isGeneratingInfiniteLoop) {
            setShowStitchOptionsPopup(false);
            setInfiniteLoopProgress(null);
          }
        }}
        onSimpleStitch={() => {
          setShowStitchOptionsPopup(false);
          handleStitchAllVideos();
        }}
        onInfiniteLoop={() => {
          handleInfiniteLoopStitch();
        }}
        onEditTransitionPrompt={() => {
          // Show dedicated transition prompt editor popup
          setShowTransitionPromptPopup(true);
        }}
        onDownloadCached={() => {
          setShowStitchOptionsPopup(false);
          setShowInfiniteLoopPreview(true);
        }}
        onCancel={async () => {
          // Set cancellation flag to stop any ongoing async operations
          infiniteLoopCancelledRef.current = true;
          
          // Cancel all active video generation projects (transition videos)
          console.log('[Infinite Loop] User cancelled generation - cancelling all active video projects');
          
          try {
            // Cancel all active video projects (includes transition videos)
            const result = await cancelAllActiveVideoProjects(setPhotos);
            
            console.log(`[Infinite Loop] Cancelled ${result.cancelled} projects, ${result.failed} failed`);
            
            // Reset state
            setIsGeneratingInfiniteLoop(false);
            setInfiniteLoopProgress(null);
            setShowStitchOptionsPopup(false);
            
            showToast({
              title: 'Generation Cancelled',
              message: result.cancelled > 0 
                ? `Cancelled ${result.cancelled} transition video${result.cancelled !== 1 ? 's' : ''}. You will be refunded for incomplete work.`
                : 'Infinite loop generation was cancelled.',
              type: 'info',
              timeout: 4000
            });
          } catch (error) {
            console.error('[Infinite Loop] Error cancelling projects:', error);
            
            // Still reset state even if cancellation failed
            setIsGeneratingInfiniteLoop(false);
            setInfiniteLoopProgress(null);
            setShowStitchOptionsPopup(false);
            
            showToast({
              title: 'Cancellation Error',
              message: 'There was an error cancelling the generation. Some videos may still complete.',
              type: 'warning',
              timeout: 4000
            });
          }
        }}
        videoCount={(() => {
          const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
          return currentPhotosArray.filter(
            photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
          ).length;
        })()}
        isGenerating={isGeneratingInfiniteLoop}
        generationProgress={infiniteLoopProgress}
        hasCachedVideo={!!cachedInfiniteLoopBlob}
        costLoading={infiniteLoopCostLoading}
        costRaw={infiniteLoopCostRaw}
        costUSD={infiniteLoopUSD}
        videoResolution={settings.videoResolution || '480p'}
        videoDuration={settings.videoDuration || 5}
        tokenType={tokenType}
      />

      {/* Infinite Loop Review Popup - Review and regenerate individual transitions before stitching */}
      <VideoReviewPopup
        visible={showTransitionReview}
        onClose={handleCloseTransitionReview}
        onStitchAll={handleStitchAfterReview}
        onRegenerateItem={handleRegenerateTransition}
        onCancelGeneration={handleCancelInfiniteLoopGeneration}
        onCancelItem={handleCancelTransitionItem}
        items={pendingTransitions?.map(t => ({
          ...t,
          fromIndex: t.fromVideoIndex,
          toIndex: t.toVideoIndex
        })) || []}
        workflowType="infinite-loop"
        regeneratingIndices={regeneratingTransitionIndices}
        regenerationProgresses={transitionRegenerationProgresses}
        itemETAs={infiniteLoopProgress?.transitionETAs || []}
        itemProgress={infiniteLoopProgress?.transitionProgress || []}
        itemWorkers={infiniteLoopProgress?.transitionWorkers || []}
        itemStatuses={infiniteLoopProgress?.transitionStatuses || []}
        itemElapsed={infiniteLoopProgress?.transitionElapsed || []}
      />

      {/* Segment Review Popup - Review and regenerate montage segments (S2V, Animate Move/Replace, Batch Transition) */}
      <VideoReviewPopup
        visible={showSegmentReview}
        onClose={handleCloseSegmentReview}
        onStitchAll={handleStitchAfterSegmentReview}
        onRegenerateItem={handleRegenerateSegment}
        onCancelGeneration={handleCancelSegmentGeneration}
        onCancelItem={handleCancelSegmentItem}
        onPlayItem={handlePlaySegment}
        items={pendingSegments}
        itemPrompts={(pendingSegments || []).map(segment => {
          const photo = photos.find(p => p.id === segment.photoId);
          return {
            positivePrompt: photo?.videoMotionPrompt || '',
            negativePrompt: photo?.videoNegativePrompt || ''
          };
        })}
        workflowType={segmentReviewData?.workflowType || 's2v'}
        regeneratingIndices={regeneratingSegmentIndices}
        regenerationProgresses={segmentRegenerationProgresses}
        itemETAs={segmentProgress?.itemETAs || []}
        itemProgress={segmentProgress?.itemProgress || []}
        itemWorkers={segmentProgress?.itemWorkers || []}
        itemStatuses={segmentProgress?.itemStatuses || []}
        itemElapsed={segmentProgress?.itemElapsed || []}
        itemVersionHistories={segmentVersionHistories}
        selectedVersions={selectedSegmentVersions}
        onVersionChange={handleSegmentVersionChange}
      />

      {/* Transition Prompt Editor Popup - Edit transition prompt before generating */}
      {showTransitionPromptPopup && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)', // Lighter backdrop to see underlying popup
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000001, // Higher than StitchOptionsPopup (10000000)
            padding: '20px',
            backdropFilter: 'blur(4px)' // Less blur to see underlying popup
          }}
          onClick={() => setShowTransitionPromptPopup(false)}
        >
          <div
            style={{
              backgroundColor: '#ffeb3b',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
              animation: 'popupFadeIn 0.25s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{
                margin: 0,
                color: '#000',
                fontSize: '20px',
                fontWeight: '700',
                fontFamily: '"Permanent Marker", cursive',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                ✨ Transition Prompt
              </h3>
              <button
                onClick={() => setShowTransitionPromptPopup(false)}
                style={{
                  background: 'rgba(0, 0, 0, 0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#000',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)';
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{
              padding: '20px',
              backgroundColor: 'rgba(0, 0, 0, 0.03)'
            }}>
              <div style={{
                marginBottom: '16px'
              }}>
                <p style={{
                  margin: '0 0 12px 0',
                  color: 'rgba(0, 0, 0, 0.7)',
                  fontSize: '13px',
                  lineHeight: '1.5'
                }}>
                  Describe how you want the AI to transition between your videos. This prompt will be used to generate smooth transitions for the Infinite Loop stitch.
                </p>
              </div>

              <textarea
                value={settings.videoTransitionPrompt ?? DEFAULT_SETTINGS.videoTransitionPrompt ?? ''}
                onChange={(e) => updateSetting('videoTransitionPrompt', e.target.value)}
                placeholder="Describe how images should transition..."
                rows={5}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '2px solid rgba(0, 0, 0, 0.15)',
                  borderRadius: '10px',
                  color: '#000',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  minHeight: '120px',
                  maxHeight: '250px',
                  boxSizing: 'border-box',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  transition: 'border-color 0.2s ease'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(147, 51, 234, 0.5)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(0, 0, 0, 0.15)';
                }}
              />
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(0, 0, 0, 0.1)',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  // Reset to default
                  updateSetting('videoTransitionPrompt', DEFAULT_SETTINGS.videoTransitionPrompt);
                }}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(0, 0, 0, 0.1)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#000',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.15)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)';
                }}
              >
                Reset to Default
              </button>
              <button
                onClick={() => setShowTransitionPromptPopup(false)}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #9333ea 0%, #7c3aed 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '700',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(147, 51, 234, 0.3)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(147, 51, 234, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(147, 51, 234, 0.3)';
                }}
              >
                ✓ Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Infinite Loop Video Preview - Fullscreen playback after generation */}
      {showInfiniteLoopPreview && cachedInfiniteLoopBlob && cachedInfiniteLoopUrl && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000001,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowInfiniteLoopPreview(false);
            }
          }}
        >
          {/* Close Button */}
          <button
            onClick={() => setShowInfiniteLoopPreview(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease'
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

          {/* Video Player */}
          <div style={{
            position: 'relative',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'hidden'
          }}>
            <video
              ref={infiniteLoopVideoRef}
              src={cachedInfiniteLoopUrl}
              autoPlay
              loop
              playsInline
              controls
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                display: 'block',
                objectFit: 'contain'
              }}
            />

            {/* Action Icons - Bottom right overlay */}
            <div style={{
              position: 'absolute',
              bottom: '60px',
              right: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 10
            }}>
              {/* Download Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const timestamp = new Date().toISOString().split('T')[0];
                  const filename = `sogni-infinite-loop-${timestamp}.mp4`;
                  const blobUrl = URL.createObjectURL(cachedInfiniteLoopBlob);
                  downloadVideo(blobUrl, filename).catch(() => {
                    showToast({
                      title: 'Download Failed',
                      message: 'Failed to download video. Please try again.',
                      type: 'error'
                    });
                  });
                }}
                title="Download"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(76, 175, 80, 0.9)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
              </button>

              {/* Share Button (if supported) */}
              {navigator.share && navigator.canShare && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const timestamp = new Date().toISOString().split('T')[0];
                      const filename = `sogni-infinite-loop-${timestamp}.mp4`;
                      const file = new File([cachedInfiniteLoopBlob], filename, { type: 'video/mp4' });
                      if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                          files: [file],
                          title: 'Sogni Infinite Loop',
                          text: 'Check out this seamless video loop!'
                        });
                      }
                    } catch (err) {
                      if (err.name !== 'AbortError') {
                        console.log('Share failed:', err);
                      }
                    }
                  }}
                  title="Share"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(33, 150, 243, 0.9)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                  </svg>
                </button>
              )}

              {/* Remix Button - opens transition review to regenerate individual transitions */}
              {pendingTransitions.length > 0 && transitionReviewData && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInfiniteLoopPreview(false);
                    setShowTransitionReview(true);
                  }}
                  title="Remix - Regenerate transitions"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(147, 51, 234, 0.9)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>
                  </svg>
                </button>
              )}

            </div>
          </div>
        </div>,
        document.body
      )}

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
            setShowTransitionMusicGenerator(false);
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

                {/* Preset Music Selection — collapsible track browser */}
                <audio
                  ref={trackPreviewAudioRef}
                  onEnded={() => { setTrackPreviewingId(null); setIsTrackPreviewPlaying(false); }}
                  onError={() => { setTrackPreviewingId(null); setIsTrackPreviewPlaying(false); }}
                  style={{ display: 'none' }}
                />

                {/* Toggle button — shows selected track or "Browse Tracks" */}
                <button
                  onClick={() => {
                    if (showTrackBrowser) {
                      stopTransitionTrackPreview();
                    }
                    setShowTrackBrowser(!showTrackBrowser);
                    setTrackSearchQuery('');
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
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: showTrackBrowser ? '0' : '6px',
                    borderBottomLeftRadius: showTrackBrowser ? '0' : '6px',
                    borderBottomRightRadius: showTrackBrowser ? '0' : '6px'
                  }}
                >
                  <span>
                    {isLoadingPreset
                      ? '⏳ Loading...'
                      : selectedPresetId
                        ? `${TRANSITION_MUSIC_PRESETS.find(p => p.id === selectedPresetId)?.emoji || '🎵'} ${TRANSITION_MUSIC_PRESETS.find(p => p.id === selectedPresetId)?.title || 'Selected'}`
                        : '🎵 Browse Preset Tracks...'}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    transition: 'transform 0.2s ease',
                    transform: showTrackBrowser ? 'rotate(180deg)' : 'rotate(0deg)'
                  }}>▼</span>
                </button>

                {/* Expandable track browser */}
                {showTrackBrowser && (
                  <div style={{
                    border: '1px solid rgba(0, 0, 0, 0.15)',
                    borderTop: 'none',
                    borderBottomLeftRadius: '6px',
                    borderBottomRightRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    marginBottom: '6px',
                    overflow: 'hidden'
                  }}>
                    {/* Search input */}
                    <div style={{ padding: '8px 8px 4px' }}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={trackSearchQuery}
                          onChange={(e) => setTrackSearchQuery(e.target.value)}
                          placeholder="Search tracks..."
                          style={{
                            width: '100%',
                            padding: '7px 30px 7px 10px',
                            borderRadius: '5px',
                            border: '1px solid rgba(0, 0, 0, 0.15)',
                            background: 'rgba(0, 0, 0, 0.04)',
                            color: '#000',
                            fontSize: '12px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                        {trackSearchQuery && (
                          <button
                            onClick={() => setTrackSearchQuery('')}
                            style={{
                              position: 'absolute',
                              right: '6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              border: 'none',
                              background: 'rgba(0, 0, 0, 0.12)',
                              color: '#333',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              lineHeight: 1
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable track list */}
                    <div style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      overscrollBehavior: 'contain'
                    }}>
                      {TRANSITION_MUSIC_PRESETS
                        .filter(track => track.title.toLowerCase().includes(trackSearchQuery.toLowerCase()))
                        .map((track) => {
                          const isSelected = selectedPresetId === track.id;
                          const isPreviewing = trackPreviewingId === track.id;
                          return (
                            <div
                              key={track.id}
                              onClick={() => {
                                stopTransitionTrackPreview();
                                handlePresetSelect(track);
                                setShowTrackBrowser(false);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 10px',
                                minHeight: '40px',
                                cursor: 'pointer',
                                background: isSelected ? 'rgba(76, 175, 80, 0.15)' : 'transparent',
                                borderLeft: isSelected ? '3px solid #c62828' : '3px solid transparent',
                                transition: 'background 0.15s ease',
                                boxSizing: 'border-box'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              {/* Play/Pause button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransitionPreviewToggle(track);
                                }}
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  border: 'none',
                                  background: isPreviewing && isTrackPreviewPlaying
                                    ? '#c62828'
                                    : 'rgba(0, 0, 0, 0.08)',
                                  color: isPreviewing && isTrackPreviewPlaying ? 'white' : '#333',
                                  fontSize: '11px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  transition: 'background 0.15s ease',
                                  padding: 0
                                }}
                              >
                                {isPreviewing && isTrackPreviewPlaying ? '⏸' : '▶'}
                              </button>

                              {/* Emoji */}
                              <span style={{ fontSize: '16px', flexShrink: 0 }}>{track.emoji}</span>

                              {/* Title */}
                              <span style={{
                                flex: 1,
                                color: '#000',
                                fontSize: '12px',
                                fontWeight: isSelected ? '600' : '500',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {track.title}
                              </span>

                              {/* Duration */}
                              <span style={{
                                color: 'rgba(0, 0, 0, 0.4)',
                                fontSize: '11px',
                                flexShrink: 0,
                                fontVariantNumeric: 'tabular-nums'
                              }}>
                                {track.duration}
                              </span>
                            </div>
                          );
                        })
                      }
                      {TRANSITION_MUSIC_PRESETS.filter(track =>
                        track.title.toLowerCase().includes(trackSearchQuery.toLowerCase())
                      ).length === 0 && (
                        <div style={{
                          padding: '16px',
                          textAlign: 'center',
                          color: 'rgba(0, 0, 0, 0.4)',
                          fontSize: '12px'
                        }}>
                          No tracks match &ldquo;{trackSearchQuery}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                    stopTransitionTrackPreview();
                    setShowTrackBrowser(false);
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
                  {musicFile && !selectedPresetId && !musicFile?.isGenerated ? `✅ ${musicFile.name}` : '📁 Upload MP3/M4A'}
                </button>

                {/* AI Music Generation (authenticated users only) */}
                {isAuthenticated && (
                  <>
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

                    <button
                      onClick={() => setShowTransitionMusicGenerator(true)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        backgroundColor: musicFile?.isGenerated ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 255, 255, 0.95)',
                        border: musicFile?.isGenerated ? '2px solid rgba(76, 175, 80, 0.6)' : '1px dashed rgba(0, 0, 0, 0.35)',
                        borderRadius: '6px',
                        color: '#000',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        textAlign: 'center'
                      }}
                    >
                      {musicFile?.isGenerated ? '✅ AI Generated Track' : '✨ Create AI Music'}
                    </button>
                  </>
                )}

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
                        Start: {Math.floor(musicStartOffset / 60)}:{(musicStartOffset % 60).toFixed(1).padStart(4, '0')} • Duration: {(loadedPhotosCount * (settings.videoDuration || 5)).toFixed(1)}s
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
              {/* Video Settings Footer */}
              <VideoSettingsFooter
                videoCount={loadedPhotosCount}
                cost={transitionVideoCostRaw}
                costUSD={transitionVideoUSD}
                loading={transitionVideoLoading}
                tokenType={tokenType}
                style={{ marginTop: '12px' }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* AI Music Generator for Transition Video */}
      <MusicGeneratorModal
        visible={showTransitionMusicGenerator}
        onClose={() => setShowTransitionMusicGenerator(false)}
        onTrackSelect={handleTransitionGeneratedTrackSelect}
        sogniClient={sogniClient}
        isAuthenticated={isAuthenticated}
        tokenType={tokenType}
        zIndex={10000001}
      />


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
              onClick={() => { 
                setShowVideoDropdown(false); 
                setSelectedMotionCategory(null); 
                setVideoTargetPhotoIndex(null);
                if (!isVideoSelectionBatch) {
                  setShowVideoSelectionPopup(true);
                }
              }}
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
              onClick={() => { 
                setShowBatchVideoDropdown(false); 
                setSelectedBatchMotionCategory(null);
                if (isVideoSelectionBatch) {
                  setShowVideoSelectionPopup(true);
                }
              }}
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

          {/* Video Settings Footer */}
          <div style={{
            padding: '8px 16px 12px 16px',
            borderTop: '1px solid rgba(0, 0, 0, 0.15)',
            color: '#000',
            flexShrink: 0
          }}>
            <VideoSettingsFooter
              videoCount={loadedPhotosCount}
              cost={batchVideoCostRaw}
              costUSD={batchVideoUSD}
              loading={batchVideoLoading}
              tokenType={tokenType}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Video Selection Popup */}
      <VideoSelectionPopup
        visible={showVideoSelectionPopup}
        onSelectVideoType={handleVideoTypeSelection}
        onClose={() => setShowVideoSelectionPopup(false)}
        isBatch={isVideoSelectionBatch}
        photoCount={loadedPhotosCount}
      />

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

      {/* Bald for Base Confirmation Popup (Single) */}
      <BaldForBaseConfirmationPopup
        visible={showBaldForBasePopup}
        onConfirm={handleBaldForBaseVideoExecute}
        onClose={() => {
          setShowBaldForBasePopup(false);
          if (!isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={baldForBaseLoading}
        costRaw={baldForBaseCostRaw}
        costUSD={baldForBaseUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={false}
        itemCount={1}
      />

      {/* Bald for Base Confirmation Popup (Batch) */}
      <BaldForBaseConfirmationPopup
        visible={showBatchBaldForBasePopup}
        onConfirm={handleBatchBaldForBaseVideoExecute}
        onClose={() => {
          setShowBatchBaldForBasePopup(false);
          if (isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={batchBaldForBaseLoading}
        costRaw={batchBaldForBaseCostRaw}
        costUSD={batchBaldForBaseUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={true}
        itemCount={Math.max(loadedPhotosCount, 1)}
      />

      {/* Prompt Video Confirmation Popup (Single) */}
      <PromptVideoConfirmationPopup
        visible={showPromptVideoPopup}
        onConfirm={handlePromptVideoExecute}
        onClose={() => {
          setShowPromptVideoPopup(false);
          if (!isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
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
        onClose={() => {
          setShowBatchPromptVideoPopup(false);
          if (isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={batchPromptVideoLoading}
        costRaw={batchPromptVideoCostRaw}
        costUSD={batchPromptVideoUSD}
        videoResolution={settings.videoResolution || '480p'}
        videoDuration={settings.videoDuration || 5}
        tokenType={tokenType}
        isBatch={true}
        itemCount={loadedPhotosCount}
      />

      {/* Animate Move Popup (Single) */}
      <AnimateMovePopup
        visible={showAnimateMovePopup}
        onConfirm={handleAnimateMoveExecute}
        onClose={() => {
          setShowAnimateMovePopup(false);
          if (!isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={animateMoveLoading}
        costRaw={animateMoveCostRaw}
        costUSD={animateMoveUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={false}
        itemCount={1}
        modelVariant={animateMoveModelVariant}
        onModelVariantChange={setAnimateMoveModelVariant}
        videoDuration={animateMoveDuration}
        onDurationChange={setAnimateMoveDuration}
      />

      {/* Animate Move Popup (Batch) */}
      <AnimateMovePopup
        visible={showBatchAnimateMovePopup}
        onConfirm={handleBatchAnimateMoveExecute}
        onClose={() => {
          setShowBatchAnimateMovePopup(false);
          if (isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={batchAnimateMoveLoading}
        costRaw={batchAnimateMoveCostRaw}
        costUSD={batchAnimateMoveUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={true}
        itemCount={loadedPhotosCount}
        modelVariant={animateMoveModelVariant}
        onModelVariantChange={setAnimateMoveModelVariant}
        videoDuration={animateMoveDuration}
        onDurationChange={setAnimateMoveDuration}
      />

      {/* Animate Replace Popup (Single) */}
      <AnimateReplacePopup
        visible={showAnimateReplacePopup}
        onConfirm={handleAnimateReplaceExecute}
        onClose={() => {
          setShowAnimateReplacePopup(false);
          if (!isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={animateReplaceLoading}
        costRaw={animateReplaceCostRaw}
        costUSD={animateReplaceUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={false}
        itemCount={1}
        modelVariant={animateReplaceModelVariant}
        onModelVariantChange={setAnimateReplaceModelVariant}
        videoDuration={animateReplaceDuration}
        onDurationChange={setAnimateReplaceDuration}
      />

      {/* Animate Replace Popup (Batch) */}
      <AnimateReplacePopup
        visible={showBatchAnimateReplacePopup}
        onConfirm={handleBatchAnimateReplaceExecute}
        onClose={() => {
          setShowBatchAnimateReplacePopup(false);
          if (isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={batchAnimateReplaceLoading}
        costRaw={batchAnimateReplaceCostRaw}
        costUSD={batchAnimateReplaceUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={true}
        itemCount={loadedPhotosCount}
        modelVariant={animateReplaceModelVariant}
        onModelVariantChange={setAnimateReplaceModelVariant}
        videoDuration={animateReplaceDuration}
        onDurationChange={setAnimateReplaceDuration}
      />

      {/* Sound to Video Popup (Single) */}
      <SoundToVideoPopup
        visible={showS2VPopup}
        onConfirm={handleS2VExecute}
        onClose={() => {
          setShowS2VPopup(false);
          if (!isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={s2vLoading}
        costRaw={s2vCostRaw}
        costUSD={s2vUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={false}
        itemCount={1}
        modelVariant={s2vModelVariant}
        onModelVariantChange={setS2vModelVariant}
        videoDuration={s2vDuration}
        onDurationChange={setS2vDuration}
        sogniClient={sogniClient}
        isAuthenticated={isAuthenticated}
      />

      {/* Sound to Video Popup (Batch) */}
      <SoundToVideoPopup
        visible={showBatchS2VPopup}
        onConfirm={handleBatchS2VExecute}
        onClose={() => {
          setShowBatchS2VPopup(false);
          if (isVideoSelectionBatch) {
            setShowVideoSelectionPopup(true);
          }
        }}
        loading={batchS2VLoading}
        costRaw={batchS2VCostRaw}
        costUSD={batchS2VUSD}
        videoResolution={settings.videoResolution || '480p'}
        tokenType={tokenType}
        isBatch={true}
        itemCount={loadedPhotosCount}
        modelVariant={s2vModelVariant}
        onModelVariantChange={setS2vModelVariant}
        videoDuration={s2vDuration}
        onDurationChange={setS2vDuration}
        sogniClient={sogniClient}
        isAuthenticated={isAuthenticated}
      />

      {/* Camera Angle Popup (Single) - with multi-angle support */}
      <CameraAnglePopup
        visible={showCameraAnglePopup && !isCameraAngleBatch}
        onClose={() => setShowCameraAnglePopup(false)}
        onConfirm={handleCameraAngleGenerate}
        onMultiAngleConfirm={handleMultiAngleConfirm}
        isBatch={false}
        itemCount={1}
        tokenType={tokenType}
        imageWidth={desiredWidth || 1024}
        imageHeight={desiredHeight || 1024}
        sourcePhotoUrl={selectedPhoto?.enhancedImageUrl || selectedPhoto?.images?.[selectedSubIndex || 0] || selectedPhoto?.originalDataUrl}
      />

      {/* Camera Angle Popup (Batch) */}
      <CameraAnglePopup
        visible={showCameraAnglePopup && isCameraAngleBatch}
        onClose={() => setShowCameraAnglePopup(false)}
        onConfirm={handleBatchCameraAngleGenerate}
        onMultiAngleConfirm={handleBatchPerImageAngleGenerate}
        isBatch={true}
        itemCount={loadedPhotosCount}
        tokenType={tokenType}
        imageWidth={desiredWidth || 1024}
        imageHeight={desiredHeight || 1024}
        sourcePhotoUrls={loadedPhotoUrls}
      />

      {/* Multi-Angle Review Popup */}
      <CameraAngleReviewPopup
        visible={showMultiAngleReview}
        items={multiAngleItems}
        sourcePhoto={multiAngleSourcePhoto || { id: '', images: [] }}
        keepOriginal={multiAngleKeepOriginal}
        onClose={() => {
          if (multiAngleItems.some(item => item.status === 'generating')) {
            handleMultiAngleCancelGeneration();
          }
          setShowMultiAngleReview(false);
        }}
        onRegenerateItem={handleMultiAngleRegenerate}
        onApply={handleMultiAngleApply}
        onVersionChange={handleMultiAngleVersionChange}
        onCancelGeneration={handleMultiAngleCancelGeneration}
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

      {/* Stitched Video Gallery Submission Confirmation Modal */}
      <GallerySubmissionConfirm
        isOpen={showStitchedGalleryConfirm}
        onConfirm={handleStitchedGallerySubmitConfirm}
        onCancel={handleStitchedGallerySubmitCancel}
        promptKey="stitched-video"
        imageUrl={(() => {
          const currentPhotosArray = isPromptSelectorMode ? filteredPhotos : photos;
          const photosWithVideos = currentPhotosArray.filter(
            photo => !photo.hidden && !photo.loading && !photo.generating && !photo.error && photo.videoUrl && !photo.isOriginal
          );
          return photosWithVideos[0]?.images?.[0] || null;
        })()}
        videoUrl={stitchedVideoPreviewUrl}
        isStitchedVideo={true}
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

      {/* Stitched Video Overlay - Uses same template as Infinite Loop */}
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
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000000,
            padding: '20px'
          }}
          onClick={() => {
            setShowStitchedVideoOverlay(false);
            // Don't revoke URL for individual segments, as they might be reused
            if (stitchedVideoUrl && stitchedVideoUrl.startsWith('blob:')) {
              URL.revokeObjectURL(stitchedVideoUrl);
            }
            setStitchedVideoUrl(null);
            // Return to segment review if this was opened from there
            if (stitchedVideoReturnToSegmentReview) {
              setShowSegmentReview(true);
              setStitchedVideoReturnToSegmentReview(false);
            } else {
              setShowDownloadTip(true);
              setTimeout(() => setShowDownloadTip(false), 8000);
            }
          }}
        >
          {/* Close Button */}
          <button
            onClick={() => {
              setShowStitchedVideoOverlay(false);
              // Don't revoke URL for individual segments, as they might be reused
              if (stitchedVideoUrl && stitchedVideoUrl.startsWith('blob:')) {
                URL.revokeObjectURL(stitchedVideoUrl);
              }
              setStitchedVideoUrl(null);
              // Return to segment review if this was opened from there
              if (stitchedVideoReturnToSegmentReview) {
                setShowSegmentReview(true);
                setStitchedVideoReturnToSegmentReview(false);
              } else {
                setShowDownloadTip(true);
                setTimeout(() => setShowDownloadTip(false), 8000);
              }
            }}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(0, 0, 0, 0.6)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease'
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

          {/* Video Player Container */}
          <div style={{
            position: 'relative',
            maxWidth: '90vw',
            maxHeight: '80vh',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <video
              ref={stitchedVideoRef}
              src={stitchedVideoUrl}
              loop
              playsInline
              controls
              muted={stitchedVideoMuted}
              style={{
                maxWidth: '90vw',
                maxHeight: '80vh',
                display: 'block'
              }}
            />

            {/* Action Icons - Bottom right overlay (same as Infinite Loop template) */}
            <div style={{
              position: 'absolute',
              bottom: '60px',
              right: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 10
            }}>
              {/* Download Button */}
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const timestamp = new Date().toISOString().split('T')[0];
                  const filename = `sogni-video-${timestamp}.mp4`;
                  try {
                    await downloadVideo(stitchedVideoUrl, filename);
                    showToast({
                      title: '✅ Download Started',
                      message: 'Your video is being downloaded!',
                      type: 'success'
                    });
                  } catch (err) {
                    showToast({
                      title: 'Download Failed',
                      message: 'Failed to download video. Please try again.',
                      type: 'error'
                    });
                  }
                }}
                title="Download"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 0.6)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(76, 175, 80, 0.9)';
                  e.currentTarget.style.transform = 'scale(1.1)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
              </button>

              {/* Share Button (if supported) */}
              {navigator.share && navigator.canShare && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleShareStitchedVideo();
                  }}
                  title="Share"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(33, 150, 243, 0.9)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
                  </svg>
                </button>
              )}

              {/* Remix Button - opens segment review to regenerate individual segments */}
              {pendingSegments.length > 0 && segmentReviewData && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStitchedVideoOverlay(false);
                    setShowSegmentReview(true);
                    setStitchedVideoReturnToSegmentReview(false); // Clear return flag
                  }}
                  title="Remix - Regenerate segments"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(147, 51, 234, 0.9)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Stitched Video QR Code Overlay - Shows QR code for stitched video sharing */}
      {qrCodeData && qrCodeData.isStitchedVideo && createPortal(
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
            zIndex: 10000002,
            cursor: 'pointer'
          }}
          onClick={onCloseQR}
        >
          <div
            style={{
              backgroundColor: 'white',
              padding: '24px',
              borderRadius: '16px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              maxWidth: '90vw'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{
              margin: '0 0 8px 0',
              color: '#333',
              fontSize: '20px',
              fontWeight: '600'
            }}>
              Scan to Share
            </h3>
            <p style={{
              margin: '0 0 20px 0',
              color: '#666',
              fontSize: '14px'
            }}>
              Your stitched video is ready to share!
            </p>

            {qrCodeData.isLoading || qrCodeDataUrl === 'loading' ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                margin: '0 auto 20px auto',
                width: '250px',
                height: '250px',
                border: '2px solid #eee',
                borderRadius: '12px',
                justifyContent: 'center',
                backgroundColor: '#f9f9f9'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  border: '4px solid #e3e3e3',
                  borderTop: '4px solid #1DA1F2',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '16px'
                }}></div>
                <div style={{
                  color: '#666',
                  fontSize: '14px',
                  fontWeight: '500'
                }}>
                  Generating QR Code...
                </div>
              </div>
            ) : qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="QR Code for sharing stitched video"
                style={{
                  display: 'block',
                  margin: '0 auto 20px auto',
                  border: '2px solid #eee',
                  borderRadius: '12px',
                  width: '250px',
                  height: '250px'
                }}
              />
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                margin: '0 auto 20px auto',
                width: '250px',
                height: '250px',
                border: '2px solid #eee',
                borderRadius: '12px',
                justifyContent: 'center',
                backgroundColor: '#f9f9f9'
              }}>
                <div style={{
                  color: '#999',
                  fontSize: '14px'
                }}>
                  Loading...
                </div>
              </div>
            )}

            <button
              onClick={onCloseQR}
              style={{
                background: 'linear-gradient(135deg, #ff5252, #e53935)',
                color: 'white',
                border: 'none',
                padding: '12px 32px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                fontFamily: '"Permanent Marker", cursive'
              }}
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Cancel Confirmation Popup */}
      <CancelConfirmationPopup
        isOpen={showCancelConfirmation}
        onClose={handleCancelConfirmationClose}
        onConfirm={handleCancelConfirmationConfirm}
        projectType={pendingCancel?.projectType || 'image'}
        progress={pendingCancel?.progress || 0}
        itemsCompleted={pendingCancel?.itemsCompleted || 0}
        totalItems={pendingCancel?.totalItems || 1}
        isRateLimited={cancelRateLimited}
        cooldownSeconds={cancelCooldownSeconds}
      />

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
  handleStitchedVideoQRShare: PropTypes.func,
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
  onRegisterVideoIntroTrigger: PropTypes.func, // Callback to register function that triggers video intro popup
  onOpenLoginModal: PropTypes.func // Function to open the login modal
};

export default PhotoGallery; 