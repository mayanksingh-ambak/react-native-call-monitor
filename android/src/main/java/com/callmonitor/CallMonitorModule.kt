package com.callmonitor

import android.content.Context
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import androidx.annotation.RequiresApi
import android.util.Log

class CallMonitorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var telephonyManager: TelephonyManager? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var telephonyCallback: TelephonyCallback? = null
    private var isListening = false
    private var lastCallState = TelephonyManager.CALL_STATE_IDLE

    companion object {
        private const val TAG = "CallMonitorModule"
    }

    override fun getName(): String {
        return "CallMonitor"
    }

    private fun resolveSuccess(promise: Promise, message: String) {
        val map = Arguments.createMap()
        map.putBoolean("success", true)
        map.putString("message", message)
        promise.resolve(map)
    }

    private fun resolveError(promise: Promise, errorCode: String, message: String) {
        Log.e(TAG, "[$errorCode] $message")
        val map = Arguments.createMap()
        map.putBoolean("success", false)
        map.putString("errorCode", errorCode)
        map.putString("message", message)
        promise.resolve(map)
    }

    @ReactMethod
    fun startMonitoring(promise: Promise) {
        Log.d(TAG, "startMonitoring called")

        try {
            if (isListening) {
                Log.d(TAG, "Already monitoring")
                resolveSuccess(promise, "Already monitoring")
                return
            }

            val context = reactContext.applicationContext
            telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager

            if (telephonyManager == null) {
                resolveError(
                    promise,
                    "TELEPHONY_UNAVAILABLE",
                    "TelephonyManager is not available on this device"
                )
                return
            }

            Log.d(TAG, "Android SDK version: ${Build.VERSION.SDK_INT}")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Log.d(TAG, "Using TelephonyCallback (Android 12+)")
                registerTelephonyCallback()
            } else {
                Log.d(TAG, "Using PhoneStateListener (Android 11 and below)")
                registerPhoneStateListener()
            }

            isListening = true
            Log.d(TAG, "Monitoring started successfully")
            resolveSuccess(promise, "Monitoring started")

        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException: ${e.message}", e)
            telephonyManager = null
            isListening = false
            resolveError(
                promise,
                "PERMISSION_DENIED",
                "READ_PHONE_STATE permission is not granted. Please request the permission before calling startMonitoring."
            )
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error: ${e.message}", e)
            telephonyManager = null
            isListening = false
            resolveError(
                promise,
                "START_FAILED",
                "Unexpected error while starting monitoring: ${e.message ?: "unknown"}"
            )
        }
    }

    @ReactMethod
    fun stopMonitoring(promise: Promise) {
        Log.d(TAG, "stopMonitoring called")

        try {
            if (!isListening) {
                Log.d(TAG, "Not monitoring")
                resolveSuccess(promise, "Not monitoring")
                return
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                unregisterTelephonyCallback()
            } else {
                unregisterPhoneStateListener()
            }

            isListening = false
            lastCallState = TelephonyManager.CALL_STATE_IDLE
            Log.d(TAG, "Monitoring stopped successfully")
            resolveSuccess(promise, "Monitoring stopped")

        } catch (e: Exception) {
            Log.e(TAG, "Error stopping monitoring: ${e.message}", e)
            isListening = false
            lastCallState = TelephonyManager.CALL_STATE_IDLE
            telephonyManager = null
            resolveError(
                promise,
                "STOP_FAILED",
                "Error while stopping: ${e.message ?: "unknown"}. Internal state has been reset."
            )
        }
    }

    @ReactMethod
    fun isMonitoring(promise: Promise) {
        promise.resolve(isListening)
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun registerTelephonyCallback() {
        telephonyCallback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                Log.d(TAG, "TelephonyCallback - Call state changed: $state")
                handleCallStateChange(state)
            }
        }
        telephonyManager?.registerTelephonyCallback(
            reactContext.mainExecutor,
            telephonyCallback as TelephonyCallback
        )
        Log.d(TAG, "TelephonyCallback registered successfully")
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun unregisterTelephonyCallback() {
        try {
            telephonyCallback?.let {
                telephonyManager?.unregisterTelephonyCallback(it)
                Log.d(TAG, "TelephonyCallback unregistered")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering TelephonyCallback: ${e.message}", e)
        } finally {
            telephonyCallback = null
        }
    }

    @Suppress("DEPRECATION")
    private fun registerPhoneStateListener() {
        phoneStateListener = object : PhoneStateListener() {
            override fun onCallStateChanged(state: Int, incomingNumber: String?) {
                Log.d(TAG, "PhoneStateListener - Call state changed: $state")
                handleCallStateChange(state)
            }
        }
        telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
        Log.d(TAG, "PhoneStateListener registered successfully")
    }

    @Suppress("DEPRECATION")
    private fun unregisterPhoneStateListener() {
        try {
            phoneStateListener?.let {
                telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
                Log.d(TAG, "PhoneStateListener unregistered")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error unregistering PhoneStateListener: ${e.message}", e)
        } finally {
            phoneStateListener = null
        }
    }

    private fun handleCallStateChange(state: Int) {
        try {
            Log.d(TAG, "handleCallStateChange - State: $state, Last State: $lastCallState")

            if (state == lastCallState) {
                Log.d(TAG, "Duplicate state, ignoring")
                return
            }

            val params = Arguments.createMap()
            params.putDouble("timestamp", System.currentTimeMillis().toDouble())

            when (state) {
                TelephonyManager.CALL_STATE_IDLE -> {
                    if (lastCallState != TelephonyManager.CALL_STATE_IDLE) {
                        params.putString("state", "ENDED")
                        params.putString("callState", "idle")
                        Log.d(TAG, "Sending ENDED event")
                        sendEvent("onCallStateChanged", params)
                    }
                }
                TelephonyManager.CALL_STATE_RINGING -> {
                    params.putString("state", "RINGING")
                    params.putString("callState", "ringing")
                    Log.d(TAG, "Sending RINGING event")
                    sendEvent("onCallStateChanged", params)
                }
                TelephonyManager.CALL_STATE_OFFHOOK -> {
                    when (lastCallState) {
                        TelephonyManager.CALL_STATE_RINGING -> {
                            params.putString("state", "CONNECTED")
                            params.putString("callState", "offhook")
                            params.putString("callType", "incoming")
                            Log.d(TAG, "Sending CONNECTED (incoming) event")
                            sendEvent("onCallStateChanged", params)
                        }
                        TelephonyManager.CALL_STATE_IDLE -> {
                            params.putString("state", "CONNECTED")
                            params.putString("callState", "offhook")
                            params.putString("callType", "outgoing")
                            Log.d(TAG, "Sending CONNECTED (outgoing) event")
                            sendEvent("onCallStateChanged", params)
                        }
                        else -> {
                            Log.d(TAG, "Already in OFFHOOK state, ignoring")
                            return
                        }
                    }
                }
            }

            lastCallState = state

        } catch (e: Exception) {
            Log.e(TAG, "Error in handleCallStateChange: ${e.message}", e)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
            Log.d(TAG, "Event sent: $eventName")
        } catch (e: Exception) {
            Log.e(TAG, "Error sending event: ${e.message}", e)
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        Log.d(TAG, "onCatalystInstanceDestroy called")
        if (isListening) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    unregisterTelephonyCallback()
                } else {
                    unregisterPhoneStateListener()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in cleanup: ${e.message}", e)
            } finally {
                isListening = false
            }
        }
    }
}