import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import type { EmitterSubscription } from 'react-native';

export interface CallStateData {
  timestamp: number;
  state: 'RINGING' | 'CONNECTED' | 'ENDED';
  callState: 'idle' | 'ringing' | 'offhook';
  callType?: 'incoming' | 'outgoing';
  isOnHold?: boolean;
}
export interface CallMonitorResult {
  success: boolean;
  message: string;
  errorCode?: string;
}
interface NativeResult {
  success: boolean;
  message: string;
  errorCode?: string;
}

interface CallMonitorNativeModule {
  startMonitoring(): Promise<NativeResult | string>;
  stopMonitoring(): Promise<NativeResult | string>;
  isMonitoring(): Promise<boolean>;
}

const { CallMonitor } = NativeModules as { CallMonitor: CallMonitorNativeModule };

function errorResult(errorCode: string, message: string): CallMonitorResult {
  return { success: false, errorCode, message };
}

function normaliseNativeResult(raw: NativeResult | string): CallMonitorResult {
  if (typeof raw === 'string') {
    return { success: true, message: raw };
  }
  return raw;
}


class NativeCallDetection {
  private eventEmitter: NativeEventEmitter | null = null;
  private subscription: EmitterSubscription | null = null;

  constructor() {
    if (CallMonitor) {
      this.eventEmitter = new NativeEventEmitter(CallMonitor as any);
    } else {
      console.warn('react-native-call-monitor Native module not found');
    }
  }

  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        {
          title: 'Phone State Permission',
          message: 'This app needs phone state access to detect calls.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.warn('react-native-call-monitor requestPermission error:', error);
      return false;
    }
  }

  async checkPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      return await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE
      );
    } catch (error) {
      console.warn('react-native-call-monitor checkPermission error:', error);
      return false;
    }
  }

  async startMonitoring(): Promise<CallMonitorResult> {
    if (!CallMonitor) {
      return errorResult(
        'MODULE_NOT_FOUND',
        'react-native-call-monitor native module is not available. Check your build setup.'
      );
    }

    try {
      if (Platform.OS === 'android') {
        const hasPermission = await this.checkPermission();

        if (!hasPermission) {

          const granted = await this.requestPermission();

          if (!granted) {
            return errorResult(
              'PERMISSION_DENIED',
              'User denied READ_PHONE_STATE permission.'
            );
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

  async stopMonitoring(): Promise<CallMonitorResult> {
    if (!CallMonitor) {
      return errorResult(
        'MODULE_NOT_FOUND',
        'CallMonitor native module is not available.'
      );
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

  async isMonitoring(): Promise<boolean> {
    if (!CallMonitor) return false;

    try {
      return await CallMonitor.isMonitoring();
    } catch (error) {
      console.warn('react-native-call-monitor isMonitoring error:', error);
      return false;
    }
  }

  addCallStateListener(callback: (data: CallStateData) => void): void {
    if (!this.eventEmitter) {
      console.warn(
        'The native module may not be linked correctly.'
      );
      return;
    }

    this.removeAllListeners();

    this.subscription = this.eventEmitter.addListener(
      'onCallStateChanged',
      (data: CallStateData) => {
        try {
          callback(data);
        } catch (error) {
          console.warn('react-native-call-monitor Error in call state callback:', error);
        }
      }
    );
  }

  removeAllListeners(): void {
    this.subscription?.remove();
    this.subscription = null;
  }
}

export default new NativeCallDetection();