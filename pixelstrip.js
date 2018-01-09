
const Pixel = require('./pixel');

module.exports = function (stripId, numPixels) {
  const that = this;
  const pixels = [];


  const STRIP_ID = stripId;
  const NUM_PIXELS = numPixels;

  // init strip
  for (let i = 0; i < NUM_PIXELS; i++) {
    pixels.push(new Pixel());
  }


  this.setStripColor = function (r, g, b, a) {
    for (let i = 0; i < NUM_PIXELS; i++) {
      pixels[i].setColor(r, g, b, a);
    }
  };

  this.getStripData = function () {
    const strip = {
      strip_id: STRIP_ID,
      data: new Buffer(3 * NUM_PIXELS)
    };
    // fill the buffer with off pixels
    strip.data.fill(0x00);

    for (let i = 0, j = 0; i < NUM_PIXELS; i++, j += 3) {
      const pixelData = pixels[i].toData3();
      strip.data[j + 0] = pixelData[0];
      strip.data[j + 1] = pixelData[1];
      strip.data[j + 2] = pixelData[2];
    }

    return strip;
  };

  this.getRandomPixel = function () {
    const randomIndex = Math.floor(Math.random() * NUM_PIXELS);
    return pixels[randomIndex];
  };

  this.getPixel = function (idx) {
    return pixels[idx];
  };

  this.clear = function () {
    pixels.forEach((pixel) => {
      pixel.r = 0;
      pixel.g = 0;
      pixel.b = 0;
      pixel.a = 0;
    });
  };
};
