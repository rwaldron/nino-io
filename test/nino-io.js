"use strict";
var rewire = require("rewire");
var Nino = rewire("../lib/nino-io.js");
var Emitter = require("events").EventEmitter;
var sinon = require("sinon");

var fsStub = {
  chmod: function(path, flag, cb) {
    if (cb) {
      cb(null, "[[descriptor]]");
    }
  },
  open: function(path, flag, cb) {
    if (cb) {
      cb(null, "[[descriptor]]");
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
};
