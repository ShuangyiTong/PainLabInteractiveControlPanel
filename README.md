# PainLab Interactive Control Panel

## Overview

This project was started in response to the needs to study pain mechanism in a VR environment. The core assets of this project is a set of hardware and software solutions to form a interactive centralised system that processes data streams in real-time (<20ms), compute a feedback from a mechanistic model, and give a feedback in real-time (<20ms) as well. 

Currently, we have implemented
- (This repo) Event-driven centralised data processing based on Node.js / Electron: https://github.com/ShuangyiTong/PainLabInteractiveControlPanel
- Constant current stimulation built for Digitimer DS5 through National Instruments DAQ: https://github.com/ShuangyiTong/PainLabDeviceNIDAQDotNet4.5VS2012
- Speech recognition for pain ratings supported by Azure Cloud Speech Services: https://github.com/ShuangyiTong/PainLabDeviceVoiceRecognitionAzure
- g.tec EEG connector: https://github.com/ShuangyiTong/PainLabLSLCompatibilityLayerg.tecEEG
- BrainProducts LiveAmp EEG LSL connector: https://github.com/ShuangyiTong/PainLabLSLCompatibilityLayerLiveAmp
- DotNet client library (one file): https://github.com/ShuangyiTong/PainLabDeviceNIDAQDotNet4.5VS2012/blob/master/PainLabDeviceNIDAQDotNet4.5VS2012/PainlabProtocol.cs
- Low-cost embedded data aquisition device (e.g. heart rate, GSR, EMG etc.): https://github.com/ShuangyiTong/PainLabDeviceEmbedded
