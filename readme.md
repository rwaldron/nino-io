# Nino-IO

[![Build Status](https://travis-ci.org/rwaldron/nino-io.png?branch=master)](https://travis-ci.org/rwaldron/nino-io)

## Nino-IO is compatible with Linino One and Arduino Yun.


Nino-IO is a Firmata.js-compatibility class for writing Node.js programs that run on the [Linino One](http://www.linino.org/modules/linino-one/) or [Arduino Yun](http://www.linino.org/modules/yun/). This project was built at [Bocoup](http://bocoup.com)

### Getting Started

Nino-IO scripts are run directly from the Linino One or Arduino Yun board. To get started, [install Node.js on the board](http://wiki.linino.org/doku.php?id=wiki:nodejscript). 

**IMPORTANT:** The Linino expects all user code to exist in `/opt`! When connecting to the board, remember to: `cd /opt`. This is how the `nodeyun_inst_latest.sh` installer program sets up the filesystem on the Linino's SD Card. 




### Installation

```
npm install nino-io johnny-five
```

[See Johnny-Five's examples for usage.](https://github.com/rwaldron/johnny-five)

## License
See LICENSE file.

