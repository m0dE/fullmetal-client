## Installation

1. npm install fullmetal-client
## Usage
```
import Fullmetal from 'fullmetal-client';

const fullmetal = new Fullmetal('API_KEY'); // api key in api.fullmetal.ai

await fullmetal.sendPrompt(question);
fullmetal.onResponse((answer) => {
    console.log(answer);
    // YOUR CODE TO EMIT the response to frontend
});
```
