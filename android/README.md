# SafetyEye Android

Native Kotlin version of SafetyEye.

## Current scope

- Recreates the old SafetyEye frontend as native Kotlin screens:
  Home, Monitor, Log, and Report.
- Opens the rear camera with Android Camera2 from the Monitor screen.
- Draws danger-zone and exit-zone overlays on top of the live preview.
- Lets the user drag on the camera preview to redefine zones.
- Starts and stops a shift.
- Tracks warning, breach, people, latency, and prevention stats.
- Persists the latest incident log locally with SharedPreferences.
- Generates a basic shift report grouped by zone.
- Speaks a warning with Android text-to-speech.
- Exposes `SafetyDetector`, the interface where Manasaa's selected open-source ML model should be connected.

The app intentionally does not choose or vendor an ML model yet. `PlaceholderSafetyDetector`
returns no detections until the model decision is made.

## ML handoff point

Replace `PlaceholderSafetyDetector` in `app/src/main/java/com/safetyeye/app/SafetyDetector.kt`
with the selected model implementation. It should return normalized `Detection` boxes
where `0..1` is the preview width/height. The existing UI, zone engine, event log,
and report will consume those detections.

## Open in Android Studio

Open the `android/` folder as the project.

## Build from terminal

If Gradle is available:

```powershell
gradle :app:assembleDebug
```

On this machine, Android Studio and the Android SDK are installed, but `gradle` is not
on PATH. Android Studio can still sync and build the project.
