FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# JDK 11 runs Gradle/AGP 7.0.2; JDK 17 is only needed to run the Android
# command-line tools (sdkmanager requires Java 17+). git + curl are required by
# fully custom Cloud Agent images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openjdk-11-jdk \
        openjdk-17-jdk-headless \
        git \
        curl \
        unzip \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Gradle (the repository ships gradlew but not the wrapper jar/properties).
ARG GRADLE_VERSION=7.5
RUN curl -fsSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
    && unzip -q /tmp/gradle.zip -d /opt \
    && ln -sf "/opt/gradle-${GRADLE_VERSION}/bin/gradle" /usr/local/bin/gradle \
    && rm -f /tmp/gradle.zip

# Android SDK: platform android-33, build-tools 31.0.0, platform-tools.
ENV ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_HOME=/opt/android-sdk
RUN mkdir -p "${ANDROID_SDK_ROOT}/cmdline-tools" \
    && curl -fsSL -o /tmp/cmdtools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip -q /tmp/cmdtools.zip -d /tmp/cmdtools \
    && mv /tmp/cmdtools/cmdline-tools "${ANDROID_SDK_ROOT}/cmdline-tools/latest" \
    && rm -rf /tmp/cmdtools.zip /tmp/cmdtools \
    && yes | JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 "${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null \
    && JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 "${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager" \
        "platform-tools" \
        "platforms;android-33" \
        "build-tools;31.0.0" \
        "build-tools;30.0.2" \
    && chmod -R a+rwX "${ANDROID_SDK_ROOT}"

# Gradle/AGP must run on JDK 11; expose the toolchain on PATH for all shells.
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:/opt/gradle-7.5/bin:${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${PATH}"
