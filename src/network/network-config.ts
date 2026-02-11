/**
 * Network configuration for multiplayer connections.
 */

/**
 * Server connection configuration.
 */
export const NetworkConfig = {
  /**
   * Server URL. Defaults to localhost for development.
   * In production, set this to your deployed server URL.
   */
  SERVER_URL:
    import.meta.env.VITE_SERVER_URL || 'http://localhost:3001',

  /**
   * Reconnection configuration.
   */
  RECONNECTION: {
    enabled: true,
    attempts: 5,
    delay: 1000, // ms
    delayMax: 5000, // ms
  },

  /**
   * Network update rates (Hz).
   */
  UPDATE_RATES: {
    PLAYER_STATE: 20, // Send player state 20 times per second
    INTERPOLATION_DELAY: 100, // ms - how far behind to interpolate remote players
  },
};
