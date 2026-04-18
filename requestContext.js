const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function run(req, fn) {
  return als.run(req, fn);
}

function getReq() {
  return als.getStore();
}

module.exports = { run, getReq };
