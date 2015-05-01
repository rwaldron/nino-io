// Global Deps
require("es6-shim");

// The const caps are used to illustrate the "const-ness"
// of the value, but the binding is not const.
var IS_TEST_ENV = global.IS_TEST_ENV || false;
var RWRWRW = 438; // 0666

// Local deps
var fs = IS_TEST_ENV ?
  require("../test/fs-mock.js") :
  require("fs");
var exec = require("child_process").exec;
var Emitter = require("events").EventEmitter;
var Promise = require("es6-promise").Promise;
var i2c;
try {
  i2c = require("i2c-bus");
} catch (ignore) {
}

// Resources
var layouts = (function() {
  var all = require("../defs/layouts/all.json");

  return Object.keys(all).reduce(function(layouts, key) {
    if (all[key].info.type === "board") {
      layouts[key] = new Layout(all[key]);
    }
    return layouts;
  }, {});
}());

// Shareds
var priv = new Map();
var tick = global.setImmediate || process.nextTick;
var boards = [];
var reporting = [];
var board = {
  name: null,
  layout: null,
  config: null
};

// Sysfs paths
var GPIO = "/sys/class/gpio/";
var AIO = "/sys/bus/iio/devices/iio:device0/";
var PWM = "/sys/class/pwm/pwmchip0/";


// This version created race conditions...
//
// Determine the type of board we're currently running on.
// exec("awk '/machine/ {print $3,$4}' /proc/cpuinfo", function(err, name) {
//   if (err) {
//     name = "Linino One";
//   }
//   board.name = name;
//   // Conversions:
//   //    Linino One => linino_one
//   //    Arduino Yun => arduino_yun
//   //
//   board.layout = layouts[toSnakeCase(name)].layout;
// });


// We absolutey must block on this because we need the board
// information before we can continue. File bugs if you know of a
// better way to solve this. <3


// This block is process blocking. Get it?
blocking: {
  if (!IS_TEST_ENV) {
    // (Adapted from ideino-linino-lib)
    if (!fs.existsSync("board")) {
      exec("awk '/machine/ {print $3,$4}' /proc/cpuinfo 2>&1 1>board");
      while (!fs.existsSync("board")) {}
    }

    board.name = fs.readFileSync("board", "utf8").trim();
  }

  if (!board.name) {
    board.name = "Linino One";
    IS_TEST_ENV = true;
  }

  board.config = layouts[toSnakeCase(board.name)];
  board.layout = board.config.layout;
}


// Example pinModes
// var pinModes = [
//   { modes: [] },
//   { modes: [] },
//   { modes: [0, 1] },
//   { modes: [0, 1, 3] },
//   { modes: [0, 1] },
//   { modes: [0, 1, 3, 4] },
//   { modes: [0, 1, 3] },
//   { modes: [0, 1] },
//   { modes: [0, 1] },
//   { modes: [0, 1, 3, 4] },
//   { modes: [0, 1, 3, 4] },
//   { modes: [0, 1, 3, 4] },
//   { modes: [0, 1] },
//   { modes: [0, 1] },
//   { modes: [0, 1, 2], analogChannel: 0 },
//   { modes: [0, 1, 2], analogChannel: 1 },
//   { modes: [0, 1, 2], analogChannel: 2 },
//   { modes: [0, 1, 2], analogChannel: 3 },
//   { modes: [0, 1, 2], analogChannel: 4 },
//   { modes: [0, 1, 2], analogChannel: 5 }
// ];

var offset = 0;
var digital = board.layout.digital;
var analog = board.layout.analog;
var pinModes = [digital, analog].reduce(function(accum, config, index) {
  var keys = Object.keys(config).map(Number);
  var isDigital = index === 0;
  var isAnalog = !isDigital;
  var i, key;

  for (i = 0; i < keys.length; i++) {
    accum.push({
      modes: [0, 1],
      config: config[i]
    });
  }

  // Get an offset number of digital pins
  if (isDigital) {
    offset = keys.length;

    // Update available modes if PWM or Servo
    for (i = 0; i < keys.length; i++) {
      key = String(keys[i]);

      if (config[key].pwm) {
        accum[i].modes.push(3);
      }
      if (config[key].servo) {
        accum[i].modes.push(4);
      }
    }
  }

  // Add an analogChannel property for analog pins
  if (isAnalog) {
    for (i = offset; i < offset + keys.length; i++) {
      accum[i].modes.push(2);
      accum[i].analogChannel = i - offset;
    }
  }

  return accum;
}, []);

function sysfsError(type, error, additional) {
  if (error && (error.code === "ENOENT" || error.code === "EISDIR")) {
    console.log(
      "Failed to export %s: (%s %s)",
      type, error.code, error.message,
      additional ? additional : ""
    );
  }
}

// Initializing all sysfs
sysfs: {
  // Based on the known pin modes data, pre-export all
  // gpios that might be used.
  //
  var npwm = 0;

  if (!IS_TEST_ENV) {
    pinModes.forEach(function(pin) {
      var isDigital = typeof pin.analogChannel !== "number";
      var isPwm = !!pin.config.pwm;

      // TODO:
      //  Refactor the export operations to a function that accepts:
      //
      //    - path
      //    - name
      //    - type
      //    - callback
      //
      //    or
      //
      //    - type
      //    - name
      //    - callback
      //
      //
      // [0, 1].MAP === "?"
      if (pin.config.MAP === "?") {
        return;
      }

      if (isDigital) {
        // Export Digital GPIO
        // http://linino.org/doku.php?id=wiki:lininoio_sysfs#gpio_on_lininoio
        // echo NUM > /sys/class/gpio/export
        //
        fs.writeFile(GPIO + "export", pin.config.NUM, function(error) {
          if (error) {
            sysfsError("GPIO", error, pin.config);
          }
        });
      }

      if (isPwm) {
        // Export PWM
        // http://linino.org/doku.php?id=wiki:lininoio_sysfs#pwm_on_lininoio
        // echo n > /sys/class/pwm/pwmchip0/export
        //
        fs.writeFile(PWM + "export", npwm++, function(error) {
          if (error) {
            sysfsError("PWM", error, pin.config);
          }
        });
      }
    });

    // Enable ADC
    // http://linino.org/doku.php?id=wiki:lininoio_sysfs#a_d_converter_on_lininoio
    // echo 1 > /sys/bus/iio/devices/iio:device0/enable
    //
    fs.writeFile(AIO + "enable", "1", function(error) {
      if (error) {
        sysfsError("ADC", error);
      }
    });
  }
}

var modes = Object.freeze({
  INPUT: 0,
  OUTPUT: 1,
  ANALOG: 2,
  PWM: 3,
  SERVO: 4
});

function read() {
  if (read.isReading) {
    return;
  }
  if (!read.samplingInterval) {
    read.samplingInterval = 1;
  }
  read.isReading = true;
  read.interval = setInterval(function() {
    var board;


    if (boards.length && reporting.length) {
      board = boards[0];

      reporting.forEach(function(report, gpio) {
        // For Aio reporting pins:
        // # ls /sys/bus/iio/devices/iio:device0/
        // dev                  in_voltage_A1_raw    in_voltage_A3_raw    in_voltage_A5_raw    uevent
        // enable               in_voltage_A1_scale  in_voltage_A3_scale  in_voltage_A5_scale
        // in_voltage_A0_raw    in_voltage_A2_raw    in_voltage_A4_raw    name
        // in_voltage_A0_scale  in_voltage_A2_scale  in_voltage_A4_scale  subsystem
        // report.buffer.fill(0);

        fs.read(report.fd, report.buffer, 0, report.bytes, 0, function(error, bytesRead, buffer) {
          processRead(board, report, buffer.toString("utf-8"));
        });
      });
    }
  }, read.samplingInterval);
}



function processRead(board, report, value) {
  value = +value;

  if (Number.isNaN(value)) {
    value = 0;
  }

  if (report.scale) {
    value = report.scale(value);
  }

  board.pins[report.index].value = value;
  board.emit(report.event, value);
}


function Nino(opts) {
  Emitter.call(this);

  if (!(this instanceof Nino)) {
    return new Nino(opts);
  }

  opts = opts || {};

  var awaiting = [];
  var state = {
    bus: null
  };

  priv.set(this, state);

  this.name = board.name;
  this.isReady = false;

  this.pins = pinModes.map(function(config, index) {
    config.addr = typeof config.analogChannel === "number" ?
      "A" + config.analogChannel : index;

    var pin = new Pin(config);

    awaiting.push(
      new Promise(function(resolve) {
        pin.on("ready", function() {
          resolve();
        });
      })
    );

    return pin;
  }, this);


  // TODO:
  //  get rid of this magic number
  //
  this.analogPins = this.pins.slice(14).map(function(_, i) {
    return i;
  });

  boards[0] = this;

  // Connected to the device by default.
  tick(function() {
    this.emit("connect");
  }.bind(this));


  // The "ready event" is needed to signal to Johnny-Five that
  // communication with the Arduino pinouts is ready.
  Promise.all(awaiting).then(function() {
    this.isReady = true;
    this.emit("ready");
  }.bind(this));
}

Nino.prototype = Object.create(Emitter.prototype, {
  constructor: {
    value: Nino
  },
  MODES: {
    value: modes
  },
  HIGH: {
    value: 1
  },
  LOW: {
    value: 0
  }
});


Nino.prototype.pinMode = function(pin, mode) {
  this.pins[toPinIndex(pin)].mode = +mode;
  return this;
};

Nino.prototype.analogRead = function(pin, handler) {
  var pinIndex;
  var gpio;
  var alias;
  var event;

  // Convert numeric analog pin numbers to "A*" format
  if (typeof pin === "number") {
    pin = "A" + pin;
  }

  pinIndex = toPinIndex(pin);
  gpio = this.pins[pinIndex].gpio;
  alias = this.pins[pinIndex].analogChannel;
  event = "analog-read-" + alias;

  if (this.pins[pinIndex].mode !== this.MODES.ANALOG) {
    this.pinMode(pin, this.MODES.ANALOG);
  }

  reporting.push({
    alias: alias,
    event: event,
    index: pinIndex,
    fd: this.pins[pinIndex].fd.value,
    bytes: 4,
    buffer: new Buffer(4),
    scale: null
  });

  this.on(event, handler);

  if (IS_TEST_ENV) {
    // Kickstart the read interval
    read();
  }

  return this;
};

Nino.prototype.digitalRead = function(pin, handler) {
  var pinIndex = toPinIndex(pin);
  var gpio = this.pins[pinIndex].gpio;
  var event = "digital-read-" + pin;

  if (this.pins[pinIndex].mode !== this.MODES.INPUT) {
    this.pinMode(pin, this.MODES.INPUT);
  }

  reporting.push({
    event: event,
    index: pinIndex,
    path: this.pins[pinIndex].paths.value,
    fd: this.pins[pinIndex].fd.value,
    bytes: 1,
    buffer: new Buffer(1),
    scale: null
  });

  this.on(event, handler);

  if (IS_TEST_ENV) {
    // Kickstart the read interval
    read();
  }

  return this;
};

Nino.prototype.analogWrite = function(pin, value) {
  var pinIndex = toPinIndex(pin);

  if (this.pins[pinIndex].mode !== this.MODES.PWM) {
    this.pinMode(pin, this.MODES.PWM);
  }

  this.pins[pinIndex].write(value);

  return this;
};

Nino.prototype.digitalWrite = function(pin, value) {
  var pinIndex = toPinIndex(pin);

  if (this.pins[pinIndex].mode !== this.MODES.OUTPUT) {
    this.pinMode(pin, this.MODES.OUTPUT);
  }

  this.pins[pinIndex].write(value);

  return this;
};

Nino.prototype.servoWrite = function(pin, value) {
  var pinIndex = toPinIndex(pin);

  if (this.pins[pinIndex].mode !== this.MODES.SERVO) {
    this.pinMode(pin, this.MODES.SERVO);
  }

  this.pins[pinIndex].write(value);

  return this;
};


// http://linino.org/doku.php?id=wiki:lininoio_sysfs#i2c_on_lininoio
Nino.prototype.i2cConfig = function(delay) {
  var state = priv.get(this);

  // Initialize the I2C interface if none currently exists
  if (!state.bus) {
    state.bus = i2c.openSync(0);
    state.busDelay = delay || 0;
  }

  return this;
};

Nino.prototype.i2cWrite = function(address, cmdRegOrData, inBytes) {
  /**
   * cmdRegOrData:
   * [... arbitrary bytes]
   *
   * or
   *
   * cmdRegOrData, inBytes:
   * command [, ...]
   *
   */
  var state = priv.get(this);
  var buffer;

  this.i2cConfig();

  // If i2cWrite was used for an i2cWriteReg call...
  if (arguments.length === 3 &&
      !Array.isArray(cmdRegOrData) &&
      !Array.isArray(inBytes)) {
    return this.i2cWriteReg(address, cmdRegOrData, inBytes);
  }

  // Fix arguments if called with Firmata.js API
  if (arguments.length === 2) {
    if (Array.isArray(cmdRegOrData)) {
      inBytes = cmdRegOrData.slice();
      cmdRegOrData = inBytes.shift();
    } else {
      inBytes = [];
    }
  }

  buffer = new Buffer([cmdRegOrData].concat(inBytes));

  // Only write if bytes provided
  if (buffer.length) {
    state.bus.i2cWriteSync(address, buffer.length, buffer);
  }

  return this;
};

Nino.prototype.i2cWriteReg = function(address, register, value) {
  var state = priv.get(this);

  this.i2cConfig();

  state.bus.writeByteSync(address, register, value);

  return this;
};

Nino.prototype._i2cRead = function(continuous, address, register, bytesToRead, callback) {
  var state = priv.get(this);
  var event = "I2C-reply" + address + "-";
  var data = new Buffer(bytesToRead);

  this.i2cConfig();

  // Fix arguments if called with Firmata.js API
  if (arguments.length === 4 &&
      typeof register === "number" &&
      typeof bytesToRead === "function") {
    callback = bytesToRead;
    bytesToRead = register;
    register = null;
  }

  callback = typeof callback === "function" ? callback : function() {};

  event += register !== null ? register : 0;

  setTimeout(function read() {
    var afterRead = function (err, bytesRead, buffer) {
      if (err) {
        return this.emit("error", err);
      }

      // Convert buffer to Array before emit
      this.emit(event, [].slice.call(buffer));
    
      if (continuous) {
        setTimeout(read.bind(this), state.busDelay);
      }
    }.bind(this);

    this.once(event, callback);

    if (register !== null) {
      state.bus.readI2cBlock(address, register, bytesToRead, data, afterRead);
    } else {
      state.bus.i2cRead(address, bytesToRead, data, afterRead);
    }
  }.bind(this), state.busDelay);

  return this;
};

Nino.prototype.i2cRead = function(address, register, bytesToRead, handler) {
  return this._i2cRead.apply(this, [true].concat([].slice.call(arguments)));
};

Nino.prototype.i2cReadOnce = function(address, register, bytesToRead, handler) {
  return this._i2cRead.apply(this, [false].concat([].slice.call(arguments)));
};

// Necessary for Firmata.js compatibility.
Nino.prototype.sendI2CConfig = Nino.prototype.i2cConfig;
Nino.prototype.sendI2CReadRequest = Nino.prototype.i2cReadOnce;
Nino.prototype.sendI2CWriteRequest = Nino.prototype.i2cWrite;


// http://linino.org/doku.php?id=wiki:lininoio_sysfs#buzzer
Nino.prototype.tone = function() {

};

Nino.prototype.noTone = function() {

};


Nino.prototype.setSamplingInterval = function(ms) {
  read.samplingInterval = Math.min(Math.max(ms, 0), 65535);
  clearInterval(read.interval);
  read();
};


function Pin(opts) {
  Emitter.call(this);

  var awaiting = [];
  var isDigital = typeof opts.analogChannel !== "number";
  var isAnalog = !isDigital;
  var state = {
    addr: opts.addr,
    mode: isAnalog ? 2 : 1,
    isPwm: false,
    paths: {
      gpio: null,
      value: null,
      direction: null,
      edge: null,
      polarity: null,
      enable: null,
      duty: null,
      period: null,
      resolution: null,
    },
    fd: {
      flag: isAnalog ? "r" : "w+",

      //  Digital Analog Specific
      value: null,
      direction: null,
      edge: null,

      // PWM/Servo specific
      // Numeric values are in nanoseconds
      polarity: null,
      enable: null,
      duty: null,
      period: null,
      resolution: null,
    },
    gpio: {
      //  Digital Analog Specific
      value: null,
      direction: null,
      edge: null,
    },
    pwm: {
      // PWM/Servo specific
      // Numeric values are in nanoseconds
      polarity: "normal",
      enable: 0,
      duty: 0,
      period: 0,
      resolution: 0,
      details: null
    }
  };

  Object.assign(state, opts);

  priv.set(this, state);

  Object.defineProperties(this, {
    value: {
      get: function() {
        return state.gpio.value;
      },
      set: function(value) {
        state.gpio.value = value;
      }
    },
    mode: {
      get: function() {
        return state.mode;
      },
      set: function(mode) {
        // INPUT: 0
        // OUTPUT: 1
        // ANALOG: 2
        // PWM: 3
        // SERVO: 4
        //
        var direction = mode === 0 || mode === 2 ? "in" : "out";
        var isChanging = state.mode !== mode;
        var index, period, details;

        if (mode === 3 || mode === 4) {
          if (!state.config.pwm) {
            throw new Error(board.name + " does not support PWM: ", state.addr);
          }
          details = PULSE_CONFIG[state.config.pwm.BIT][mode - 3];
          period = details.period;

          if (mode === 3) {
            if (state.config.pwm.TIM.SHARED && state.config.pwm.TIM.SET) {
              details = state.config.pwm.TIM.USE.slice(0)[0];
              // period = Math.max(state.config.pwm.MAX, details.period);
              period = details.period;
            }
          }

          if (mode === 4) {
            // Mark this timer as in-use
            state.config.pwm.TIM.SET = true;
            state.config.pwm.TIM.USE.push(details);
          }

          state.isPwm = true;
          state.pwm.details = details;
          state.pwm.period = period;

          if (isChanging) {
            fs.writeFile(state.paths.period, period, noop);
          }

          if (!state.pwm.enable) {
            state.pwm.enable = 1;
            fs.writeFile(state.paths.enable, 1, noop);
          }
        }

        if (isDigital) {
          fs.writeFile(state.paths.direction, direction, noop);
        }

        state.mode = mode;
      }
    },
    isPwm: {
      get: function() {
        return state.isPwm;
      }
    },
    addr: {
      get: function() {
        return state.addr;
      }
    },
    gpio: {
      get: function() {
        return state.addr;
      }
    },
    fd: {
      get: function() {
        return state.fd;
      }
    },
    paths: {
      get: function() {
        return state.paths;
      }
    }
  });

  if (typeof opts.analogChannel === "number") {
    this.analogChannel = opts.analogChannel;
  }

  // TODO:
  //
  //  Refactor cacheFileDescriptor to be useful for
  //  any path
  var cacheFileDescriptor = function(fd, resolve) {
    if (fd) {
      // Cache the file descriptor
      state.fd.value = fd;
      resolve();
    } else {
      // Open the value path to cache a file descriptor
      fs.open(state.paths.value, state.fd.flag, function(error, fd) {
        // Cache the file descriptor
        state.fd.value = fd;
        resolve();
      });
    }
  };

  if (isDigital && state.config.MAP !== "?") {
    // Initialize all digital GPIO paths
    // Cache file descriptors.

    state.paths.gpio = GPIO + state.config.MAP;
    state.paths.direction = state.paths.gpio + "/direction";
    state.paths.edge = state.paths.gpio + "/edge";
    state.paths.value = state.paths.gpio + "/value";

    var digitalInitialState = function(fd, resolve) {
      // It's not necessary to wait for these,
      // either it worked or it didn't.

      // Make the value path writable by all
      fs.chmod(state.paths.value, RWRWRW, noop);

      // Normalize all digital pins:
      //
      //    - set the direction to out (output mode)
      //    - set the edge to both (rising and falling)
      //    - set the value 0 (low voltage)
      //
      fs.writeFile(state.paths.direction, "out", noop);
      fs.writeFile(state.paths.edge, "both", noop);
      fs.writeFile(state.paths.value, "0", function() {
        // Once the pin has been set LOW, its
        // setup routine is resolvable.

        // Align the internal state table
        state.gpio.direction = "out";
        state.gpio.edge = "both";
        state.gpio.value = "0";

        cacheFileDescriptor(fd, resolve);
      });
    };

    // Initialize GPIO
    awaiting.push(
      new Promise(function(resolve) {
        fs.open(state.paths.value, "w+", function(error, fd) {
          if (error && (error.code === "ENOENT" || error.code === "EISDIR")) {
            fs.writeFile(GPIO + "export", state.config.NUM, function() {
              digitalInitialState(null, resolve);
            });
          } else {
            digitalInitialState(fd, resolve);
          }
        });
      })
    );

    // Initialize PWM
    //
    if (state.config.pwm) {

      state.paths.pwm = PWM + state.config.pwm.TYP + state.config.pwm.NUM;
      state.paths.duty = state.paths.pwm + "/duty_cycle";
      state.paths.enable = state.paths.pwm + "/enable";
      state.paths.period = state.paths.pwm + "/period";
      state.paths.resolution = state.paths.pwm + "/resolution";

      fs.chmod(state.paths.duty, RWRWRW, noop);
      fs.chmod(state.paths.enable, RWRWRW, noop);
      fs.chmod(state.paths.period, RWRWRW, noop);
      fs.chmod(state.paths.resolution, RWRWRW, noop);

      // Zero the duty, set the period and resolution
      fs.writeFile(state.paths.duty, 0, noop);
      fs.writeFile(state.paths.period, state.config.pwm.MAX, noop);
      fs.writeFile(state.paths.resolution, state.config.pwm.RES, noop);

      awaiting.push(
        new Promise(function(resolve) {
          // Open the value path to cache a file descriptor
          fs.open(state.paths.period, state.fd.flag, function(error, fd) {
            // Cache the file descriptor
            state.fd.period = fd;
            resolve();
          });
        })
      );

      awaiting.push(
        new Promise(function(resolve) {
          // Open the value path to cache a file descriptor
          fs.open(state.paths.duty, state.fd.flag, function(error, fd) {
            // Cache the file descriptor
            state.fd.duty = fd;
            resolve();
          });
        })
      );

      state.pwm.period = state.config.pwm.MAX;
    }
  }

  if (isAnalog) {
    state.paths.value = AIO + "in_voltage_" + state.config.MAP + "_raw";

    awaiting.push(
      new Promise(function(resolve) {
        cacheFileDescriptor(null, resolve);
      })
    );
  }

  Promise.all(awaiting).then(function() {
    this.emit("ready");
  }.bind(this));
}

Pin.prototype = Object.create(Emitter.prototype, {
  constructor: {
    value: Pin
  }
});


var LOW = new Buffer("0");
var HIGH = new Buffer("1");

var PULSE_CONFIG = {
  // [BIT][mode - 3 = 0|1]
  8: [
    // PWM
    {
      min: 0,
      max: 5000000,
      period: 10000000,
    },
    // Servo
    {
      min: 560000,
      max: 10000000,
      period: 20000000,
    }
  ],
  16: [
    // PWM
    {
      min: 0,
      max: 5000000,
      period: 10000000,
    },
    // Servo
    {
      min: 560000,
      max: 2400000,
      period: 20000000,
    }
  ]
};

Pin.prototype.write = function(value) {
  var state = priv.get(this);
  var fd, buffer, duty, vrange, min, max;

  if (state.isPwm) {
    if (state.mode === 3) {
      vrange = 255;
    }

    if (state.mode === 4) {
      vrange = 180;
    }

    min = state.pwm.details.min;
    max = state.pwm.details.max;

    duty = toDutyCycle(value, vrange, min, max) | 0;
    state.pwm.duty = duty;
    state.gpio.value = value;

    buffer = new Buffer(String(duty));
    fd = state.fd.duty;
  } else {
    state.gpio.value = value;
    buffer = value ? HIGH : LOW;
    fd = state.fd.value;
  }

  fs.write(fd, buffer, 0, buffer.length, 0, noop);
};

function toPinIndex(pin) {
  var offset = pin[0] === "A" ? 14 : 0;
  return ((pin + "").replace("A", "") | 0) + offset;
}

function toTitleCase(value) {
  return value.replace(/(^[a-z])|(_([a-z]))/ig, function(letter) {
    return letter.replace(/^_/, " ").toUpperCase();
  });
}

function toSnakeCase(value) {
  return value.toLowerCase().replace(" ", "_");
}

function toDutyCycle(value, vrange, min, max) {
  if (value > vrange) {
    return max;
  }

  if (value < 0) {
    return min;
  }

  return (min + (value / vrange) * (max - min));
}

function scale(value, inMin, inMax, outMin, outMax) {
  return (value - inMin) * (outMax - outMin) /
    (inMax - inMin) + outMin;
}

function constrain(value, min, max) {
  return value > max ? max : value < min ? min : value;
}

function noop() {}

function Layout(initializer) {

  this.key = initializer.info.name;
  this.name = toTitleCase(initializer.info.name);
  this.type = initializer.info.type;
  this.layout = null;

  if (this.type === "board") {
    var pwms = initializer.layout.pwm;
    var servos = initializer.layout.servo;

    // make capabilities
    this.layout = ["digital", "analog"].reduce(function(layout, key, index) {
      if (!initializer.layout[key]) {
        return layout;
      }

      var isDigital = index === 0;
      var prefix = key[0].toUpperCase();
      var entries = Object.keys(initializer.layout[key]);
      var names = entries.slice(0, entries.length / 2);

      layout[key] = names.reduce(function(sublayout, name) {
        var ps;

        sublayout[name] = initializer.register[prefix + name];

        if (isDigital && (ps = initializer.register["P" + name])) {
          sublayout[name].servo = null;
          sublayout[name].pwm = null;

          ps.TIM = initializer.timer[ps.TIM];

          if (servos[name]) {
            //  Servo uses the same pin name as pwm
            sublayout[name].servo = ps;
          }
          if (pwms[name]) {
            sublayout[name].pwm = ps;
          }
        }
        return sublayout;
      }, {});

      return layout;
    }, []);
  }
}


if (IS_TEST_ENV) {
  Nino.__read = read;
  Nino.__Pin = Pin;
  Nino.reset = function() {
    boards.length = 0;
    reporting.length = 0;
    read.isReading = false;
    clearInterval(read.interval);
    priv.clear();
  };
} else {
  read();
}

module.exports = Nino;
