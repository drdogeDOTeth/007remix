// Global error handler for isNumber errors
try {
    // Attempted workaround for isNumber errors
    if (typeof isNumber === 'undefined') {
      // Define globally if not already defined
      window.isNumber = function(value) {
        return typeof value === 'number' && !isNaN(value);
      };
    }
  } catch (e) {
    // Ignore errors from the attempt, we'll handle them another way
  }
  
  // Utility function to check if a value is a number
  function isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
  }
  
  /**
   * V4-P0R1Z3R ENERGY WEAPON SYSTEM
   * 
   * FEATURES:
   * - Precision aiming using camera/mouse cursor position
   * - First and third person shooting modes
   * - Visual aiming indicator that shows exactly where you're aiming
   * - Auto and semi-auto fire modes
   * - Particle-based projectiles and impact effects
   * - Headshot detection with critical hit multiplier
   * - PIP-Boy style weapon statistics display
   * 
   * CONTROLS:
   * - Left mouse button: Fire weapon
   * - C key: Toggle between first and third person
   * - F key: Toggle weapon stats display
   * - V key: Toggle between auto and semi-auto fire modes
   * - Q key: Exit first person mode or release weapon
   */
  
  // Modern particle system for better effects
  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.particlePool = [];
      this.maxParticles = 50;
      this.config = {
        lifetime: 1.0,
        speed: 5,
        size: 0.05,
        color: '#00ffee',
        gravity: 0.1,
        spread: 0.2
      };
    }
    
    createParticleEmitter(position, direction, count, config = {}) {
      // Merge provided config with defaults
      const particleConfig = { ...this.config, ...config };
      
      // Create particles
      for (let i = 0; i < count; i++) {
        this.emitParticle(position, direction, particleConfig);
      }
    }
    
    emitParticle(position, direction, config) {
      // Get a particle from the pool or create a new one
      let particle = this.particlePool.pop();
      
      if (!particle) {
        // Create a new particle if the pool is empty
        particle = {
          mesh: app.create('anchor'),
          ui: app.create('ui'),
          text: app.create('uitext')
        };
        
        // Setup UI
        particle.ui.width = 30;
        particle.ui.height = 30;
        particle.ui.billboard = 'full';
        particle.ui.backgroundColor = 'transparent';
        
        // Setup text
        particle.text.value = config.character || '⚡';
        particle.text.fontSize = 24;
        
        // Add UI to mesh
        particle.ui.add(particle.text);
        particle.mesh.add(particle.ui);
      }
      
      // Check if we should use image instead of text
      if (config.imageUrl) {
        // Hide text and show image background
        particle.text.opacity = 0;
        
        // Set background image
        particle.ui.backgroundImage = config.imageUrl;
        particle.ui.backgroundSize = 'contain';
      } else {
        // Use text character
        particle.text.opacity = 1;
        particle.text.value = config.character || '⚡';
        particle.ui.backgroundImage = '';
      }
      
      // Initialize particle properties
      particle.position = Array.isArray(position) 
        ? [...position] 
        : position.toArray ? position.toArray() : [position.x, position.y, position.z];
      
      // Apply spread to direction
      const spread = config.spread || 0.2;
      const dir = Array.isArray(direction) 
        ? [...direction] 
        : direction.toArray ? direction.toArray() : [direction.x, direction.y, direction.z];
      
      // Calculate random spread
      const randomSpreadX = (Math.random() * 2 - 1) * spread;
      const randomSpreadY = (Math.random() * 2 - 1) * spread;
      const randomSpreadZ = (Math.random() * 2 - 1) * spread;
      
      particle.velocity = [
        dir[0] + randomSpreadX,
        dir[1] + randomSpreadY,
        dir[2] + randomSpreadZ
      ];
      
      // Normalize velocity vector
      const magnitude = Math.sqrt(
        particle.velocity[0] * particle.velocity[0] + 
        particle.velocity[1] * particle.velocity[1] + 
        particle.velocity[2] * particle.velocity[2]
      );
      
      if (magnitude > 0) {
        particle.velocity[0] /= magnitude;
        particle.velocity[1] /= magnitude;
        particle.velocity[2] /= magnitude;
      }
      
      // Apply speed
      const speed = config.speed + (Math.random() * config.speed * 0.5);
      particle.velocity[0] *= speed;
      particle.velocity[1] *= speed;
      particle.velocity[2] *= speed;
      
      // Set other properties
      particle.lifetime = config.lifetime + (Math.random() * config.lifetime * 0.5);
      particle.initialLifetime = particle.lifetime;
      particle.size = config.size + (Math.random() * config.size * 0.5);
      particle.color = config.color || '#00ffee';
      
      // Set position and scale
      particle.mesh.position.set(particle.position[0], particle.position[1], particle.position[2]);
      particle.mesh.scale.set(particle.size, particle.size, particle.size);
      
      // Set color
      particle.text.color = particle.color;
      
      // Add to world and particle array
      world.add(particle.mesh);
      
      // Add to active particles
      this.particles.push(particle);
      
      // Cap total particles
      if (this.particles.length > this.maxParticles) {
        const oldestParticle = this.particles.shift();
        this.recycleParticle(oldestParticle);
      }
      
      return particle;
    }
    
    recycleParticle(particle) {
      try {
        // Remove from world
        world.remove(particle.mesh);
        
        // Add to pool for reuse
        this.particlePool.push(particle);
      } catch (e) {
        console.error('Error recycling particle:', e);
      }
    }
    
    update(delta) {
      // Update all particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const particle = this.particles[i];
        
        // Update lifetime
        particle.lifetime -= delta;
        
        // If expired, recycle
        if (particle.lifetime <= 0) {
          this.recycleParticle(particle);
          this.particles.splice(i, 1);
          continue;
        }
        
        // Update position based on velocity
        particle.position[0] += particle.velocity[0] * delta;
        particle.position[1] += particle.velocity[1] * delta;
        particle.position[2] += particle.velocity[2] * delta;
        
        // Apply gravity
        particle.velocity[1] -= 2.0 * delta;
        
        // Update mesh position
        particle.mesh.position.set(
          particle.position[0], 
          particle.position[1], 
          particle.position[2]
        );
        
        // Fade out based on lifetime
        const lifetimeProgress = 1 - (particle.lifetime / particle.initialLifetime);
        
        // Fade both text and background
        if (particle.text) {
          particle.text.opacity = 1 - lifetimeProgress;
        }
        
        // Fade background image if it's being used
        if (particle.ui && particle.ui.backgroundImage) {
          // Set background opacity for a smooth fade
          const bgColor = particle.ui.backgroundColor || 'transparent';
          // Check if background has alpha component and adjust it
          if (bgColor.startsWith('rgba')) {
            // Extract components
            const rgbaMatch = bgColor.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/);
            if (rgbaMatch && rgbaMatch.length === 5) {
              // Update alpha component for fading
              const r = parseInt(rgbaMatch[1], 10);
              const g = parseInt(rgbaMatch[2], 10);
              const b = parseInt(rgbaMatch[3], 10);
              const alpha = (1 - lifetimeProgress) * parseFloat(rgbaMatch[4]);
              particle.ui.backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
          }
        }
        
        // Scale down slightly over time
        const scale = particle.size * (1 - lifetimeProgress * 0.5);
        particle.mesh.scale.set(scale, scale, scale);
      }
    }
    
    clear() {
      // Remove all particles from world
      this.particles.forEach(particle => {
        try {
          world.remove(particle.mesh);
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      
      // Clear arrays
      this.particles = [];
      this.particlePool = [];
    }
  }
  
  // Create global instance
  const particleSystem = new ParticleSystem();
  
  // Play lightning sound at position
  function playLightningSound(position) {
    try {
      const soundEffect = app.create('audio')
      
      // Use a relative path for default sound with proper error handling
      const defaultSound = 'sounds/lightning.mp3'
      soundEffect.src = app.config.lightningSound?.url || defaultSound
      
      // Use volume from config, default to 0.7 if not set
      const volume = (app.config.soundVolume || 7.0) / 10.0
      soundEffect.volume = volume
      soundEffect.spatial = true
      soundEffect.group = 'sfx'
      
      soundEffect.position.set(position[0], position[1], position[2])
      world.add(soundEffect)
      
      // Play with error handling
      try {
        soundEffect.play()
      } catch (e) {
        console.warn('Failed to play lightning sound:', e)
      }
      
      // Use timer system for cleanup
      const lightSoundTimerId = 'lightSound' + Date.now();
      createTimer(lightSoundTimerId, 5000, () => {
        try {
          if (soundEffect) {
            world.remove(soundEffect);
          }
        } catch (e) {
          console.error('Error removing sound effect:', e);
        }
      });
    } catch (e) {
      console.error('Error creating lightning sound effect:', e)
    }
  }
  
  // Global variables
let lastUseTime = 0;
let player = null;
let control = null;
let inFirstPersonMode = false;
let controlReleaseFn = null;
let controlsText = null; // Reference to the UI controls text element
let statsVisible = false; // Track whether weapon stats UI is visible
let weaponStatsUI = null; // Reference to the weapon stats UI panel
let fireMode = null; // Current fire mode ('auto' or 'semi')
let fireModeBanner = null; // Reference to the fire mode change banner
// Track if the fire button is being held down
let isFireButtonDown = false;
let autoFireInterval = null;
// Debug aim indicator
let aimIndicator = null;
  
  // Array to track particles for effects
  const particles = [];
  
  // Hyperfy Weapons Script with Animation Features
  
  app.configure(() => {
    return [
      {
        type: 'section',
        key: 'appearance',
        label: 'Weapon Appearance',
      },
    {
      key: 'weaponName',
      type: 'text',
      label: 'Weapon Name',
      value: 'V4-P0R1Z3R',
      description: 'Custom name for your weapon that appears in the weapon stats display'
    },
    {
      key: 'emote',
      type: 'file',
      kind: 'emote',
      label: 'Weapon Use Animation'
    },
    {
      key: 'lightningColor',
      type: 'color',
      label: 'Lightning Color',
      value: '#00ffee'
    },
    {
      key: 'projectileChar',
      type: 'text',
      label: 'Projectile Character',
      value: '•',
      description: 'Single character to use for projectiles (e.g. •, ⚡, ☢, ⚪)'
    },
    {
      key: 'lightningSound',
      type: 'file',
      kind: 'audio',
      label: 'Lightning Sound Effect',
      description: 'Upload a sound file or leave empty to use default. Audio hosted on assets.hyperfy.io may not work.'
    },
    {
      key: 'impactSound',
      type: 'file',
      kind: 'audio',
      label: 'Impact Sound Effect',
      description: 'Upload a sound file or leave empty to use default. Audio hosted on assets.hyperfy.io may not work.'
    },
    {
      key: 'soundVolume',
      type: 'number',
      label: 'Sound Effect Volume (0-10)',
      value: 7.0,
      min: 0,
      max: 10,
      step: 0.5
    },
      {
        type: 'section',
        key: 'gameplay',
        label: 'Gameplay Settings',
      },
      {
        key: 'weaponDamage',
        type: 'number',
        label: 'Base Damage',
        min: 1,
        max: 100,
        initial: 25
      },
      {
        key: 'headshotMultiplier',
        type: 'number',
        dp: 1,
        label: 'Headshot Multiplier',
        min: 1,
        max: 5,
        step: 0.1,
        initial: 2.0
      },
      {
        key: 'fireRate',
        type: 'number',
        dp: 2,
        label: 'Fire Rate (seconds)',
        min: 0.01,
        max: 1,
        step: 0.05,
        initial: 0.1
      },
      {
        key: 'weaponRange',
        type: 'number',
        label: 'Weapon Range',
        min: 10,
        max: 1500,
        initial: 100
      },
      {
        key: 'defaultFireMode',
        type: 'dropdown',
        label: 'Default Fire Mode',
        options: [
          { label: 'Full-Auto', value: 'auto' },
          { label: 'Semi-Auto', value: 'semi' }
        ],
        initial: 'auto'
      },
      {
        type: 'section',
        key: 'health',
        label: 'Health Settings',
      },
      {
        key: 'enableHealthRegen',
        type: 'switch',
        label: 'Health Regeneration',
        value: true,
        options: [
          { label: 'Enabled', value: true },
          { label: 'Disabled', value: false }
        ]
      },
      {
        key: 'healthRegenAmount',
        type: 'number',
        label: 'Regen Amount',
        min: 1,
        max: 20,
        initial: 1,
        when: [{ key: 'enableHealthRegen', op: 'eq', value: true }]
      },
      {
        key: 'healthRegenDelay',
        type: 'number',
        label: 'Regen Delay (seconds)',
        min: 1,
        max: 30,
        initial: 5,
        when: [{ key: 'enableHealthRegen', op: 'eq', value: true }]
      },
      {
        type: 'section',
        key: 'view',
        label: 'View Settings',
      },
    {
      key: 'enableFirstPerson',
      type: 'switch',
        label: 'First Person Mode',
      value: true,
      options: [
          { label: 'Enabled', value: true },
          { label: 'Disabled', value: false }
      ]
    },
    {
      type: 'section',
      key: 'visuals',
      label: 'Visual Settings',
    },
    {
      key: 'muzzleFlashImage',
      type: 'file',
      kind: 'texture',
      label: 'Muzzle Flash Image',
      description: 'Custom image for muzzle flash effect (leave empty for default character)'
    },
    {
      key: 'projectileImage',
      type: 'file',
      kind: 'texture',
      label: 'Projectile Image',
      description: 'Custom image for projectiles (leave empty to use character)'
    },
    {
      key: 'impactImage',
      type: 'file',
      kind: 'texture',
      label: 'Impact Effect Image',
      description: 'Custom image for impact particles (leave empty to use character)'
    },
    ]
  })
  
  // Animation timing
  const WEAPON_ANIMATION_DURATION = 1.2 // Length of weapon use animation
  const WEAPON_USE_DELAY = app.config.weaponUseDelay || 0.1 // Seconds before weapon fires
  const WEAPON_COOLDOWN = app.config.weaponCooldown || 0.2 // Seconds between hits on same player
  const WEAPON_MAX_DISTANCE = app.config.weaponMaxDistance || 100 // Maximum distance weapon can hit
  
  // Health regeneration settings - read from config with fallbacks
  const HEALTH_REGEN_AMOUNT = app.config.healthRegenAmount || 1
  const HEALTH_REGEN_INTERVAL = 2     // Seconds between regen ticks
  const HEALTH_REGEN_DELAY = app.config.healthRegenDelay || 5
  
  // Weapon damage settings - read from config with fallbacks
  const WEAPON_DAMAGE = app.config.weaponDamage || 25 // Base damage per hit
  const WEAPON_HEADSHOT_MULTIPLIER = app.config.weaponHeadshotMultiplier || 2.0 // Multiplier for headshots
  const WEAPON_FIRE_RATE = app.config.fireRate || 0.1 // Fire rate from config
  
  // Lightning effect settings
  const LIGHTNING_COUNT = 2 // Single beam for laser
  const LIGHTNING_PARTICLE_SPEED_MIN = 50  // Increased from 40
  const LIGHTNING_PARTICLE_SPEED_MAX = 70  // Increased from 60
  const LIGHTNING_LIFETIME = 0.5   // Slightly longer lifetime
  const LIGHTNING_SCALE_MIN = 0.005 // Reduced from 0.1
  const LIGHTNING_SCALE_MAX = 0.005  // Reduced from 0.4
  const LIGHTNING_SPREAD = 0 // No spread for perfect accuracy
  const LIGHTNING_SPAWN_OFFSET_FORWARD = 0.2
  const LIGHTNING_SPAWN_OFFSET_UP = 1.5
  const LIGHTNING_SPAWN_OFFSET_RIGHT = 0.05
  const LIGHTNING_FIRE_RANGE = 1 // Extended range for laser
// We'll use a single fire rate value from config throughout the code
const FIRE_RATE = app.config.fireRate || 0.1 // Fire rate from config
  
  // Muzzle flash settings
  const MUZZLE_FLASH_COUNT = 3      // Reduced from 5 for fewer effects
  const MUZZLE_FLASH_LIFETIME = 0.3 // Slightly reduced lifetime
  const MUZZLE_FLASH_SCALE = 0.05   // Reduced from 0.15
  const MUZZLE_FLASH_SPREAD = 0.05  // Reduced spread
  const MUZZLE_FLASH_OFFSET_FORWARD = 0.7  // Keep same position
  const MUZZLE_FLASH_OFFSET_UP = 1.5      // Keep same position
  const MUZZLE_FLASH_OFFSET_RIGHT = 0.1
  
  // Impact effect settings
  const IMPACT_PARTICLES = 5 // Reduced from 8
  const IMPACT_SPEED_MIN = 4
  const IMPACT_SPEED_MAX = 8 // Reduced from 12
  const IMPACT_LIFETIME = 0.3 // Reduced from 0.4
  const IMPACT_SCALE = 0.008  // Reduced from 0.012
  const IMPACT_SPREAD = 0.4   // Reduced from 0.8
  const IMPACT_CHARS = ['⚡'] // Reduced character set for better performance
  
  // Effect character definitions
  const LIGHTNING_CHARS = ['💥']
  
  // Camera configuration for first person mode
  const CAMERA_CONFIG = {
    // Camera view presets
    ANGLES: [
      { position: new Vector3(0, 1.3, -2.1), lookAhead: 14, name: "FIRST PERSON" }, // First person view
      { position: new Vector3(0, 1.8, 2), lookAhead: 8, name: "OVER SHOULDER" },   // Over shoulder view
      { position: new Vector3(0, 2.5, 4), lookAhead: 5, name: "CHASE" }            // Chase camera
    ],
    DEFAULT_ANGLE: 0,   // Default to first person
    DAMPING: 1,      // Camera movement smoothing
    TRANSITION_SPEED: 2 // How fast camera transitions between positions
  }
  
  // Secure random number generator (alternative to Math.random which is blocked in SES)
  const secureRandom = {
    // Seed value
    _seed: Date.now() % 2147483647,
    
    // LCG parameters - common values for a basic PRNG
    _a: 16807,       // multiplier
    _c: 0,           // increment
    _m: 2147483647,  // modulus (2^31 - 1)
    
    // Get next pseudorandom value between 0 and 1
    value() {
      this._seed = (this._a * this._seed + this._c) % this._m
      return this._seed / this._m
    },
    
    // Get random value in range [min, max)
    range(min, max) {
      return min + this.value() * (max - min)
    },
    
    // Random integer in range [min, max]
    int(min, max) {
      return Math.floor(this.range(min, max + 1))
    },
    
    // Reset seed based on current time
    resetSeed() {
      // Use current timestamp as new seed
      this._seed = (Date.now() % this._m) || 1 // Ensure seed is never 0
    }
  }
  
  // Reset the seed initially
  secureRandom.resetSeed()
  
  const initialPosition = app.position.toArray()
  const initialQuaternion = app.quaternion.toArray()
  
  if (world.isClient) {
    let control = null
    let lastUseTime = 0 // Used for weapon use cooldown
    let pendingUse = null // Track pending weapon use
    const player = world.getPlayer()
    const action = app.create('action', {
      active: false,
      label: `Equip ${app.config.weaponName || 'V4-P0R1Z3R'}`,
      onTrigger: e => {
        action.active = false
        
        app.send('request', player.id)
      },
    })
    app.add(action)
    const state = app.state
    if (!state.playerId) {
      action.active = true
    }
    
    // First person camera variables
    let inFirstPersonMode = false
    let currentCameraPosition = new Vector3()
    let currentCameraAngle = CAMERA_CONFIG.DEFAULT_ANGLE
    
    // Health status UI
    let healthUI = null
    let healthText = null
    let damageOverlay
    
    // Create a hit marker UI for the shooter
    let hitMarker;
    let hitMarkerVisible = false;
    let hitMarkerTimeout;
    
    if (world.isClient) {
      // We don't need the health UI so these are removed
      
      // Create the weapon stats UI using our new function
      createWeaponStatsUI();
      
      // Damage overlay for visual feedback when hit
      damageOverlay = app.create('ui')
      damageOverlay.width = 400
      damageOverlay.height = 300
      damageOverlay.backgroundColor = 'rgba(255, 0, 0, 0.0)'  // Start transparent
      damageOverlay.position.set(0, 0, -0.5)  // Position slightly in front of camera
      damageOverlay.billboard = 'full'
      damageOverlay.active = false  // Start inactive
      app.add(damageOverlay)
      
      // Create hit marker UI (centered crosshair that appears when hitting players)
      hitMarker = app.create('ui');
      hitMarker.width = 40;
      hitMarker.height = 40;
      hitMarker.backgroundColor = 'transparent';
      hitMarker.position.set(0, 0, -0.5); // Positioned in front of camera
      hitMarker.pivot = 'center';
      hitMarker.billboard = 'full';
      hitMarker.justifyContent = 'center';
      hitMarker.alignItems = 'center';
      
      // Hit marker text (X symbol)
      const hitMarkerText = app.create('uitext');
      hitMarkerText.value = '✕'; // X symbol for hit marker
      hitMarkerText.fontSize = 24;
      hitMarkerText.color = '#ff3300'; // Red hit marker
      hitMarker.add(hitMarkerText);
      
      // Add to app but keep hidden initially
      hitMarker.active = false;
      app.add(hitMarker);
      
      // Function to show hit marker
      function showHitMarker(isCritical = false) {
        // Clear any existing timeout
        if (hitMarkerTimeout) {
          clearTimeout(hitMarkerTimeout);
        }
        
        // Update color based on critical hit
        const hitMarkerText = hitMarker.children[0];
        if (hitMarkerText) {
          hitMarkerText.color = isCritical ? '#ffff00' : '#ff3300'; // Yellow for crits, red for normal
          hitMarkerText.fontSize = isCritical ? 32 : 24; // Bigger for crits
        }
        
        // Show the hit marker with animation
        hitMarker.active = true;
        hitMarkerVisible = true;
        
        // Animation effect - start slightly larger and shrink to normal
        hitMarker.scale.set(1.5, 1.5, 1.5);
        
        // Animate back to normal size
        const startTime = Date.now();
        const animateDuration = 150; // 150ms animation
        
        function animateHitMarker() {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / animateDuration, 1);
          const scale = 1.5 - (0.5 * progress); // Scale from 1.5 to 1.0
          
          hitMarker.scale.set(scale, scale, scale);
          
          if (progress < 1 && hitMarkerVisible) {
            // Continue animation
            requestAnimationFrame(animateHitMarker);
          }
        }
        
        // Start animation
        animateHitMarker();
        
        // Hide after a short delay
        const timerId = 'hitMarker' + Date.now();
        createTimer(timerId, 200, () => {
          hitMarker.active = false;
          hitMarkerVisible = false;
          // Reset scale when hidden
          hitMarker.scale.set(1, 1, 1);
        }); // Show for 200ms
      }
      
      // Listen for hit confirmation events
      app.on('hitConfirm', (data) => {
        // Show hit marker when we hit someone
        if (data && data.hit) {
          showHitMarker(data.critical);
          
          // Play hit sound effect
          const hitSound = {
            url: data.critical ? 'sounds/crit_hit.mp3' : 'sounds/hit.mp3',
            volume: 0.5,
            spatial: false
          };
          
          try {
            app.audio.play(hitSound);
          } catch (e) {
            console.log('Could not play hit sound:', e);
          }
        }
      });
    }
    
    // Helper function to play the weapon animation
    function playWeaponAnimation() {
      // Get the local player
      if (!world.isClient) return;
      const player = world.getPlayer();
      if (!player) return;
      
      // Check if emote URL exists
      const emoteUrl = app.config.emote?.url;
      console.log('Emote URL:', emoteUrl);
      
      if (!emoteUrl) {
        console.warn('No emote URL configured for weapon animation');
        return;
      }
      
      // Simple, direct approach - this is what worked before
      try {
        // Apply the animation effect
        player.applyEffect({
          emote: emoteUrl,
          duration: WEAPON_ANIMATION_DURATION,
          turn: true,
          cancellable: false
        });
        console.log('Applied animation to player');
      } catch (error) {
        console.error('Error applying animation:', error);
      }
    }
    
    // Update the control handlers to use this function
    function setupControls() {
      if (!control) return;
      
      // Configure mouse input depending on fire mode
      if (fireMode === 'auto') {
        // FULL AUTO MODE
        // Initial fire on press
        control.mouseLeft.onPress = () => {
          isFireButtonDown = true;
          useWeapon(); // Fire immediately
          playWeaponAnimation();
        };
        
        // Track when mouse button is released
        control.mouseLeft.onRelease = () => {
          isFireButtonDown = false;
        };
      } else {
        // SEMI AUTO MODE
        // Fire only on press
        control.mouseLeft.onPress = () => {
          useWeapon();
          playWeaponAnimation();
        };
        
        // Reset button state on release
        control.mouseLeft.onRelease = () => {
          isFireButtonDown = false;
        };
      }
    }
    
    // Function to enter first person mode
    function enterFirstPersonMode() {
      if (inFirstPersonMode) return
      
      if (!control || !player) {
        console.error('Cannot enter first person mode: missing control or player')
        return
      }
      
      // Release current control and request a new one with camera write access
      control.release()
      control = app.control()
      
      if (!control) {
        console.error('Failed to get control for first person mode')
        return
      }
      
      inFirstPersonMode = true
      updateControlsText() // Update controls text to reflect mode change
      
      // Configure control for first person mode
      control.mouseLeft.capture = true
      control.keyC.capture = true  // Toggle camera view
      control.keyQ.capture = true  // Exit first person view
      control.keyF.capture = true  // Toggle weapon stats display
      control.camera.write = true  // Enable camera control
      
      // Initialize camera position based on current preset
      const preset = CAMERA_CONFIG.ANGLES[currentCameraAngle]
      currentCameraPosition = player.position.clone().add(
        preset.position.clone().applyQuaternion(player.quaternion)
      )
      control.camera.position.copy(currentCameraPosition)
      
      // Set up controls
      setupControls()
      
      // Start updating the camera
      app.on('update', updateFirstPersonView)
      
      // Create a function to update the controls text when view mode changes
      updateControlsText()
    }
    
    // Function to exit first person mode
    function exitFirstPersonMode() {
      if (!inFirstPersonMode) return
      
      app.off('update', updateFirstPersonView)
      
      // Reset firing state when changing view modes
      isFireButtonDown = false;
      
      // Release the control
      if (control) {
        control.release()
        control = app.control() // Get a new control without camera override
        
        if (control) {
          // Set up controls for firing in third person
          setupControls()
        }
      }
      
      inFirstPersonMode = false
      
      // Create a function to update the controls text when view mode changes
      updateControlsText()
    }
    
    // Update function for first person view
    function updateFirstPersonView(delta) {
      if (!inFirstPersonMode || !control) return
      
      // Check for exit request
      if (control.keyQ.pressed) {
        exitFirstPersonMode()
        return
      }
      
      // Camera view switching
      if (control.keyC.pressed) {
        currentCameraAngle = (currentCameraAngle + 1) % CAMERA_CONFIG.ANGLES.length
      }
      
      // Calculate target camera position based on current preset
      const preset = CAMERA_CONFIG.ANGLES[currentCameraAngle]
      const targetPosition = player.position.clone().add(
        preset.position.clone().applyQuaternion(player.quaternion)
      )
      
      // Smoothly move camera to target position
      currentCameraPosition.lerp(targetPosition, CAMERA_CONFIG.DAMPING)
      control.camera.position.copy(currentCameraPosition)
      
      // Calculate look target ahead of player
      const lookAtPosition = player.position.clone().add(
        new Vector3(0, 0, -preset.lookAhead).applyQuaternion(player.quaternion)
      )
      
      // Point camera at look target
      const lookDirection = lookAtPosition.clone().sub(currentCameraPosition).normalize()
      control.camera.quaternion.setFromRotationMatrix(
        new Matrix4().lookAt(
          new Vector3(0, 0, 0),
          lookDirection,
          new Vector3(0, 1, 0)
        )
      )
  
      // In the update function, add this code to ensure the hit marker stays with the camera
      if (hitMarker && hitMarkerVisible) {
        // Position the hit marker in front of the camera
        const camera = world.camera;
        if (camera) {
          hitMarker.position.set(0, 0, -0.5);
          hitMarker.quaternion.copy(camera.quaternion);
        }
      }
      
      // Update aim indicator position in third-person mode
      updateAimIndicator();
    }
    
    // Create a function to update the aim indicator
    function updateAimIndicator() {
      // Only show the aim indicator in third-person mode
      if (inFirstPersonMode || !control || !control.mousePosition) {
        if (aimIndicator) {
          aimIndicator.active = false;
        }
        return;
      }
      
      // Create the aim indicator if it doesn't exist
      if (!aimIndicator) {
        aimIndicator = app.create('ui');
        aimIndicator.width = 10;
        aimIndicator.height = 10;
        aimIndicator.borderRadius = 5; // Make it circular
        aimIndicator.backgroundColor = '#00ffaa';
        aimIndicator.position.set(0, 0, -1);
        aimIndicator.pivot = 'center';
        aimIndicator.billboard = 'full';
        app.add(aimIndicator);
      }
      
      // Make the indicator visible
      aimIndicator.active = true;
      
      // Calculate the aim ray from the camera through the mouse position
      try {
        const ray = control.camera.screenPointToRay(
          control.mousePosition.x || 0,
          control.mousePosition.y || 0
        );
        
        // Cast a ray to find where it intersects with objects
        const hit = world.raycast(
          ray.origin,
          ray.direction,
          100, // Max distance
          null // No layer mask
        );
        
        if (hit) {
          // Position the indicator at the hit point
          aimIndicator.position.copy(hit.point);
          // Make it a bit bigger when it hits something
          aimIndicator.width = 12;
          aimIndicator.height = 12;
          aimIndicator.backgroundColor = '#ff3300'; // Red for hits
        } else {
          // Position the indicator at a distance in the ray direction
          const aimPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(20));
          aimIndicator.position.copy(aimPoint);
          // Default size and color when not hitting anything
          aimIndicator.width = 10;
          aimIndicator.height = 10;
          aimIndicator.backgroundColor = '#00ffaa'; // Green when not hitting
        }
      } catch (err) {
        // Hide the indicator if there's an error
        aimIndicator.active = false;
      }
    }
    
    app.on('playerId', playerId => {
      state.playerId = playerId
      action.active = !playerId
      
      // Reset firing state when player state changes
      isFireButtonDown = false;
      lastUseTime = 0;
      
      if (player.id === playerId) {
        // Initialize controls for weapon use
        control = app.control()
        
        // Initialize fire mode based on config with explicit default
        fireMode = app.config.defaultFireMode || 'auto'
        
        if (control) {
          // Add weapon use control (left mouse click and hold)
          setupControls()
          
          // Add C key for toggling first person mode
          control.keyC.onPress = () => {
            if (inFirstPersonMode) {
              exitFirstPersonMode()
            } else {
              enterFirstPersonMode()
            }
          }
          
          // Add F key for toggling weapon stats display
          control.keyF.onPress = () => {
            statsVisible = !statsVisible
            
            if (weaponStatsUI) {
              weaponStatsUI.active = statsVisible
            }
          }
          
          // Add V key for toggling fire mode
          control.keyV.capture = true
          control.keyV.onPress = () => {
            // Toggle between auto and semi
            fireMode = fireMode === 'auto' ? 'semi' : 'auto'
            
            // Show fire mode change banner
            showFireModeBanner(fireMode)
            
            // Update controls text
            updateControlsText()
            
            // Update control behavior based on new fire mode
            setupControls()
            
            // Emit event for UI updates
            app.emit('fireMode:change', { mode: fireMode })
          }
          
          // Start updating the aim indicator
          app.on('update', updateAimIndicator);
        }
      } else {
        if (inFirstPersonMode) {
          exitFirstPersonMode()
        }
        
        if (control) {
          control.release()
          control = null
        }
        
        // Reset firing state
        isFireButtonDown = false;
        
        // Remove aim indicator update
        app.off('update', updateAimIndicator);
        
        // Hide aim indicator
        if (aimIndicator) {
          aimIndicator.active = false;
        }
      }
      
      if (!playerId) {
        app.position.fromArray(initialPosition)
        app.quaternion.fromArray(initialQuaternion)
      }
    })
    
    // Helper function for using the weapon
    function useWeapon() {
      // Basic timestamp calculation 
      const now = Date.now();
      const currentTime = now / 1000;
      
      // Use the global fire rate constant
      const fireRateDelay = FIRE_RATE;
      
      // Only log first shot
      if (!lastUseTime) {
        console.log(`Weapon initialized: fire rate ${fireRateDelay}s, mode: ${fireMode}`);
      }
      
      // Check firing rate with protective code
      if (lastUseTime && (currentTime - lastUseTime < fireRateDelay)) {
        // Still on cooldown
        return;
      }
      
      // Update cooldown timestamp
      lastUseTime = currentTime;
      
      // Skip complex operations if no player or control
      if (!player || !control) {
        return;
      }
      
      // Play weapon animation for first shot and occasionally during auto fire
      if (fireMode === 'auto') {
        // In auto mode, only play animation occasionally to avoid animation spam
        if (!lastUseTime || Math.random() < 0.3) { // 30% chance during auto fire
          playWeaponAnimation();
        }
      }
      
      // Advanced direction calculation using mouse cursor in 3rd person
      let forward;
      
      try {
        // Get direction based on the current view mode
        if (inFirstPersonMode) {
          // In first person mode, use exact camera direction
          forward = new Vector3(0, 0, -1).applyQuaternion(control.camera.quaternion);
        } else if (control && control.mousePosition && control.camera) {
          // In third person mode, use the actual aim direction from mouse cursor
          try {
            // Cast a ray from camera through mouse cursor position
            const ray = control.camera.screenPointToRay(
              control.mousePosition.x || 0, 
              control.mousePosition.y || 0
            );
            forward = ray.direction;
          } catch (err) {
            // Fallback to player direction if ray calculation fails
            forward = new Vector3(0, 0, -1).applyQuaternion(player.quaternion);
          }
        } else {
          // Fallback if no control or missing properties
          forward = new Vector3(0, 0, -1).applyQuaternion(player.quaternion);
        }
        
        // Ensure forward is normalized
        forward.normalize();
        
        // Get the barrel mesh if it exists
        const barrel = app.get('Barrel');
        let spawnPosition;
        
        if (barrel) {
          try {
            // Create a vector to store the position
            const barrelPosition = new Vector3();
            // Get barrel position in world space
            if (typeof barrel.getWorldPosition === 'function') {
              barrel.getWorldPosition(barrelPosition);
            } else {
              // Fallback if getWorldPosition isn't available
              barrelPosition.copy(barrel.position);
              // If barrel is a child of another object, we need to transform its position
              if (barrel.parent) {
                barrelPosition.applyMatrix4(barrel.parent.matrixWorld);
              }
            }
            spawnPosition = barrelPosition.toArray();
          } catch (err) {
            console.error("Error getting barrel position:", err);
            // Fallback to player position on error
            spawnPosition = player.position.toArray();
          }
        } else {
          // Fallback to player position
          spawnPosition = player.position.toArray();
        }
        
        // Send minimal data to server for projectile creation
        const weaponData = [
          spawnPosition,
          [forward.x, forward.y, forward.z]
        ];
        
        // Send weapon use event to server
        app.send('weapon:use', weaponData);
        
        return true; // Return success flag
      } catch (err) {
        console.error("Error in weapon use:", err);
        return false; // Return failure flag
      }
    }
    
    app.on('update', (delta) => {
      // Update the particle system
      particleSystem.update(delta);
      
      // Update timers for auto-hiding UI elements
      updateTimers(delta);
      
      // Handle auto-fire when in auto mode and fire button is held
      if (fireMode === 'auto' && isFireButtonDown && control) {
        const currentTime = Date.now() / 1000;
        
        // Check if enough time has passed since last shot according to fire rate
        if (currentTime - lastUseTime >= FIRE_RATE) {
          useWeapon();
        }
      }
      
      // Check for pending weapon use
      if (pendingUse) {
        const currentTime = Date.now() / 1000
        if (currentTime - pendingUse.startTime >= WEAPON_USE_DELAY) {
          // Get the correct forward vector based on the mode
          let forward
          
          if (inFirstPersonMode && control) {
            // In first person mode, use exact camera direction
            forward = new Vector3(0, 0, -1).applyQuaternion(control.camera.quaternion)
          } else if (control && control.mousePosition && control.camera) {
            // In third person mode, use the actual aim direction
            try {
              const ray = control.camera.screenPointToRay(
                control.mousePosition.x || 0, 
                control.mousePosition.y || 0
              )
              forward = ray.direction
            } catch (err) {
              // Fallback to player direction if ray calculation fails
              forward = new Vector3(0, 0, -1).applyQuaternion(player.quaternion)
            }
          } else {
            // Fallback if no control or missing properties
            forward = new Vector3(0, 0, -1).applyQuaternion(player.quaternion)
          }
          
          // Ensure forward is normalized
          forward.normalize()
          
          // Get the barrel mesh if it exists
          const barrel = app.get('Barrel');
          let spawnPosition;
          
          if (barrel) {
            try {
              // Create a vector to store the position
              const barrelPosition = new Vector3();
              // Get barrel position in world space
              if (typeof barrel.getWorldPosition === 'function') {
                barrel.getWorldPosition(barrelPosition);
              } else {
                // Fallback if getWorldPosition isn't available
                barrelPosition.copy(barrel.position);
                // If barrel is a child of another object, we need to transform its position
                if (barrel.parent) {
                  barrelPosition.applyMatrix4(barrel.parent.matrixWorld);
                }
              }
              spawnPosition = barrelPosition.toArray();
            } catch (err) {
              console.error("Error getting barrel position:", err);
              // Fallback to player position on error
              spawnPosition = player.position.toArray();
            }
          } else {
            // Fallback to player position
            spawnPosition = player.position.toArray();
          }
          
          // Send weapon use event to server
          app.send('weapon:use', [spawnPosition, forward.toArray()])
          
          // Clear pending use
          pendingUse = null
        }
      }
    })
    
    // Listen for damage events 
    app.on('player:damaged', ({amount}) => {
      // Flash the damage overlay for visual feedback
      if (damageOverlay) {
        // Set initial opacity based on damage amount (capped at 0.8)
        const opacity = Math.min(amount / 100, 0.8)
        damageOverlay.backgroundColor = `rgba(255, 0, 0, ${opacity})`
        damageOverlay.active = true
        
        // Add screen shake effect proportional to damage
        if (control && control.camera) {
          const shakeIntensity = Math.min(amount / 10, 0.3); // Cap at 0.3
          const shakeDuration = 0.4; // seconds
          
          // Apply screenshake
          let shakeTime = 0;
          const shakeOrigin = control.camera.position.clone();
          
          const shakeHandler = (delta) => {
            shakeTime += delta;
            
            if (shakeTime >= shakeDuration) {
              // Reset camera position and remove handler
              control.camera.position.copy(shakeOrigin);
              app.off('update', shakeHandler);
              return;
            }
            
            // Calculate shake falloff - more intense at start, fading out
            const shakeProgress = shakeTime / shakeDuration;
            const shakeFalloff = 1 - shakeProgress;
            
            // Apply random offset to camera
            control.camera.position.set(
              shakeOrigin.x + (Math.random() * 2 - 1) * shakeIntensity * shakeFalloff,
              shakeOrigin.y + (Math.random() * 2 - 1) * shakeIntensity * shakeFalloff,
              shakeOrigin.z + (Math.random() * 2 - 1) * shakeIntensity * shakeFalloff
            );
          };
          
          // Start the screen shake
          app.on('update', shakeHandler);
        }
        
        // Fade it out over time
        let duration = 0
        const fadeTime = 0.5 // Half a second fade
        
        const fadeHandler = (delta) => {
          duration += delta
          if (duration >= fadeTime) {
            // Remove when done
            damageOverlay.active = false
            app.off('update', fadeHandler)
            return
          }
          
          // Calculate fade progress
          const progress = duration / fadeTime
          const remaining = 1 - progress
          damageOverlay.backgroundColor = `rgba(255, 0, 0, ${opacity * remaining})`
        }
        
        // Start the fade effect
        app.on('update', fadeHandler)
      }
    })
    
    // Listen for hit confirmations
    app.on('hitConfirm', ({message}) => {
      // Show hit confirmation message
      if (message && healthUI) {
        const hitText = app.create('uitext')
        hitText.value = message
        hitText.fontSize = 16
        hitText.color = '#ffff00' // Yellow for hit confirmation
        hitText.position.set(0, 0.1, 0)
        
        // Create temporary UI for hit message
        const hitUI = app.create('ui')
        hitUI.width = 300
        hitUI.height = 40
        hitUI.padding = 8
        hitUI.backgroundColor = 'rgba(0, 0, 0, 0.7)'
        hitUI.borderRadius = 5
        hitUI.position.set(0, 1.3, 0) // Below health bar
        hitUI.pivot = 'top-center'
        hitUI.billboard = 'full'
        hitUI.justifyContent = 'center'
        hitUI.alignItems = 'center'
        hitUI.add(hitText)
        app.add(hitUI)
        
        // Remove after a few seconds
        let duration = 0
        const removeTime = 3 // Show for 3 seconds
        
        const removeHandler = (delta) => {
          duration += delta
          if (duration >= removeTime) {
            app.remove(hitUI)
            app.off('update', removeHandler)
            return
          }
          
          // Fade out in the last second
          if (duration > removeTime - 1) {
            const fadeProgress = (duration - (removeTime - 1))
            hitUI.backgroundColor = `rgba(0, 0, 0, ${0.7 * (1 - fadeProgress)})`
            hitText.color = `rgba(255, 255, 0, ${1 - fadeProgress})`
          }
        }
        
        // Start the remove timer
        app.on('update', removeHandler)
      }
    })
    
    app.on('lateUpdate', delta => {
      if (!state.playerId) return
      const player = world.getPlayer(state.playerId)
      const matrix = player.getBoneTransform('rightHand')
      if (matrix) {
        app.position.setFromMatrixPosition(matrix)
        app.quaternion.setFromRotationMatrix(matrix)
      }
      
      // Handle releasing weapon with Q when not in first person mode
      if (control && control.keyQ.pressed && !inFirstPersonMode) {
        isFireButtonDown = false; // Make sure to reset firing state
        app.send('release', player.id)
      }
    })
    
    // Creates an energy impact effect at the hit location
    function createLegacyImpactEffect(position, velocity) {
      // Create a small flash at impact point
      const flash = app.create('anchor')
      flash.visible = true
      flash.position.set(position[0], position[1], position[2])
      
      const flashUI = app.create('ui')
      flashUI.width = 30
      flashUI.height = 30
      flashUI.billboard = 'full'
      flashUI.size = IMPACT_SCALE * 2
      flashUI.backgroundColor = 'transparent'
      flash.add(flashUI)
      
      const flashText = app.create('uitext')
      flashText.value = '✺'
      flashText.color = app.config.lightningColor || '#ff0000'
      flashText.fontSize = 30
      flashText.textAlign = 'center'
      flashUI.add(flashText)
      
      // Pre-calculate lifetime values for performance
      const flashMaxLifetime = IMPACT_LIFETIME * 0.3
      
      // Animate central flash
      const updateFlash = (delta) => {
        flash.lifetime = (flash.lifetime || 0) + delta
        if (flash.lifetime >= flashMaxLifetime) {
          world.remove(flash)
          app.off('update', updateFlash)
          return
        }
        const progress = flash.lifetime / flashMaxLifetime
        flashText.opacity = (1 - progress) * (0.8 + 0.2 * Math.sin(progress * 20))
        flashUI.size = IMPACT_SCALE * 2 * (1 - progress * 0.5)
      }
      app.on('update', updateFlash)
  
      // Create particle pool
      const impactParticles = []
      let updateParticlesHandler = null
      
      // Create spreading particles
      for (let i = 0; i < IMPACT_PARTICLES; i++) {
        const particle = app.create('anchor')
        particle.visible = true
        particle.position.set(position[0], position[1], position[2])
        
        // Create UI element
        const particleUI = app.create('ui')
        particleUI.width = 20
        particleUI.height = 20
        particleUI.pivot = 'center'
        particleUI.billboard = 'full'
        particleUI.backgroundColor = 'transparent'
        particle.add(particleUI)
        
        // Add text
        const particleText = app.create('uitext')
        particleText.value = '✧' // Using a star character for sparkles
        particleText.fontSize = 12
        particleText.color = app.config.lightningColor || '#ff0000'
        particleUI.add(particleText)
        
        // Calculate random velocity
        const theta = Math.random() * Math.PI * 2 // Around a circle
        const phi = Math.random() * Math.PI // From center line
        const speed = IMPACT_SPEED_MIN + Math.random() * (IMPACT_SPEED_MAX - IMPACT_SPEED_MIN)
        
        // Convert spherical to cartesian coordinates with random spread
        const vx = Math.sin(phi) * Math.cos(theta)
        const vy = Math.cos(phi) // Upward bias
        const vz = Math.sin(phi) * Math.sin(theta)
        
        // Add to list
        impactParticles.push({
          anchor: particle,
          velocity: { x: vx * speed, y: vy * speed, z: vz * speed },
          lifetime: 0
        })
        
        // Add to world
        world.add(particle)
      }
      
      // Update particles
      updateParticlesHandler = (delta) => {
        let activeParticles = 0
        
        for (let i = 0; i < impactParticles.length; i++) {
          const particleObj = impactParticles[i]
          if (!particleObj || !particleObj.anchor) continue
          
          // Update lifetime
          particleObj.lifetime += delta
          if (particleObj.lifetime >= IMPACT_LIFETIME) {
            // Remove expired particle
            world.remove(particleObj.anchor)
            // Mark as inactive
            particleObj.anchor = null
            continue
          }
          
          // Update position
          const anchor = particleObj.anchor
          const vel = particleObj.velocity
          
          // Apply velocity
          anchor.position.x += vel.x * delta
          anchor.position.y += vel.y * delta
          anchor.position.z += vel.z * delta
          
          // Apply gravity
          vel.y -= 9.8 * delta
          
          // Fade out based on lifetime
          const progress = particleObj.lifetime / IMPACT_LIFETIME
          
          // Get the text element
          const ui = anchor.children[0]
          if (ui && ui.children.length > 0) {
            const text = ui.children[0]
            text.opacity = 1 - progress
          }
          
          activeParticles++
        }
        
        // If no active particles remain, clean up
        if (activeParticles === 0) {
          app.off('update', updateParticlesHandler)
          // Force cleanup any remaining particles
          impactParticles.forEach(particleObj => {
            if (particleObj && particleObj.anchor) {
              world.remove(particleObj.anchor)
            }
          })
          // Clear the array
          impactParticles.length = 0
        }
      }
      
      app.on('update', updateParticlesHandler)
    }
  
    // Creates lightning particle effects at the specified position
    function createLightningEffect(position, direction) {
      console.log('Creating lightning effect at:', position, 'direction:', direction);
      
      // Calculate muzzle flash spawn position with offsets
      const muzzleUp = new Vector3(0, 1, 0)
      const muzzleDir = new Vector3(direction[0], direction[1], direction[2]).normalize()
      const muzzleRight = new Vector3().crossVectors(muzzleDir, muzzleUp).normalize()
      
      // Improved positioning for muzzle effects - place them more directly in front of the character
      const muzzlePosition = [
        position[0] + (muzzleDir.x * MUZZLE_FLASH_OFFSET_FORWARD),
        position[1] + (muzzleDir.y * MUZZLE_FLASH_OFFSET_FORWARD) + MUZZLE_FLASH_OFFSET_UP,
        position[2] + (muzzleDir.z * MUZZLE_FLASH_OFFSET_FORWARD)
      ]
      
      console.log('Muzzle position calculated:', muzzlePosition);
  
      // Muzzle flash effect
      for (let i = 0; i < MUZZLE_FLASH_COUNT; i++) {
        const flash = app.create('anchor')
        flash.visible = true
        flash.position.set(muzzlePosition[0], muzzlePosition[1], muzzlePosition[2])
        
        const flashUI = app.create('ui')
        flashUI.width = 40
        flashUI.height = 40
        flashUI.billboard = 'full'
        flashUI.size = MUZZLE_FLASH_SCALE * 2
        flashUI.backgroundColor = 'transparent'
        flash.add(flashUI)
        
        const flashText = app.create('uitext')
        flashText.value = LIGHTNING_CHARS[i % LIGHTNING_CHARS.length]
        flashText.color = app.config.lightningColor || '#ff0000'
        flashText.fontSize = 40
        flashText.textAlign = 'center'
        flashUI.add(flashText)
        
        // Add a glow effect
        const glowUI = app.create('ui')
        glowUI.width = 50
        glowUI.height = 50
        glowUI.billboard = 'full'
        glowUI.size = MUZZLE_FLASH_SCALE * 2.5
        glowUI.backgroundColor = 'transparent'
        flash.add(glowUI)
        
        const glowText = app.create('uitext')
        glowText.value = 
        glowText.color = app.config.lightningColor || '#ff0000'
        glowText.opacity = 0.5
        glowText.fontSize = 0
        glowText.textAlign = 'center'
        glowUI.add(glowText)
        
        // Spread particles in a circle around firing direction
        const angle = (i / MUZZLE_FLASH_COUNT) * Math.PI * 2
        flash.velocity = new Vector3(
          Math.cos(angle) * MUZZLE_FLASH_SPREAD,
          Math.sin(angle) * MUZZLE_FLASH_SPREAD,
          0
        )
        
        flash.lifetime = 0
        world.add(flash)
        
        const updateFlash = (delta) => {
          flash.position.x += flash.velocity.x * delta
          flash.position.y += flash.velocity.y * delta
          
          flash.lifetime += delta
          if (flash.lifetime >= MUZZLE_FLASH_LIFETIME) {
            world.remove(flash)
            app.off('update', updateFlash)
            flash.velocity = null
          } else {
            const progress = flash.lifetime / MUZZLE_FLASH_LIFETIME
            flashText.opacity = 1 - progress
            flashUI.size = MUZZLE_FLASH_SCALE * (1 - progress)
          }
        }
        
        app.on('update', updateFlash)
      }
  
      // Use constant values for spawn offsets for the lightning beam
      const forwardOffset = LIGHTNING_SPAWN_OFFSET_FORWARD
      const upOffset = LIGHTNING_SPAWN_OFFSET_UP
      const rightOffset = LIGHTNING_SPAWN_OFFSET_RIGHT
      
      // Calculate right vector from direction
      const up = new Vector3(0, 1, 0)
      const dir = new Vector3(direction[0], direction[1], direction[2]).normalize()
      const right = new Vector3().crossVectors(dir, up).normalize()
      
      // Calculate spawn position with all offsets
      const spawnPosition = [
        position[0] + (direction[0] * forwardOffset) + (right.x * rightOffset),
        position[1] + (direction[1] * forwardOffset) + up.y * upOffset,
        position[2] + (direction[2] * forwardOffset) + (right.z * rightOffset)
      ]
      
      // Reset random seed for better variety
      secureRandom.resetSeed()
      
      // Generate velocity from direction - make it stronger and more focused
      const baseSpeed = LIGHTNING_PARTICLE_SPEED_MIN
      const baseVelocity = [
        direction[0] * baseSpeed,
        direction[1] * baseSpeed,
        direction[2] * baseSpeed
      ]
      
      // Optimize lightning beam effect
      const particle = app.create('anchor')
      particle.visible = true
      particle.position.set(spawnPosition[0], spawnPosition[1], spawnPosition[2])
      
      const particleUI = app.create('ui')
      particleUI.width = 40
      particleUI.height = 40
      particleUI.billboard = 'full'
      particleUI.size = LIGHTNING_SCALE_MAX * 2
      particleUI.backgroundColor = 'transparent'
      particle.add(particleUI)
      
      const particleText = app.create('uitext')
      particleText.value = LIGHTNING_CHARS[0]
      particleText.color = app.config.lightningColor || '#ff0000'
      particleText.fontSize = 40
      particleText.textAlign = 'center'
      particleUI.add(particleText)
      
      // Add a glow effect
      const glowUI = app.create('ui')
      glowUI.width = 50
      glowUI.height = 50
      glowUI.billboard = 'full'
      glowUI.size = LIGHTNING_SCALE_MAX * 2.5
      glowUI.backgroundColor = 'transparent'
      particle.add(glowUI)
      
      const glowText = app.create('uitext')
      glowText.value = 
      glowText.color = app.config.lightningColor || '#ff0000'
      glowText.opacity = 0.5
      glowText.fontSize = 0
      glowText.textAlign = 'center'
      glowUI.add(glowText)
      
      particle.velocity = new Vector3(
        baseVelocity[0],
        baseVelocity[1],
        baseVelocity[2]
      )
      
      particle.lifetime = 0
      world.add(particle)
      
      const updateParticle = (delta) => {
        particle.position.x += particle.velocity.x * delta
        particle.position.y += particle.velocity.y * delta
        particle.position.z += particle.velocity.z * delta
        
        particle.lifetime += delta
        if (particle.lifetime >= LIGHTNING_LIFETIME) {
          world.remove(particle)
          app.off('update', updateParticle)
          particle.velocity = null
          return
        }
        const progress = particle.lifetime / LIGHTNING_LIFETIME
        particleText.opacity = (1 - progress) * (0.8 + 0.2 * Math.sin(progress * 20))
      }
      
      app.on('update', updateParticle)
      
      // Play the laser sound from the weapon origin
      playLightningSound(position)
    }
    
    // Track last hit timestamps for damage cooldown
    const playerHitTimestamps = new Map()
    
    // Track last damage timestamps for health regeneration
    const playerDamageTimestamps = new Map()
    
    // Health regeneration system on server
    if (world.isServer) {
      let lastRegenTime = 0
      
      app.on('update', delta => {
        const currentTime = world.getTimestamp()
        
        // Check if health regen is enabled in config
        if (!app.config.enableHealthRegen) return;
        
        // Check for health regeneration every HEALTH_REGEN_INTERVAL seconds
        if (currentTime - lastRegenTime >= HEALTH_REGEN_INTERVAL) {
          lastRegenTime = currentTime
          
          // Process all players in the world
          world.players.forEach(player => {
            // Skip at full health
            if (player.health >= 100) return
            
            // Check if enough time has passed since last damage
            const lastDamageTime = playerDamageTimestamps.get(player.id) || 0
            if (currentTime - lastDamageTime >= HEALTH_REGEN_DELAY) {
              // Regenerate health
              player.heal(HEALTH_REGEN_AMOUNT)
            }
          })
        }
      })
    }
    
    // Safer, more direct weapon effect creation without complex calculations
    app.on('weapon:effect', (data) => {
      try {
        if (!data || !Array.isArray(data)) {
          console.error('Invalid weapon:effect data received');
          return;
        }
        
        const [positionArray, directionArray, hitPosition, impactVelocity] = data;
        
        // Create lightning effect with minimal processing
        if (positionArray && directionArray) {
          // Use the particle system
          particleSystem.createParticleEmitter(
            positionArray,
            directionArray,
            5, // Number of particles
            {
              character: '⚡',
              lifetime: 0.5, 
              speed: 20,
              size: 0.05,
              color: app.config.lightningColor || '#00ffee',
              spread: 0.05, // Keep tight spread for beam effect
              imageUrl: app.config.muzzleFlashImage?.url // Use custom muzzle flash image if available
            }
          );
          
          // Play the lightning sound
          playLightningSound(positionArray);
        }
        
        // Create impact effect if hit
        if (hitPosition) {
          // Use the particle system for impact
          particleSystem.createParticleEmitter(
            hitPosition,
            [0, 1, 0], // Upward direction
            15, // More particles for impact
            {
              character: '✺',
              lifetime: 0.8,
              speed: 3,
              size: 0.04,
              color: app.config.impactColor || '#ff6600',
              spread: 1.0, // Wide spread for explosion effect
              gravity: 2.0, // More gravity for impact particles
              imageUrl: app.config.impactImage?.url // Use custom impact image if available
            }
          );
        }
      } catch (e) {
        console.error('Error in weapon:effect handler:', e);
      }
    });
    
    // Handle weapon use on server
    app.on('weapon:use', (data, sender) => {
      // Validate the data structure
      if (!data || !Array.isArray(data) || data.length < 2) {
        console.error('Invalid weapon:use data received:', data);
        return;
      }
      
      const [positionArray, forwardArray] = data
      
      // Validate position and direction arrays
      if (!Array.isArray(positionArray) || positionArray.length !== 3) {
        console.error('Invalid position array:', positionArray);
        return;
      }
      
      if (!Array.isArray(forwardArray) || forwardArray.length !== 3) {
        console.error('Invalid forward array:', forwardArray);
        return;
      }
      
      const senderPlayer = world.getPlayer(sender)
      const currentTime = world.getTimestamp()
      
      // Create vectors once for reuse
      const position = new Vector3(positionArray[0], positionArray[1], positionArray[2])
      const direction = new Vector3(forwardArray[0], forwardArray[1], forwardArray[2]).normalize()
      
      // Log direction for debugging
      if (sender && senderPlayer) {
        console.log(`Player ${senderPlayer.name} fired with direction [${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)}]`);
      }
      
      // Add a small offset to prevent self-intersection (like sentrylaser does)
      const OFFSET_DISTANCE = 0.001
      const rayOrigin = position.clone().add(direction.clone().multiplyScalar(OFFSET_DISTANCE))
      
      // First check for hits using raycasting with mask set to null (matches sentrylaser.js approach)
      let hit = null;
      try {
        // Use raycasting to detect hits - this will follow the exact aim direction
        hit = world.raycast(
          rayOrigin,
          direction,
          WEAPON_MAX_DISTANCE,
          null // Use null mask to match sentrylaser.js
        );
      } catch (error) {
        console.error("Error during raycast:", error);
      }
  
      if (hit) {
        // Calculate impact velocity based on forward direction
        const impactVelocity = [
          forwardArray[0] * LIGHTNING_PARTICLE_SPEED_MIN,
          forwardArray[1] * LIGHTNING_PARTICLE_SPEED_MIN,
          forwardArray[2] * LIGHTNING_PARTICLE_SPEED_MIN
        ]
        
        // Broadcast effect with impact position
        app.send('weapon:effect', [positionArray, forwardArray, hit.point.toArray(), impactVelocity])
        
        // Check if we hit a player (using hit.playerId like sentrylaser does)
        if (hit.playerId) {
          // Get the hit player
          const hitPlayerId = hit.playerId
          const hitPlayer = world.getPlayer(hitPlayerId)
          
          // Don't damage yourself
          if (hitPlayerId !== sender && hitPlayer) {
            // Check for cooldown
            const lastHitTime = playerHitTimestamps.get(hitPlayerId) || 0
            if (currentTime - lastHitTime >= WEAPON_COOLDOWN) {
              // Set cooldown
              playerHitTimestamps.set(hitPlayerId, currentTime)
              
              // Calculate damage based on hit location (simple headshot check)
              let damage = WEAPON_DAMAGE
              
              // Simple headshot detection by y-coordinate relative to player position
              // This is approximate - could be improved with proper collision meshes
              const headShotThreshold = 1.7 // Approximate head height
              const hitHeight = hit.point.y - hitPlayer.position.y
              
              if (hitHeight >= headShotThreshold) {
                // Headshot - apply damage multiplier
                damage *= WEAPON_HEADSHOT_MULTIPLIER
                // Announce headshot
                world.chat(`⚡ HEADSHOT! ${senderPlayer?.name || 'Someone'} zapped ${hitPlayer.name}!`)
              }
              
              // Apply damage to the hit player
              hitPlayer.damage(damage)
              
              // Track last damage time for health regeneration
              playerDamageTimestamps.set(hitPlayerId, currentTime)
              
              // Send damage event to the hit player for client-side feedback
              app.send('player:damaged', { amount: damage }, hitPlayerId)
              
              // Emit damage event for PvpCore to show floating damage numbers
              const isCritical = hitHeight >= headShotThreshold;
              world.emit('hyperfy:dmg', { 
                playerId: hitPlayerId, 
                amount: Math.round(damage), 
                crit: isCritical 
              });
              
              // Send hit confirmation to the shooter with critical hit info
              app.send('hitConfirm', { 
                message: isCritical ? `CRITICAL HIT on ${hitPlayer.name}!` : `Hit ${hitPlayer.name}!`,
                hit: true,
                critical: isCritical,
                damage: Math.round(damage)
              }, sender);
              
              // Check if the player was killed
              if (hitPlayer.health <= 0) {
                // Announce the kill in chat
                const attackerName = senderPlayer?.name || 'Unknown';
                const victimName = hitPlayer.name;
                
                // Create kill message with Wasteland style
                const killMessages = [
                  `${attackerName} turned ${victimName} into atoms.`,
                  `${attackerName} made ${victimName} meet their maker.`,
                  `${attackerName} sent ${victimName} to the great vault in the sky.`,
                  `${victimName} was vaporized by ${attackerName}'s energy weapon.`,
                  `${attackerName} critically hit ${victimName} for a fatal blow.`
                ];
                
                // Select a random message
                const killMessage = killMessages[Math.floor(Math.random() * killMessages.length)];
                
                // Announce in chat
                world.chat(`☢️ ${killMessage}`);
                
                // Send kill confirmation to the attacker
                app.send('hitConfirm', { 
                  message: `You eliminated ${victimName}!`,
                  hit: true,
                  critical: isCritical,
                  damage: Math.round(damage),
                  kill: true
                }, sender);
              } else if (hitPlayer.health <= 25) {
                // Send a message to the attacker that the target is low on health
                app.send('hitConfirm', { 
                  message: `${hitPlayer.name} is critically injured!`,
                  hit: true,
                  critical: isCritical,
                  damage: Math.round(damage),
                  lowHealth: true
                }, sender);
              }
            }
          }
        }
      } else {
        // No hit, just show the beam effect
        app.send('weapon:effect', [positionArray, forwardArray]);
      }
    });
  }
  
  if (world.isServer) {
    const state = app.state;
    state.playerId = null;
    app.on('request', playerId => {
      if (state.playerId) return;
      state.playerId = playerId;
      app.send('playerId', playerId);
    });
    app.on('release', playerId => {
      console.log(state.playerId, playerId);
      if (state.playerId !== playerId) return;
      state.playerId = null;
      app.send('playerId', null);
    });
    world.on('leave', e => {
      const player = world.getPlayer(e.playerId);
      if (player && state.playerId === player.id) {
        state.playerId = null;
        app.send('playerId', null);
      }
    });
  }
  
  // Cleanup function
  app.on('cleanup', () => {
    console.log('=== WEAPON SYSTEM CLEANUP ===');
    
    if (world.isClient) {
      // Unsubscribe from input and interaction events
      app.off('input', handleInput);
      app.off('interact', handleInteraction);
      app.off('update', updateFirstPersonView);
      app.off('update', updateAimIndicator);
      
      // Remove aim indicator
      if (aimIndicator) {
        try {
          app.remove(aimIndicator);
          aimIndicator = null;
        } catch (e) {}
      }
      
      // Remove the weapon model
      if (weaponModel) {
        try {
          app.remove(weaponModel);
        } catch (e) {}
      }
    }
    
    // Stop weapon use timers
    clearInterval(autoFireInterval);
    
    // Clean up any remaining particles
    particleSystem.clear();
    
    // Clean up the projectile map
    for (const [id, projectile] of projectileObjects.entries()) {
      try {
        if (projectile && projectile.mesh) {
          world.remove(projectile.mesh);
        }
      } catch (e) {
        console.error(`Error cleaning up projectile ${id}:`, e);
      }
    }
    projectileObjects.clear();
    
    console.log('Weapon system cleanup complete');
  });
  
  // PROJECTILE SYSTEM
  // Configuration for projectiles similar to PlaneFlight.js
  const PROJECTILE_CONFIG = {
    // Projectile behavior
    SPEED: 150,             // Projectile velocity
    LIFETIME: 2.0,          // How long projectiles exist before despawning
    SCALE: 0.18,            // Size of projectiles
    FIRE_RATE: app.config.fireRate || 0.1,  // Delay between shots (use config value)
    SEND_RATE: 1/15,        // Network update frequency
    SPAWN_OFFSET: 3,        // How far in front of the player to spawn projectiles
    HEIGHT_OFFSET: 0.5,     // How much to raise the projectile from player center
    IMPACT_RADIUS: 2.0,     // Radius of impact effect
  
    // Visual appearance
    COLOR: 0x00ffee,        // Bright cyan for energy weapon (hex color)
    COLOR_STRING: '#00ffee', // Same color as string format
    PROJECTILE_CHAR: app.config.projectileChar || '•',   // Character for projectile UI from config or default
    IMPACT_COLOR_STRING: '#ff6600', // Color for impact particles
    PROJECTILE_IMAGE: app.config.projectileImage?.url, // Custom projectile image URL
    MUZZLE_IMAGE: app.config.muzzleFlashImage?.url,   // Custom muzzle flash image URL
    IMPACT_IMAGE: app.config.impactImage?.url,        // Custom impact image URL

    // Particle system settings
    IMPACT_PARTICLES: 12,    // Number of particles in impact
    IMPACT_LIFETIME: 0.8,    // Lifetime of impact particles
    IMPACT_SPEED_MIN: 2.0,   // Minimum speed of impact particles
    IMPACT_SPEED_MAX: 6.0,   // Maximum speed of impact particles
    PARTICLE_CHARS: ['✺', '•', '✧', '⁕'], // Characters to use for particles
  };
  
  // Map to track active projectiles (server-side)
  const projectiles = new Map();
  let nextProjectileId = 0;
  let lastProjectileUpdate = 0;
  
  if (world.isServer) {
    // Process weapon use by converting it to projectile fire
    app.on('weapon:use', (data, sender) => {
      console.log('=== WEAPON USE EVENT RECEIVED ===');
      console.log('Raw data:', JSON.stringify(data));
      console.log('Sender:', sender);
      
      // Validate data
      if (!data || !Array.isArray(data) || data.length < 2) {
        console.error('Invalid weapon:use data received:', data);
        return;
      }
      
      const [positionArray, forwardArray] = data;
      const senderPlayer = world.getPlayer(sender);
      
      if (!senderPlayer) {
        console.error('Player not found for sender:', sender);
        return;
      }
      
      // Get the current timestamp for cooldown tracking
      const currentTime = world.getTimestamp();
      
      // Prepare origin position and direction
      const position = new Vector3(positionArray[0], positionArray[1], positionArray[2]);
      const direction = new Vector3(forwardArray[0], forwardArray[1], forwardArray[2]).normalize();
      
      console.log(`Firing projectile from: [${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}]`);
      console.log(`Direction: [${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)}]`);
      
      // Use the position directly as spawn position since it's coming from the barrel
      const spawnX = position.x;
      const spawnY = position.y;
      const spawnZ = position.z;
      
      // Create a unique ID for this projectile
      const id = nextProjectileId++;
      
      // Create the projectile object with position and velocity
      const projectile = {
        id,
        position: new Vector3(spawnX, spawnY, spawnZ),
        velocity: new Vector3(
          direction.x * PROJECTILE_CONFIG.SPEED,
          direction.y * PROJECTILE_CONFIG.SPEED,
          direction.z * PROJECTILE_CONFIG.SPEED
        ),
        timeAlive: 0,
        owner: sender // Track who fired this projectile
      };
      
      // Store the projectile in our map
      projectiles.set(id, projectile);
      
      // Broadcast to all clients to spawn the projectile visually
      app.send('projectile:spawn', [id, [spawnX, spawnY, spawnZ], PROJECTILE_CONFIG.SCALE]);
      
      console.log(`Projectile ${id} created and broadcast to clients`);
    });
    
    // Main projectile update loop - runs every frame
    app.on('update', (delta) => {
      // Skip if no projectiles
      if (projectiles.size === 0) return;
      
      lastProjectileUpdate += delta;
      
      // Update each active projectile
      for (const [id, projectile] of projectiles.entries()) {
        // Apply velocity to position
        projectile.position.x += projectile.velocity.x * delta;
        projectile.position.y += projectile.velocity.y * delta;
        projectile.position.z += projectile.velocity.z * delta;
        
        // Check for collisions using raycasting
        const direction = projectile.velocity.clone().normalize();
        
        // Add a small offset to prevent self-intersection (like sentrylaser does)
        const OFFSET_DISTANCE = 0.001;
        const rayOrigin = projectile.position.clone().add(direction.clone().multiplyScalar(OFFSET_DISTANCE));
        
        // Use raycast with same approach as sentrylaser
        const hit = world.raycast(
          rayOrigin, 
          direction, 
          PROJECTILE_CONFIG.SPEED * delta,
          null // Use null mask to match sentrylaser.js
        );
        
        if (hit) {
          // Handle the hit
          projectiles.delete(id);
          
          // Broadcast the hit to all clients
          app.send('projectile:hit', [id, hit.point.toArray(), projectile.velocity.toArray()]);
          
          // If we hit a player, apply damage (using hit.playerId like sentrylaser)
          if (hit.playerId) {
            const hitPlayerId = hit.playerId;
            const hitPlayer = world.getPlayer(hitPlayerId);
            
            // Don't damage yourself
            if (hitPlayerId !== projectile.owner && hitPlayer) {
              const currentTime = world.getTimestamp();
              
              // Check for cooldown
              const lastHitTime = playerHitTimestamps.get(hitPlayerId) || 0;
              if (currentTime - lastHitTime >= WEAPON_COOLDOWN) {
                // Set cooldown
                playerHitTimestamps.set(hitPlayerId, currentTime);
                
                // Calculate damage based on hit location (simple headshot check)
                let damage = WEAPON_DAMAGE;
                
                // Simple headshot detection by y-coordinate relative to player position
                const headShotThreshold = 1.7; // Approximate head height
                const hitHeight = hit.point.y - hitPlayer.position.y;
                
                if (hitHeight >= headShotThreshold) {
                  // Headshot - apply damage multiplier
                  damage *= WEAPON_HEADSHOT_MULTIPLIER;
                  
                  // Announce headshot
                  const shooterPlayer = world.getPlayer(projectile.owner);
                  const shooterName = shooterPlayer ? shooterPlayer.name : 'Someone';
                  world.chat(`⚡ HEADSHOT! ${shooterName} zapped ${hitPlayer.name}!`);
                }
                
                // Apply damage to the hit player
                hitPlayer.damage(damage);
                
                // Track last damage time for health regeneration
                playerDamageTimestamps.set(hitPlayerId, currentTime);
                
                // Send damage event to the hit player for client-side feedback
                app.send('player:damaged', { amount: damage }, hitPlayerId);
                
                // Emit damage event for floating damage numbers
                const isCritical = hitHeight >= headShotThreshold;
                world.emit('hyperfy:dmg', { 
                  playerId: hitPlayerId, 
                  amount: Math.round(damage), 
                  crit: isCritical 
                });
                
                // Send hit confirmation to the shooter with critical hit info
                app.send('hitConfirm', { 
                  message: isCritical ? `CRITICAL HIT on ${hitPlayer.name}!` : `Hit ${hitPlayer.name}!`,
                  hit: true,
                  critical: isCritical,
                  damage: Math.round(damage)
                }, projectile.owner);
                
                // Check if the player was killed
                if (hitPlayer.health <= 0) {
                  // Announce the kill in chat
                  const shooterPlayer = world.getPlayer(projectile.owner);
                  const attackerName = shooterPlayer ? shooterPlayer.name : 'Unknown';
                  const victimName = hitPlayer.name;
                  
                  // Create kill message with Wasteland style
                  const killMessages = [
                    `${attackerName} turned ${victimName} into atoms.`,
                    `${attackerName} made ${victimName} meet their maker.`,
                    `${attackerName} sent ${victimName} to the great vault in the sky.`,
                    `${victimName} was vaporized by ${attackerName}'s energy weapon.`,
                    `${attackerName} critically hit ${victimName} for a fatal blow.`
                  ];
                  
                  // Select a random message
                  const killMessage = killMessages[Math.floor(Math.random() * killMessages.length)];
                  
                  // Announce in chat
                  world.chat(`☢️ ${killMessage}`);
                  
                  // Send kill confirmation to the attacker
                  app.send('hitConfirm', { 
                    message: `You eliminated ${victimName}!`,
                    hit: true,
                    critical: isCritical,
                    damage: Math.round(damage),
                    kill: true
                  }, projectile.owner);
                } else if (hitPlayer.health <= 25) {
                  // Send a message to the attacker that the target is low on health
                  app.send('hitConfirm', { 
                    message: `${hitPlayer.name} is critically injured!`,
                    hit: true,
                    critical: isCritical,
                    damage: Math.round(damage),
                    lowHealth: true
                  }, projectile.owner);
                }
              }
            }
          }
          continue;
        }
        
        // Remove expired projectiles
        projectile.timeAlive += delta;
        if (projectile.timeAlive >= PROJECTILE_CONFIG.LIFETIME) {
          projectiles.delete(id);
          app.send('projectile:cleanup', [id]);
          continue;
        }
      }
      
      // Broadcast position updates at configured rate
      if (lastProjectileUpdate >= PROJECTILE_CONFIG.SEND_RATE) {
        lastProjectileUpdate = 0;
        
        // Send batch updates
        const updates = [];
        for (const projectile of projectiles.values()) {
          updates.push([
            projectile.id,
            projectile.position.toArray()
          ]);
        }
        
        if (updates.length > 0) {
          app.send('projectile:positions', updates);
        }
      }
    });
  }
  
  // CLIENT-SIDE PROJECTILE EFFECTS
  if (world.isClient) {
    // Map to track client-side projectile objects
    const projectileObjects = new Map();
    
    // Log readiness
    console.log("Projectile system initialized with empty projectile map");
    
    // Handle projectile spawning
    app.on('projectile:spawn', (data) => {
      const [id, positionArray, scale] = data;
      console.log(`Spawning projectile ${id} at [${positionArray[0].toFixed(2)}, ${positionArray[1].toFixed(2)}, ${positionArray[2].toFixed(2)}]`);
      
      try {
        // Create a projectile using the new particle system
        const projectile = particleSystem.emitParticle(
          positionArray,
          [0, 0, 0], // Direction will be applied from velocity updates
          {
            character: PROJECTILE_CONFIG.PROJECTILE_CHAR,
            lifetime: PROJECTILE_CONFIG.LIFETIME,
            speed: 0.1, // Low initial speed, will be updated with velocity
            size: scale || 0.18,
            color: PROJECTILE_CONFIG.COLOR_STRING,
            spread: 0, // No spread for main projectile
            imageUrl: app.config.projectileImage?.url // Use custom projectile image if available
          }
        );
        
        // Store in our map
        projectileObjects.set(id, projectile);
        
        // Play fire sound
        playLightningSound(positionArray);
      } catch (e) {
        console.error('Error spawning projectile:', e);
      }
    });
    
    // Handle projectile position updates
    app.on('projectile:positions', (updates) => {
      for (const [id, positionArray] of updates) {
        const projectile = projectileObjects.get(id);
        if (projectile && projectile.mesh) {
          projectile.mesh.position.set(positionArray[0], positionArray[1], positionArray[2]);
          projectile.position = positionArray;
        }
      }
    });
    
    // Handle projectile hits
    app.on('projectile:hit', (data) => {
      if (!data || !Array.isArray(data) || data.length < 2) {
        console.error('Invalid projectile hit data received');
        return;
      }
      
      const [id, positionArray, velocityArray] = data;
      
      // Safety check for position and velocity
      if (!positionArray || !Array.isArray(positionArray) || positionArray.length < 3) {
        console.error('Invalid position array in projectile hit');
        return;
      }
      
      // Play hit sound
      try {
        const soundEffect = app.create('audio');
        soundEffect.src = app.config.impactSound?.url || 'sounds/impact.mp3';
        const impactVolume = (app.config.soundVolume || 7.0) / 10.0;
        soundEffect.volume = impactVolume;
        soundEffect.spatial = true;
        soundEffect.group = 'sfx';
        soundEffect.position.set(positionArray[0], positionArray[1], positionArray[2]);
        world.add(soundEffect);
        try {
          soundEffect.play();
        } catch (e) {
          console.warn('Failed to play impact sound:', e);
        }
        
        // Auto-cleanup
        const impactSoundTimerId = 'impactSound' + Date.now();
        createTimer(impactSoundTimerId, 2000, () => {
          try {
            world.remove(soundEffect);
          } catch (e) {}
        });
      } catch (e) {
        console.error('Error playing hit sound:', e);
      }
      
      // Create impact effect with fallback for velocity
      const velocity = velocityArray && Array.isArray(velocityArray) && velocityArray.length >= 3 
        ? velocityArray 
        : [0, 1, 0]; // Default upward direction if no velocity
      
      createImpactEffect(positionArray, velocity);
      
      // Remove the projectile
      const projectile = projectileObjects.get(id);
      if (projectile) {
        particleSystem.recycleParticle(projectile);
        projectileObjects.delete(id);
      }
    });
    
    // Handle projectile cleanup (timeout/expiration)
    app.on('projectile:cleanup', (data) => {
      const [id] = data;
      console.log(`Cleaning up expired projectile ${id}`);
      
      // Remove the projectile object
      const projectile = projectileObjects.get(id);
      if (projectile) {
        try {
          world.remove(projectile);
          projectileObjects.delete(id);
          console.log(`Removed expired projectile ${id} from world`);
        } catch (e) {
          console.error(`Error removing expired projectile ${id}:`, e);
          projectileObjects.delete(id); // Still remove from map
        }
      } else {
        console.warn(`Expired projectile ${id} not found in projectileObjects map`);
      }
    });
    
    // Create enhanced impact effect function
    function createLegacyImpactEffect(position, velocity) {
      console.log('Creating impact effect at', position);
      
      // Create a simple pseudo-random number generator
      let seed = Date.now() % 2147483647;
      function randomFloat() {
        // Simple LCG (Linear Congruential Generator)
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      }
      
      // Helper function for randomization with power curve
      function randomNum(min, max, pow = 1) {
        const r = randomFloat();
        const powR = Math.pow(r, pow);
        return min + powR * (max - min);
      }
      
      // Create multiple particles for the impact
      for (let i = 0; i < PROJECTILE_CONFIG.IMPACT_PARTICLES; i++) {
        // Select a random particle character
        const randomIndex = Math.floor(randomFloat() * PROJECTILE_CONFIG.PARTICLE_CHARS.length);
        const particleChar = PROJECTILE_CONFIG.PARTICLE_CHARS[randomIndex];
        
        // Create parent anchor for positioning
        const particle = app.create('anchor');
        particle.visible = true;
        particle.position.set(position[0], position[1], position[2]);
        
        // Create UI container
        const particleUI = app.create('ui');
        particleUI.width = 20;
        particleUI.height = 20;
        particleUI.billboard = 'full';
        particleUI.backgroundColor = 'transparent';
        particle.add(particleUI);
        
        // Add text for the particle
        const particleText = app.create('uitext');
        particleText.value = particleChar;
        particleText.color = PROJECTILE_CONFIG.IMPACT_COLOR_STRING || '#ff6600';
        particleText.fontSize = 20;
        particleUI.add(particleText);
        
        // Get speed values with fallbacks
        const minSpeed = PROJECTILE_CONFIG.IMPACT_SPEED_MIN || 2.0;
        const maxSpeed = PROJECTILE_CONFIG.IMPACT_SPEED_MAX || 6.0;
        
        // Calculate random velocity for the particle
        const speed = minSpeed + randomNum(0, 1, 2) * (maxSpeed - minSpeed);
        
        // Random direction in a cone
        const theta = randomNum(0, 1, 1) * Math.PI * 2; // Random angle around circle
        const phi = randomNum(0, 1, 2) * Math.PI * 0.5; // Random angle from center
        
        // Create 3D vector from spherical coordinates
        const vx = Math.sin(phi) * Math.cos(theta);
        const vy = Math.sin(phi) * Math.sin(theta);
        const vz = Math.cos(phi);
        
        // Add a bit of the original projectile velocity
        const particleVel = {
          x: vx * speed + velocity[0] * 0.2,
          y: vy * speed + velocity[1] * 0.2,
          z: vz * speed + velocity[2] * 0.2
        };
        
        // Track particle state for animation
        const particleObj = {
          anchor: particle,
          velocity: particleVel,
          lifetime: 0
        };
        
        // Add to particles array for tracking
        if (typeof particles !== 'undefined' && Array.isArray(particles)) {
          particles.push(particleObj);
        } else {
          console.error('particles array is not defined');
        }
        
        // Add to world
        world.add(particle);
      }
      
      // Play impact sound
      playLightningSound(position);
    }
  }
  
  // Handle particle updates on the client side
  if (world.isClient) {
    // Update particles in every frame
    app.on('update', (delta) => {
      // Skip if no particles
      if (!particles || particles.length === 0) return;
      
      // Update each particle
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        
        // Skip invalid particles
        if (!particle || !particle.anchor) {
          // Remove invalid entries
          particles.splice(i, 1);
          continue;
        }
        
        // Update position based on velocity
        if (particle.anchor) {
          particle.anchor.position.x += particle.velocity.x * delta;
          particle.anchor.position.y += particle.velocity.y * delta;
          particle.anchor.position.z += particle.velocity.z * delta;
          
          // Apply pseudo-gravity
          particle.velocity.y -= 9.8 * delta; // Earth gravity
        }
        
        // Update lifetime
        particle.lifetime += delta;
        
        // Check if particle should be removed
        if (particle.lifetime >= PROJECTILE_CONFIG.IMPACT_LIFETIME) {
          // Remove from world
          if (particle.anchor) {
            try {
              world.remove(particle.anchor);
              console.log('Removed particle due to lifetime expiration');
            } catch (e) {
              console.error('Error removing particle:', e);
            }
            // Clear reference
            particle.anchor = null;
          }
          
          // Remove from array
          particles.splice(i, 1);
          continue;
        }
        
        // Fade out based on lifetime
        if (particle.anchor) {
          const progress = particle.lifetime / PROJECTILE_CONFIG.IMPACT_LIFETIME;
          
          // Find the particle UI text
          if (particle.anchor.children && 
              particle.anchor.children.length > 0 && 
              particle.anchor.children[0].children && 
              particle.anchor.children[0].children.length > 0) {
            const text = particle.anchor.children[0].children[0];
            
            // Apply opacity based on lifetime (1.0 -> 0.0)
            const opacity = 1.0 - progress;
            text.opacity = opacity;
            
            // Optionally shrink as it fades
            const scale = 1.0 - (progress * 0.5);
            particle.anchor.scale.set(scale, scale, scale);
          }
        }
      }
      
      // Automatic emergency cleanup if too many particles
      if (particles.length > 500) {
        console.warn(`Emergency cleanup: ${particles.length} particles is too many, removing oldest`);
        // Remove the oldest 200 particles
        const toRemove = particles.splice(0, 200);
        toRemove.forEach(p => {
          if (p && p.anchor) {
            try {
              world.remove(p.anchor);
            } catch (e) {
              // Ignore errors during emergency cleanup
            }
          }
        });
      }
    });
    
    // Cleanup all particles on world cleanup
    app.on('cleanup', () => {
      if (particles && particles.length > 0) {
        console.log(`Cleaning up ${particles.length} remaining particles`);
        particles.forEach(p => {
          if (p && p.anchor) {
            try {
              world.remove(p.anchor);
            } catch (e) {
              // Ignore errors during cleanup
            }
          }
        });
        particles.length = 0;
      }
    });
  }
  
  // Create enhanced impact effect function for projectile system
  function createProjectileImpactEffect(position, velocity) {
    // Safety check for parameters
    if (!position || !Array.isArray(position) || position.length < 3) {
      console.error('Invalid position for impact effect:', position);
      return;
    }
    
    if (!velocity || !Array.isArray(velocity) || velocity.length < 3) {
      console.error('Invalid velocity for impact effect:', velocity);
      return;
    }
    
    // Create a simple pseudo-random number generator
    let seed = Date.now() % 2147483647;
    function randomFloat() {
      // Simple LCG (Linear Congruential Generator)
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    
    // Helper function for randomization with power curve
    function randomNum(min, max, pow = 1) {
      const r = randomFloat();
      const powR = Math.pow(r, pow);
      return min + powR * (max - min);
    }
    
    // Ensure PARTICLE_CHARS exists, otherwise use defaults
    const particleChars = PROJECTILE_CONFIG.PARTICLE_CHARS || ['✺', '•', '✧', '⁕'];
    
    // Create multiple particles for the impact
    const numParticles = PROJECTILE_CONFIG.IMPACT_PARTICLES || 8;
    for (let i = 0; i < numParticles; i++) {
      // Select a random particle character
      const randomIndex = Math.floor(randomFloat() * particleChars.length);
      const particleChar = particleChars[randomIndex];
      
      // Create parent anchor for positioning
      const particle = app.create('anchor');
      particle.visible = true;
      particle.position.set(position[0], position[1], position[2]);
      
      // Create UI container
      const particleUI = app.create('ui');
      particleUI.width = 20;
      particleUI.height = 20;
      particleUI.billboard = 'full';
      particleUI.backgroundColor = 'transparent';
      particle.add(particleUI);
      
      // Add text for the particle
      const particleText = app.create('uitext');
      particleText.value = particleChar;
      particleText.color = PROJECTILE_CONFIG.IMPACT_COLOR_STRING || '#ff6600';
      particleText.fontSize = 20;
      particleUI.add(particleText);
      
      // Get speed values with fallbacks
      const minSpeed = PROJECTILE_CONFIG.IMPACT_SPEED_MIN || 2.0;
      const maxSpeed = PROJECTILE_CONFIG.IMPACT_SPEED_MAX || 6.0;
      
      // Calculate random velocity for the particle
      const speed = minSpeed + randomNum(0, 1, 2) * (maxSpeed - minSpeed);
      
      // Random direction in a cone
      const theta = randomNum(0, 1, 1) * Math.PI * 2; // Random angle around circle
      const phi = randomNum(0, 1, 2) * Math.PI * 0.5; // Random angle from center
      
      // Create 3D vector from spherical coordinates
      const vx = Math.sin(phi) * Math.cos(theta);
      const vy = Math.sin(phi) * Math.sin(theta);
      const vz = Math.cos(phi);
      
      // Add a bit of the original projectile velocity
      const particleVel = {
        x: vx * speed + velocity[0] * 0.2,
        y: vy * speed + velocity[1] * 0.2,
        z: vz * speed + velocity[2] * 0.2
      };
      
      // Track particle state for animation
      const particleObj = {
        anchor: particle,
        velocity: particleVel,
        lifetime: 0
      };
      
      // Add to particles array for tracking
      if (typeof particles !== 'undefined' && Array.isArray(particles)) {
        particles.push(particleObj);
      } else {
        console.error('particles array is not defined');
      }
      
      // Add to world
      world.add(particle);
    }
    
    // Play impact sound
    playLightningSound(position);
  }
  
  // Unified impact effect function that chooses the appropriate implementation
  function createImpactEffect(position, velocity) {
    // Use projectile system's implementation
    createProjectileImpactEffect(position, velocity);
  }
  
  // Add timer management variables at the top of the file (after imports/declarations)
  let timers = {};
  
  // Timer utility functions
  function createTimer(id, duration, callback) {
    timers[id] = {
      remaining: duration,
      callback: callback,
      active: true
    };
    return id;
  }
  
  function removeTimer(id) {
    if (timers[id]) {
      delete timers[id];
    }
  }
  
  function updateTimers(delta) {
    Object.keys(timers).forEach(id => {
      const timer = timers[id];
      if (timer.active) {
        timer.remaining -= delta * 1000; // Convert delta to ms
        if (timer.remaining <= 0) {
          timer.active = false;
          timer.callback();
          removeTimer(id);
        }
      }
    });
  }
  
  // Add the timer update function to your main update function
  function update(delta) {
    // Update all active timers
    updateTimers(delta);
    
    // Update first-person view if active
    if (isFirstPersonMode) {
      updateFirstPersonView(delta);
    }
  }
  
  // Function to update the controls text when view mode changes
  function updateControlsText() {
    if (controlsText) {
      controlsText.value = `[LMB] FIRE ${fireMode === 'auto' ? '(AUTO)' : '(SEMI)'} [C] ${inFirstPersonMode ? '3RD' : '1ST'} PERS [F] STATS [V] MODE`;
    }
  }
  
  // Find the app initialization section and add initialization of the UI
  app.on('init', () => {
    console.log('=== WEAPON SYSTEM INIT ===');
    
    // Initialize UI elements early
    initializeUI();
    
    // Log startup message
    console.log('Weapon system initialized - V4-P0R1Z3R ready to fire!');
  });
  
  // Create a new function to handle UI initialization
  function initializeUI() {
    console.log('Initializing weapon system UI elements');
    
    // Create weapon stats UI
    createWeaponStatsUI();
    
    // ... any other UI initialization
  }
  
  // Move weapon stats UI creation to a separate function
  function createWeaponStatsUI() {
    if (weaponStatsUI) return; // Already created
    
    // Weapon stats display (PIP-BOY style)
    weaponStatsUI = app.create('ui') // Use the global variable
    weaponStatsUI.width = 200
    weaponStatsUI.height = 120
    weaponStatsUI.backgroundColor = 'rgba(0, 15, 30, 0.7)'
    weaponStatsUI.borderRadius = 5
    weaponStatsUI.padding = 12
    weaponStatsUI.position.set(-0.3, 2, .2)
    weaponStatsUI.pivot = 'top-right'
    weaponStatsUI.billboard = 'full'
    weaponStatsUI.flexDirection = 'column'
    weaponStatsUI.justifyContent = 'flex-start'
    weaponStatsUI.alignItems = 'flex-start'
    weaponStatsUI.gap = 6
    
    // Weapon name
    const weaponNameText = app.create('uitext')
    weaponNameText.value = app.config.weaponName || 'V4-P0R1Z3R'
    weaponNameText.fontSize = 16
    weaponNameText.fontWeight = 'bold'
    weaponNameText.color = '#00ffaa'
    weaponStatsUI.add(weaponNameText)
    
    // Damage stat
    const damageText = app.create('uitext')
    damageText.value = `DMG: ${WEAPON_DAMAGE} (x${WEAPON_HEADSHOT_MULTIPLIER} HS)`
    damageText.fontSize = 14
    damageText.color = '#00ffaa'
    weaponStatsUI.add(damageText)
    
    // Range stat
    const rangeText = app.create('uitext')
    rangeText.value = `RNG: ${WEAPON_MAX_DISTANCE}m`
    rangeText.fontSize = 14
    rangeText.color = '#00ffaa'
    weaponStatsUI.add(rangeText)
    
    // Fire rate stat
    const fireRateText = app.create('uitext')
    fireRateText.value = `ROF: ${(1 / FIRE_RATE).toFixed(1)}/sec`
    fireRateText.fontSize = 14
    fireRateText.color = '#00ffaa'
    weaponStatsUI.add(fireRateText)
    
    // Fire mode stat
    const fireModeText = app.create('uitext')
    fireModeText.value = `MODE: ${fireMode === 'auto' ? 'FULL-AUTO' : 'SEMI-AUTO'}`
    fireModeText.fontSize = 14
    fireModeText.color = fireMode === 'auto' ? '#ff3300' : '#00ffaa'
    weaponStatsUI.add(fireModeText)
    
    // Controls hint
    controlsText = app.create('uitext')
    controlsText.value = `[LMB] FIRE ${fireMode === 'auto' ? '(AUTO)' : '(SEMI)'} [C] ${inFirstPersonMode ? '3RD' : '1ST'} PERS [F] STATS [V] MODE`
    controlsText.fontSize = 12
    controlsText.color = '#ffff00'
    controlsText.marginTop = 8
    weaponStatsUI.add(controlsText)
    
    // Make it initially hidden
    weaponStatsUI.active = false
    app.add(weaponStatsUI)
    
    // Update fire mode text when fire mode changes
    const updateFireModeUI = () => {
      if (fireModeText) {
        fireModeText.value = `MODE: ${fireMode === 'auto' ? 'FULL-AUTO' : 'SEMI-AUTO'}`
        fireModeText.color = fireMode === 'auto' ? '#ff3300' : '#00ffaa'
      }
    }
    
    // Listen for fire mode changes
    app.on('fireMode:change', updateFireModeUI)
    
    console.log('Weapon stats UI created');
  }
  
  // Empty function that does nothing (removed physics force application)
  function applyExplosionForce(position, radius, force) {
    // Physics force application has been disabled
    // This function is kept as a placeholder to avoid breaking references
    console.log(`Impact at [${position[0]?.toFixed(2) || '?'}, ${position[1]?.toFixed(2) || '?'}, ${position[2]?.toFixed(2) || '?'}]`);
  }
  
  // Function to show a temporary banner when fire mode changes
  function showFireModeBanner(mode) {
    // Remove existing banner if present
    if (fireModeBanner) {
      try {
        app.remove(fireModeBanner);
        fireModeBanner = null;
      } catch (e) {
        console.error('Error removing existing banner:', e);
      }
    }
    
    // Create a new banner
    fireModeBanner = app.create('ui');
    fireModeBanner.width = 320;
    fireModeBanner.height = 60;
    fireModeBanner.backgroundColor = 'rgba(0, 30, 50, 0.8)';
    fireModeBanner.borderRadius = 8;
    fireModeBanner.padding = 10;
    fireModeBanner.position.set(0, 2.2, 0);
    fireModeBanner.pivot = 'top-center';
    fireModeBanner.billboard = 'full';
    fireModeBanner.justifyContent = 'center';
    fireModeBanner.alignItems = 'center';
    
    // Add text
    const modeText = app.create('uitext');
    modeText.value = `${app.config.weaponName || 'V4-P0R1Z3R'}: ${mode === 'auto' ? 'FULL-AUTO MODE' : 'SEMI-AUTO MODE'}`;
    modeText.fontSize = 18;
    modeText.fontWeight = 'bold';
    modeText.color = mode === 'auto' ? '#ff3300' : '#00ffaa';
    fireModeBanner.add(modeText);
    
    // Add description
    const descText = app.create('uitext');
    descText.value = mode === 'auto' ? 'Hold trigger for continuous fire' : 'Press trigger for each shot';
    descText.fontSize = 14;
    descText.color = '#ffffff';
    descText.marginTop = 5;
    fireModeBanner.add(descText);
    
    // Add to app
    app.add(fireModeBanner);
    
    // Simpler direct fade out method using a single update handler
    let displayDuration = 0;
    const totalDisplayTime = 2.0; // Display for 2 seconds
    const fadeDuration = 0.5; // Fade out over 0.5 seconds
    
    const fadeHandler = (delta) => {
      displayDuration += delta;
      
      // Don't start fading until we've shown the banner for enough time
      if (displayDuration < totalDisplayTime - fadeDuration) {
        return;
      }
      
      // Calculate fade progress (0 = start of fade, 1 = fully faded)
      const fadeProgress = Math.min(
        (displayDuration - (totalDisplayTime - fadeDuration)) / fadeDuration, 
        1.0
      );
      
      // Apply fade
      if (fireModeBanner) {
        // Adjust background opacity
        const bgOpacity = 0.8 * (1 - fadeProgress);
        fireModeBanner.backgroundColor = `rgba(0, 30, 50, ${bgOpacity})`;
        
        // Fade text too
        if (fireModeBanner.children) {
          fireModeBanner.children.forEach(child => {
            if (child.opacity !== undefined) {
              child.opacity = 1 - fadeProgress;
            }
          });
        }
        
        // When fully faded, remove the banner and stop the handler
        if (fadeProgress >= 1.0) {
          app.remove(fireModeBanner);
          fireModeBanner = null;
          app.off('update', fadeHandler);
        }
      } else {
        // Banner was removed elsewhere, clean up handler
        app.off('update', fadeHandler);
      }
    };
    
    // Start the fade handler
    app.on('update', fadeHandler);
    
    console.log(`Fire mode banner displayed: ${mode} mode`);
  }