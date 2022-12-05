/* 
  Shuangyi Tong <shuangyi.tong@eng.ox.ac.uk>
  created on Apr 15, 2021
*/

const { app, BrowserWindow } = require('electron');
let { env } = require('./backend/env.js');

require('./backend/server.js')
require('./backend/service.js')

function createWindow () {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.on('close', function(e) {
    const choice = require('electron').dialog.showMessageBoxSync(this,
      {
        type: 'question',
        buttons: ['Yes, I can confirm I saved all the data, close it NOW', 'Oh, No!!!!!!'],
        title: 'Confirm',
        message: 'DID YOU SAVED THE DATA?????????????????'
      });
    if (choice === 1) {
      e.preventDefault();
    }
  });
  env.winRef = win;

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})