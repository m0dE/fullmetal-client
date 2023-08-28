// index.js
const cryptoJs = require('crypto-js');
const { io } = require('socket.io-client');

function generateRSAKeyPair() {
  const keyPair = cryptoJs.lib.WordArray.random(32);
  return {
    publicKey: keyPair.toString(),
    privateKey: keyPair.toString(),
  };
}

class Fullmetal {
  constructor(credentials) {
    this.socket = io('http://localhost:5000');
    this.authenticate('client', credentials);
    this.secretEncryptionKey = cryptoJs.lib.WordArray.random(32); // Generate a new secret key for each session
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

  authenticate(userType, credentials) {
    this.socket.emit('authenticate', { userType, credentials });
  }
  sendPrompt(prompt) {
    // this.performKeyExchange(() => {
    //   this.socket.emit('prompt', this.encrypt(prompt));
    // });
    this.socket.emit('prompt', prompt);
  }
  onResponse(cb) {
    // this.socket.on('response', (answer) => {
    //   cb(this.decrypt(answer));
    // });
    this.socket.on('response', cb);
  }
  onError(cb) {
    this.socket.on('error', cb);
  }
}
module.exports = Fullmetal;
