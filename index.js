// index.js
const cryptoJs = require('crypto-js');
const { io } = require('socket.io-client');
const config = require('./config');

function generateRSAKeyPair() {
  const keyPair = cryptoJs.lib.WordArray.random(32);
  return {
    publicKey: keyPair.toString(),
    privateKey: keyPair.toString(),
  };
}

class Fullmetal {
  constructor(options) {
    if (!options)
      throw new Error('Missing Configuration: You need to provide a apikey');

    if (options) {
      if (!options.apiKey) {
        throw new Error('Missing Configuration: apiKey is required');
      }
      this.socket = io(config.APIURL, {
        path: '/socket.io/',
        forceNew: true,
        reconnectionAttempts: 3,
        timeout: 2000,
        rejectUnauthorized: false,
      });

      this.socket.on('connect', () => {
        console.log(this.socket.id);
      });

      this.authenticate({ userType: 'client', options });
      this.onError((error) => {
        console.log(error);
      });
      this.secretEncryptionKey = cryptoJs.lib.WordArray.random(32); // Generate a new secret key for each session
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
    this.socket.emit('authenticate', data);
  }
  sendPrompt(prompt, refId) {
    this.socket.emit('prompt', { prompt, refId });
  }
  onResponse(cb) {
    this.socket.on('response', ({ response, refId }) => {
      cb({ response, refId });
    });
  }
  onError(cb) {
    this.socket.on('error', (error) => {
      cb(error);
      throw new Error(error);
    });
  }
}
module.exports = Fullmetal;
