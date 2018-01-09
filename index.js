const debug = require('ndebug')('index');

const dgram = require('dgram');
const Emitter = require('events').EventEmitter;

const Pixel = require('./pixel');
const PixelStrip = require('./pixelstrip');

const LISTENER_SOCKET_PORT = 7331;
const CONTROLLER_TIMEOUT_THRESHOLD_MILLIS = 5000;
const TIMEOUT_CHECK_MILLIS = 1000;

/**
 * Controller class
 */
class Controller extends Emitter {
  constructor(params) {
    // debug(params);
    super();
    if (!(this instanceof Controller)) return new Controller(params);
    this.params = params;
    this.lastUpdated = new Date().getTime();
    this.nextUpdate = this.lastUpdated + this.params.pixelpusher.updatePeriod;
    this.sequenceNo = 1;
    this.messages = [];
    this.timer = null;
    this.currentStripData = [];

    for (let i = 0; i < this.params.pixelpusher.numberStrips; i += 1) {
      this.currentStripData.push({
        strip_id: i,
        data: Buffer.alloc(0)
      });
    }
    this.on('data', this.dataHandler);
    this.on('sync', this.syncHandler);
  }

  syncHandler(message) {
    const packet = message.packet;
    debug(packet);
    this.params.socket.send(
      packet, 0, packet.length,
      this.params.pixelpusher.myPort, this.params.ipAddress
    );
  }

  dataHandler(strips) {
    // debug(strips);

    let i;
    let j;
    let n;

    let stripId = null;
    const that = this;

    // Format checking
    // and unchanged strip checking
    const updatedValidStrips = [];
    for (i = 0; i < strips.length; i += 1) {
      stripId = strips[i].stripId;

      // confirm proper strip numbering
      if ((stripId < 0) || (stripId >= this.params.pixelpusher.numberStrips)) {
        throw new Error(`strips must be numbered from 0..${this.params.pixelpusher.numberStrips - 1} current value [${n}]`);
      }

      // filter out sending dup data
      if (this.currentStripData.length > 0
        && strips[i].data.equals(this.currentStripData[i].data)) {
        debug('');
      } else {
        updatedValidStrips.push(strips[i]);
      }
    }

    that.currentStripData = updatedValidStrips;

    const stripsPerPacket = that.params.pixelpusher.stripsPerPkt;
    const totalStripsToSend = strips.length;
    const packetsToSend = Math.ceil(totalStripsToSend / stripsPerPacket);
    const sequenceDenotationLength = 4;
    const stripIdDenotationLength = 1;
    let stripIdx = 0;
    for (let packetNum = 0; packetNum < packetsToSend; packetNum += 1) {
      const remaining = totalStripsToSend - stripIdx;
      const stripsInThisPacket = Math.min(stripsPerPacket, remaining);
      let totalPixelDataLength = 0;
      for (i = 0; i < stripsInThisPacket; i += 1) {
        totalPixelDataLength += stripIdDenotationLength + strips[stripIdx + i].data.length;
      }
      const packetLength = sequenceDenotationLength + totalPixelDataLength;
      const message = {
        sequenceNo: that.sequenceNo,
        packet: Buffer.alloc(packetLength)
      };
      message.packet.fill(0x00);
      let pointerPosition = 0;
      message.packet.writeUInt32LE(that.sequenceNo, 0);
      that.sequenceNo += 1;
      pointerPosition += 4;
      for (i = 0; i < stripsInThisPacket; i += 1) {
        const strip = strips[stripIdx];
        message.packet.writeUInt8(stripIdx, pointerPosition);
        pointerPosition += 1;
        for (j = 0; j < strip.data.length; j += 1) {
          message.packet[pointerPosition] = strip.data[j];
          pointerPosition += 1;
        }
        stripIdx += 1;
      }
      that.emit('sync', message);
    }
  }

  static trimStaleMessages(controller) {
    if (controller.messages.length < 2) { return; }
    controller.messages = controller.messages.slice(0, 2);
  }
}

/**
 * PixelPusher class
 */
class PixelPusher extends Emitter {
  constructor(options) {
    super();
    if (!(this instanceof PixelPusher)) return new PixelPusher(options);
    this.options = options;
    this.controllers = {};
    this.runUDPListener();
    this.runUpdater();
  }

  setHandler(evt, handler) {
    this.on(evt, handler);
  }

  runUDPListener() {
    const socket = dgram.createSocket('udp4');
    socket.bind(LISTENER_SOCKET_PORT);
    socket.on('message', (message) => {
      if (message.length < 48) {
        return debug(`message too short ( ${message.length} octets )`);
      }

      const mac = message.slice(0, 6).toString('hex').match(/.{2}/g).join(':');

      if (this.controllers[mac]) {
        const controller = this.controllers[mac];
        if (controller.params.deviceType !== 2) { return ''; }
        let cycleTime = message.readUInt32LE(28) / 1000;
        const delta = message.readUInt32LE(36);
        if (delta > 5) {
          cycleTime += 5;
          controller.trimStaleMessages(controller);
        } else if ((delta === 0) && (cycleTime > 1)) {
          cycleTime -= 1;
        }
        controller.params.pixelpusher.updatePeriod = cycleTime;
        controller.params.pixelpusher.powerTotal = message.readUInt32LE(32);
        controller.params.pixelpusher.deltaSequence = delta;
        controller.lastUpdated = new Date().getTime();
        controller.nextUpdate = controller.lastUpdated + cycleTime;
        if (controller.timer) {
          clearTimeout(controller.timer);
          controller.emit('sync', controller);
        }
        controller.emit('update');
      } else {
        const ipAddress = message
          .slice(6, 10).toString('hex').match(/.{2}/g)
          .map(x => parseInt(x, 16))
          .join('.');
        debug(`PixelPusher discovered at ip address [${ipAddress}]`);

        const params = {
          macAddress: mac,
          ipAddress,
          deviceType: message[10],
          protocolVrsn: message[11],
          vendorID: message.readUInt16LE(12),
          productID: message.readUInt16LE(14),
          hardwareRev: message.readUInt16LE(16),
          softwareRev: message.readUInt16LE(18),
          linkSpeed: message.readUInt32LE(20),
          socket
        };

        //        console.log('params.linkSpeed', params.linkSpeed);
        if (params.deviceType !== 2) {
          params.payload = message.slice(24).toString('hex');
        } else {
          params.pixelpusher = {
            numberStrips: message[24],
            stripsPerPkt: message[25],
            pixelsPerStrip: message.readUInt16LE(26),
            updatePeriod: message.readUInt32LE(28) / 1000,
            powerTotal: message.readUInt32LE(32),
            deltaSequence: message.readUInt32LE(36),
            controllerNo: message.readInt32LE(40),
            groupNo: message.readInt32LE(44)
          };

          debug(`params.pixelpusher.updatePeriod ${params.pixelpusher.updatePeriod}`);

          if (message.length >= 54) {
            params.pixelpusher.artnetUniverse = message.readUInt16LE(48);
            params.pixelpusher.artnetChannel = message.readUInt16LE(50);
            params.pixelpusher.myPort = message.readUInt16LE(52);
          } else {
            params.pixelpusher.myPort = 9761;
          }

          if (message.length >= 62) {
            params.pixelpusher.stripFlags = message
              .slice(54, 62).toString('hex').match(/.{2}/g)
              .map(x => parseInt(x, 16));
          }

          if (message.length >= 66) {
            params.pixelpusher.pusherFlags = message.readInt32LE(62);
          }
        }

        const newController = new Controller(params);
        this.controllers[mac] = newController;
        debug('Sending discover..');
        this.emit('discover', newController);
        return '';
      }
    }).on('listening', () => {
      // log that the socket listener has begun listening
      const port = socket.address().port;
      debug(`UDP socket listening for pixel pusher on udp://*:  ${port}`);
    }).on('error', (err) => {
      debug('Error opening socket to detect PixelPusher', err);
      this.emit('error', err);
    });
  }
  runUpdater() {
    setInterval(() => {
      const now = new Date().getTime();
      Object.keys(this.controllers).forEach((mac) => {
        const controller = this.controllers[mac];
        if (!controller) {
          delete this.controllers[mac];
        } else if ((controller.lastUpdated + CONTROLLER_TIMEOUT_THRESHOLD_MILLIS) < now) {
          controller.emit('timeout');
          if (!controller.timer) { clearTimeout(controller.timer); }
          delete this.controllers[mac];
        }
      });
    }, TIMEOUT_CHECK_MILLIS);
  }
}


Controller.prototype.refresh = (strips) => {
  let i;
  let j;
  let n;

  let stripId = null;
  const that = this;

  // Format checking
  // and unchanged strip checking
  const updatedValidStrips = [];
  for (i = 0; i < strips.length; i += 1) {
    stripId = strips[i].stripId;
    // confirm proper strip numbering
    if ((stripId < 0) || (stripId >= that.params.pixelpusher.numberStrips)) {
      throw new Error(`strips must be numbered from 0..${that.params.pixelpusher.numberStrips - 1} current value [${n}]`);
    }

    // filter out sending dup data
    if (that.currentStripData.length > 0 && strips[i].data.equals(that.currentStripData[i].data)) {
      debug('');
    } else {
      updatedValidStrips.push(strips[i]);
    }
  }

  that.currentStripData = strips;

  const stripsPerPacket = that.params.pixelpusher.stripsPerPkt;
  const totalStripsToSend = that.currentStripData.length;
  const packetsToSend = Math.ceil(totalStripsToSend / stripsPerPacket);
  const sequenceDenotationLength = 4;
  const stripIdDenotationLength = 1;
  let stripIdx = 0;
  for (let packetNum = 0; packetNum < packetsToSend; packetNum += 1) {
    const remaining = totalStripsToSend - stripIdx;
    const stripsInThisPacket = Math.min(stripsPerPacket, remaining);
    let totalPixelDataLength = 0;
    for (i = 0; i < stripsInThisPacket; i += 1) {
      totalPixelDataLength += stripIdDenotationLength
        + that.currentStripData[stripIdx + i].data.length;
    }
    const packetLength = sequenceDenotationLength + totalPixelDataLength;
    const message = {
      sequenceNo: that.sequenceNo,
      packet: Buffer.alloc(packetLength)
    };

    message.packet.fill(0x00);

    let pointerPosition = 0;
    message.packet.writeUInt32LE(that.sequenceNo, 0);
    that.sequenceNo += 1;
    pointerPosition += 4;
    for (i = 0; i < stripsInThisPacket; i += 1) {
      const strip = that.currentStripData[stripIdx];
      message.packet.writeUInt8(stripIdx, pointerPosition);
      pointerPosition += 1;
      for (j = 0; j < strip.data.length; j += 1) {
        message.packet[pointerPosition] = strip.data[j];
        pointerPosition += 1;
      }
      stripIdx += 1;
    }
    that.messages.push(message);
  }
  if ((that.timer === null) && (that.messages.length > 0)) {
    that.sync(that);
  }
};

// Controller.prototype.sync = function (controller) {
//   let message,
//     now,
//     packet;
//
//   now = new Date().getTime();
//   if (now < controller.nextUpdate) {
//     controller.timer = setTimeout(() => {
//       controller.sync(controller);
//     }, controller.nextUpdate - now);
//     return;
//   }
//   controller.timer = null;
//
//   // remove the first item from the messages queue
//   message = controller.messages.shift();
//   // get a ref to the packet
//   packet = message.packet;
//   // send the packet over the socket/port/dest ip
//   controller.params.socket.send(packet, 0, packet.length, controller.params.pixelpusher.myPort, controller.params.ipAddress);
//
//   // mark when we need to send the next update
//   controller.nextUpdate = now + controller.params.pixelpusher.updatePeriod;
//
//   // if there are no more messages to send then
//   // dont re set the drain timeout
//   if (controller.messages.length === 0) return;
//
//   console.log('More messages...', controller.params.pixelpusher.updatePeriod);
//
//   // we have more messages so set another time out to drain the queue
//   // dont exceed 'updatePeriod'
//   controller.timer = setTimeout(() => {
//     controller.sync(controller);
//   }, controller.params.pixelpusher.updatePeriod);
// };


PixelPusher.PixelStrip = PixelStrip;
PixelPusher.Pixel = Pixel;
module.exports = PixelPusher;


/*
 *  Universal Discovery Protocol
 *  A UDP protocol for finding Etherdream/Heroic Robotics lighting devices
 *
 *  (c) 2012 Jas Strong and Jacob Potter
 *  <jasmine@electronpusher.org> <jacobdp@gmail.com>
 */

/*

#define SFLAG_RGBOW             (1 << 0)
#define SFLAG_WIDEPIXELS        (1 << 1)

#define PFLAG_PROTECTED         (1 << 0)

typedef enum DeviceType { ETHERDREAM = 0, LUMIABRIDGE = 1, PIXELPUSHER = 2 } DeviceType;

typedef struct PixelPusher {
    uint8_t  strips_attached;
    uint8_t  max_strips_per_packet;
    uint16_t pixels_per_strip;          // uint16_t used to make alignment work
    uint32_t update_period;             // in microseconds
    uint32_t power_total;               // in PWM units
    uint32_t delta_sequence;            // difference between received and expected sequence numbers
    int32_t controller_ordinal;         // ordering number for this controller.
    int32_t group_ordinal;              // group number for this controller.
    uint16_t artnet_universe;           // configured artnet starting point for this controller
    uint16_t artnet_channel;
    uint16_t my_port;
    uint8_t strip_flags[8];             // flags for each strip, for up to eight strips
    uint32_t pusher_flags;              // flags for the whole pusher
} PixelPusher;

typedef struct LumiaBridge {
    // placekeeper
} LumiaBridge;

typedef struct EtherDream {
    uint16_t buffer_capacity;
    uint32_t max_point_rate;
    uint8_t light_engine_state;
    uint8_t playback_state;
    uint8_t source;     //   0 = network
    uint16_t light_engine_flags;
    uint16_t playback_flags;
    uint16_t source_flags;
    uint16_t buffer_fullness;
    uint32_t point_rate;                // current point playback rate
    uint32_t point_count;               //  # points played
} EtherDream;

typedef union {
    PixelPusher pixelpusher;
    LumiaBridge lumiabridge;
    EtherDream etherdream;
} Particulars;

typedef struct DiscoveryPacketHeader {
    uint8_t mac_address[6];
    uint8_t ip_address[4];              // network byte order
    uint8_t device_type;
    uint8_t protocol_version;           // for the device, not the discovery
    uint16_t vendor_id;
    uint16_t product_id;
    uint16_t hw_revision;
    uint16_t sw_revision;
    uint32_t link_speed;                // in bits per second
} DiscoveryPacketHeader;

typedef struct DiscoveryPacket {
    DiscoveryPacketHeader header;
    Particulars p;
} DiscoveryPacket;

*/
