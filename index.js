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
    this.restart = true;
    try {
      if (!options) {
        throw new Error('Missing Configuration: You need to provide a apikey');
      }

      if (options) {
        if (!options.apiKey) {
          throw new Error('Missing Configuration: apiKey is required');
        }
        this.socket = io(config.APIURL, {
          transports: ['websocket'],
          upgrade: false,
          path: '/socket.io/',
          forceNew: true,
          timeout: 2000,
          rejectUnauthorized: false,
          reconnection: true,
          reconnectionAttempts: 5, // Number of reconnection attempts
          reconnectionDelay: 1000, // Initial delay between reconnection attempts (in milliseconds)
          reconnectionDelayMax: 5000, // Maximum delay between reconnection attempts (in milliseconds)
          randomizationFactor: 0.5, // Randomization factor for reconnection delay
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

        this.socket.on('connect', () => {
          console.log(this.socket.id, 50);
        });

        this.socket.on('connect', (socket) => {
          this.authenticate({ userType: 'client', options });
          this.onError((error) => {
            config.rollbar.error(error);
            console.log(error);
          });
        });

        setInterval(() => {
          this.socket.emit('ping', new Date());
        }, 10000);
        this.socket.on('pong', (data) => {
          // console.log('Pong at', this.socket.id, data);
        });
        this.secretEncryptionKey = cryptoJs.lib.WordArray.random(32); // Generate a new secret key for each session
      }
      this.socket.on('close', (socket) => {
        config.rollbar.info(` ${new Date()} - Socket get closed`);
        console.log(` ${new Date()} - Socket get closed`);
        if (this.restart) {
          process.exit(1);// purposely restarting the app
        } 
      });
      this.socket.on('disconnect', (socket) => {
        config.rollbar.info(` ${new Date()} - Disconnected from API server`);
        console.log(` ${new Date()} - Disconnected from API server`);
        if (this.restart) {
          process.exit(1);// purposely restarting the app
        } 
      });
    } catch (error) {
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
    } catch (error) {
      config.rollbar.error(error);
      console.log(error);
    }
  }
  sendPrompt(prompt, refId, options) {
    try {
      console.log(this.socket.id, 23);
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

  disconnectConnection(restart) {
    try {
      this.restart = restart;
      this.socket.disconnect(restart);
    } catch (error) {
      config.rollbar.error(error);
      console.log(error);
    }
  }
}
module.exports = Fullmetal;
