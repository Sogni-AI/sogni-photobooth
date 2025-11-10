import React from 'react';
import { Helmet } from 'react-helmet-async';
import { trackEvent, trackPageView } from '../../utils/analytics';
import { setCampaignSource } from '../../utils/campaignAttribution';
import '../../styles/challenge/GimiChallenge.css';

const GimiChallenge = () => {
  const [isJazzAudioEnabled, setIsJazzAudioEnabled] = React.useState(false);
  const [isJojoAudioEnabled, setIsJojoAudioEnabled] = React.useState(false);
  
  // Initialize with 4 unique random transformations
  const getInitialIndices = () => {
    const indices = [];
    while (indices.length < 4) {
      const randomIndex = Math.floor(Math.random() * 40); // We have 40 transformations
      if (!indices.includes(randomIndex)) {
        indices.push(randomIndex);
      }
    }
    return indices;
  };
  
  // State for rotating transformations (one index per transformation box)
  const [transformationIndices, setTransformationIndices] = React.useState(getInitialIndices);

  // Track page view and set campaign attribution on mount
  React.useEffect(() => {
    trackPageView('/challenge/gimi');
    trackEvent('Gimi Challenge', 'page_view', 'Challenge Landing Page');
    
    // Set campaign source for attribution tracking (30-day window)
    setCampaignSource('gimi-challenge');
  }, []);

  const handleCTAClick = () => {
    trackEvent('Gimi Challenge', 'cta_click', 'Join Challenge Button');
    window.open('https://gimi.co', '_blank', 'noopener,noreferrer');
  };

  const handleVideoLinkClick = () => {
    trackEvent('Gimi Challenge', 'video_link_click', 'Video Content Link');
  };

  const handleAudioToggle = (videoName, isEnabled) => {
    trackEvent('Gimi Challenge', 'audio_toggle', videoName, isEnabled ? 1 : 0);
  };

  // All available transformations - large pool to avoid repetition (using real files)
  const allTransformations = [
    { name: "cyberpunk", image: "/gallery/prompts/headshot/sogni-photobooth-neon-cyberpunk-raw.jpg" },
    { name: "renaissance", image: "/gallery/prompts/headshot/sogni-photobooth-gilded-renaissance-raw.jpg" },
    { name: "ascii art", image: "/gallery/prompts/headshot/sogni-photobooth-ascii-terminal-raw.jpg" },
    { name: "90s party", image: "/gallery/prompts/headshot/sogni-photobooth-1990s-house-party-raw.jpg" },
    { name: "club dj", image: "/gallery/prompts/headshot/sogni-photobooth-club-d-j-raw.jpg" },
    { name: "professional", image: "/gallery/prompts/headshot/sogni-photobooth-magazine-cover-studio-raw.jpg" },
    { name: "anime", image: "/gallery/prompts/headshot/sogni-photobooth-anime-classic-raw.jpg" },
    { name: "claymation", image: "/gallery/prompts/headshot/sogni-photobooth-claymation-studio-raw.jpg" },
    { name: "comic manga", image: "/gallery/prompts/headshot/sogni-photobooth-comic-manga-raw.jpg" },
    { name: "crystal crown", image: "/gallery/prompts/headshot/sogni-photobooth-crystal-crown-prism-raw.jpg" },
    { name: "pixel art", image: "/gallery/prompts/headshot/sogni-photobooth-pixel-art-raw.jpg" },
    { name: "pop art", image: "/gallery/prompts/headshot/sogni-photobooth-popart-raw.jpg" },
    { name: "vaporwave", image: "/gallery/prompts/headshot/sogni-photobooth-vaporwave-raw.jpg" },
    { name: "baroque", image: "/gallery/prompts/headshot/sogni-photobooth-neo-baroque-raw.jpg" },
    { name: "film noir", image: "/gallery/prompts/headshot/sogni-photobooth-neo-noir-raw.jpg" },
    { name: "van gogh", image: "/gallery/prompts/headshot/sogni-photobooth-vangogh-swirl-raw.jpg" },
    { name: "picasso", image: "/gallery/prompts/headshot/sogni-photobooth-picasso-cubist-raw.jpg" },
    { name: "klimt gold", image: "/gallery/prompts/headshot/sogni-photobooth-klimt-gilded-raw.jpg" },
    { name: "ink wash", image: "/gallery/prompts/headshot/sogni-photobooth-ink-wash-raw.jpg" },
    { name: "retro vhs", image: "/gallery/prompts/headshot/sogni-photobooth-retro-v-h-s-raw.jpg" },
    { name: "synthwave", image: "/gallery/prompts/headshot/sogni-photobooth-synthwave-grid-raw.jpg" },
    { name: "graffiti", image: "/gallery/prompts/headshot/sogni-photobooth-graffiti-stencil-raw.jpg" },
    { name: "etching", image: "/gallery/prompts/headshot/sogni-photobooth-etching-vintage-raw.jpg" },
    { name: "stone moss", image: "/gallery/prompts/headshot/sogni-photobooth-stone-moss-raw.jpg" },
    { name: "jojo aura", image: "/gallery/prompts/headshot/sogni-photobooth-jojo-stand-aura-raw.jpg" },
    { name: "halftone", image: "/gallery/prompts/headshot/sogni-photobooth-halftone-ben-day-raw.jpg" },
    { name: "banksy", image: "/gallery/prompts/headshot/sogni-photobooth-banksy-stencil-raw.jpg" },
    { name: "arcade vector", image: "/gallery/prompts/headshot/sogni-photobooth-arcade-vector-raw.jpg" },
    { name: "art nouveau", image: "/gallery/prompts/headshot/sogni-photobooth-art-nouveau-gold-raw.jpg" },
    { name: "chalk pastel", image: "/gallery/prompts/headshot/sogni-photobooth-chalk-pastel-raw.jpg" },
    { name: "drip paint", image: "/gallery/prompts/headshot/sogni-photobooth-drip-paint-raw.jpg" },
    { name: "gothic", image: "/gallery/prompts/headshot/sogni-photobooth-dark-queen-raw.jpg" },
    { name: "medieval", image: "/gallery/prompts/headshot/sogni-photobooth-royal-bust-raw.jpg" },
    { name: "disco ball", image: "/gallery/prompts/headshot/sogni-photobooth-disco-ball-reflections-raw.jpg" },
    { name: "punk rocker", image: "/gallery/prompts/headshot/sogni-photobooth-punk-rocker-raw.jpg" },
    { name: "retro futurism", image: "/gallery/prompts/headshot/sogni-photobooth-retro-futurist-raw.jpg" },
    { name: "stained glass", image: "/gallery/prompts/headshot/sogni-photobooth-stained-ink-marbling-raw.jpg" },
    { name: "kusama dots", image: "/gallery/prompts/headshot/sogni-photobooth-kusama-dots-raw.jpg" },
    { name: "roman statue", image: "/gallery/prompts/headshot/sogni-photobooth-statue-roman-raw.jpg" },
    { name: "barbie", image: "/gallery/prompts/headshot/sogni-photobooth-barbie-raw.jpg" },
    { name: "ghibli", image: "/gallery/prompts/headshot/sogni-photobooth-ghibli-meadow-raw.jpg" },
    { name: "jazz sax", image: "/gallery/prompts/headshot/sogni-photobooth-jazz-saxophonist-raw.jpg" },
    { name: "nft ape", image: "/gallery/prompts/headshot/sogni-photobooth-nft-bored-ape-raw.jpg" },
    { name: "crypto punk", image: "/gallery/prompts/headshot/sogni-photobooth-nft-crypto-punk-raw.jpg" },
    { name: "tron", image: "/gallery/prompts/headshot/sogni-photobooth-tron-don-raw.jpg" },
    { name: "watercolor", image: "/gallery/prompts/headshot/sogni-photobooth-storybook-watercolor-raw.jpg" },
    { name: "origami", image: "/gallery/prompts/headshot/sogni-photobooth-origami-shadowbox-raw.jpg" },
    { name: "sepia photo", image: "/gallery/prompts/headshot/sogni-photobooth-sepia-daguerreotype-raw.jpg" },
    { name: "pointillism", image: "/gallery/prompts/headshot/sogni-photobooth-pointillism-dots-raw.jpg" },
    { name: "bronze", image: "/gallery/prompts/headshot/sogni-photobooth-polished-bronze-raw.jpg" },
  ];

  // Rotate transformations at different intervals (twice as fast)
  React.useEffect(() => {
    const intervals = [2500, 3000, 3500, 4000]; // Different intervals for each box
    
    const timers = intervals.map((interval, boxIndex) => {
      return setInterval(() => {
        setTransformationIndices(prev => {
          const newIndices = [...prev];
          // Get next random index that's different from current AND not currently showing in other boxes
          let newIndex;
          let attempts = 0;
          do {
            newIndex = Math.floor(Math.random() * allTransformations.length);
            attempts++;
          } while (
            (newIndex === newIndices[boxIndex] || newIndices.includes(newIndex)) && 
            attempts < 50 // Prevent infinite loop
          );
          newIndices[boxIndex] = newIndex;
          return newIndices;
        });
      }, interval);
    });

    return () => timers.forEach(timer => clearInterval(timer));
  }, []);

  const styles = [
    { name: "1990's House Party host", emoji: "🎉", image: "/gallery/prompts/headshot/sogni-photobooth-1990s-house-party-raw.jpg" },
    { name: "Cyberpunk street racer", emoji: "🏍️", image: "/gallery/prompts/headshot/sogni-photobooth-neon-cyberpunk-raw.jpg" },
    { name: "Renaissance painting", emoji: "🎨", image: "/gallery/prompts/headshot/sogni-photobooth-gilded-renaissance-raw.jpg" },
    { name: "Club DJ in Tokyo", emoji: "🎧", image: "/gallery/prompts/headshot/sogni-photobooth-club-d-j-raw.jpg" },
    { name: "Professional headshot", emoji: "💼", image: "/gallery/prompts/headshot/sogni-photobooth-magazine-cover-studio-raw.jpg" },
    { name: "ASCII Terminal hacker", emoji: "💻", image: "/gallery/prompts/headshot/sogni-photobooth-ascii-terminal-raw.jpg" },
    { name: "200+ other wild styles", emoji: "✨", image: null }
  ];

  const contentExamples = [
    {
      title: "screen record the process",
      example: '"POV: you discover the world\'s fastest AI photobooth"'
    },
    {
      title: "before/after reveals",
      example: '"me now vs. me in the metaverse"'
    },
    {
      title: "style carousel",
      example: "show all 8 and ask which one hits"
    },
    {
      title: "get weird with it",
      example: "the best stuff comes from creators who experiment"
    }
  ];

  const socialHandles = [
    { platform: 'TikTok', handle: '@sogni.ai', url: 'https://tiktok.com/@sogni.ai' },
    { platform: 'Instagram', handle: '@sogni.ai', url: 'https://instagram.com/sogni.ai' },
    { platform: 'X/Twitter', handle: '@sogni_protocol', url: 'https://x.com/sogni_protocol' },
    { platform: 'YouTube', handle: '@SogniAI', url: 'https://youtube.com/@SogniAI' }
  ];

  return (
    <div className="gimi-challenge-container">
      <Helmet>
        <title>Turn One Photo Into 8 Viral Posts – $2,000 Gimi Challenge | Sogni AI Photobooth</title>
        <meta name="description" content="Join the Sogni x Gimi Creator Challenge! Create 8 viral photo transformations in 60 seconds and compete for $2,000 USDC. Use photobooth.sogni.ai with 200+ AI styles. Sign up free on Gimi.co." />
        
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="Turn One Photo Into 8 Viral Posts – Win $2,000!" />
        <meta property="og:description" content="Join the Sogni x Gimi Creator Challenge! Create 8 viral photo transformations in 60 seconds with 200+ AI styles. Compete for $2,000 USDC based on engagement. Sign up free on Gimi.co." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://photobooth.sogni.ai/challenge/gimi" />
        <meta property="og:image" content="https://photobooth.sogni.ai/promo/gimi/Photobooth_gimi-1920x400.jpg" />
        <meta property="og:image:width" content="1920" />
        <meta property="og:image:height" content="400" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Turn One Photo Into 8 Viral Posts – Win $2,000!" />
        <meta name="twitter:description" content="Join the Sogni x Gimi Creator Challenge! Create viral AI photo transformations in 60 seconds. 200+ styles. $2,000 USDC prize pool. Sign up free on Gimi.co." />
        <meta name="twitter:image" content="https://photobooth.sogni.ai/promo/gimi/Photobooth_gimi-1920x400.jpg" />
        <meta name="twitter:site" content="@sogni_protocol" />
        
        {/* Additional SEO */}
        <meta name="keywords" content="AI photo challenge, creator challenge, Gimi.co, viral content, AI photobooth, photo transformation, creator rewards, USDC prizes, social media content, TikTok challenge, Instagram challenge" />
        <link rel="canonical" href="https://photobooth.sogni.ai/challenge/gimi" />
      </Helmet>

      {/* Banner Section */}
      <section className="gimi-banner">
        <img 
          src="/promo/gimi/Photobooth_gimi-1920x400.jpg" 
          alt="Gimi Challenge - Turn one photo into 8 viral posts and win $2,000" 
          className="gimi-banner-image"
        />
      </section>

      {/* Hero Section */}
      <section className="gimi-hero">
        <div className="gimi-hero-content">
          <h1 className="gimi-hero-title">
            Turn One Photo Into <span className="highlight">8 Viral Posts</span>
          </h1>
          <p className="gimi-hero-subtitle">(and get paid for it)</p>
          
          <div className="gimi-hero-description">
            <p>We're giving away <strong>$2,000</strong> to creators who make the best Photobooth content</p>
            <p className="gimi-tagline">60 seconds to create. Unlimited ways to go viral.</p>
          </div>

          <button className="gimi-cta-button gimi-cta-primary" onClick={handleCTAClick}>
            Join the Challenge on Gimi.co
          </button>
        </div>
      </section>

      {/* How It Works */}
      <section className="gimi-section gimi-how-it-works">
        <h2 className="gimi-section-title">How It Works</h2>
        
        <div className="gimi-steps">
          <div className="gimi-step">
            <div className="gimi-step-number">1</div>
            <h3 className="gimi-step-title">Create Your Transformations</h3>
            <p className="gimi-step-description">
              Use <a href="https://photobooth.sogni.ai" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('Gimi Challenge', 'link_click', 'Photobooth Link')}>photobooth.sogni.ai</a> → upload any photo → pick from 200+ styles → get 8 variations in ~60 seconds
            </p>
          </div>

          <div className="gimi-step">
            <div className="gimi-step-number">2</div>
            <h3 className="gimi-step-title">Make It Viral</h3>
            <p className="gimi-step-description">
              Post to TikTok, Instagram, or X → tag us → screen record it, make before/afters, do your thing
            </p>
          </div>

          <div className="gimi-step">
            <div className="gimi-step-number">3</div>
            <h3 className="gimi-step-title">Submit & Earn</h3>
            <p className="gimi-step-description">
              Drop your post link on the <a href="https://gimi.co" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('Gimi Challenge', 'link_click', 'Gimi.co Link')}>Gimi.co</a> campaign page → once approved, you start earning based on engagement
            </p>
          </div>
        </div>
      </section>

      {/* The Prize */}
      <section className="gimi-section gimi-prize">
        <img 
          src="/polaroid-camera.png" 
          alt="Polaroid camera" 
          className="gimi-prize-camera"
        />
        
        <div className="gimi-moneybag-decorations">
          <span className="gimi-moneybag gimi-moneybag-1">💰</span>
          <span className="gimi-moneybag gimi-moneybag-2">💰</span>
          <span className="gimi-moneybag gimi-moneybag-3">💰</span>
          <span className="gimi-moneybag gimi-moneybag-4">💰</span>
        </div>
        
        <h2 className="gimi-section-title">The Prize</h2>

        <div className="gimi-prize-amount">
          <span className="gimi-currency">$2,000</span>
          <span className="gimi-currency-type">USDC</span>
          <span className="gimi-prize-recipients">paid out to creators</span>
        </div>

        <div className="gimi-prize-details">
          <ul className="gimi-prize-list">
            <li>The more views, likes, shares, and comments on content, the more you earn</li>
            <li>Top performers get featured on our socials + ongoing partnership opportunities</li>
            <li>Rewards paid through Gimi.co based on real engagement</li>
          </ul>
          <p className="gimi-prize-urgency">
            ⚡ Once the prize pool is gone, it's gone. So start creating!
          </p>
        </div>
      </section>

      {/* What You Can Make - Combined with showcase */}
      <section className="gimi-section gimi-styles">
        <h2 className="gimi-section-title">What You Can Make</h2>
        
        <p className="gimi-styles-intro">One photo becomes:</p>

        {/* Before/After Showcase with Rotating Transformations */}
        <div className="gimi-showcase-container">
          <div className="gimi-before-after">
            <div className="gimi-showcase-before">
              <img 
                src="/albert-einstein-sticks-out-his-tongue.jpg" 
                alt="Original Einstein photo" 
                className="gimi-showcase-image"
              />
              <span className="gimi-showcase-label">Before</span>
            </div>
            
            <div className="gimi-arrow">→</div>
            
            <div className="gimi-showcase-after">
              <div className="gimi-transformations-grid">
                {transformationIndices.map((transformIndex, boxIndex) => {
                  const transformation = allTransformations[transformIndex];
                  return (
                    <div key={`${boxIndex}-${transformIndex}`} className="gimi-transformation">
                      <img 
                        src={transformation.image} 
                        alt={`${transformation.name} transformation`} 
                        className="gimi-showcase-image gimi-transformation-fade"
                      />
                      <span className="gimi-transform-label">{transformation.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <p className="gimi-styles-note">
          <span className="gimi-muted">200+ styles available or prompt your own!</span> No prompt engineering required. Just upload and go.
        </p>
      </section>

      {/* Content That Works */}
      <section className="gimi-section gimi-content-examples">
        <img 
          src="/sloth_cam_hop_trnsparent.png" 
          alt="Sloth mascot with camera" 
          className="gimi-content-sloth"
        />
        
        <h2 className="gimi-section-title">Content That Works</h2>
        
        <div className="gimi-examples-grid">
          {contentExamples.map((item, index) => (
            <div key={index} className="gimi-example-card">
              <h4 className="gimi-example-title">{item.title}</h4>
              <p className="gimi-example-text">{item.example}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Video Content Section */}
      <section className="gimi-section gimi-video-section">
        <div className="gimi-video-content">
          <h3 className="gimi-video-title">
            <a href="https://photobooth.sogni.ai/?page=prompts&themes=videos" target="_blank" rel="noopener noreferrer" onClick={handleVideoLinkClick}>
              Video Content
            </a> OK as long as source images start in Photobooth
          </h3>
          
          <div className="gimi-video-examples">
            <div className="gimi-video-example">
              <div className="gimi-video-container">
                <video
                  className="gimi-video-player"
                  src="https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-video-demo_832x1216.mp4"
                  loop
                  muted={!isJazzAudioEnabled}
                  playsInline
                  autoPlay
                />
                <button 
                  className="gimi-audio-toggle"
                  onClick={() => {
                    const newState = !isJazzAudioEnabled;
                    setIsJazzAudioEnabled(newState);
                    handleAudioToggle('Jazz Sax', newState);
                  }}
                  aria-label={isJazzAudioEnabled ? "Mute audio" : "Unmute audio"}
                >
                  {isJazzAudioEnabled ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor"/>
                    </svg>
                  )}
                </button>
              </div>
              <p className="gimi-video-label">Jazz Sax</p>
            </div>
            <div className="gimi-video-example">
              <div className="gimi-video-container">
                <video
                  className="gimi-video-player"
                  src="https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-jojo-stand-aura-raw.mp4"
                  loop
                  muted={!isJojoAudioEnabled}
                  playsInline
                  autoPlay
                />
                <button 
                  className="gimi-audio-toggle"
                  onClick={() => {
                    const newState = !isJojoAudioEnabled;
                    setIsJojoAudioEnabled(newState);
                    handleAudioToggle('Jojo Stand Aura', newState);
                  }}
                  aria-label={isJojoAudioEnabled ? "Mute audio" : "Unmute audio"}
                >
                  {isJojoAudioEnabled ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor"/>
                    </svg>
                  )}
                </button>
              </div>
              <p className="gimi-video-label">Jojo Stand Aura</p>
            </div>
            <div className="gimi-video-example">
              <video
                className="gimi-video-player"
                src="https://pub-5bc58981af9f42659ff8ada57bfea92c.r2.dev/videos/sogni-photobooth-stonemoss-raw.mp4"
                loop
                muted
                playsInline
                autoPlay
              />
              <p className="gimi-video-label">Stone Moss</p>
            </div>
          </div>
          
          <p className="gimi-video-note">
            *Native Video coming to Photobooth soon using <a href="https://github.com/Wan-Video/Wan2.2" target="_blank" rel="noopener noreferrer">WAN 2.2</a>!
          </p>
        </div>
      </section>

      {/* Ready to Win */}
      <section className="gimi-section gimi-cta-section">
        <h2 className="gimi-section-title">Ready to Win?</h2>
        
        <button className="gimi-cta-button gimi-cta-secondary" onClick={handleCTAClick}>
          Join the Challenge on Gimi.co
        </button>

        <p className="gimi-cta-tagline">Sign up. Create. Post. Earn.</p>
      </section>

      {/* About Section */}
      <section className="gimi-section gimi-about">
        <div className="gimi-about-container">
          <div className="gimi-about-column">
            <h3 className="gimi-about-title">About Sogni</h3>
            <ul className="gimi-about-list">
              <li>Sogni is a "decentralized" AI Art platform that takes AI art out of the corporate cloud and into people's hands</li>
              <li>Users from all around the world are able to use 100+ latest generative art models for free, up to 50 images a day</li>
              <li>All the art is generated by end-users like you, who get paid to run art tasks with their GPUs while they are sleeping. Anyone can host a worker node</li>
              <li>Because it's a decentralized network run on open source models, it's private, we don't mine your data, and you can render whatever you want without oppressive corporate policies</li>
              <li>Run out of free credits? Sogni supports in-app payments via its web app and its pro native apps on MacOS and iOS</li>
              <li>Along with contests like this Sogni has an active <a href="https://discord.com/invite/2JjzA2zrrc" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('Gimi Challenge', 'link_click', 'Discord Community')}>Discord community</a> and fun <a href="https://www.sogni.ai/leaderboard#artist" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('Gimi Challenge', 'link_click', 'Leaderboard')}>leaderboard contests</a></li>
            </ul>
          </div>

          <div className="gimi-about-column">
            <h3 className="gimi-about-title">About Sogni Photobooth</h3>
            <ul className="gimi-about-list">
              <li>Photobooth is one of many open-source Sogni <a href="https://www.sogni.ai/super-apps" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('Gimi Challenge', 'link_click', 'SuperApps')}>SuperApps</a> sample projects to show off what you can build on top of the Sogni developer SDK</li>
              <li>The developer SDK allows you to tap into the open source global render network and build something fun and profitable</li>
              <li>This application was completely vibe coded, written via AI, using Cursor / Claude 4. If we can build it, you can build it too!</li>
              <li>Over 100k lines of code completely open-source on <a href="https://github.com/Sogni-AI/sogni-photobooth" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('Gimi Challenge', 'link_click', 'GitHub Repo')}>GitHub</a></li>
            </ul>
          </div>
        </div>
      </section>

      {/* The Fine Print */}
      <section className="gimi-section gimi-fine-print">
        <h3 className="gimi-fine-print-title">The Fine Print</h3>
        
        <ul className="gimi-fine-print-list">
          <li>Open to creators 18+</li>
          <li>Use <a href="https://photobooth.sogni.ai" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('Gimi Challenge', 'link_click', 'Fine Print Photobooth Link')}>photobooth.sogni.ai</a> for transformations</li>
          <li>Tag us in your posts (handles below)</li>
          <li>No offensive/illegal content</li>
          <li>Rewards paid through Gimi.co based on engagement</li>
          <li>Bot/fake engagement gets disqualified</li>
        </ul>
      </section>

      {/* Tag Us */}
      <section className="gimi-section gimi-social">
        <h3 className="gimi-social-title">Tag Us</h3>
        
        <div className="gimi-social-links">
          {socialHandles.map((social, index) => (
            <a
              key={index}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="gimi-social-link"
              onClick={() => trackEvent('Gimi Challenge', 'social_link_click', social.platform)}
            >
              <span className="gimi-social-platform">{social.platform}:</span>
              <span className="gimi-social-handle">{social.handle}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="gimi-footer">
        <p className="gimi-powered-by">Powered by <a href="https://sogni.ai" target="_blank" rel="noopener noreferrer" onClick={() => trackEvent('Gimi Challenge', 'link_click', 'Footer Sogni Link')}>Sogni.ai</a></p>
      </footer>
    </div>
  );
};

export default GimiChallenge;

