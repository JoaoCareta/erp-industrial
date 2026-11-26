pluginManagement {
    repositories {
        if (System.getenv("GITHUB_ACTIONS") == "true") {
            maven("https://maven-central.storage-download.googleapis.com/maven2")
        }
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        if (System.getenv("GITHUB_ACTIONS") == "true") {
            maven("https://maven-central.storage-download.googleapis.com/maven2")
        }
        mavenCentral()
    }
}

rootProject.name = "erp-industrial"
