plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.aymanaboelela.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.aymanaboelela.app"

        // 24 (Android 7.0), not Flutter's default 21.
        //
        // `flutter_local_notifications` needs desugaring, `firebase_messaging`
        // needs Play Services on a version that still receives updates, and
        // 21-23 devices cannot install the modern security provider that the
        // TLS handshake with Cloudflare requires — a student on one of those
        // would download the app and then fail every request with a handshake
        // error. Play Console reports under 1% of Egyptian traffic below 24.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Required by flutter_local_notifications: it uses java.time, which does
    // not exist below API 26, and desugaring is what backfills it. Without
    // this the build fails at dex time with an unresolvable
    // `java.time.LocalDateTime` — a message that names nothing about
    // notifications.
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    buildTypes {
        release {
            // ⚠️ PLACEHOLDER. Play Store uploads need a real upload key; the
            // debug key is checked into every Flutter project on earth and an
            // APK signed with it can be replaced by anyone.
            //
            // Wiring it up is `android/key.properties` (gitignored) plus a
            // signingConfigs block reading it. Left as the debug key so
            // `flutter run --release` and the CI smoke build work today, and
            // deliberately NOT silently "fixed" with a generated keystore —
            // losing the upload key after a first publish is unrecoverable, so
            // that file has to be created once, by hand, and backed up.
            signingConfig = signingConfigs.getByName("debug")

            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}

flutter {
    source = "../.."
}
