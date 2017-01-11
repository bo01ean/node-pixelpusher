var PixelPusher = require('./pixelpusher');
var PixelStrip = PixelPusher.PixelStrip;

var PixelPusherInstance = new PixelPusher();

PixelPusherInstance.UPDATE_FREQUENCY_MILLIS = 2; // Expose
PixelPusherInstance.PIXELS_PER_STRIP = 360; // Default
PixelPusherInstance.exec = function () {}; // NOP
PixelPusherInstance.go = function () {
  PixelPusherInstance.on('discover', function(controller) {

    var timer = null;
    // log connection data on initial discovery
    console.log('-----------------------------------');
    console.log('Discovered PixelPusher on network: ');
    console.log(controller.params.pixelpusher);
    console.log('-----------------------------------');

    // capture the update message sent back from the pp controller
    controller.on('update', function() {
      console.log ({
        updatePeriod  : this.params.pixelpusher.updatePeriod,
        deltaSequence : this.params.pixelpusher.deltaSequence,
        powerTotal    : this.params.pixelpusher.powerTotal
      });
    }).on('timeout', function() {
        console.log('TIMEOUT : PixelPusher at address [' + controller.params.ipAddress + '] with MAC (' + controller.params.macAddress + ') has timed out. Awaiting re-discovery....');
        if (!!timer) clearInterval(timer);
    });

    var NUM_STRIPS = controller.params.pixelpusher.numberStrips;
    var STRIPS_PER_PACKET = controller.params.pixelpusher.stripsPerPkt;
    var NUM_PACKETS_PER_UPDATE = NUM_STRIPS/STRIPS_PER_PACKET;
    PixelPusherInstance.PIXELS_PER_STRIP = controller.params.pixelpusher.pixelsPerStrip;

    var waveHeight = PixelPusherInstance.PIXELS_PER_STRIP/2;
    var waveWidth = 2;
    var wavePosition = 0;

    var strip = new PixelStrip(0, PixelPusherInstance.PIXELS_PER_STRIP);

    function waveRider() {
      var startIdx = waveHeight+wavePosition;
      for (var i = startIdx, j = waveWidth; i < PixelPusherInstance.PIXELS_PER_STRIP &&  i > waveHeight && j > 0; i--, j--){
          strip.getPixel(i).setColor(0, 255, 0, (j / waveWidth));
      }

      var startIdx = waveHeight-wavePosition;
      for (var i = startIdx, j = waveWidth; i > 0 &&  i < waveHeight && j > 0; i++, j--) {
          strip.getPixel(i).setColor(255, 0, 0, (j / waveWidth));
      }

      strip.getRandomPixel().setColor(0,0,255, 0.1);
      //controller.refresh([strip.getStripData()]);
      controller.emit('data', [strip.getStripData()]);
      strip.clear();
      wavePosition = (wavePosition + 1) % waveHeight;
    }

    PixelPusherInstance.exec = waveRider; // default pattern;

    timer = setInterval(function() {
      PixelPusherInstance.exec();
    }, PixelPusherInstance.UPDATE_FREQUENCY_MILLIS);

  }).on('error', function(err) {
    console.log('PixelPusher Error: ' + err.message);
  });
};

module.exports = PixelPusherInstance;
