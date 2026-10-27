pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    // Lets the Java toolchain download a JDK when the machine doesn't have the right one.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "financial-tracker"

include("backend")
