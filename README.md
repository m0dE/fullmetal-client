## Installation

1. npm install fullmetal-client

## Usage
```
const io = require('socket.io')();
import Fullmetal from 'fullmetal-client';

const fullMetalConfig = {
  apiKey: process.env.FULLMETAL_API_KEY, // get apiKey from .env file
  name: process.env.APP_NAME, // get app name from .env file
};
const fullmetal = new Fullmetal(fullMetalConfig);
fullmetal.onResponse(async (response) => {
  // response= {token:'', completed:false, speed:10/s, elapsedTime:2s model:''Wizard-Vicuna-7B-Uncensored', refId: end-client-socket.id}
  io.to(response.refId).emit('response', response); // The particular page/browser tab from which the requested prompt fired can be found using refId.
});

// Handle error message to client side, if any
fullmetal.onError(async (response) => {
  io.to(response.refId).emit('error', response.message);
});

// Handle response queue number of prompt e.g Prompt successfully queued. There are 3 prompts ahead of you.
fullmetal.onResponseQueue(async (response) => {
  io.to(response.refId).emit('responseQueuedNumber', response.queuedNumber);
});

io.on('connection', async (socket) => {
  socket.on('prompt', async (data) => {
    await fullmetal.sendPrompt(
      data.prompt,
      socket.id,
      { model: data.model }
    );
  });
});
```
## DEMO
Click [here](https://github.com/m0dE/fullmetal-chat-example/) to see the sample code