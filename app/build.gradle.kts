import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

fun getVersionCode(project: Project): Int {
    return try {
        val output = project.providers.exec {
            commandLine("git", "rev-list", "--count", "origin/main")
        }.standardOutput.asText.get().trim()
        output.toIntOrNull() ?: 1
    } catch (ignored: Exception) {
        1
    }
}

fun getVersionName(project: Project): String {
    return try {
        val output = project.providers.exec {
            commandLine("git", "describe", "--tags", "--dirty")
        }.standardOutput.asText.get().trim()
        if (output.isEmpty()) "0.0.0" else output.replaceFirst("^v", "")
    } catch (ignored: Exception) {
        "0.0.0"
    }
}

fun getRepoId(project: Project): String {
    return try {
        val url = project.providers.exec {
            commandLine("git", "remote", "get-url", "origin")
        }.standardOutput.asText.get().trim()
        val matcher = Regex("""github\.com[:/]([^/]+/[^/.]+)""").find(url)
        matcher?.groupValues?.get(1) ?: "piblynk/LAMPA2"
    } catch (ignored: Exception) {
        "piblynk/LAMPA2"
    }
}

android {
    compileSdk = 37
    namespace = "top.rootu.lampa"

    defaultConfig {
        applicationId = "com.piblynk.lampa2"
        minSdk = 28
        targetSdk = 37
        versionCode = getVersionCode(project)
        versionName = getVersionName(project)

        buildConfigField("String", "REPO_ID", "\"${getRepoId(project)}\"")
    }

    androidResources {
        localeFilters += listOf("en", "ru", "uk", "ro", "zh")
    }

    signingConfigs {
        getByName("debug") {
            val localDebugKeystore = file("keystore/debug.keystore")
            if (localDebugKeystore.exists()) {
                storeFile = localDebugKeystore
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }

        create("release") {
            val keystoreProperties = Properties()
            val keystorePropsFile = file("keystore/keystore_config")

            if (keystorePropsFile.exists()) {
                keystorePropsFile.inputStream().use { keystoreProperties.load(it) }
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            } else {
                val keystoreFile = System.getenv("KEYSTORE_FILE")
                if (!keystoreFile.isNullOrBlank() && file(keystoreFile).exists()) {
                    storeFile = file(keystoreFile)
                    storePassword = System.getenv("KEYSTORE_PASSWORD")
                    keyAlias = System.getenv("RELEASE_SIGN_KEY_ALIAS")
                    keyPassword = System.getenv("RELEASE_SIGN_KEY_PASSWORD")
                }
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            val releaseSigning = signingConfigs.getByName("release")
            signingConfig = if (releaseSigning.storeFile?.exists() == true) {
                releaseSigning
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += setOf(
                "DebugProbesKt.bin",
                "META-INF/*.kotlin_module",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/AL2.0",
                "META-INF/LGPL2.1"
            )
        }
    }

    flavorDimensions += "default"

    productFlavors {
        create("lite") {
            dimension = "default"
            buildConfigField("boolean", "enableUpdate", "true")
            buildConfigField("String", "defaultAppUrl", "\"http://lampa.mx\"")
        }
        create("full") {
            dimension = "default"
            buildConfigField("boolean", "enableUpdate", "false")
            buildConfigField("String", "defaultAppUrl", "\"http://lampa.mx\"")
        }
        create("ruStore") {
            dimension = "default"
            versionNameSuffix = "-RuStore"
            buildConfigField("boolean", "enableUpdate", "false")
            buildConfigField("String", "defaultAppUrl", "\"http://lampa.mx\"")
        }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    implementation(platform(libs.kotlin.bom))

    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.preference.ktx)
    implementation(libs.androidx.tvprovider)
    implementation(libs.androidx.webkit)

    implementation(libs.google.material)
    implementation(libs.okhttp)
    implementation(libs.okhttp.dnsoverhttps)
    implementation(libs.okhttp.brotli)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.gson)
    implementation(libs.lottie)
    implementation(libs.rhino)

    testImplementation(libs.junit)
}
