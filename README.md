node-pixelpusher
================

[Heroic Robotics'](http://www.heroicrobotics.com) Pixel Pusher LED controller interface.

Install
-------

    npm install https://github.com/bo01ean/node-pixelpusher

Using The Library :
---

### Prepare To Push

    var PixelPusher = require('heroic-pixel-pusher');


### Discovering A PixelPusher On Your Network

    new PixelPusher().on('discover', function(controller) {
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
            // be sure to handel the situation when the controller dissappears.
            // this could be due to power cycle or network conditions
            console.log('TIMEOUT : PixelPusher at address [' + controller.params.ipAddress + '] with MAC (' + controller.params.macAddress + ') has timed out. Awaiting re-discovery....');
            if (!!timer) clearInterval(timer);
        });

        //--
        // create a timer of some fps frequency and send the new pixel data
        //--

    }).on('error', function(err) {
      console.log('PixelPusher Error: ' + err.message);
    });


### Pushing Pixels (push it real good!)

    // aquire the number of strips that the controller has said it
    // has connected via the pixel.rc config file
    var NUM_STRIPS = controller.params.pixelpusher.numberStrips;

    // aquire the number of pixels we that the controller reports is
    // in each strip. This is set in the pixel.rc file placed on your thumb drive.
    var PIXELS_PER_STRIP = controller.params.pixelpusher.pixelsPerStrip;

    // create a loop that will send commands to the PP to update the strip
    var UPDATE_FREQUENCY_MILLIS = 30;// 15 is just faster than 60 FPS

    timer = setInterval(function() {
        // create an array to hold the data for all the strips at once
        // loop
        var strips = [];
        for (var stripId = 0; stripId< NUM_STRIPS; stripId ++){
            var s = new PixelStrip(stripId,PIXELS_PER_STRIP);
            // set a random pixel blue
            s.getRandomPixel().setColor(0,0,255, 0.1);
            // render the strip data into the correct format for sending
            // to the pixel pusher controller
            var renderedStripData = s.getStripData();
            // add this data to our list of strip data to send
            strips.push(renderedStripData);
        }
        // inform the controller of the new strip frame
        controller.refresh(strips);
    }, UPDATE_FREQUENCY_MILLIS);


### LED Data Formats

    // if you are using NeoPixels from Adafruit you wont need to
    // use this.

    if (strip[x].flags & 0x1) {
        // red, green blue, orange[3], white[3]

        // indicates that the actual number of pixels is pixelsPerStrip/3,
        // each pixel is encoded as 9 octets
        //     first three octets are R, G, and B
        //     next three octets is the orange value (three times)
        //     next three octets is the white  value (three times)

    } else if (strip[x].flags & 0x2) { // wide pixels
        // indicates that the actual number of pixels is pixelsPerStrip/2,
        // each pixel is encoded as 6 octets: R >> 8, G >> 8, B >> 8, R & 0xff, G & 0xff, B & 0xff
    } else {
        // each pixel is encoded as three octets: R, G, and B
        // this is how the library handles data by default.
    }
