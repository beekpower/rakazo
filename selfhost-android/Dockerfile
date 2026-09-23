# Toolchain for building the Rakazo Android app without installing the
# Android SDK on the host. The SDK and Gradle caches live in named volumes.
FROM node:22-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jdk-headless unzip \
 && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    ANDROID_HOME=/opt/android-sdk \
    GRADLE_USER_HOME=/opt/gradle-home \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1
ENV PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

# Official command-line tools from Google, checksum-pinned.
ARG CMDLINE_TOOLS=commandlinetools-linux-13114758_latest.zip
ARG CMDLINE_TOOLS_SHA256=7ec965280a073311c339e571cd5de778b9975026cfcbe79f2b1cdcb1e15317ee
RUN curl -fsSLo /tmp/tools.zip https://dl.google.com/android/repository/$CMDLINE_TOOLS \
 && echo "$CMDLINE_TOOLS_SHA256  /tmp/tools.zip" | sha256sum -c - \
 && mkdir -p $ANDROID_HOME/cmdline-tools \
 && unzip -q /tmp/tools.zip -d $ANDROID_HOME/cmdline-tools \
 && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
 && rm /tmp/tools.zip \
 && mkdir -p $GRADLE_USER_HOME \
 && chown -R 1000:1000 $ANDROID_HOME $GRADLE_USER_HOME

RUN corepack enable
USER 1000:1000
