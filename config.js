const Rollbar = require('rollbar');

exports.APIURL = 'https://api.fullmetal.ai/';

exports.rollbar = new Rollbar({
  accessToken: '1102c4abd7d04345a6a58be5a06cdeb8',
  captureUncaught: true,
  captureUnhandledRejections: true,
});
