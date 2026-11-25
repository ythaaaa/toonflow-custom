plugins {
  id("com.android.application") version "9.4.0"
}

layout.buildDirectory.set(file("../../../build/mobile/native"))

val productionStorePath = providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull?.takeIf(String::isNotBlank)
val productionStorePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull?.takeIf(String::isNotBlank)
val productionKeyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").orNull?.takeIf(String::isNotBlank)
val productionKeyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").orNull?.takeIf(String::isNotBlank)
val productionSigningConfigured = productionStorePath != null &&
  productionStorePassword != null && productionKeyAlias != null && productionKeyPassword != null &&
  java.io.File(productionStorePath).isAbsolute && file(productionStorePath).isFile

android {
  namespace = "com.toonflow.mobile"
  compileSdk {
    version = release(37) { minorApiLevel = 1 }
  }
  buildToolsVersion = "36.0.0"

  defaultConfig {
    applicationId = "com.toonflow.mobile"
    minSdk = 26
    targetSdk = 34
    versionCode = providers.gradleProperty("mobileVersionCode").orElse("1").get().toInt()
    versionName = providers.gradleProperty("mobileVersion").orElse("0.1.0").get()
    ndk { abiFilters += "arm64-v8a" }
  }

  signingConfigs {
    if (productionSigningConfigured) {
      create("production") {
        storeFile = file(productionStorePath!!)
        storePassword = productionStorePassword
        keyAlias = productionKeyAlias
        keyPassword = productionKeyPassword
      }
    }
  }
  buildTypes {
    release {
      if (productionSigningConfigured) signingConfig = signingConfigs.getByName("production")
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
    }
  }
  sourceSets {
    getByName("main") {
      manifest.srcFile("../../../build/mobile/staging/manifest.xml")
      java.directories.apply { clear(); add(projectDir.path) }
      res.directories.apply { clear(); add("../../../build/mobile/staging/res") }
      assets.directories.apply { clear(); add("../../../build/mobile/staging/assets") }
      jniLibs.directories.apply { clear(); add("../../../build/mobile/staging/lib") }
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  lint { checkReleaseBuilds = false }
  packaging {
    jniLibs {
      useLegacyPackaging = true
      // ACT: 官方 Gecko 与 Bun 二进制已处理符号，保留原文件，避免安装 NDK 重新剥离。
      keepDebugSymbols += "**/*.so"
    }
  }
}

tasks.configureEach {
  if (name == "assembleRelease" || name == "packageRelease" || name == "bundleRelease") {
    doFirst {
      check(productionSigningConfigured) {
        "Android Release 需要外部签名配置：ANDROID_KEYSTORE_PATH、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。"
      }
    }
  }
}

dependencies {
  implementation("org.mozilla.geckoview:geckoview-arm64-v8a:157.0.20261005135250")
}

tasks.withType<JavaCompile>().configureEach { options.encoding = "UTF-8" }

tasks.register("prepareDependencies") {
  doLast {
    androidComponents.sdkComponents.bootClasspath.get()
    configurations.getByName("debugCompileClasspath").files
    configurations.getByName("debugRuntimeClasspath").files
    configurations.getByName("releaseRuntimeClasspath").files
  }
}
