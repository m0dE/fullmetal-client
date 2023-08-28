## Installation

1. npm install fullmetal-client

## Usage
```
import Fullmetal from 'fullmetal-client';
const fullmetal = new Fullmetal('API_KEY'); // api key in api.fullmetal.ai

// send prompt
var prompt = "How many countries are there in the world?"
await fullmetal.sendPrompt(prompt);

// response provided by fullmetal API
fullmetal.onResponse((response) => {
    // your code goes here
});
```
