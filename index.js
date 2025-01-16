// index.js
const cryptoJs = require('crypto-js');
const { io } = require('socket.io-client');
const config = require('./config');

function generateRSAKeyPair() {
  try {
    const keyPair = cryptoJs.lib.WordArray.random(32);
    return {
      publicKey: keyPair.toString(),
      privateKey: keyPair.toString(),
    };
  } catch (error) {
    config.rollbar.error(error);
    console.log(error);
  }
}

class Fullmetal {
  constructor(options) {
    try {
      if (!options) {
        throw new Error('Missing Configuration: You need to provide a apikey');
      }

      if (options) {
        if (!options.apiKey) {
          throw new Error('Missing Configuration: apiKey is required');
        }
        if (!options.hasOwnProperty('doRestart')) {
          options.doRestart = true;
        }

        this.isAuthenticated = false; // Track authentication status
        this.onAuthenticatedCallback = null; // Store callback for post-authentication

        this.socket = io(config.APIURL, {
          transports: ['websocket'],
          upgrade: false,
          path: '/socket.io/',
          forceNew: true,
          timeout: 2000,
          rejectUnauthorized: false,
          reconnection: true,
          reconnectionAttempts: Infinity, // Number of reconnection attempts
          reconnectionDelay: 1000, // Initial delay between reconnection attempts (in milliseconds)
          reconnectionDelayMax: 5000, // Maximum delay between reconnection attempts (in milliseconds)
          randomizationFactor: 0.5, // Randomization factor for reconnection delay
          pingInterval: 30000, // Send ping every 30 seconds
          pingTimeout: 120000, // Wait 120 seconds for a pong
        });
        this.socket.on('reconnect', (attemptNumber) => {
          console.log(`Reconnected after ${attemptNumber} attempts`);
        });

        this.socket.on('reconnecting', (attemptNumber) => {
          console.log(`Reconnecting attempt ${attemptNumber}`);
        });

        this.socket.on('reconnect_error', (error) => {
          config.rollbar.error(error);
          console.error('Reconnection error:', error);
        });

        this.socket.on('connect_error', (err) => {
          console.log(`connect_error due to ${err}`);
          setTimeout(() => {
            this.socket.connect();
          }, 5000);
        });

        this.socket.on('connect', (socket) => {
          this.authenticate({ userType: 'client', options });
          this.onError((error) => {
            config.rollbar.error(error);
            console.log(error);
          });
          console.log(
            `*******************************************`,
            this.socket.id
          );
          console.log(
            `Connected to API server with ${this.socket.id} socketId`
          );
          console.log(`*******************************************`);
          this.isReady(true);
        });

        this.socket.on('authenticated', () => {
          console.log('Successfully authenticated');
          this.isAuthenticated = true;

          // Execute callback if provided
          if (this.onAuthenticatedCallback) {
            this.onAuthenticatedCallback();
            this.onAuthenticatedCallback = null; // Clear callback after execution
          }
        });

        setInterval(() => {
          this.socket.emit('ping', new Date());
        }, 10000);
        this.socket.on('pong', (data) => {
          // console.log('Pong at', this.socket.id, data);
        });
        this.secretEncryptionKey = cryptoJs.lib.WordArray.random(32); // Generate a new secret key for each session

        this.socket.on('close', (socket) => {
          this.isAuthenticated = false; // Reset authentication status on disconnect
          config.rollbar.info(` ${new Date()} - Client Socket get closed`);
          console.log(` ${new Date()} - Client Socket get closed`);
          if (options.restartOnDisconnect) {
            process.exit(1); // purposely restarting the app
          }
        });
        this.socket.on('disconnect', (reason) => {
          this.isAuthenticated = false; // Reset authentication status on disconnect
          config.rollbar.info(
            `${new Date()} - Client Disconnected from API server. Reason: ${reason}`
          );
          console.log(
            ` ${new Date()} - Client Disconnected from API server. Reason: ${reason}`
          );
          if (options.restartOnDisconnect) {
            process.exit(1); // purposely restarting the app
          }
        });
      }
    } catch (error) {
      this.isAuthenticated = false; // Reset authentication status on disconnect
      config.rollbar.error(error);
      console.log(error);
    }
  }

  // Client-side encryption using LucidAgent's public key
  encrypt(data) {
    if (!this.agentPublicKey) {
      throw new Error(
        'Agent public key not received. Perform key exchange first.'
      );
    }

    const encryptedData = cryptoJs.AES.encrypt(data, this.agentPublicKey, {
      mode: cryptoJs.mode.ECB,
      padding: cryptoJs.pad.NoPadding,
    }).toString();
    const encodedEncryptedData = cryptoJs.enc.Base64.stringify(
      cryptoJs.enc.Utf8.parse(encryptedData)
    );
    return encodedEncryptedData;
  }

  // Client-side decryption using own private key
  decrypt(encryptedData) {
    const decodedEncryptedData = cryptoJs.enc.Base64.parse(
      encryptedData
    ).toString(cryptoJs.enc.Utf8);
    const decipher = cryptoJs.AES.decrypt(
      decodedEncryptedData,
      this.secretEncryptionKey,
      { mode: cryptoJs.mode.ECB, padding: cryptoJs.pad.NoPadding }
    );
    const decryptedData = decipher.toString(cryptoJs.enc.Utf8);
    return decryptedData;
  }

  async performKeyExchange(cb) {
    const keyPair = generateRSAKeyPair();
    this.socket.emit('clientPublicKey', keyPair.publicKey);
    this.socket.on('agentPublicKey', (agentPublicKey) => {
      this.agentPublicKey = cryptoJs.enc.Utf8.parse(agentPublicKey);
      cb();
    });
  }
  authenticate(data) {
    try {
      this.socket.emit('authenticate', data);

      this.socket.on('authenticationFailed', (error) => {
        console.error('Authentication failed:', error);
      });
    } catch (error) {
      config.rollbar.error(error);
      console.log(error);
    }
  }

  sendPromptAfterAuthentication(prompt, refId, options) {
    if (this.isAuthenticated) {
      this.sendPrompt(prompt, refId, options);
    } else {
      console.log('Not authenticated. Waiting to send prompt...');
      this.onAuthenticatedCallback = () => {
        this.sendPrompt(prompt, refId, options);
      };
    }
  }

  sendPrompt(prompt, refId, options) {
    try {
      console.log('Sending prompt:', prompt);
      this.socket.emit('prompt', { prompt, refId, options });
    } catch (error) {
      config.rollbar.error(error);
      console.log(error);
    }
  }

  onResponse(cb) {
    try {
      this.socket.on('response', (response) => {
        cb(response);
      });
    } catch (error) {
      config.rollbar.error(error);
      console.log(error);
    }
  }
  onError(cb) {
    try {
      this.socket.on('error', (data) => {
        cb(data);
        config.rollbar.error(data);
        if (data.stopExecution) throw new Error(data.message);
      });
    } catch (error) {
      config.rollbar.error(error);
      console.log(error);
    }
  }
  onResponseQueue(cb) {
    try {
      this.socket.on('responseQueuedNumber', (data) => {
        cb(data);
      });
    } catch (error) {
      config.rollbar.error(error);
      console.log(error);
    }
  }

  disconnectConnection() {
    try {
      this.socket.disconnect();
    } catch (error) {
      config.rollbar.error(error);
      console.log(error);
    }
  }
}
module.exports = Fullmetal;
