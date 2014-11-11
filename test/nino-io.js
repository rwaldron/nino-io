"use strict";
var rewire = require("rewire");
var Nino = rewire("../lib/nino-io.js");
var Emitter = require("events").EventEmitter;
var sinon = require("sinon");

var fsStub = {
  chmod: function(path, flag, cb) {
    if (cb) {
      cb(null, "[[mock descriptor]]");
    }
  },
  open: function(path, flag, cb) {
    if (cb) {
      cb(null, "[[mock descriptor]]");
    }
  },
  read: function(fd, buffer, start, offset, position, cb) {
    if (cb) {
      // cb(null, 4, "Success!");
    }
  },
  readFile: function(path, encoding, cb) {
    cb(null, path, encoding);
  },
  write: function(fd, buffer, start, offset, position, cb) {
    if (cb) {
      cb(null, "Success!");
    }
  },
  writeFile: function(path, encoding, cb) {
    if (cb) {
      cb(null, "Success!");
    }
  },
  writeFileSync: function(path, encoding, cb) {
    if (cb) {
      cb(null, "Success!");
    }
  }
};


Nino.__set__("fs", fsStub);

var Pin = Nino.__Pin;
var read = Nino.__read;


function restore(target) {
  for (var prop in target) {
    if (typeof target[prop].restore === "function") {
      target[prop].restore();
    }
  }
}

exports["Nino"] = {
  setUp: function(done) {

    this.clock = sinon.useFakeTimers();

    this.nino = new Nino();

    this.proto = {};

    this.proto.functions = [{
      name: "analogRead"
    }, {
      name: "analogWrite"
    }, {
      name: "digitalRead"
    }, {
      name: "digitalWrite"
    }, {
      name: "servoWrite"
    }];

    this.proto.objects = [{
      name: "MODES"
    }];

    this.proto.numbers = [{
      name: "HIGH"
    }, {
      name: "LOW"
    }];

    this.instance = [{
      name: "pins"
    }, {
      name: "analogPins"
    }];

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();
    done();
  },
  shape: function(test) {
    test.expect(
      this.proto.functions.length +
      this.proto.objects.length +
      this.proto.numbers.length +
      this.instance.length
    );

    this.proto.functions.forEach(function(method) {
      test.equal(typeof this.nino[method.name], "function");
    }, this);

    this.proto.objects.forEach(function(method) {
      test.equal(typeof this.nino[method.name], "object");
    }, this);

    this.proto.numbers.forEach(function(method) {
      test.equal(typeof this.nino[method.name], "number");
    }, this);

    this.instance.forEach(function(property) {
      test.notEqual(typeof this.nino[property.name], "undefined");
    }, this);

    test.done();
  },
  readonly: function(test) {
    test.expect(7);

    test.equal(this.nino.HIGH, 1);

    test.throws(function() {
      this.nino.HIGH = 42;
    });

    test.equal(this.nino.LOW, 0);

    test.throws(function() {
      this.nino.LOW = 42;
    });

    test.deepEqual(this.nino.MODES, {
      INPUT: 0,
      OUTPUT: 1,
      ANALOG: 2,
      PWM: 3,
      SERVO: 4
    });

    test.throws(function() {
      this.nino.MODES.INPUT = 42;
    });

    test.throws(function() {
      this.nino.MODES = 42;
    });

    test.done();
  },
  emitter: function(test) {
    test.expect(1);
    test.ok(this.nino instanceof Emitter);
    test.done();
  },
  connected: function(test) {
    test.expect(1);

    this.nino.on("connect", function() {
      test.ok(true);
      test.done();
    });
  },
  ready: function(test) {
    test.expect(1);

    this.nino.on("ready", function() {
      test.ok(true);
      test.done();
    });
  }
};


exports["Nino.prototype.analogRead"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.nino = new Nino();

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();

    this.nino.removeAllListeners("analog-read-0");
    this.nino.removeAllListeners("digital-read-9");

    done();
  },
  correctMode: function(test) {
    test.expect(1);

    // Reading from an ANALOG pin should set its mode to 1 ("out")
    this.nino.analogRead("A0", function() {});

    // test.equal(this.nino.pins[14].mode, 1);
    test.equal(this.nino.pins[14].mode, 2);
    this.clock.tick(10);
    test.done();
  },

  analogPinNumber: function(test) {
    test.expect(2);

    this.read = sinon.stub(fsStub, "read", function(fd, buf, start, end, position, cb) {
      var buffer = new Buffer("1023");
      cb(null, 4, buffer);
    });

    var handler = function(data) {
      test.equal(data, 1023);
      test.done();
    };

    this.nino.analogRead(0, handler);
    test.equal(this.nino.pins[14].mode, 2);

    this.clock.tick(10);
  },

  analogPinString: function(test) {
    test.expect(2);

    this.read = sinon.stub(fsStub, "read", function(fd, buf, start, end, position, cb) {
      var buffer = new Buffer("1023");
      cb(null, 4, buffer);
    });

    var handler = function(data) {
      test.equal(data, 1023);
      test.done();
    };

    this.nino.analogRead("A0", handler);
    this.clock.tick(10);
    // test.equal(this.nino.pins[14].mode, 1);
    test.equal(this.nino.pins[14].mode, 2);
  },

  event: function(test) {
    test.expect(1);

    var scaled = 1023;
    var event = "analog-read-0";

    this.read = sinon.stub(fsStub, "read", function(fd, buf, start, end, position, cb) {
      var buffer = new Buffer("1023");
      cb(null, 4, buffer);
    });

    this.nino.once(event, function(data) {
      test.equal(data, scaled);
      test.done();
    });

    var handler = function(data) {};

    this.nino.analogRead("A0", handler);

    this.clock.tick(20);
  }
};

exports["Nino.prototype.digitalRead"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.nino = new Nino();

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();

    this.nino.removeAllListeners("analog-read-0");
    this.nino.removeAllListeners("digital-read-9");

    done();
  },
  correctMode: function(test) {
    test.expect(1);

    // Reading from an ANALOG pin should set its mode to 1 ("out")
    this.nino.digitalRead(9, function() {});

    test.equal(this.nino.pins[9].mode, 0);
    this.clock.tick(10);
    test.done();
  },

  digitalPinNumber: function(test) {
    test.expect(2);

    this.read = sinon.stub(fsStub, "read", function(fd, buf, start, end, position, cb) {
      var buffer = new Buffer("1");
      cb(null, 1, buffer);
    });

    var handler = function(data) {
      test.equal(data, 1);
      test.done();
    };

    this.nino.digitalRead(9, handler);
    this.clock.tick(10);
    test.equal(this.nino.pins[9].mode, 0);
  },

  event: function(test) {
    test.expect(1);

    var scaled = 1;
    var event = "digital-read-9";

    this.read = sinon.stub(fsStub, "read", function(fd, buf, start, end, position, cb) {
      var buffer = new Buffer("1");
      cb(null, 1, buffer);
    });

    this.nino.once(event, function(data) {
      test.equal(data, scaled);
      test.done();
    });

    var handler = function(data) {};

    this.nino.digitalRead(9, handler);
    this.clock.tick(10);
  }
};


exports["Nino.prototype.analogWrite"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.fsWrite = sinon.spy(fsStub, "write");
    this.write = sinon.spy(Pin.prototype, "write");
    this.nino = new Nino();

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();
    done();
  },

  mode: function(test) {
    test.expect(2);

    var value = 255;
    var pin = 11;

    this.nino.pinMode(11, this.nino.MODES.PWM);
    test.equal(this.nino.pins[11].mode, 3);
    test.equal(this.nino.pins[11].isPwm, true);

    test.done();
  },

  write: function(test) {
    test.expect(18);

    var value = 255;
    var pin = 11;

    this.nino.analogWrite(11, value);

    // Internal write is called
    test.equal(this.write.callCount, 1);
    test.equal(this.write.args[0][0], value);

    // Value is stored in pin state
    test.equal(this.nino.pins[11].value, value);

    // fs.write call 1 is called with expected arguments
    test.equal(this.fsWrite.callCount, 1);
    /*
      [0] descriptor
      [1] buffer value
      [2] offset of buffer
      [3] length of buffer
      [4] start position in file
      [5] callback (untested)
     */
    test.equal(this.fsWrite.args[0][0], "[[mock descriptor]]");
    test.equal(this.fsWrite.args[0][1], new Buffer("5000000").toString());
    test.equal(this.fsWrite.args[0][2], 0);
    test.equal(this.fsWrite.args[0][3], "5000000".length);
    test.equal(this.fsWrite.args[0][4], 0);


    value = 0;

    this.nino.analogWrite(11, value);

    // Internal write is called
    test.equal(this.write.callCount, 2);
    test.equal(this.write.args[1][0], value);

    // Value is stored in pin state
    test.equal(this.nino.pins[11].value, value);

    // fs.write call 2 is called with expected arguments
    test.equal(this.fsWrite.callCount, 2);
    /*
      [0] descriptor
      [1] buffer value
      [2] offset of buffer
      [3] length of buffer
      [4] start position in file
      [5] callback (untested)
     */
    test.equal(this.fsWrite.args[1][0], "[[mock descriptor]]");
    test.equal(this.fsWrite.args[1][1], new Buffer("0").toString());
    test.equal(this.fsWrite.args[1][2], 0);
    test.equal(this.fsWrite.args[1][3], "0".length);
    test.equal(this.fsWrite.args[1][4], 0);

    test.done();
  },

  stored: function(test) {
    test.expect(1);

    var value = 255;
    this.nino.analogWrite(11, value);

    test.equal(this.nino.pins[11].value, value);

    test.done();
  }
};

exports["Nino.prototype.servoWrite"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();

    this.fsWrite = sinon.spy(fsStub, "write");
    this.write = sinon.spy(Pin.prototype, "write");
    this.nino = new Nino();

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();
    done();
  },

  mode: function(test) {
    test.expect(2);

    var value = 255;
    var pin = 11;

    this.nino.pinMode(11, this.nino.MODES.SERVO);
    test.equal(this.nino.pins[11].mode, 4);
    test.equal(this.nino.pins[11].isPwm, true);

    test.done();
  },

  write: function(test) {
    test.expect(18);

    var value = 255;
    var pin = 11;

    this.nino.servoWrite(11, value);

    // Internal write is called
    test.equal(this.write.callCount, 1);
    test.equal(this.write.args[0][0], value);

    // Value is stored in pin state
    test.equal(this.nino.pins[11].value, value);

    // fs.write call 1 is called with expected arguments
    test.equal(this.fsWrite.callCount, 1);
    /*
      [0] descriptor
      [1] buffer value
      [2] offset of buffer
      [3] length of buffer
      [4] start position in file
      [5] callback (untested)
     */
    test.equal(this.fsWrite.args[0][0], "[[mock descriptor]]");
    test.equal(this.fsWrite.args[0][1], new Buffer("2400000").toString());
    test.equal(this.fsWrite.args[0][2], 0);
    test.equal(this.fsWrite.args[0][3], "2400000".length);
    test.equal(this.fsWrite.args[0][4], 0);


    value = 0;

    this.nino.analogWrite(11, value);

    // Internal write is called
    test.equal(this.write.callCount, 2);
    test.equal(this.write.args[1][0], value);

    // Value is stored in pin state
    test.equal(this.nino.pins[11].value, value);

    // fs.write call 2 is called with expected arguments
    test.equal(this.fsWrite.callCount, 2);
    /*
      [0] descriptor
      [1] buffer value
      [2] offset of buffer
      [3] length of buffer
      [4] start position in file
      [5] callback (untested)
     */
    test.equal(this.fsWrite.args[1][0], "[[mock descriptor]]");
    test.equal(this.fsWrite.args[1][1], new Buffer("560000").toString());
    test.equal(this.fsWrite.args[1][2], 0);
    test.equal(this.fsWrite.args[1][3], "560000".length);
    test.equal(this.fsWrite.args[1][4], 0);

    test.done();
  },

  stored: function(test) {
    test.expect(1);

    var value = 255;
    this.nino.analogWrite(11, value);

    test.equal(this.nino.pins[11].value, value);

    test.done();
  }
};

exports["Nino.prototype.pinMode (analog)"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();
    this.nino = new Nino();

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();

    done();
  },
  analogOut: function(test) {
    test.expect(1);

    this.nino.pinMode("A0", 1);
    test.equal(this.nino.pins[14].mode, 1);

    test.done();
  },
  analogIn: function(test) {
    test.expect(2);

    this.nino.pinMode("A0", 2);
    test.equal(this.nino.pins[14].mode, 2);

    this.nino.pinMode(0, 2);
    test.equal(this.nino.pins[14].mode, 2);

    test.done();
  }
};

exports["Nino.prototype.pinMode (digital)"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();
    this.nino = new Nino();

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();

    done();
  },
  digitalOut: function(test) {
    test.expect(1);

    this.nino.pinMode(3, 1);
    test.equal(this.nino.pins[3].mode, 1);

    test.done();
  },
  digitalIn: function(test) {
    test.expect(1);

    this.nino.pinMode(3, 0);
    test.equal(this.nino.pins[3].mode, 0);

    test.done();
  }
};

exports["Nino.prototype.pinMode (pwm/servo)"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();
    this.nino = new Nino();

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();

    done();
  },
  pwm: function(test) {
    test.expect(2);

    this.nino.pinMode(3, 3);
    test.equal(this.nino.pins[3].mode, 3);
    test.equal(this.nino.pins[3].isPwm, true);

    test.done();
  },
  servo: function(test) {
    test.expect(2);

    this.nino.pinMode(3, 4);
    test.equal(this.nino.pins[3].mode, 4);
    test.equal(this.nino.pins[3].isPwm, true);

    test.done();
  },
  modeInvalid: function(test) {
    test.expect(4);

    test.throws(function() {
      this.nino.pinMode(12, this.nino.MODES.PWM);
    }.bind(this));

    test.throws(function() {
      this.nino.analogWrite(12, 255);
    }.bind(this));

    test.throws(function() {
      this.nino.pinMode(12, this.nino.MODES.SERVO);
    }.bind(this));

    test.throws(function() {
      this.nino.servoWrite(12, 255);
    }.bind(this));

    test.done();
  },
};

exports["Nino.prototype.setSamplingInterval"] = {
  setUp: function(done) {
    this.clock = sinon.useFakeTimers();
    this.nino = new Nino();

    done();
  },
  tearDown: function(done) {
    restore(this);
    Nino.reset();

    done();
  },
  samplingIntervalDefault: function(test) {
    test.expect(1);
    read();
    test.equal(read.samplingInterval, 1);
    test.done();
  },
  samplingIntervalCustom: function(test) {
    test.expect(1);
    read();
    this.nino.setSamplingInterval(1000);
    test.equal(read.samplingInterval, 1000);
    test.done();
  }
};
