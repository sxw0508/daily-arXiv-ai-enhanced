/**
 * Authentication Configuration
 * Frontend login: user enters a password; it is SHA-256 hashed and compared to passwordHash.
 * To change the password, set passwordHash to SHA-256(password) in hex (see project README or CI).
 */

const AUTH_CONFIG = {
    /** SHA-256 hash of the current access password (plain text not stored here). */
    passwordHash: 'cd833fb5f64c5e71116c6913ea7e8f5a12a27b8e4c6df4fe288d5dc2979b8402',

    /**
     * Session duration in milliseconds
     * Default: 7 days (604800000 ms)
     */
    sessionDuration: 7 * 24 * 60 * 60 * 1000,

    /**
     * LocalStorage key for storing authentication token
     */
    storageKey: 'arxiv_auth_token',

    /**
     * LocalStorage key for storing session expiration time
     */
    storageExpireKey: 'arxiv_auth_expire'
};
