import Foundation
import CallKit
import React

@objc(CallMonitor)
class CallMonitorModule: RCTEventEmitter {

    private static let TAG = "CallMonitor"
    private static let EVENT_CALL_STATE_CHANGED = "onCallStateChanged"

    private var callObserver: CXCallObserver?
    private var isMonitoring = false
    private var lastCallState: String = "idle"
    private var activeCallUUIDs: Set<UUID> = []

    override init() {
        super.init()
    }

    @objc override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return [CallMonitorModule.EVENT_CALL_STATE_CHANGED]
    }

    override func startObserving() {
        print("\(CallMonitorModule.TAG): JS started observing events")
    }

    override func stopObserving() {
        print("\(CallMonitorModule.TAG): JS stopped observing events")
    }

    private func makeSuccess(_ message: String) -> [String: Any] {
        return ["success": true, "message": message]
    }

    private func makeError(code: String, message: String) -> [String: Any] {
        print("\(CallMonitorModule.TAG): [\(code)] \(message)")
        return ["success": false, "errorCode": code, "message": message]
    }

    @objc func startMonitoring(_ resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        print("\(CallMonitorModule.TAG): startMonitoring called")

        do {
            if isMonitoring {
                print("\(CallMonitorModule.TAG): Already monitoring")
                resolve(makeSuccess("Already monitoring"))
                return
            }

            // CXCallObserver() does not throw in practice, but we wrap it anyway
            // for safety — any future OS-level change or entitlement issue will
            // be caught here instead of crashing silently.
            let observer = CXCallObserver()
            observer.setDelegate(self, queue: DispatchQueue.main)
            callObserver = observer
            isMonitoring = true

            print("\(CallMonitorModule.TAG): Monitoring started successfully")
            resolve(makeSuccess("Monitoring started"))
        } catch {
            print("\(CallMonitorModule.TAG): Unexpected error in startMonitoring: \(error.localizedDescription)")
            isMonitoring = false
            callObserver = nil
            resolve(makeError(code: "START_FAILED", message: "Unexpected error: \(error.localizedDescription)"))
        }
    }

    @objc func stopMonitoring(_ resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        print("\(CallMonitorModule.TAG): stopMonitoring called")

        do {
            if !isMonitoring {
                print("\(CallMonitorModule.TAG): Not monitoring")
                resolve(makeSuccess("Not monitoring"))
                return
            }

            callObserver?.setDelegate(nil, queue: nil)
            callObserver = nil
            isMonitoring = false
            activeCallUUIDs.removeAll()
            lastCallState = "idle"

            print("\(CallMonitorModule.TAG): Monitoring stopped successfully")
            resolve(makeSuccess("Monitoring stopped"))
        } catch {
            print("\(CallMonitorModule.TAG): Unexpected error in stopMonitoring: \(error.localizedDescription)")
            callObserver = nil
            isMonitoring = false
            activeCallUUIDs.removeAll()
            lastCallState = "idle"
            resolve(makeError(code: "STOP_FAILED", message: "Unexpected error: \(error.localizedDescription)"))
        }
    }

    @objc func isMonitoring(_ resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        resolve(isMonitoring)
    }

    private func handleCallStateChange(call: CXCall) {
        do {
            let timestamp = Date().timeIntervalSince1970 * 1000
            var params: [String: Any] = ["timestamp": timestamp]
            var newState = "idle"

            if call.hasEnded {
                newState = "idle"
                params["state"] = "ENDED"
                params["callState"] = "idle"
                activeCallUUIDs.remove(call.uuid)
                print("\(CallMonitorModule.TAG): Call ended")

            } else if call.isOutgoing {
                newState = "offhook"
                params["state"] = "CONNECTED"
                params["callState"] = "offhook"
                params["callType"] = "outgoing"
                activeCallUUIDs.insert(call.uuid)

                if call.hasConnected {
                    print("\(CallMonitorModule.TAG): Outgoing call connected")
                } else {
                    print("\(CallMonitorModule.TAG): Outgoing call initiated")
                }

            } else {
                if call.hasConnected {
                    newState = "offhook"
                    params["state"] = "CONNECTED"
                    params["callState"] = "offhook"
                    params["callType"] = "incoming"
                    activeCallUUIDs.insert(call.uuid)
                    print("\(CallMonitorModule.TAG): Incoming call answered")

                } else if call.isOnHold {
                    newState = "offhook"
                    params["state"] = "CONNECTED"
                    params["callState"] = "offhook"
                    params["callType"] = "incoming"
                    params["isOnHold"] = true
                    print("\(CallMonitorModule.TAG): Call on hold")

                } else {
                    newState = "ringing"
                    params["state"] = "RINGING"
                    params["callState"] = "ringing"
                    print("\(CallMonitorModule.TAG): Incoming call ringing")
                }
            }

            if newState == lastCallState {
                print("\(CallMonitorModule.TAG): Duplicate state, ignoring")
                return
            }

            lastCallState = newState
            print("\(CallMonitorModule.TAG): Sending event: \(params)")
            sendEvent(withName: CallMonitorModule.EVENT_CALL_STATE_CHANGED, body: params)

        } catch {
            print("\(CallMonitorModule.TAG): Unexpected error in handleCallStateChange: \(error.localizedDescription)")
        }
    }
}

extension CallMonitorModule: CXCallObserverDelegate {
    func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
        do {
            print("\(CallMonitorModule.TAG): Call state changed - UUID: \(call.uuid)")
            print("\(CallMonitorModule.TAG): hasEnded: \(call.hasEnded), hasConnected: \(call.hasConnected), isOutgoing: \(call.isOutgoing), isOnHold: \(call.isOnHold)")
            handleCallStateChange(call: call)
        } catch {
            print("\(CallMonitorModule.TAG): Unexpected error in callObserver delegate: \(error.localizedDescription)")
        }
    }
}