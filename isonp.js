'use strict';

var one = require('one-time')
  , iframe = require('frames')
  , target = require('target')
  , Tick = require('tick-tock')
  , parse = require('url-parse')
  , htmlfile = require('htmlfile')
  , EventEmitter = require('eventemitter3');

/**
 * ISONP stands for Iframe Sent Object Ninja Polling. Which is just JSONP
 * wrapped in iframes for better error handling.
 *
 * Options:
 *
 * global (string): Name of the global variable object we need to introduce.
 * mode (string): The polling mode, either short(polling) or long(polling).
 * timeout (string|number): Timeout for a get/post request.
 * interval (string|number): Poll interval for short polling.
 * dom (document): Reference to a DOM element we need to use to create elements.
 * domain (string): The `document.domain` we need to set in the HTMLFile.
 *
 * @constructor
 * @param {String} url URL we need to connect to.
 * @param {Object} options Optional configuration.
 * @api public
 */
function ISONP(url, options) {
  if (!(this instanceof ISONP)) return new ISONP(url, options);

  options = options || {};

  this.uid = 0;                                         // Unique ID for request.
  this.url = url;                                       // URL of server.
  this.env = null;                                      // ENV we introduce globals.
  this.active = [];                                     // Active HTTP requests.
  this.iframe = null;                                   // Iframe element reference.
  this.document = options.dom || document;              // Create element document.
  this.global = options.global || '__isonp';            // Global name.
  this.mode = options.mode || 'longpolling';            // Polling mode.
  this.timeout = options.timeout || '60 seconds';       // Poll timeout.
  this.interval = options.interval || '1 second';       // Short poll interval.
  this.domain = options.domain || document.domain;      // Domain for iframe.
  this.timers = new Tick();                             // Timer storage.

  this.initialize();
}

ISONP.prototype = new EventEmitter();
ISONP.prototype.constructor = ISONP;
ISONP.prototype.emits = require('emits');

/**
 * Setup the environment where we're going to load the script tags in.
 *
 * @api private
 */
ISONP.prototype.initialize = function initialize() {
  if (htmlfile.supported) {
    this.document = htmlfile();
    this.env = this.document.parentWindow;
  } else {
    this.env = this.env || (new Function('return this')());
  }

  var env = this.env
    , isonp = this;

  //
  // We want to store our poll callbacks in an object so we don't introduce
  // a ton of pointless callbacks in the global space. This also makes it quite
  // easy to clean up our callbacks by just deleting them from the global space.
  // In the case of IE/HTMLFile we don't even introduce globals as we add them
  // to this newly created document.
  //
  env[this.global] = 'object' === typeof env[this.global]
  ? env[this.global]
  : {};

  //
  // @TODO start the polling interval.
  //
  if (!~this.mode.indexOf('short')) {
    this.poll(function poll(err, data) {
      isonp.setTimeout('short-polling', function short() {
        isonp.poll(poll);
      }, isonp.interval);
    });
  }
};

/**
 * Write a message.
 *
 * @param {String} msg The message we want to write.
 * @param {Function} fn Optional completion callback.
 * @api public
 */
ISONP.prototype.write = function write(msg, fn) {
  var isonp = this
    , abort;

  abort = target(this.url, {
    dom: this.document,
    method: 'POST',
    body: msg,
  }, function receive(err, data) {
    if ('function' === typeof fn) fn(err, data);

    if (err) isonp.emit('error', err);
    else isonp.emit('data', data);
  });
};

/**
 * Send a poll to the server.
 *
 * @param {Function} fn Completion callback.
 * @api private
 */
ISONP.prototype.poll = function poll(fn) {
  var next
    , script
    , isonp = this
    , doc = this.document
    , id = (this.i++).toString()
    , url = parse(this.url, true)
    , name = this.global +'.'+ id;

  next = this.env[this.global][id] = one(function onetime(err, data) {
    isonp.clear(name);
    delete isonp.env[isonp.gobal][id];
    if (script) script.onload = script.onreadystatechange = null;

    if ('function' === typeof fn) fn(err, data);

    if (err) isonp.emit('error', err);
    else isonp.emit('data', data);
  });

  this.timers.setTimeout(name, function timeout() {
    if (!isonp.env[isonp.global][id]) return;

    isonp.env[isonp.global][id](new Error('Request timeout'));
  }, this.timeout);

  script = doc.createElement('script');
  script.async = true;

  script.onload = script.onreadystatechange = function load() {
    if (!(script.readyState in { complete: 1, loaded: 1 })) return;

    next();
  };

  script.src = this.src(name);
};

/**
 *
 * @param {String} name Name of the callback function.
 * @returns {String}
 * @api public
 */
ISONP.prototype.src = function src(name) {

};

/**
 * Destroy all the things.
 *
 * @api public
 */
ISONP.prototype.end = ISONP.prototype.destroy = function end() {
  if (!this.timers) return false;
  this.timers.clear();

  //
  // Iterate over all the callbacks that are left behind so we can cancel the
  // requests.
  //
  if ('object' === this.env[this.global]) {
    for (var poll in this.env[this.global]) {
      this.env[this.global][poll](new Error('Request aborted, ISONP#end called.'));
    }

    delete this.env[this.global];
  }

  if (this.iframe) this.iframe.remove();
  this.document = this.env = this.timers = this.iframe = this.domain = null;

  //
  // The HTMLfile should be destroyed as last using the destroy method as all
  // references to the document so be removed first in order for proper garbage
  // collection to happen.
  //
  if (htmlfile.supported) {
    htmlfile.destroy();
  }

  return true;
};

/**
 * Is ISONP supported.
 *
 * @type {Boolean}
 * @api public
 */
ISONP.supported = (function supported() {
  try { return document.createElement('script'); }
  catch (e) { return false; }
}());

/**
 * Is this transport cross domain capable.
 *
 * @type {Boolean}
 * @public
 */
ISONP.crossdomain = true;

/**
 * Can this transport be used to send binary data natively.
 *
 * @type {Boolean}
 * @public
 */
ISONP.binary = false;

//
// Expose the module.
//
module.exports = ISONP;
