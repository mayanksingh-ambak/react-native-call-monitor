"use strict";

import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';
const {
  CallMonitor
} = NativeModules;
function errorResult(errorCode, message) {
  return {
    success: false,
    errorCode,
    message
  };
}
function normaliseNativeResult(raw) {
  if (typeof raw === 'string') {
    return {
      success: true,
      message: raw
    };
  }
  return raw;
}
class NativeCallDetection {
  eventEmitter = null;
  subscription = null;
  constructor() {
    if (CallMonitor) {
      this.eventEmitter = new NativeEventEmitter(CallMonitor);
    } else {
      console.warn('react-native-call-monitor Native module not found');
    }
  }
  async requestPermission() {
    if (Platform.OS !== 'android') return true;
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE, {
        title: 'Phone State Permission',
        message: 'This app needs phone state access to detect calls.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK'
      });
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.warn('react-native-call-monitor requestPermission error:', error);
      return false;
    }
  }
  async checkPermission() {
    if (Platform.OS !== 'android') return true;
    try {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
    } catch (error) {
      console.warn('react-native-call-monitor checkPermission error:', error);
      return false;
    }
  }
  async startMonitoring() {
    if (!CallMonitor) {
      return errorResult('MODULE_NOT_FOUND', 'react-native-call-monitor native module is not available. Check your build setup.');
    }
    try {
      if (Platform.OS === 'android') {
        const hasPermission = await this.checkPermission();
        if (!hasPermission) {
          const granted = await this.requestPermission();
          if (!granted) {
            return errorResult('PERMISSION_DENIED', 'User denied READ_PHONE_STATE permission.');
          }
        }
      }
      const raw = await CallMonitor.startMonitoring();
      const result = normaliseNativeResult(raw);
      if (!result.success) {
        console.warn('react-native-call-monitor startMonitoring failed:', result);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('react-native-call-monitor startMonitoring unexpected error:', message);
      return errorResult('UNEXPECTED_ERROR', message);
    }
  }
  async stopMonitoring() {
    if (!CallMonitor) {
      return errorResult('MODULE_NOT_FOUND', 'CallMonitor native module is not available.');
    }
    try {
      const raw = await CallMonitor.stopMonitoring();
      const result = normaliseNativeResult(raw);
      if (!result.success) {
        console.warn('react-native-call-monitor stopMonitoring failed:', result);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('react-native-call-monitor stopMonitoring unexpected error:', message);
      return errorResult('UNEXPECTED_ERROR', message);
    }
  }
  async isMonitoring() {
    if (!CallMonitor) return false;
    try {
      return await CallMonitor.isMonitoring();
    } catch (error) {
      console.warn('react-native-call-monitor isMonitoring error:', error);
      return false;
    }
  }
  addCallStateListener(callback) {
    if (!this.eventEmitter) {
      console.warn('The native module may not be linked correctly.');
      return;
    }
    this.removeAllListeners();
    this.subscription = this.eventEmitter.addListener('onCallStateChanged', data => {
      try {
        callback(data);
      } catch (error) {
        console.warn('react-native-call-monitor Error in call state callback:', error);
      }
    });
  }
  removeAllListeners() {
    this.subscription?.remove();
    this.subscription = null;
  }
}
export default new NativeCallDetection();
//# sourceMappingURL=index.js.map