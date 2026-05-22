/* 
    Shuangyi Tong <shuangyi.tong@eng.ox.ac.uk>
    created on Apr 15, 2021
*/
const { app, Menu, dialog } = require('electron');
const isMac = process.platform === 'darwin'
const fs = require('fs-extra');
var JSONStream = require( "JSONStream" );

const { env } = require('./env.js');
const Buffer = require('buffer').Buffer;

// Modified from https://www.bennadel.com/blog/3232-parsing-and-serializing-large-objects-using-jsonstream-in-node-js.htm
function dumpJSONArray(fileName, arr, callback) {
  var transformStream = JSONStream.stringify();
  var outputStream = fs.createWriteStream( fileName );
  transformStream.pipe( outputStream );
  // TODO: Need to flush pipe from time to time, otherwise it consumes too much memory.
  // See Jannis Froese commment: https://stackoverflow.com/a/43011606
  arr.forEach( transformStream.write );
  transformStream.end();

  outputStream.on(
      "finish",
      function handleFinish() {
          console.log("finish writing " + fileName);
          if (callback) callback();
      }
  );
}

class DataHub {
    constructor() {
        // device identifier : descriptor sent in register phase
        this.deviceDescriptors = {}
        // device identifier : dataframe
        this.deviceData = {};
        // device_identifier : control data object
        this.controlData = { "log": [] } // a default log object
        // auto save
        this.timestamp = Date.now().toString()
        // fs.mkdir('instance/autosave/' + this.timestamp) TODO: this call is asynchronous, needs to be fixed, wait for complete
        // this.autosave_control = fs.openSync('instance/autosave/' + this.timestamp + '/control_data.autosave', 'w');
        // this.autosave_device_data = fs.openSync('instance/autosave/' + this.timestamp + '/device_data.autosave', 'w');

        this.activeWrites = 0;

        const template = [
            // { role: 'appMenu' }
            ...(isMac ? [{
              label: app.name,
              submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
              ]
            }] : []),
            // { role: 'fileMenu' }
            {
              label: 'File',
              submenu: [
                { label: 'Save All Data', click: () => { 
                    dialog.showSaveDialog(
                    { defaultPath: 'test', filters: { extensions: ["json"] } }).then(
                        result => {
                            let activeWrites = Object.keys(this.deviceData).length + 2;
                            const onWriteFinished = () => {
                                activeWrites--;
                                if (activeWrites == 0) {
                                    dialog.showMessageBox({ message: "All device data saved."});
                                }
                            };

                            let fileName = result.filePath + "__Device_Descriptors__.json";
                            fs.outputJson(fileName, this.deviceDescriptors, function (err) {
                              onWriteFinished();
                              if (err != null) {
                                console.log(err);
                              }
                            });

                            fileName = result.filePath + "__Control_Data__.json";
                            fs.outputJson(fileName, this.controlData, function (err) {
                              onWriteFinished();
                              if (err != null) {
                                console.log(err);
                              }
                            });

                            Object.keys(this.deviceData).forEach(deviceID => {
                              let fileName = result.filePath + "__Device_Data_" + this.deviceDescriptors[deviceID]["device_type"] + "__.json";

                              dumpJSONArray(fileName, this.deviceData[deviceID], onWriteFinished);
                            });
                        }
                    ).catch(err => {
                        console.log(err);
                    });
                  }
                },
                // {
                //     label: 'Clear Data (incomplete)', 
                //     click: () => { this.deviceDescriptors = {}; this.deviceData = {}; this.controlData = {} }
                // },
                isMac ? { role: 'close' } : { role: 'quit' }
              ]
            },
            // { role: 'editMenu' }
            {
              label: 'Edit',
              submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                ...(isMac ? [
                  { role: 'pasteAndMatchStyle' },
                  { role: 'delete' },
                  { role: 'selectAll' },
                  { type: 'separator' },
                  {
                    label: 'Speech',
                    submenu: [
                      { role: 'startSpeaking' },
                      { role: 'stopSpeaking' }
                    ]
                  }
                ] : [
                  { role: 'delete' },
                  { type: 'separator' },
                  { role: 'selectAll' }
                ])
              ]
            },
            // { role: 'viewMenu' }
            {
              label: 'View',
              submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
              ]
            },
            // { role: 'windowMenu' }
            {
              label: 'Window',
              submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                  { type: 'separator' },
                  { role: 'front' },
                  { type: 'separator' },
                  { role: 'window' }
                ] : [
                  { role: 'close' }
                ])
              ]
            },
            {
              role: 'help',
              submenu: [
                {
                  label: 'Learn More',
                  click: async () => {
                    const { shell } = require('electron')
                    await shell.openExternal('https://electronjs.org')
                  }
                }
              ]
            }
        ];

        const menu = Menu.buildFromTemplate(template)
        Menu.setApplicationMenu(menu)
    }

    registerDescriptor(descriptor) {
        let deviceID = descriptor['device_id'];

        if (deviceID in this.deviceDescriptors) {
            // reconnect, just log that
            console.log("deviceID " + deviceID + " reconnected");
            if (env.winRef) {
                env.winRef.webContents.send('connected', deviceID);
            }
        } else {
            // init device data array
            this.deviceData[deviceID] = [];
            this.controlData[deviceID] = [];
            console.log("deviceID " + deviceID + " connected");
            // update render process
            if (env.winRef) {
                env.winRef.webContents.send('new-descriptor', [deviceID, descriptor]);
            }
        }
        this.deviceDescriptors[deviceID] = descriptor;

        return 0;
    }

    saveFrame(deviceID, bufObj) {
        let frameFormat = this.deviceDescriptors[deviceID]['report_pack_order'];
        let binaryDecode = false;
        if (frameFormat) {
            if (frameFormat.order) {
                binaryDecode = true;
            }
        }

        if (binaryDecode) {
          if (frameFormat.packed) {
            let frameBatch = { timestamp: Date.now(), frames: [] };
            let frameOffset = 0;
            let dataFormat = this.deviceDescriptors[deviceID]['data_to_report'];
            while (frameOffset < bufObj.length) {
              let frameObj = {};
              frameFormat.order.forEach(item => {
                var decodedData;
                if (dataFormat[item] == 'uint32_t_le') {
                  decodedData = bufObj.readUInt32LE(frameOffset);
                  frameOffset += 4;
                } else if (dataFormat[item] == 'uint16_t_le') {
                  decodedData = bufObj.readUInt16LE(frameOffset);
                  frameOffset += 2;
                }
                frameObj[item] = decodedData;
              });
              frameBatch.frames.push(frameObj);
            }
            this.deviceData[deviceID].push(frameBatch);
            // fs.write(this.autosave_device_data, "\"" + deviceID + "\": " + JSON.stringify(frameBatch) + "\n");

            // send frame batch to front end
            if (env.winRef) {
              if (frameBatch.frames.length > 0) {
                if (this.deviceDescriptors[deviceID]['visual_report']['expand_packed']) {
                  env.winRef.webContents.send('new-dataframe', [deviceID, frameBatch.frames]);
                } else {
                  let frameToFront = frameBatch.frames[frameBatch.frames.length - 1];
                  frameToFront["timestamp"] = frameBatch.timestamp;
                  env.winRef.webContents.send('new-dataframe', [deviceID, frameToFront]);
                }
              }
            }
          } else {
            throw new Error("Not implemented yet");
          }
        } else {
            try
            {
                var frameObj = JSON.parse(bufObj.toString());
            }
            catch (error)
            {
                console.log(error);
                console.log(bufObj.toString());
            }
            frameObj['timestamp'] = Date.now();
            this.deviceData[deviceID].push(frameObj);
            // fs.write(this.autosave_device_data, "\"" + deviceID + "\": " + JSON.stringify(frameObj) + "\n");

            // send the frame to front end
            if (env.winRef) {
              if (frameFormat && frameFormat.packed) {
                let frameToFront = {timestamp: frameObj.timestamp};
                for (const prop in frameObj) {
                  if (prop != 'timestamp' && Array.isArray(frameObj[prop])) {
                    frameToFront[prop] = frameObj[prop];
                  } 
                }
                env.winRef.webContents.send('new-dataframe', [deviceID, frameToFront]);
              }
              else {
                env.winRef.webContents.send('new-dataframe', [deviceID, frameObj]);
              }
              
            }
        }

        return 0;
    }

    prepareControlData(deviceID, obj) {
        let frameFormat = this.deviceDescriptors[deviceID]['control_pack_order'];
        let controlFrame = null;

        if (frameFormat) {
            if (frameFormat == "serial") {
                controlFrame = Buffer.from("abcd" + obj['serial'], 'utf8'); // "abcd" is the placeholder for 4 byte BE length
            } else {
                throw new Error("not implemented yet.");
            }
        } else {
            controlFrame = Buffer.from("abcd" + JSON.stringify(obj), 'utf8'); // "abcd" is the placeholder for 4 byte BE length
        }

        obj['timestamp'] = Date.now();
        this.controlData[deviceID].push(obj);
        // fs.write(this.autosave_control, "\"" + deviceID + "\": " + JSON.stringify(obj) + "\n");
        return controlFrame;
    }

    writeLog(obj) {
      // fs.write(this.autosave_control, "\"log\": " + JSON.stringify(obj) + "\n");
      this.controlData["log"].push(obj);
    }
}

var dataHub = new DataHub();
exports.dataHub = dataHub;