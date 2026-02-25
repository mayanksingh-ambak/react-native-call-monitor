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
declare class NativeCallDetection {
    private eventEmitter;
    private subscription;
    constructor();
    requestPermission(): Promise<boolean>;
    checkPermission(): Promise<boolean>;
    startMonitoring(): Promise<CallMonitorResult>;
    stopMonitoring(): Promise<CallMonitorResult>;
    isMonitoring(): Promise<boolean>;
    addCallStateListener(callback: (data: CallStateData) => void): void;
    removeAllListeners(): void;
}
declare const _default: NativeCallDetection;
export default _default;
//# sourceMappingURL=index.d.ts.map