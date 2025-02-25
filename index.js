const cryptoJs = require('crypto-js'); // Importing crypto-js for encryption and decryption
const { io } = require('socket.io-client'); // Importing socket.io-client for real-time communication
const config = require('./config'); // Importing configuration file

// Function to generate a simple RSA key pair for demonstration purposes
function generateRSAKeyPair() {
  try {
    // Generating a random key for both public and private keys
    const key = cryptoJs.lib.WordArray.random(32).toString();
    return { publicKey: key, privateKey: key };
  } catch (error) {
    logError(error); // Logging any errors that occur during key generation
  }
}

// Function to log errors to Rollbar and console
function logError(error) {
  config.rollbar.error(error); // Logging error to Rollbar
  console.error(error); // Logging error to console
}

// Fullmetal class for managing socket connections and encryption
class Fullmetal {
  constructor(options) {
    if (!options || !options.apiKey) {
      throw new Error('Missing Configuration: apiKey is required'); // Throwing error if apiKey is not provided
    }

    this.isAuthenticated = false; // Flag to check if the client is authenticated
    this.isReconnecting = false; // Flag to check if the client is reconnecting
    this.onAuthenticatedCallback = null; // Callback to be executed after authentication

    // Setting up the socket connection with the server
    this.socket = io(config.APIURL, {
      transports: ['websocket'],
      upgrade: false,
      path: '/socket.io/',
      timeout: 20000,
      rejectUnauthorized: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      pingInterval: 30000,
      pingTimeout: 90000,
    });

    // Generating a session-based secret key for encryption
    this.secretEncryptionKey = cryptoJs.lib.WordArray.random(32);
    this.setupSocketEvents(options); // Setting up socket events
  }

  // Method to set up socket events
  setupSocketEvents(options) {
    this.socket.on('connect', () => this.handleConnect(options)); // Event for socket connection
    this.socket.on('authenticated', this.handleAuthentication.bind(this)); // Event for authentication
    this.socket.on('disconnect', (reason) =>
      this.handleDisconnect(reason, options)
    ); // Event for socket disconnection
    this.socket.on('error', logError); // Event for socket errors
    this.socket.on('connect_error', this.handleConnectError.bind(this)); // Event for connection errors
    this.socket.on('reconnect_attempt', (attemptNumber) =>
      console.log(`Reconnecting attempt ${attemptNumber}...`)
    ); // Event for reconnect attempts
    this.socket.on('reconnect', (attemptNumber) =>
      this.handleReconnect(attemptNumber)
    ); // Event for successful reconnect
    this.socket.on('reconnect_error', logError); // Event for reconnect errors
  }

  // Method to handle socket connection
  handleConnect(options) {
    this.isReconnecting = false; // Resetting reconnect flag
    this.authenticate({ userType: 'client', options }); // Authenticating the client
    console.log(`Connected to API server with socketId: ${this.socket.id}`); // Logging connection success
    this.isReady(true); // Indicating that the client is ready
  }

  // Method to handle authentication
  handleAuthentication() {
    console.log('Successfully authenticated'); // Logging authentication success
    this.isAuthenticated = true; // Setting authentication flag

    if (this.onAuthenticatedCallback) {
      this.onAuthenticatedCallback(); // Executing callback if set
      this.onAuthenticatedCallback = null; // Resetting callback
    }
  }

  // Method to handle socket disconnection
  handleDisconnect(reason, options) {
    this.isAuthenticated = false; // Resetting authentication flag
    console.warn(`Client Disconnected. Reason: ${reason}`); // Logging disconnection reason

    if (options.restartOnDisconnect) {
      process.exit(1); // Force restarting the process if configured
    }
  }

  // Method to handle connection errors
  handleConnectError(error) {
    console.warn(`connect_error: ${error}`); // Logging connection error
    if (!this.isReconnecting) {
      this.isReconnecting = true; // Setting reconnect flag
      setTimeout(() => this.socket.connect(), 5000); // Attempting to reconnect after 5 seconds
    }
  }

  // Method to handle successful reconnect
  handleReconnect(attemptNumber) {
    console.log(`Reconnected after ${attemptNumber} attempts`); // Logging successful reconnect
    this.isReconnecting = false; // Resetting reconnect flag
  }

  // Method to authenticate the client
  authenticate(data) {
    try {
      this.socket.emit('authenticate', data); // Emitting authentication event
      this.socket.on('authenticationFailed', (error) =>
        console.error('Authentication failed:', error)
      ); // Handling authentication failure
    } catch (error) {
      logError(error); // Logging any errors during authentication
    }
  }

  // Method to send a prompt after authentication
  sendPromptAfterAuthentication(prompt, refId, options) {
    if (this.isAuthenticated) {
      this.sendPrompt(prompt, refId, options); // Sending prompt if authenticated
    } else {
      console.log('Not authenticated. Waiting to send prompt...'); // Logging if not authenticated
      this.onAuthenticatedCallback = () =>
        this.sendPrompt(prompt, refId, options); // Setting callback to send prompt after authentication
    }
  }

  // Method to send a prompt
  sendPrompt(prompt, refId, options) {
    try {
      console.log('Sending prompt:', prompt); // Logging the prompt being sent
      this.socket.emit('prompt', { prompt, refId, options }); // Emitting prompt event
    } catch (error) {
      logError(error); // Logging any errors during prompt sending
    }
  }

  // Method to handle responses
  onResponse(cb) {
    this.socket.on('response', cb); // Setting up response event
  }

  // Method to handle errors
  onError(cb) {
    this.socket.on('error', (data) => {
      cb(data); // Executing callback with error data
      logError(data); // Logging the error
      if (data.stopExecution) throw new Error(data.message); // Throwing error if execution should be stopped
    });
  }

  // Method to handle response queue
  onResponseQueue(cb) {
    this.socket.on('responseQueuedNumber', cb); // Setting up response queue event
  }

  // Method to disconnect the client
  disconnectConnection() {
    try {
      this.socket.disconnect(); // Disconnecting the socket
    } catch (error) {
      logError(error); // Logging any errors during disconnection
    }
  }

  // Method to perform key exchange
  async performKeyExchange(cb) {
    const keyPair = generateRSAKeyPair(); // Generating key pair
    this.socket.emit('clientPublicKey', keyPair.publicKey); // Emitting client public key
    this.socket.on('agentPublicKey', (agentPublicKey) => {
      this.agentPublicKey = cryptoJs.enc.Utf8.parse(agentPublicKey); // Setting agent public key
      cb(); // Executing callback
    });
  }

  // Method to encrypt data
  encrypt(data) {
    if (!this.agentPublicKey)
      throw new Error(
        'Agent public key not received. Perform key exchange first.'
      ); // Throwing error if agent public key is not set
    return cryptoJs.AES.encrypt(data, this.agentPublicKey, {
      mode: cryptoJs.mode.ECB,
      padding: cryptoJs.pad.NoPadding,
    }).toString(); // Encrypting data
  }

  // Method to decrypt data
  decrypt(encryptedData) {
    const decryptedData = cryptoJs.AES.decrypt(
      encryptedData,
      this.secretEncryptionKey,
      { mode: cryptoJs.mode.ECB, padding: cryptoJs.pad.NoPadding }
    );

    return decryptedData.toString(cryptoJs.enc.Utf8); // Decrypting data
  }
}

module.exports = Fullmetal;
