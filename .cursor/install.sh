#!/usr/bin/env bash
# Idempotent repository bootstrap for the VCamera Android project.
# Runs from /workspace after the source checkout. The base image already
# provides JDK 11/17, the Android SDK, and Gradle 7.5.
set -euo pipefail
cd /workspace

# The :opensdk module is declared in settings.gradle and .gitmodules but is not
# committed as a gitlink, so fetch it directly when it is missing.
if [ ! -f opensdk/build.gradle ]; then
  rm -rf opensdk
  git clone --depth 1 https://github.com/WaxMoon/opensdk.git opensdk
fi

# Point Gradle at the SDK baked into the image (local.properties is gitignored).
if [ ! -f local.properties ]; then
  echo "sdk.dir=/opt/android-sdk" > local.properties
fi

# AGP 7.0.2 requires AndroidX and a Java 11 toolchain (gradle.properties is gitignored).
if [ ! -f gradle.properties ]; then
  cat > gradle.properties <<'PROPS'
android.useAndroidX=true
android.enableJetifier=true
org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.java.home=/usr/lib/jvm/java-11-openjdk-amd64
PROPS
fi

# Warm the dependency cache and validate the toolchain against the library module.
gradle --no-daemon :opensdk:assembleDebug
