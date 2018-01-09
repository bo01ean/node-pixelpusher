const debug = require('ndebug')('no');

const PixelPusher = require('./index');

const PixelPusherInstance = new PixelPusher();
PixelPusherInstance.setHandler('discover', (controller) => {
  let timer = null;
  debug('-----------------------------------');
  debug('Discovered PixelPusher on network: ');
  debug(controller.params.pixelpusher);
  debug('-----------------------------------');

  controller.on('update', () => {
    debug({
      updatePeriod: this.params.pixelpusher.updatePeriod,
      deltaSequence: this.params.pixelpusher.deltaSequence,
      powerTotal: this.params.pixelpusher.powerTotal
    });
  }).on('timeout', () => {
    debug(`TIMEOUT : PixelPusher at address [ ${controller.params.ipAddress} ] with MAC (' + ${controller.params.macAddress} ) has timed out. Awaiting re-discovery....`);
    if (timer) { clearInterval(timer); }
  });

  // const NUM_STRIPS = controller.params.pixelpusher.numberStrips;
  // const STRIPS_PER_PACKET = controller.params.pixelpusher.stripsPerPkt;
  // const NUM_PACKETS_PER_UPDATE = NUM_STRIPS / STRIPS_PER_PACKET;
  // debug(NUM_PACKETS_PER_UPDATE);

  PixelPusherInstance.PIXELS_PER_STRIP = controller.params.pixelpusher.pixelsPerStrip;

  const waveHeight = PixelPusherInstance.PIXELS_PER_STRIP / 2;
  const waveWidth = 2;
  let wavePosition = 0;

  const strip = new PixelPusher.PixelStrip(0, PixelPusherInstance.PIXELS_PER_STRIP);

  function waveRider() {
    let startIdx = waveHeight + wavePosition;
    for (let i = startIdx, j = waveWidth;
      i < PixelPusherInstance.PIXELS_PER_STRIP
      && i > waveHeight
      && j > 0; i -= 1, j -= 1) {
      strip.getPixel(i).setColor(0, 255, 0, (j / waveWidth));
    }

    startIdx = waveHeight - wavePosition;
    for (let i = startIdx, j = waveWidth; i > 0
      && i < waveHeight
      && j > 0; i += 1, j -= 1) {
      strip.getPixel(i).setColor(255, 0, 0, (j / waveWidth));
    }

    strip.getRandomPixel().setColor(0, 0, 255, 0.1);
    // controller.refresh([strip.getStripData()]);
    debug('.');
    controller.emit('data', [strip.getStripData()]);
    strip.clear();
    wavePosition = (wavePosition + 1) % waveHeight;
  }

  PixelPusherInstance.exec = waveRider; // default pattern;

  timer = setInterval(() => {
    PixelPusherInstance.exec();
  }, PixelPusherInstance.UPDATE_FREQUENCY_MILLIS);
});
PixelPusherInstance.setHandler('error', (err) => {
  debug(`PixelPusher Error: ${err.message}`);
});


PixelPusherInstance.UPDATE_FREQUENCY_MILLIS = 1000; // Expose
PixelPusherInstance.PIXELS_PER_STRIP = 360; // Default
PixelPusherInstance.exec = () => {}; // NOP
PixelPusherInstance.go = () => {};

module.exports = PixelPusherInstance;
